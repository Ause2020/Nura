import { notFound, redirect } from "next/navigation";
import { NcDetail } from "@/components/capa/nc-detail";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/ai/anthropic";
import type {
  CapaAction,
  CapaStageLog,
  Nc5Whys,
  NcFishboneCause,
  Nonconformity,
  Profile,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function CapaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const userRole = (profileData as { role: UserRole } | null)?.role ?? "operator";

  const { data: ncData } = await supabase
    .from("nonconformities")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  const nc = ncData as Nonconformity | null;
  if (!nc) notFound();

  const [
    { data: actionsData },
    { data: whysData },
    { data: fishboneData },
    { data: logData },
    { data: membersData },
    { data: similarData },
  ] = await Promise.all([
    supabase
      .from("capa_actions")
      .select("*")
      .eq("nc_id", nc.id)
      .order("created_at", { ascending: true }),
    supabase.from("nc_5whys").select("*").eq("nc_id", nc.id).maybeSingle(),
    supabase
      .from("nc_fishbone_causes")
      .select("*")
      .eq("nc_id", nc.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("capa_stage_log")
      .select("*")
      .eq("nc_id", nc.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("organization_id", orgId)
      .order("full_name"),
    supabase
      .from("nonconformities")
      .select("*")
      .eq("organization_id", orgId)
      .neq("id", nc.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <NcDetail
      nc={nc}
      actions={(actionsData ?? []) as CapaAction[]}
      fiveWhys={(whysData as Nc5Whys | null) ?? null}
      fishboneCauses={(fishboneData ?? []) as NcFishboneCause[]}
      stageLog={(logData ?? []) as CapaStageLog[]}
      members={(membersData ?? []) as Pick<Profile, "id" | "full_name">[]}
      similarNcs={(similarData ?? []) as Nonconformity[]}
      organizationId={orgId}
      userId={user.id}
      userRole={userRole}
      aiAvailable={isAiConfigured()}
    />
  );
}
