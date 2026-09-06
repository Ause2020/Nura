import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getLatestInsight } from "@/lib/ai-insights/store";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { fetchDashboardData } from "@/lib/dashboard/data";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const orgId = await requireOrganizationId();
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);
  if (!user) redirect("/login");

  const userName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "Usuario";

  const data = await fetchDashboardData(orgId, userName);

  const insight =
    profile?.role === "operator"
      ? null
      : await getLatestInsight(orgId, await createClient());

  return <DashboardView data={data} insight={insight} />;
}
