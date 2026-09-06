import { notFound, redirect } from "next/navigation";
import { DocumentDetailView } from "@/components/documents/document-detail-view";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  ControlledDocument,
  DocumentReadAcknowledgment,
  DocumentStateLog,
  DocumentVersion,
  Profile,
  UserRole,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function DocumentoDetailPage({
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

  const role = (profileData as { role: UserRole } | null)?.role ?? "operator";

  const { data: docData } = await supabase
    .from("controlled_documents")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!docData) notFound();

  const document = docData as ControlledDocument;

  if (
    role === "operator" &&
    document.status !== "published" &&
    document.status !== "obsolete"
  ) {
    notFound();
  }

  const [
    { data: versionsData },
    { data: logData },
    { data: acksData },
    { data: membersData },
  ] = await Promise.all([
    supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", id)
      .eq("organization_id", orgId)
      .order("version_number", { ascending: false }),
    supabase
      .from("document_state_log")
      .select("*")
      .eq("document_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_read_acknowledgments")
      .select("*")
      .eq("document_id", id)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("organization_id", orgId),
  ]);

  const currentVersionId = document.current_version_id;
  const acksForVersion = (acksData ?? []).filter(
    (a) =>
      !currentVersionId ||
      (a as DocumentReadAcknowledgment).version_id === currentVersionId
  );

  return (
    <DocumentDetailView
      document={document}
      versions={(versionsData ?? []) as DocumentVersion[]}
      stateLog={(logData ?? []) as DocumentStateLog[]}
      acknowledgments={acksForVersion as DocumentReadAcknowledgment[]}
      profiles={(membersData ?? []) as Pick<Profile, "id" | "full_name" | "role">[]}
      organizationId={orgId}
      userId={user.id}
      userRole={role}
    />
  );
}
