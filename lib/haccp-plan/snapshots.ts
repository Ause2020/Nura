import { createClient } from "@/lib/supabase/client";
import { computeDocumentSignatureHash } from "@/lib/documents/utils";
import { isStepComplete, STEP_CHECKLISTS } from "@/lib/haccp-plan/checklists";
import { STEP_META } from "@/lib/haccp-plan/constants";
import type { HaccpPlanDetails, HazardRow } from "@/lib/haccp-plan/types";
import type { StepPayloadMap } from "@/lib/haccp-plan/step-data-service";

function processStepLabel(details: HaccpPlanDetails, hazardId: string): string {
  const hazard = details.hazards.find((item) => item.id === hazardId);
  if (!hazard) return "";
  return (
    details.diagrams
      .flatMap((diagram) => diagram.nodes)
      .find((node) => node.id === hazard.stepId)?.label ?? hazard.stepId
  );
}

export function buildStepSnapshot(
  stepId: number,
  details: HaccpPlanDetails,
  stepData: Partial<StepPayloadMap>,
  activeDiagramId: string | null
) {
  const step = STEP_META.find((item) => item.id === stepId);
  switch (stepId) {
    case 1:
      return {
        team: details.team.map((member) => ({
          name: member.name,
          role: member.role,
          area: member.area,
          qual: member.qual,
          trainingDate: member.trainingDate,
          trainingFile: member.trainingEvidence?.name ?? null,
        })),
      };
    case 2:
      return {
        products: details.products.map((product) => ({
          name: product.name,
          specs: product.specs,
          allergens: product.allergens,
          resolution: product.resolutionNumber,
        })),
      };
    case 3:
      return {
        intendedUse: details.products.map((product) => ({
          name: product.name,
          intendedUse: product.intendedUse,
          consumerGroups: product.consumerGroups,
        })),
      };
    case 4: {
      const diagram =
        details.diagrams.find((item) => item.id === activeDiagramId) ??
        details.diagrams[0];
      return diagram
        ? { name: diagram.name, nodes: diagram.nodes, edges: diagram.edges }
        : {};
    }
    case 5:
      return {
        observations: details.validation.observations,
        filesCount: details.validation.files.length,
      };
    case 6:
      return {
        hazards: details.hazards,
        threshold: details.plan.riskMatrix.significanceThreshold,
      };
    case 7:
      return {
        questions: stepData[7]?.questions ?? {},
        decisions: (stepData[7]?.hazards ?? []).map((hazard: HazardRow) => ({
          id: hazard.id,
          q1: hazard.q1,
          q2: hazard.q2,
          q3: hazard.q3,
          q4: hazard.q4,
          isCCP: hazard.isCCP,
        })),
      };
    case 8:
      return {
        criticalLimits: (stepData[8]?.criticalLimits ?? []).map((limit) => ({
          ...limit,
          processStep: processStepLabel(details, limit.hazardId),
        })),
      };
    case 9:
      return {
        monitoringPlans: (stepData[9]?.monitoringPlans ?? []).map((plan) => ({
          ...plan,
          processStep: processStepLabel(details, plan.hazardId),
        })),
      };
    case 10:
      return {
        correctiveActions: (stepData[10]?.correctiveActions ?? []).map(
          (action) => ({
            ...action,
            processStep: processStepLabel(details, action.hazardId),
          })
        ),
      };
    case 11:
      return stepData[11]?.verificationPlan ?? { activities: [], generalObservations: "" };
    case 12:
      return {
        completedSteps: Object.keys(STEP_CHECKLISTS).filter((id) =>
          isStepComplete(Number(id), details.plan.checklistProgress)
        ).length,
      };
    default:
      return { step: step?.title };
  }
}

export async function createPlanVersionDocument(input: {
  organizationId: string;
  userId: string;
  stepId: number;
  title: string;
  version: string;
  changes: string;
  snapshot: unknown;
}) {
  const supabase = createClient();
  const step = STEP_META.find((item) => item.id === input.stepId);
  const code = `HACCP-S${input.stepId}-${input.version.replace(/[^A-Za-z0-9.-]/g, "")}`.slice(0, 40);
  const now = new Date().toISOString();

  const { data: doc, error: docError } = await supabase
    .from("controlled_documents")
    .insert({
      organization_id: input.organizationId,
      code,
      title: input.title,
      category: "specification",
      status: "draft",
      owner_id: input.userId,
      created_by: input.userId,
    })
    .select("id")
    .single();

  if (docError || !doc) {
    throw new Error(docError?.message ?? "No se pudo crear el documento");
  }

  const documentId = (doc as { id: string }).id;
  const blob = new Blob(
    [JSON.stringify({ module: `Plan HACCP - ${step?.title ?? input.stepId}`, data: input.snapshot }, null, 2)],
    { type: "application/json" }
  );
  const path = `${input.organizationId}/${documentId}/v1-snapshot.json`;
  await supabase.storage.from("documents").upload(path, blob, { upsert: true });
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);

  const hash = await computeDocumentSignatureHash({
    userId: input.userId,
    action: "create-haccp-version",
    documentId,
    timestamp: now,
  });

  const { data: version, error: versionError } = await supabase
    .from("document_versions")
    .insert({
      organization_id: input.organizationId,
      document_id: documentId,
      version_number: 1,
      file_url: urlData.publicUrl,
      file_name: `${code}.json`,
      change_summary: input.changes,
      created_by: input.userId,
      version_status: "draft",
    })
    .select("id")
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "No se pudo crear la versión");
  }

  await supabase
    .from("controlled_documents")
    .update({ current_version_id: (version as { id: string }).id })
    .eq("id", documentId);

  await supabase.from("document_state_log").insert({
    organization_id: input.organizationId,
    document_id: documentId,
    version_id: (version as { id: string }).id,
    from_status: null,
    to_status: "draft",
    changed_by: input.userId,
    comment: `Snapshot Plan HACCP — ${step?.title}`,
    signature_hash: hash,
  });

  return documentId;
}
