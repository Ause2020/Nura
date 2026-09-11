import { generateDailyInsight } from "@/lib/ai-insights/generate";
import {
  auditUpcomingEmail,
  capaDueEmail,
  capaOverdueEmail,
  weeklySummaryEmail,
} from "@/lib/email/templates";
import { getUserEmail, sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { getNotificationPreferencesAdmin } from "@/lib/settings/preferences";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Audit, Nonconformity } from "@/types/database";

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
  const todayIso = today.toISOString().split("T")[0];
  const in48hIso = in48h.toISOString().split("T")[0];
  const in7dIso = in7d.toISOString().split("T")[0];

  const managers = await getManagerProfiles(supabase, organizationId);
  const prefs = await getNotificationPreferencesAdmin(organizationId);
  let notificationsCreated = 0;
  let emailsSent = 0;

  const adminClient = createAdminClient();

  const [{ data: ncsData }, { data: auditsData }] = await Promise.all([
    supabase
      .from("nonconformities")
      .select("id, nc_number, description, due_date, status, severity")
      .eq("organization_id", organizationId)
      .neq("status", "closed"),
    supabase
      .from("audits")
      .select("id, title, scheduled_date, status")
      .eq("organization_id", organizationId)
      .in("status", ["scheduled", "in_progress"]),
  ]);

  const ncs = (ncsData ?? []) as Nonconformity[];
  const audits = (auditsData ?? []) as Audit[];

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
