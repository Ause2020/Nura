import { generateDailyInsight } from "@/lib/ai-insights/generate";
import {
  auditUpcomingEmail,
  capaDueEmail,
  capaOverdueEmail,
  supplierDocExpiringEmail,
  supplierEvalOverdueEmail,
  weeklySummaryEmail,
} from "@/lib/email/templates";
import { getCriticalityLabel } from "@/lib/suppliers/constants";
import { daysUntil, isEvaluationOverdue } from "@/lib/suppliers/utils";
import { getUserEmail, sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { getNotificationPreferencesAdmin } from "@/lib/settings/preferences";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Audit,
  CustomerComplaint,
  Nonconformity,
  Supplier,
  SupplierDocument,
  SupplierEvaluation,
  TrainingAssignment,
} from "@/types/database";

const MS_DAY = 86400000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_DAY
  );
}

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

type SupabaseClient = {
  from: (table: string) => ReturnType<
    ReturnType<typeof import("@/lib/supabase/client").createClient>["from"]
  >;
  auth?: {
    admin?: {
      getUserById: (id: string) => Promise<{
        data: { user: { email?: string } | null };
        error: unknown;
      }>;
    };
  };
};

async function getManagerProfiles(
  supabase: SupabaseClient,
  organizationId: string
) {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "quality_manager"]);

  return (data ?? []) as { id: string; full_name: string }[];
}

export interface CronResult {
  organizationId: string;
  notificationsCreated: number;
  emailsSent: number;
}

