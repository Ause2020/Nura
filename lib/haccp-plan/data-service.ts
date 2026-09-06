import { createClient } from "@/lib/supabase/client";
import { INITIAL_PRODUCT_SPECS } from "@/lib/haccp-plan/constants";
import type { HaccpDbClient } from "@/lib/haccp-plan/db";
import {
  diagramToRow,
  hazardToRow,
  mapDiagram,
  mapEvidenceFiles,
  mapHazard,
  mapPlan,
  mapProduct,
  mapTeamMember,
  productToRow,
  teamToRow,
} from "@/lib/haccp-plan/mappers";
import type {
  Hazard,
  HaccpPlan,
  HaccpPlanDetails,
  PlanValidation,
  ProcessDiagram,
  Product,
  TeamMember,
} from "@/lib/haccp-plan/types";

function db(client?: HaccpDbClient) {
  return client ?? createClient();
}

const SEED_NODES = [
  { id: "seed-start", type: "start" as const, label: "Inicio", x: 348, y: 24 },
  { id: "seed-reception", type: "step" as const, label: "Recepción Materias Primas", x: 300, y: 140 },
  { id: "seed-storage", type: "step" as const, label: "Almacenamiento", x: 300, y: 268 },
  { id: "seed-end", type: "end" as const, label: "Fin", x: 348, y: 396 },
];

const SEED_EDGES = [
  { id: "seed-e1", source: "seed-start", target: "seed-reception", type: "step" as const, sourceSide: "bottom" as const, targetSide: "top" as const },
  { id: "seed-e2", source: "seed-reception", target: "seed-storage", type: "step" as const, sourceSide: "bottom" as const, targetSide: "top" as const },
  { id: "seed-e3", source: "seed-storage", target: "seed-end", type: "step" as const, sourceSide: "bottom" as const, targetSide: "top" as const },
];

export async function getOrCreateActivePlan(
  organizationId: string,
  userId: string,
  client?: HaccpDbClient
): Promise<HaccpPlanDetails> {
  const supabase = db(client);

  const { data: existing } = await supabase
    .from("haccp_plans")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let planRow = existing as Record<string, unknown> | null;

  if (!planRow) {
    const { data: created, error } = await supabase
      .from("haccp_plans")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        name: "Plan HACCP",
        status: "draft",
        current_step: 1,
      })
      .select("*")
      .single();

    if (error || !created) {
      throw new Error(error?.message ?? "No se pudo crear el plan HACCP");
    }
    planRow = created as Record<string, unknown>;
  }

  return loadPlanDetails(supabase, mapPlan(planRow));
}

