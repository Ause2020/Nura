import { notFound, redirect } from "next/navigation";
import { ProductionSubmissionDetail } from "@/components/production-records/production-submission-detail";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type {
  ProductionFormSubmission,
  ProductionFormSubmissionValue,
  ProductionFormTemplate,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function RegistroDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: submissionData } = await supabase
    .from("production_form_submissions")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!submissionData) notFound();

  const submission = submissionData as ProductionFormSubmission;

  const [{ data: valuesData }, { data: templateData }] = await Promise.all([
    supabase
      .from("production_form_submission_values")
      .select("*")
      .eq("submission_id", id)
      .eq("organization_id", orgId)
      .order("created_at"),
    supabase
      .from("production_form_templates")
      .select("*")
      .eq("id", submission.template_id)
      .maybeSingle(),
  ]);

  return (
    <ProductionSubmissionDetail
      submission={submission}
      template={(templateData as ProductionFormTemplate | null) ?? null}
      values={(valuesData ?? []) as ProductionFormSubmissionValue[]}
    />
  );
}
