-- Nura · Agregados del kiosco de planta (SECURITY INVOKER + RLS)
-- Más liviano que get_dashboard_metrics: sin charts, documentos, orígenes ni historial.

CREATE OR REPLACE FUNCTION public.get_kiosk_metrics()
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
  v_week_start date;
  v_from timestamptz;
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
  v_week_start := date_trunc('week', v_today)::date;
  v_from := LEAST(v_week_start, v_month_start)::timestamptz;

  RETURN jsonb_build_object(
    'ok', true,
    'haccp_checklist_progress', (
      SELECT p.checklist_progress
      FROM public.haccp_plans p
      WHERE p.organization_id = v_org
      ORDER BY p.updated_at DESC
      LIMIT 1
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
        'open', COUNT(*) FILTER (WHERE n.status <> 'closed')::int,
        'overdue', COUNT(*) FILTER (
          WHERE n.status <> 'closed'
            AND n.due_date IS NOT NULL
            AND n.due_date < v_today
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
        'urgent_tasks', COUNT(*) FILTER (
          WHERE n.status <> 'closed'
            AND n.due_date IS NOT NULL
            AND (
              n.due_date = v_today
              OR (n.due_date = v_today + 1 AND n.severity = 'critical')
            )
        )::int
      )
      FROM public.nonconformities n
      WHERE n.organization_id = v_org
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
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_kiosk_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kiosk_metrics() TO authenticated;
