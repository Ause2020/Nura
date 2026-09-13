import { periodDateInSantiago } from "@/lib/ai-insights/period";
import { getOrCreateDailyInsight } from "@/lib/ai-insights/generate";
import {
  auditUpcomingEmail,
  capaDueEmail,
  capaOverdueEmail,
  weeklySummaryEmail,
} from "@/lib/email/templates";
import { getUserEmails, sendEmail } from "@/lib/email/send";
import {
  createNotifications,
  type CreateNotificationInput,
} from "@/lib/notifications";
import { getNotificationPreferencesAdmin } from "@/lib/settings/preferences";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Audit, Nonconformity, NotificationPreferences } from "@/types/database";

const MS_DAY = 86400000;
const JOB_KEY = "notifications-cron";

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

function defaultPrefs(organizationId: string): NotificationPreferences {
  return {
    organization_id: organizationId,
    email_capa_due: true,
    email_weekly_summary: true,
    email_audit_completed: false,
    updated_at: new Date().toISOString(),
  };
}

type SupabaseClient = {
  from: (table: string) => ReturnType<
    ReturnType<typeof import("@/lib/supabase/client").createClient>["from"]
  >;
  rpc?: (
    fn: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  auth?: {
    admin?: {
      getUserById: (id: string) => Promise<{
        data: { user: { email?: string } | null };
        error: unknown;
      }>;
    };
  };
};

type Manager = { id: string; full_name: string };

type PendingEmail = {
  userId: string;
  dedupKey: string;
  send: (email: string) => Promise<boolean>;
};

export interface CronOrgContext {
  managers?: Manager[];
  prefs?: NotificationPreferences | null;
}

async function getManagerProfiles(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Manager[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("organization_id", organizationId)
    .in("role", ["admin", "quality_manager"]);

  return (data ?? []) as Manager[];
}

function createdKey(userId: string, dedupKey: string | null): string {
  return `${userId}:${dedupKey ?? ""}`;
}

export interface CronResult {
  organizationId: string;
  notificationsCreated: number;
  emailsSent: number;
  skipped?: boolean;
}

async function tryAcquireJobLock(admin: SupabaseClient): Promise<boolean> {
  if (!admin.rpc) return true;
  const { data, error } = await admin.rpc("try_acquire_job_lock", {
    p_job: JOB_KEY,
    p_ttl_seconds: 480,
  });
  if (error) return true;
  return data === true;
}

export async function listOrganizationsForNotificationCron(
  admin: SupabaseClient
): Promise<string[]> {
  const today = startOfDay(new Date());
  const todayIso = today.toISOString().split("T")[0];
  const in48hIso = new Date(today.getTime() + 2 * MS_DAY).toISOString().split("T")[0];
  const in7dIso = new Date(today.getTime() + 7 * MS_DAY).toISOString().split("T")[0];
  const isMonday = today.getDay() === 1;
  const periodDate = periodDateInSantiago();

  const { data: orgsData } = await admin
    .from("organizations")
    .select("id")
    .eq("access_status", "active");
  const activeIds = ((orgsData ?? []) as { id: string }[]).map((o) => o.id);
  if (activeIds.length === 0) return [];

  const { data: managerRows } = await admin
    .from("profiles")
    .select("organization_id")
    .in("organization_id", activeIds)
    .in("role", ["admin", "quality_manager"]);

  const withManagers = [
    ...new Set(
      ((managerRows ?? []) as { organization_id: string | null }[])
        .map((row) => row.organization_id)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  if (withManagers.length === 0) return [];
  if (isMonday) return withManagers;

  const [{ data: dueNcs }, { data: dueAudits }, { data: insightRows }] =
    await Promise.all([
      admin
        .from("nonconformities")
        .select("organization_id")
        .in("organization_id", withManagers)
        .neq("status", "closed")
        .not("due_date", "is", null)
        .lte("due_date", in48hIso),
      admin
        .from("audits")
        .select("organization_id")
        .in("organization_id", withManagers)
        .in("status", ["scheduled", "in_progress"])
        .gte("scheduled_date", todayIso)
        .lte("scheduled_date", in7dIso),
      admin
        .from("ai_daily_insights")
        .select("organization_id, overall_risk")
        .in("organization_id", withManagers)
        .eq("period_date", periodDate),
    ]);

  const needed = new Set<string>();
  for (const row of (dueNcs ?? []) as { organization_id: string }[]) {
    needed.add(row.organization_id);
  }
  for (const row of (dueAudits ?? []) as { organization_id: string }[]) {
    needed.add(row.organization_id);
  }

  const insightByOrg = new Map(
    ((insightRows ?? []) as { organization_id: string; overall_risk: string }[]).map(
      (row) => [row.organization_id, row.overall_risk]
    )
  );
  for (const orgId of withManagers) {
    const risk = insightByOrg.get(orgId);
    if (!risk || risk !== "ok") needed.add(orgId);
  }

  return [...needed];
}

export async function runNotificationCronForOrg(
  supabase: SupabaseClient,
  organizationId: string,
  preload?: CronOrgContext
): Promise<CronResult> {
  const today = startOfDay(new Date());
  const in48h = new Date(today.getTime() + 2 * MS_DAY);
  const in7d = new Date(today.getTime() + 7 * MS_DAY);
  const todayIso = today.toISOString().split("T")[0];
  const in48hIso = in48h.toISOString().split("T")[0];
  const in7dIso = in7d.toISOString().split("T")[0];
  const isMonday = today.getDay() === 1;

  const managers =
    preload?.managers ?? (await getManagerProfiles(supabase, organizationId));
  if (managers.length === 0) {
    return { organizationId, notificationsCreated: 0, emailsSent: 0 };
  }

  const prefs =
    preload?.prefs !== undefined
      ? preload.prefs ?? defaultPrefs(organizationId)
      : (await getNotificationPreferencesAdmin(organizationId)) ??
        defaultPrefs(organizationId);
  const adminClient = createAdminClient();
  const pending: CreateNotificationInput[] = [];
  const emails: PendingEmail[] = [];

  const [{ data: ncsData }, { data: auditsData }, weeklyCounts] =
    await Promise.all([
      supabase
        .from("nonconformities")
        .select("id, nc_number, description, due_date, status, severity")
        .eq("organization_id", organizationId)
        .neq("status", "closed")
        .not("due_date", "is", null)
        .lte("due_date", in48hIso),
      supabase
        .from("audits")
        .select("id, title, scheduled_date, status")
        .eq("organization_id", organizationId)
        .in("status", ["scheduled", "in_progress"])
        .gte("scheduled_date", todayIso)
        .lte("scheduled_date", in7dIso),
      isMonday && prefs.email_weekly_summary !== false
        ? Promise.all([
            supabase
              .from("nonconformities")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .neq("status", "closed"),
            supabase
              .from("nonconformities")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", organizationId)
              .neq("status", "closed")
              .lt("due_date", todayIso),
          ])
        : Promise.resolve(null),
    ]);

  const ncs = (ncsData ?? []) as Nonconformity[];
  const audits = (auditsData ?? []) as Audit[];

  for (const nc of ncs) {
    if (!nc.due_date) continue;
    const due = startOfDay(new Date(nc.due_date));
    const dueIso = due.toISOString().split("T")[0];

    for (const manager of managers) {
      if (due < today) {
        const dedupKey = `capa-overdue-${nc.id}`;
        pending.push({
          organizationId,
          userId: manager.id,
          type: "capa_overdue",
          title: "NC vencida",
          message: `${nc.nc_number} requiere acción inmediata`,
          link: `/capa/${nc.id}`,
          dedupKey,
        });
        if (prefs.email_capa_due !== false) {
          emails.push({
            userId: manager.id,
            dedupKey,
            send: async (email) => {
              const tpl = capaOverdueEmail({
                ncNumber: nc.nc_number,
                description: nc.description.slice(0, 120),
                dueDate: new Date(nc.due_date!).toLocaleDateString("es"),
                appUrl: appUrl(`/capa/${nc.id}`),
              });
              const result = await sendEmail({ to: email, ...tpl });
              return result.ok;
            },
          });
        }
      } else if (dueIso >= todayIso && dueIso <= in48hIso) {
        const dedupKey = `capa-due-${nc.id}-${dueIso}`;
        pending.push({
          organizationId,
          userId: manager.id,
          type: "capa_due",
          title: "CAPA por vencer",
          message: `${nc.nc_number} vence el ${new Date(nc.due_date).toLocaleDateString("es")}`,
          link: `/capa/${nc.id}`,
          dedupKey,
        });
        if (prefs.email_capa_due !== false) {
          emails.push({
            userId: manager.id,
            dedupKey,
            send: async (email) => {
              const tpl = capaDueEmail({
                ncNumber: nc.nc_number,
                description: nc.description.slice(0, 120),
                dueDate: new Date(nc.due_date!).toLocaleDateString("es"),
                appUrl: appUrl(`/capa/${nc.id}`),
              });
              const result = await sendEmail({ to: email, ...tpl });
              return result.ok;
            },
          });
        }
      }
    }
  }

  if (weeklyCounts) {
    const openNcs = weeklyCounts[0].count ?? 0;
    const overdueNcs = weeklyCounts[1].count ?? 0;
    const upcomingAudits = audits.length;
    const weekKey = `${today.getFullYear()}-W${Math.ceil((today.getDate() + 1) / 7)}`;

    for (const manager of managers) {
      const dedupKey = `weekly-summary-${weekKey}`;
      pending.push({
        organizationId,
        userId: manager.id,
        type: "system",
        title: "Resumen semanal",
        message: `${openNcs} NC abiertas · ${overdueNcs} vencidas · ${upcomingAudits} auditorías próximas`,
        link: "/dashboard",
        dedupKey,
      });
      emails.push({
        userId: manager.id,
        dedupKey,
        send: async (email) => {
          const tpl = weeklySummaryEmail({
            openNcs,
            overdueNcs,
            upcomingAudits,
            appUrl: appUrl("/dashboard"),
          });
          const result = await sendEmail({ to: email, ...tpl });
          return result.ok;
        },
      });
    }
  }

  for (const audit of audits) {
    const scheduled = startOfDay(new Date(audit.scheduled_date));
    const scheduledIso = scheduled.toISOString().split("T")[0];
    if (scheduledIso < todayIso || scheduledIso > in7dIso) continue;

    const daysUntil = daysBetween(today, scheduled);

    for (const manager of managers) {
      const dedupKey = `audit-upcoming-${audit.id}`;
      pending.push({
        organizationId,
        userId: manager.id,
        type: "audit_upcoming",
        title: "Auditoría próxima",
        message: `${audit.title} — ${daysUntil === 0 ? "hoy" : `en ${daysUntil} días`}`,
        link: `/auditorias/${audit.id}/ejecutar`,
        dedupKey,
      });
      if (daysUntil <= 7 && daysUntil >= 5) {
        emails.push({
          userId: manager.id,
          dedupKey,
          send: async (email) => {
            const tpl = auditUpcomingEmail({
              auditTitle: audit.title,
              scheduledDate: new Date(audit.scheduled_date).toLocaleDateString(
                "es"
              ),
              daysUntil,
              appUrl: appUrl(`/auditorias/${audit.id}/ejecutar`),
            });
            const result = await sendEmail({ to: email, ...tpl });
            return result.ok;
          },
        });
      }
    }
  }

  try {
    const insight = await getOrCreateDailyInsight(organizationId, supabase);
    if (insight.overallRisk !== "ok") {
      for (const manager of managers) {
        pending.push({
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
      }
    }
  } catch {
    // La tabla puede no existir aún (migración 033). No abortar el cron.
  }

  const created = await createNotifications(supabase, pending);
  const createdKeys = new Set(
    created.map((row) => createdKey(row.user_id, row.dedup_key))
  );

  let emailsSent = 0;
  if (adminClient && emails.length > 0) {
    const addressByUser = await getUserEmails(
      adminClient,
      emails.map((item) => item.userId)
    );
    for (const item of emails) {
      if (!createdKeys.has(createdKey(item.userId, item.dedupKey))) continue;
      const email = addressByUser.get(item.userId);
      if (!email) continue;
      if (await item.send(email)) emailsSent++;
    }
  }

  return {
    organizationId,
    notificationsCreated: created.length,
    emailsSent,
  };
}

export async function runNotificationCronAllOrgs(): Promise<CronResult[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const locked = await tryAcquireJobLock(admin);
  if (!locked) {
    return [{ organizationId: "*", notificationsCreated: 0, emailsSent: 0, skipped: true }];
  }

  const orgIds = await listOrganizationsForNotificationCron(admin);
  if (orgIds.length === 0) {
    await admin.rpc("cleanup_rate_limit_windows", { p_older_than: "2 days" });
    return [];
  }

  const [{ data: managerRows }, { data: prefRows }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, organization_id")
      .in("organization_id", orgIds)
      .in("role", ["admin", "quality_manager"]),
    admin
      .from("notification_preferences")
      .select("*")
      .in("organization_id", orgIds),
  ]);

  const managersByOrg = new Map<string, Manager[]>();
  for (const row of (managerRows ?? []) as (Manager & { organization_id: string })[]) {
    const list = managersByOrg.get(row.organization_id) ?? [];
    list.push({ id: row.id, full_name: row.full_name });
    managersByOrg.set(row.organization_id, list);
  }

  const prefsByOrg = new Map(
    ((prefRows ?? []) as NotificationPreferences[]).map((row) => [
      row.organization_id,
      row,
    ])
  );

  const results: CronResult[] = [];
  for (const orgId of orgIds) {
    results.push(
      await runNotificationCronForOrg(admin, orgId, {
        managers: managersByOrg.get(orgId) ?? [],
        prefs: prefsByOrg.get(orgId) ?? defaultPrefs(orgId),
      })
    );
  }

  await admin.rpc("cleanup_rate_limit_windows", { p_older_than: "2 days" });
  return results;
}
