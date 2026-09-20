import { redirect } from "next/navigation";
import { DocumentsDashboard } from "@/components/documents/documents-dashboard";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { canManageQuality } from "@/lib/auth/permissions";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { startNavTimer, timeNav } from "@/lib/perf/dev-time";
import { rscNavCtx } from "@/lib/perf/rsc-nav";
import { createClient } from "@/lib/supabase/server";
import type { ControlledDocument } from "@/types/database";

export default async function DocumentosPage() {
  const nav = await rscNavCtx("/documentos");
  const endPage = startNavTimer("PAGE", "total", nav);
  const orgId = await requireOrganizationId();
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);
  if (!user) redirect("/login");

  const role = profile?.role ?? "operator";
  const canManage = canManageQuality(role);

  const supabase = await createClient();
  let query = supabase
    .from("controlled_documents")
    .select(
      "id, code, title, category, status, next_review_date, owner_id, current_version_id"
    )
    .eq("organization_id", orgId)
    .order("code");

  if (!canManage) {
    query = query.eq("status", "published");
  }

  const { data } = await timeNav("PAGE", "query", nav, () => query);

  endPage();
  return (
    <DocumentsDashboard
      documents={(data ?? []) as ControlledDocument[]}
      canManage={canManage}
    />
  );
}
