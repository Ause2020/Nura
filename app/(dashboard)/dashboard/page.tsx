import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getInsightTeaser } from "@/lib/ai-insights/store";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { fetchDashboardData } from "@/lib/dashboard/data";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { startDevTimer } from "@/lib/perf/dev-time";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const endTimer = startDevTimer("/dashboard");
  const orgId = await requireOrganizationId();
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);
  if (!user) redirect("/login");

  const userName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "Usuario";

  const [data, insight] = await Promise.all([
    fetchDashboardData(orgId, userName),
    profile?.role === "operator"
      ? Promise.resolve(null)
      : createClient().then((supabase) => getInsightTeaser(orgId, supabase)),
  ]);

  endTimer();
  return <DashboardView data={data} insight={insight} />;
}