export async function runNotificationCronForOrg(
  supabase: SupabaseClient,
  organizationId: string
): Promise<CronResult> {
  const today = startOfDay(new Date());
  const in48h = new Date(today.getTime() + 2 * MS_DAY);
  const in7d = new Date(today.getTime() + 7 * MS_DAY);
  const in30d = new Date(today.getTime() + 30 * MS_DAY);
  const todayIso = today.toISOString().split("T")[0];
  const in48hIso = in48h.toISOString().split("T")[0];
  const in7dIso = in7d.toISOString().split("T")[0];
  const in30dIso = in30d.toISOString().split("T")[0];

  const managers = await getManagerProfiles(supabase, organizationId);
  const prefs = await getNotificationPreferencesAdmin(organizationId);
  let notificationsCreated = 0;
  let emailsSent = 0;

  const adminClient = createAdminClient();

  const [
    { data: ncsData },
    { data: auditsData },
    { data: supplierDocsData },
    { data: suppliersData },
    { data: supplierEvalsData },
    { data: trainingAssignmentsData },
    { data: trainingCoursesData },
    { data: complaintsData },
  ] = await Promise.all([
      supabase
        .from("nonconformities")
        .select("*")
        .eq("organization_id", organizationId)
        .neq("status", "closed"),
      supabase
        .from("audits")
        .select("*")
        .eq("organization_id", organizationId)
        .in("status", ["scheduled", "in_progress"]),
      supabase
        .from("supplier_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .not("expiry_date", "is", null),
      supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", organizationId),
      supabase
        .from("supplier_evaluations")
        .select("supplier_id, evaluation_date")
        .eq("organization_id", organizationId)
        .order("evaluation_date", { ascending: false }),
      supabase
        .from("training_assignments")
        .select("*")
        .eq("organization_id", organizationId)
        .neq("status", "completed"),
      supabase
        .from("training_courses")
        .select("id, title")
        .eq("organization_id", organizationId),
      supabase
        .from("customer_complaints")
        .select("*")
        .eq("organization_id", organizationId)
        .neq("status", "closed")
        .is("response_date", null),
    ]);

  const ncs = (ncsData ?? []) as Nonconformity[];
  const audits = (auditsData ?? []) as Audit[];
  const supplierDocs = (supplierDocsData ?? []) as SupplierDocument[];
  const suppliers = (suppliersData ?? []) as Supplier[];
  const criticalSuppliers = suppliers.filter(
    (s) =>
      s.criticality === "critical" &&
      (s.status === "approved" || s.status === "conditional")
  );
  const supplierNameById = new Map(suppliers.map((s) => [s.id, s.name] as const));
  const supplierEvals = (supplierEvalsData ?? []) as Pick<
    SupplierEvaluation,
    "supplier_id" | "evaluation_date"
  >[];
  const trainingAssignments = (trainingAssignmentsData ??
    []) as TrainingAssignment[];
  const openComplaints = (complaintsData ?? []) as CustomerComplaint[];
  const courseTitleById = new Map(
    ((trainingCoursesData ?? []) as { id: string; title: string }[]).map(
      (c) => [c.id, c.title] as const
    )
  );

  const lastEvalBySupplier = new Map<string, string>();
  for (const ev of supplierEvals) {
    if (!lastEvalBySupplier.has(ev.supplier_id)) {
      lastEvalBySupplier.set(ev.supplier_id, ev.evaluation_date);
    }
  }

  for (const nc of ncs) {
    if (!nc.due_date) continue;
    const due = startOfDay(new Date(nc.due_date));
    const dueIso = due.toISOString().split("T")[0];

    for (const manager of managers) {
      if (due < today) {
        const row = await createNotification(supabase, {
          organizationId,
          userId: manager.id,
          type: "capa_overdue",
          title: "NC vencida",
          message: `${nc.nc_number} requiere acción inmediata`,
          link: `/capa/${nc.id}`,
          dedupKey: `capa-overdue-${nc.id}`,
        });
        if (row) notificationsCreated++;

        if (adminClient && row && prefs?.email_capa_due !== false) {
          const email = await getUserEmail(adminClient, manager.id);
          if (email) {
            const tpl = capaOverdueEmail({
              ncNumber: nc.nc_number,
              description: nc.description.slice(0, 120),
              dueDate: new Date(nc.due_date).toLocaleDateString("es"),
              appUrl: appUrl(`/capa/${nc.id}`),
            });
            const result = await sendEmail({ to: email, ...tpl });
            if (result.ok) emailsSent++;
          }
        }
      } else if (dueIso >= todayIso && dueIso <= in48hIso) {
        const row = await createNotification(supabase, {
          organizationId,
          userId: manager.id,
          type: "capa_due",
          title: "CAPA por vencer",
          message: `${nc.nc_number} vence el ${new Date(nc.due_date).toLocaleDateString("es")}`,
          link: `/capa/${nc.id}`,
          dedupKey: `capa-due-${nc.id}-${dueIso}`,
        });
        if (row) notificationsCreated++;

        if (adminClient && row && prefs?.email_capa_due !== false) {
          const email = await getUserEmail(adminClient, manager.id);
          if (email) {
            const tpl = capaDueEmail({
              ncNumber: nc.nc_number,
              description: nc.description.slice(0, 120),
              dueDate: new Date(nc.due_date).toLocaleDateString("es"),
              appUrl: appUrl(`/capa/${nc.id}`),
            });
            const result = await sendEmail({ to: email, ...tpl });
            if (result.ok) emailsSent++;
          }
        }
      }
    }
  }

  if (
    prefs?.email_weekly_summary !== false &&
    today.getDay() === 1
  ) {
    const weekKey = `${today.getFullYear()}-W${Math.ceil((today.getDate() + 1) / 7)}`;
    const openNcs = ncs.filter((nc) => nc.status !== "closed").length;
    const overdueNcs = ncs.filter((nc) => {
      if (!nc.due_date) return false;
      return startOfDay(new Date(nc.due_date)) < today;
    }).length;
    const upcomingAudits = audits.filter((audit) => {
      const scheduled = startOfDay(new Date(audit.scheduled_date));
      const scheduledIso = scheduled.toISOString().split("T")[0];
      return scheduledIso >= todayIso && scheduledIso <= in7dIso;
    }).length;

    for (const manager of managers) {
      const row = await createNotification(supabase, {
        organizationId,
        userId: manager.id,
        type: "system",
        title: "Resumen semanal",
        message: `${openNcs} NC abiertas · ${overdueNcs} vencidas · ${upcomingAudits} auditorías próximas`,
        link: "/dashboard",
        dedupKey: `weekly-summary-${weekKey}`,
      });
      if (row) notificationsCreated++;

      if (adminClient && row) {
        const email = await getUserEmail(adminClient, manager.id);
        if (email) {
          const tpl = weeklySummaryEmail({
            openNcs,
            overdueNcs,
            upcomingAudits,
            appUrl: appUrl("/dashboard"),
          });
          const result = await sendEmail({ to: email, ...tpl });
          if (result.ok) emailsSent++;
        }
      }
    }
  }

  for (const audit of audits) {
    const scheduled = startOfDay(new Date(audit.scheduled_date));
    const scheduledIso = scheduled.toISOString().split("T")[0];
    if (scheduledIso < todayIso || scheduledIso > in7dIso) continue;

    const daysUntil = daysBetween(today, scheduled);

    for (const manager of managers) {
      const row = await createNotification(supabase, {
        organizationId,
        userId: manager.id,
        type: "audit_upcoming",
        title: "Auditoría próxima",
        message: `${audit.title} — ${daysUntil === 0 ? "hoy" : `en ${daysUntil} días`}`,
        link: `/auditorias/${audit.id}/ejecutar`,
        dedupKey: `audit-upcoming-${audit.id}`,
      });
      if (row) notificationsCreated++;

      if (adminClient && row && daysUntil <= 7 && daysUntil >= 5) {
        const email = await getUserEmail(adminClient, manager.id);
        if (email) {
          const tpl = auditUpcomingEmail({
            auditTitle: audit.title,
            scheduledDate: new Date(audit.scheduled_date).toLocaleDateString("es"),
            daysUntil,
            appUrl: appUrl(`/auditorias/${audit.id}/ejecutar`),
          });
          const result = await sendEmail({ to: email, ...tpl });
          if (result.ok) emailsSent++;
        }
      }
    }
  }

  for (const doc of supplierDocs) {
    if (!doc.expiry_date) continue;
    const expiryIso = doc.expiry_date;
    if (expiryIso < todayIso || expiryIso > in30dIso) continue;

    const daysLeft = daysUntil(expiryIso);
    const supplierName = supplierNameById.get(doc.supplier_id) ?? "Proveedor";

    for (const manager of managers) {
      const row = await createNotification(supabase, {
        organizationId,
        userId: manager.id,
        type: "supplier_doc_expiring",
        title: "Documento de proveedor por vencer",
        message: `${supplierName}: ${doc.doc_name} — ${daysLeft} días`,
        link: `/proveedores/${doc.supplier_id}`,
        dedupKey: `supplier-doc-exp-${doc.id}-${expiryIso}`,
      });
      if (row) notificationsCreated++;

      if (adminClient && row && prefs?.email_capa_due !== false) {
        const email = await getUserEmail(adminClient, manager.id);
        if (email) {
          const tpl = supplierDocExpiringEmail({
            supplierName,
            docName: doc.doc_name,
            expiryDate: new Date(doc.expiry_date).toLocaleDateString("es"),
            daysUntil: daysLeft,
            appUrl: appUrl(`/proveedores/${doc.supplier_id}`),
          });
          const result = await sendEmail({ to: email, ...tpl });
          if (result.ok) emailsSent++;
        }
      }
    }
  }

  for (const supplier of criticalSuppliers) {
    const lastEval = lastEvalBySupplier.get(supplier.id);
    const overdueBySchedule = isEvaluationOverdue(supplier.next_evaluation_date);
    const overdueByLastEval =
      !lastEval ||
      daysUntil(lastEval) < -180;

    if (!overdueBySchedule && !overdueByLastEval) continue;

    for (const manager of managers) {
      const row = await createNotification(supabase, {
        organizationId,
        userId: manager.id,
        type: "supplier_eval_overdue",
        title: "Evaluación de proveedor pendiente",
        message: `${supplier.name} (crítico) requiere evaluación`,
        link: `/proveedores/${supplier.id}`,
        dedupKey: `supplier-eval-overdue-${supplier.id}-${todayIso}`,
      });
      if (row) notificationsCreated++;

      if (adminClient && row && prefs?.email_capa_due !== false) {
        const email = await getUserEmail(adminClient, manager.id);
        if (email) {
          const tpl = supplierEvalOverdueEmail({
            supplierName: supplier.name,
            criticality: getCriticalityLabel(supplier.criticality),
            nextEvaluationDate: supplier.next_evaluation_date
              ? new Date(supplier.next_evaluation_date).toLocaleDateString("es")
              : null,
            appUrl: appUrl(`/proveedores/${supplier.id}`),
          });
          const result = await sendEmail({ to: email, ...tpl });
          if (result.ok) emailsSent++;
        }
      }
    }
  }

  for (const assignment of trainingAssignments) {
    if (!assignment.due_date) continue;
    const dueIso = assignment.due_date;
    const courseTitle =
      courseTitleById.get(assignment.course_id) ?? "Capacitación";
    const daysLeft = daysUntil(dueIso);

    if (dueIso < todayIso) {
      await createNotification(supabase, {
        organizationId,
        userId: assignment.user_id,
        type: "training_overdue",
        title: "Capacitación vencida",
        message: `${courseTitle} — venció el ${new Date(dueIso).toLocaleDateString("es")}`,
        link: "/capacitacion/mis-capacitaciones",
        dedupKey: `training-overdue-${assignment.id}`,
      });
      notificationsCreated++;
    } else if (dueIso >= todayIso && dueIso <= in7dIso) {
      await createNotification(supabase, {
        organizationId,
        userId: assignment.user_id,
        type: "training_due",
        title: "Capacitación por vencer",
        message: `${courseTitle} — ${daysLeft} días restantes`,
        link: "/capacitacion/mis-capacitaciones",
        dedupKey: `training-due-${assignment.id}-${dueIso}`,
      });
      notificationsCreated++;
    }
  }

  const nowMs = Date.now();
  const in24hMs = nowMs + 24 * MS_DAY;

  for (const complaint of openComplaints) {
    if (!complaint.response_due_at) continue;
    const dueMs = new Date(complaint.response_due_at).getTime();
    const isOverdue = dueMs < nowMs;
    const isDueSoon = !isOverdue && dueMs <= in24hMs;

    if (!isOverdue && !isDueSoon) continue;

    for (const manager of managers) {
      const row = await createNotification(supabase, {
        organizationId,
        userId: manager.id,
        type: isOverdue ? "complaint_sla_overdue" : "complaint_sla_due",
        title: isOverdue
          ? "Reclamo con SLA vencido"
          : "Reclamo SLA por vencer",
        message: `${complaint.complaint_number} — ${complaint.customer_name}`,
        link: `/reclamos/${complaint.id}`,
        dedupKey: isOverdue
          ? `complaint-sla-overdue-${complaint.id}`
          : `complaint-sla-due-${complaint.id}-${complaint.response_due_at}`,
      });
      if (row) notificationsCreated++;
    }
  }

  try {
    const insight = await generateDailyInsight(organizationId, supabase);
    if (insight.overallRisk !== "ok") {
      for (const manager of managers) {
        const row = await createNotification(supabase, {
          organizationId,
          userId: manager.id,
          type: "daily_insight",
          title:
            insight.overallRisk === "critical"
              ? "Análisis diario: crítico"
              : "Análisis diario listo",
          message: insight.headline,
          link: "/analisis",
          dedupKey: `daily-insight-${insight.periodDate}`,
        });
        if (row) notificationsCreated++;
      }
    }
  } catch {
    // La tabla puede no existir aún (migración 033). No abortar el cron.
  }

  return { organizationId, notificationsCreated, emailsSent };
}

export async function runNotificationCronAllOrgs(): Promise<CronResult[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data: orgsData } = await admin.from("organizations").select("id");
  const orgs = (orgsData ?? []) as { id: string }[];
  const results: CronResult[] = [];

  for (const org of orgs) {
    results.push(await runNotificationCronForOrg(admin, org.id));
  }

  return results;
}
