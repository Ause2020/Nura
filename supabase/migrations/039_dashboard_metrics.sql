-- Nura · Agregados del dashboard (SECURITY INVOKER + RLS)
-- Idempotente. No altera tablas de negocio ni policies existentes.
--
-- Por qué INVOKER (no DEFINER):
--   El dashboard solo necesita lecturas del tenant de la sesión.
--   INVOKER ejecuta como el usuario autenticado: RLS sigue vigente.
--   organization_id se resuelve desde profiles (el usuario ya puede leer su fila).
--   No hay justificación de seguridad para DEFINER: no se cruzan tenants
--   ni se omiten políticas.

CREATE INDEX IF NOT EXISTS idx_nonconformities_org_detected
  ON public.nonconformities (organization_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_nonconformities_org_created
  ON public.nonconformities (organization_id, created_at);

CREATE INDEX IF NOT EXISTS idx_nonconformities_org_closed
  ON public.nonconformities (organization_id, closed_at DESC)
  WHERE status = 'closed' AND closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audits_org_completed
  ON public.audits (organization_id, completed_date DESC)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_capa_actions_org_open_due
  ON public.capa_actions (organization_id, due_date)
  WHERE status <> 'completed';

CREATE INDEX IF NOT EXISTS idx_production_submissions_org_deviation
  ON public.production_form_submissions (organization_id, submitted_at DESC)
  WHERE has_deviation = true;

CREATE INDEX IF NOT EXISTS idx_controlled_documents_org_published_review
  ON public.controlled_documents (organization_id, next_review_date)
  WHERE status = 'published';

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_today date;
  v_month_start date;
  v_month_end date;
  v_last_month_start date;
  v_last_month_end date;
  v_week_start date;
  v_from timestamptz;
  v_result jsonb;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_organization');
  END IF;

  v_today := (timezone('utc', now()))::date;
  v_month_start := date_trunc('month', v_today)::date;
  v_month_end := (date_trunc('month', v_today) + interval '1 month' - interval '1 day')::date;
  v_last_month_start := (date_trunc('month', v_today) - interval '1 month')::date;
  v_last_month_end := (v_month_start - interval '1 day')::date;
  v_week_start := date_trunc('week', v_today)::date;
  v_from := LEAST(v_week_start, v_month_start)::timestamptz;

  SELECT jsonb_build_object(
    'ok', true,
    'haccp_checklist_progress', (
      SELECT p.checklist_progress
      FROM public.haccp_plans p
      WHERE p.organization_id = v_org
      ORDER BY p.updated_at DESC
      LIMIT 1
    ),
    'records_templates_active', (
      SELECT COUNT(*)::int
      FROM public.production_form_templates t
      WHERE t.organization_id = v_org
        AND t.is_active
    ),
    'submissions', (
      SELECT jsonb_build_object(
        'month_total', COUNT(*) FILTER (
          WHERE s.submitted_at >= v_month_start::timestamptz
        ),
        'month_ok', COUNT(*) FILTER (
          WHERE s.submitted_at >= v_month_start::timestamptz
            AND s.status = 'ok'
            AND s.has_deviation = false
        ),
        'today_total', COUNT(*) FILTER (
          WHERE s.submitted_at >= v_today::timestamptz
        ),
        'today_ok', COUNT(*) FILTER (
          WHERE s.submitted_at >= v_today::timestamptz
            AND s.status = 'ok'
            AND s.has_deviation = false
        ),
        'week_total', COUNT(*) FILTER (
          WHERE s.submitted_at >= v_week_start::timestamptz
        ),
        'week_ok', COUNT(*) FILTER (
          WHERE s.submitted_at >= v_week_start::timestamptz
            AND s.status = 'ok'
            AND s.has_deviation = false
        )
      )
      FROM public.production_form_submissions s
      WHERE s.organization_id = v_org
        AND s.submitted_at >= v_from
    ),
    'ncs', (
      SELECT jsonb_build_object(
        'total', COUNT(*)::int,
        'open', COUNT(*) FILTER (WHERE n.status <> 'closed')::int,
        'overdue', COUNT(*) FILTER (
          WHERE n.status <> 'closed'
            AND n.due_date IS NOT NULL
            AND n.due_date < v_today
        )::int,
        'critical_or_overdue', COUNT(*) FILTER (
          WHERE n.status <> 'closed'
            AND (
              n.severity = 'critical'
              OR n.status = 'overdue'
              OR (n.due_date IS NOT NULL AND n.due_date < v_today)
            )
        )::int,
        'due_soon_48h', COUNT(*) FILTER (
          WHERE n.status <> 'closed'
            AND n.due_date IS NOT NULL
            AND (n.due_date + time '23:59:59') >= timezone('utc', now())
            AND (n.due_date + time '23:59:59') <= timezone('utc', now()) + interval '48 hours'
        )::int,
        'critical_open', COUNT(*) FILTER (
          WHERE n.status <> 'closed' AND n.severity = 'critical'
        )::int,
        'this_month', COUNT(*) FILTER (
          WHERE n.created_at >= v_month_start::timestamptz
            AND n.created_at < (v_month_end + interval '1 day')
        )::int,
        'last_month', COUNT(*) FILTER (
          WHERE n.created_at >= v_last_month_start::timestamptz
            AND n.created_at < v_month_start::timestamptz
        )::int
      )
      FROM public.nonconformities n
      WHERE n.organization_id = v_org
    ),
    'avg_closure_days', (
      SELECT ROUND(AVG(days))::int
      FROM (
        SELECT COALESCE(
          (
            SELECT AVG(GREATEST(1, ROUND(EXTRACT(EPOCH FROM (c.closed_at - c.detected_at)) / 86400)))
            FROM public.nonconformities c
            WHERE c.organization_id = v_org
              AND c.status = 'closed'
              AND c.closed_at IS NOT NULL
              AND c.closed_at >= timezone('utc', now()) - interval '30 days'
          ),
          (
            SELECT AVG(GREATEST(1, ROUND(EXTRACT(EPOCH FROM (c.closed_at - c.detected_at)) / 86400)))
            FROM public.nonconformities c
            WHERE c.organization_id = v_org
              AND c.status = 'closed'
              AND c.closed_at IS NOT NULL
          )
        ) AS days
      ) closure
    ),
    'nc_by_origin', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('origin', o.origin, 'count', o.cnt) ORDER BY o.cnt DESC)
      FROM (
        SELECT n.origin, COUNT(*)::int AS cnt
        FROM public.nonconformities n
        WHERE n.organization_id = v_org
        GROUP BY n.origin
      ) o
    ), '[]'::jsonb),
    'overdue_capa_actions', (
      SELECT COUNT(*)::int
      FROM public.capa_actions a
      WHERE a.organization_id = v_org
        AND a.status <> 'completed'
        AND a.due_date < v_today
    ),
    'audits_month', (
      SELECT jsonb_build_object(
        'scheduled', COUNT(*)::int,
        'completed', COUNT(*) FILTER (WHERE a.status = 'completed')::int
      )
      FROM public.audits a
      WHERE a.organization_id = v_org
        AND a.scheduled_date >= v_month_start
        AND a.scheduled_date <= v_month_end
    ),
    'audit_compliance', (
      SELECT jsonb_build_object(
        'this_month', AVG(a.compliance_score) FILTER (
          WHERE a.completed_date >= v_month_start AND a.completed_date <= v_month_end
        ),
        'last_month', AVG(a.compliance_score) FILTER (
          WHERE a.completed_date >= v_last_month_start AND a.completed_date <= v_last_month_end
        )
      )
      FROM public.audits a
      WHERE a.organization_id = v_org
        AND a.status = 'completed'
        AND a.completed_date IS NOT NULL
        AND a.completed_date >= v_last_month_start
        AND a.completed_date <= v_month_end
    ),
    'last_audits', COALESCE((
      SELECT jsonb_agg(row_to_json(x) ORDER BY x.completed_date DESC)
      FROM (
        SELECT a.id, a.title, a.compliance_score, a.completed_date
        FROM public.audits a
        WHERE a.organization_id = v_org
          AND a.status = 'completed'
          AND a.completed_date IS NOT NULL
        ORDER BY a.completed_date DESC
        LIMIT 2
      ) x
    ), '[]'::jsonb),
    'documents', (
      SELECT jsonb_build_object(
        'review_overdue', COUNT(*) FILTER (
          WHERE d.next_review_date IS NOT NULL AND d.next_review_date < v_today
        )::int,
        'review_due_soon', COUNT(*) FILTER (
          WHERE d.next_review_date IS NOT NULL
            AND d.next_review_date >= v_today
            AND d.next_review_date <= v_today + 30
        )::int
      )
      FROM public.controlled_documents d
      WHERE d.organization_id = v_org
        AND d.status = 'published'
    ),
    'monthly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ym', to_char(m.month_start, 'YYYY-MM'),
        'audit_avg', a.audit_avg,
        'nc_count', n.nc_count
      ) ORDER BY m.month_start)
      FROM generate_series(
        date_trunc('month', v_today) - interval '5 months',
        date_trunc('month', v_today),
        interval '1 month'
      ) AS m(month_start)
      LEFT JOIN LATERAL (
        SELECT AVG(x.compliance_score) AS audit_avg
        FROM public.audits x
        WHERE x.organization_id = v_org
          AND x.status = 'completed'
          AND x.completed_date >= m.month_start::date
          AND x.completed_date < (m.month_start + interval '1 month')::date
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS nc_count
        FROM public.nonconformities y
        WHERE y.organization_id = v_org
          AND y.created_at >= m.month_start
          AND y.created_at < m.month_start + interval '1 month'
      ) n ON true
    ), '[]'::jsonb),
    'site_areas', COALESCE((
      SELECT jsonb_agg(z.area ORDER BY z.area)
      FROM (
        SELECT DISTINCT TRIM(u.area) AS area
        FROM (
          SELECT t.area
          FROM public.production_form_templates t
          WHERE t.organization_id = v_org
            AND t.is_active
            AND t.area IS NOT NULL
            AND TRIM(t.area) <> ''
          UNION
          SELECT s.area
          FROM public.production_form_submissions s
          WHERE s.organization_id = v_org
            AND s.submitted_at >= timezone('utc', now()) - interval '90 days'
            AND s.area IS NOT NULL
            AND TRIM(s.area) <> ''
        ) u
      ) z
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;
