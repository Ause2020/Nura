import type {
  Supplier,
  SupplierApprovalLog,
  SupplierApprovalStage,
  SupplierCriticality,
  SupplierDocument,
} from "@/types/database";
import type { SupplierApprovalChecklistItem } from "@/types/database";
import type { SupplierApprovalResponse } from "@/types/database";
import { getRequiredDocTypes } from "@/lib/suppliers/checklist";
import { computeDocStatus } from "@/lib/suppliers/utils";

export const APPROVAL_STAGES: {
  id: SupplierApprovalStage;
  label: string;
  description: string;
}[] = [
  {
    id: "request",
    label: "Solicitud",
    description: "Alta del proveedor y documentación inicial",
  },
  {
    id: "review",
    label: "Revisión QA",
    description: "Verificación de checklist y documentos",
  },
  {
    id: "approved",
    label: "Homologado",
    description: "Aprobación pendiente de activación",
  },
  {
    id: "active",
    label: "Activo",
    description: "Proveedor en lista aprobada",
  },
  {
    id: "rejected",
    label: "Rechazado",
    description: "No cumple requisitos de homologación",
  },
  {
    id: "suspended",
    label: "Suspendido",
    description: "Fuera de lista hasta nueva evaluación",
  },
];

export function getApprovalStageLabel(
  stage: SupplierApprovalStage | null | undefined
): string {
  if (!stage) return "Sin etapa";
  return APPROVAL_STAGES.find((s) => s.id === stage)?.label ?? stage;
}

export function getNextApprovalStage(
  stage: SupplierApprovalStage
): SupplierApprovalStage | null {
  const order: SupplierApprovalStage[] = [
    "request",
    "review",
    "approved",
    "active",
  ];
  const idx = order.indexOf(stage);
  if (idx < 0 || idx >= order.length - 1) return null;
  return order[idx + 1];
}

export function defaultReEvaluationMonths(
  criticality: SupplierCriticality
): number {
  if (criticality === "critical") return 6;
  if (criticality === "major") return 12;
  return 24;
}

export interface ApprovalValidationContext {
  supplier: Supplier;
  documents: SupplierDocument[];
  checklist: SupplierApprovalChecklistItem[];
  responses: SupplierApprovalResponse[];
}

export function validateApprovalAdvance(
  stage: SupplierApprovalStage,
  ctx: ApprovalValidationContext
): string | null {
  const responseMap = new Map(
    ctx.responses.filter((r) => r.checked).map((r) => [r.item_key, true])
  );
  const requiredItems = ctx.checklist.filter((i) => i.required);
  const missingChecklist = requiredItems.filter(
    (i) => !responseMap.has(i.item_key)
  );

  const requiredDocTypes = getRequiredDocTypes(ctx.supplier.criticality);
  const presentDocTypes = new Set(
    ctx.documents
      .filter(
        (d) =>
          d.review_status !== "rejected" &&
          computeDocStatus(d.expiry_date) !== "expired"
      )
      .map((d) => d.doc_type)
  );
  const missingDocs = requiredDocTypes.filter((t) => !presentDocTypes.has(t));

  switch (stage) {
    case "request":
      if (!ctx.supplier.name.trim()) return "Completa el nombre del proveedor";
      return null;
    case "review":
      if (missingChecklist.length > 0) {
        return `Completa el checklist (${missingChecklist.length} ítem pendiente)`;
      }
      if (missingDocs.length > 0) {
        return "Faltan documentos obligatorios para esta criticidad";
      }
      if (
        ctx.documents.some(
          (d) =>
            d.review_status === "pending_review" ||
            computeDocStatus(d.expiry_date) === "expired"
        )
      ) {
        return "Revisa documentos pendientes o vencidos antes de avanzar";
      }
      return null;
    case "approved":
      return null;
    default:
      return null;
  }
}

export async function computeSupplierSignatureHash(input: {
  userId: string;
  supplierId: string;
  fromStage: SupplierApprovalStage | null;
  toStage: SupplierApprovalStage;
  timestamp: string;
}): Promise<string> {
  const payload = [
    input.userId,
    input.supplierId,
    input.fromStage ?? "",
    input.toStage,
    input.timestamp,
  ].join("|");

  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function mapStageToStatus(
  stage: SupplierApprovalStage
): Supplier["status"] {
  switch (stage) {
    case "request":
      return "pending";
    case "review":
      return "in_evaluation";
    case "approved":
      return "conditional";
    case "active":
      return "approved";
    case "rejected":
      return "suspended";
    case "suspended":
      return "suspended";
    default:
      return "pending";
  }
}

export function sortApprovalLog(log: SupplierApprovalLog[]): SupplierApprovalLog[] {
  return [...log].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