async function loadPlanDetails(
  supabase: HaccpDbClient,
  plan: HaccpPlan
): Promise<HaccpPlanDetails> {
  const [teamRes, productsRes, diagramsRes, validationRes, hazardsRes] =
    await Promise.all([
      supabase.from("haccp_teams").select("*").eq("plan_id", plan.id).order("order_index"),
      supabase.from("haccp_plan_products").select("*").eq("plan_id", plan.id).order("order_index"),
      supabase.from("haccp_diagrams").select("*").eq("plan_id", plan.id).order("order_index"),
      supabase.from("haccp_validations").select("*").eq("plan_id", plan.id).maybeSingle(),
      supabase.from("haccp_plan_hazards").select("*").eq("plan_id", plan.id),
    ]);

  let diagrams = ((diagramsRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => mapDiagram(row)
  );

  if (diagrams.length === 0) {
    const seeded = await createDiagram(plan.id, "Proceso Principal", SEED_NODES, supabase);
    diagrams = [seeded];
  }

  if ((productsRes.data ?? []).length === 0) {
    await createProduct(plan.id, "Producto", supabase);
    const { data } = await supabase
      .from("haccp_plan_products")
      .select("*")
      .eq("plan_id", plan.id)
      .order("order_index");
    productsRes.data = data;
  }

  const validationRow = validationRes.data as Record<string, unknown> | null;

  return {
    plan,
    team: ((teamRes.data ?? []) as Record<string, unknown>[]).map((row) =>
      mapTeamMember(row)
    ),
    products: ((productsRes.data ?? []) as Record<string, unknown>[]).map((row) =>
      mapProduct(row)
    ),
    diagrams,
    validation: {
      files: mapEvidenceFiles(validationRow?.evidence_files),
      observations: typeof validationRow?.observations === "string" ? validationRow.observations : "",
      validatedAt: (validationRow?.validated_at as string | null) ?? null,
      validatedBy: (validationRow?.validated_by as string | null) ?? null,
    },
    hazards: ((hazardsRes.data ?? []) as Record<string, unknown>[]).map((row) =>
      mapHazard(row, diagrams)
    ),
  };
}

export async function updatePlanFields(
  planId: string,
  patch: Partial<{
    current_step: number;
    status: HaccpPlan["status"];
    risk_matrix: HaccpPlan["riskMatrix"];
    checklist_progress: HaccpPlan["checklistProgress"];
  }>
) {
  const { error } = await db()
    .from("haccp_plans")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", planId);
  if (error) throw new Error(error.message);
}

export async function createTeamMember(planId: string, orderIndex: number) {
  const { data, error } = await db()
    .from("haccp_teams")
    .insert({
      plan_id: planId,
      name: "",
      role: "",
      area: "",
      qualifications: "",
      order_index: orderIndex,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo agregar el miembro");
  return mapTeamMember(data as Record<string, unknown>);
}

export async function updateTeamMember(
  member: TeamMember,
  planId: string,
  orderIndex: number
) {
  const { error } = await db()
    .from("haccp_teams")
    .update(teamToRow(member, planId, orderIndex))
    .eq("id", member.id);
  if (error) throw new Error(error.message);
}

export async function deleteTeamMember(id: string) {
  const { error } = await db().from("haccp_teams").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createProduct(
  planId: string,
  name = "Producto",
  client?: HaccpDbClient
) {
  const supabase = db(client);
  const { data: existing } = await supabase
    .from("haccp_plan_products")
    .select("order_index")
    .eq("plan_id", planId)
    .order("order_index", { ascending: false })
    .limit(1);

  const orderIndex =
    ((existing?.[0] as { order_index?: number } | undefined)?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("haccp_plan_products")
    .insert({
      plan_id: planId,
      name,
      specifications: INITIAL_PRODUCT_SPECS,
      order_index: orderIndex,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el producto");
  return mapProduct(data as Record<string, unknown>);
}

export async function updateProduct(
  product: Product,
  planId: string,
  orderIndex: number
) {
  const { error } = await db()
    .from("haccp_plan_products")
    .update(productToRow(product, planId, orderIndex))
    .eq("id", product.id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(id: string) {
  const { error } = await db().from("haccp_plan_products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createDiagram(
  planId: string,
  name: string,
  nodes = SEED_NODES,
  client?: HaccpDbClient
): Promise<ProcessDiagram> {
  const supabase = db(client);
  const { data: existing } = await supabase
    .from("haccp_diagrams")
    .select("order_index")
    .eq("plan_id", planId)
    .order("order_index", { ascending: false })
    .limit(1);

  const orderIndex =
    ((existing?.[0] as { order_index?: number } | undefined)?.order_index ?? -1) + 1;

  const { data, error } = await supabase
    .from("haccp_diagrams")
    .insert({
      plan_id: planId,
      name,
      nodes,
      edges: nodes === SEED_NODES ? SEED_EDGES : [],
      zoom: 1,
      pan_x: 0,
      pan_y: 0,
      order_index: orderIndex,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el diagrama");
  return mapDiagram(data as Record<string, unknown>);
}

export async function syncDiagrams(
  planId: string,
  diagrams: ProcessDiagram[]
) {
  const supabase = db();
  const { data: existing } = await supabase
    .from("haccp_diagrams")
    .select("id")
    .eq("plan_id", planId);

  const existingIds = new Set(
    ((existing ?? []) as { id: string }[]).map((row) => row.id)
  );
  const nextIds = new Set(diagrams.map((diagram) => diagram.id));

  await Promise.all(
    diagrams.map((diagram, index) => {
      const row = diagramToRow(diagram, planId, index);
      if (existingIds.has(diagram.id)) {
        return supabase.from("haccp_diagrams").update(row).eq("id", diagram.id);
      }
      return supabase.from("haccp_diagrams").insert(row);
    })
  );

  const removed = Array.from(existingIds).filter((id) => !nextIds.has(id));
  if (removed.length > 0) {
    await supabase.from("haccp_diagrams").delete().in("id", removed);
  }
}

export async function upsertValidation(
  planId: string,
  validation: PlanValidation,
  userId: string
) {
  const payload = {
    plan_id: planId,
    evidence_files: validation.files,
    observations: validation.observations,
    validated_at: validation.observations.trim()
      ? new Date().toISOString()
      : validation.validatedAt,
    validated_by: userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db()
    .from("haccp_validations")
    .upsert(payload, { onConflict: "plan_id" });
  if (error) throw new Error(error.message);
}

export async function createHazard(planId: string, partial: Partial<Hazard>, threshold: number) {
  const row = hazardToRow(
    {
      id: crypto.randomUUID(),
      diagramId: partial.diagramId ?? "",
      stepId: partial.stepId ?? "",
      description: partial.description ?? "",
      cause: partial.cause ?? "",
      type: partial.type ?? "biological",
      severity: partial.severity ?? 1,
      probability: partial.probability ?? 1,
      justification: partial.justification ?? "",
      preventiveMeasure: partial.preventiveMeasure ?? "",
    },
    planId,
    threshold
  );
  delete (row as { id?: string }).id;

  const { data, error } = await db()
    .from("haccp_plan_hazards")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el peligro");
  return mapHazard(data as Record<string, unknown>, []);
}

export async function updateHazard(
  hazard: Hazard,
  planId: string,
  threshold: number,
  stepName = ""
) {
  const { error } = await db()
    .from("haccp_plan_hazards")
    .update(hazardToRow(hazard, planId, threshold, stepName))
    .eq("id", hazard.id);
  if (error) throw new Error(error.message);
}

export async function deleteHazard(id: string) {
  const { error } = await db().from("haccp_plan_hazards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function upsertCcpDecision(input: {
  planId: string;
  hazardId: string;
  q1: boolean | null | undefined;
  q2: boolean | null | undefined;
  q3: boolean | null | undefined;
  q4: boolean | null | undefined;
  result: string;
  pccNumber: number | null;
}) {
  const { error } = await db().from("haccp_ccp_decisions").upsert(
    {
      plan_id: input.planId,
      hazard_id: input.hazardId,
      q1: input.q1 ?? null,
      q2: input.q2 ?? null,
      q3: input.q3 ?? null,
      q4: input.q4 ?? null,
      result: input.result,
      pcc_number: input.pccNumber,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plan_id,hazard_id" }
  );
  if (error) throw new Error(error.message);
}
