"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronRight, History, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  APPROVAL_STAGES,
  computeSupplierSignatureHash,
  defaultReEvaluationMonths,
  getApprovalStageLabel,
  getNextApprovalStage,
  mapStageToStatus,
  sortApprovalLog,
  validateApprovalAdvance,
} from "@/lib/suppliers/approval";
import { mergeChecklistWithDefaults, getRequiredDocTypes } from "@/lib/suppliers/checklist";
import { getDocTypeLabel } from "@/lib/suppliers/constants";
import { computeDocStatus } from "@/lib/suppliers/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  Supplier,
  SupplierApprovalChecklistItem,
  SupplierApprovalLog,
  SupplierApprovalResponse,
  SupplierApprovalStage,
  SupplierDocument,
} from "@/types/database";

interface SupplierApprovalPanelProps {
  supplier: Supplier;
  documents: SupplierDocument[];
  checklist: SupplierApprovalChecklistItem[];
  responses: SupplierApprovalResponse[];
  approvalLog: SupplierApprovalLog[];
  organizationId: string;
  userId: string;
  portalUrl: string | null;
  onPortalGenerated: (url: string) => void;
}

export function SupplierApprovalPanel({
  supplier: initialSupplier,
  documents,
  checklist: dbChecklist,
  responses: initialResponses,
  approvalLog,
  organizationId,
  userId,
  portalUrl,
  onPortalGenerated,
}: SupplierApprovalPanelProps) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(initialSupplier);
  const [responses, setResponses] = useState(initialResponses);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const checklist = useMemo(
    () =>
      mergeChecklistWithDefaults(
        organizationId,
        supplier.criticality,
        dbChecklist
      ),
    [organizationId, supplier.criticality, dbChecklist]
  );

  const responseMap = useMemo(() => {
    const map = new Map<string, SupplierApprovalResponse>();
    for (const r of responses) map.set(r.item_key, r);
    return map;
  }, [responses]);

  const requiredDocs = getRequiredDocTypes(supplier.criticality);
  const sortedLog = sortApprovalLog(approvalLog);
  const nextStage = getNextApprovalStage(supplier.approval_stage);
  const validationError = nextStage
    ? validateApprovalAdvance(supplier.approval_stage, {
        supplier,
        documents,
        checklist,
        responses,
      })
    : null;

  async function toggleChecklistItem(itemKey: string, checked: boolean) {
    setError("");
    const supabase = createClient();
    const existing = responseMap.get(itemKey);
    const now = new Date().toISOString();

    if (existing) {
      const { data, error: updateError } = await supabase
        .from("supplier_approval_responses")
        .update({
          checked,
          checked_by: checked ? userId : null,
          checked_at: checked ? now : null,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError || !data) {
        setError(updateError?.message ?? "Error al actualizar checklist");
        return;
      }
      setResponses((prev) =>
        prev.map((r) => (r.id === existing.id ? (data as SupplierApprovalResponse) : r))
      );
      return;
    }

    const { data, error: insertError } = await supabase
      .from("supplier_approval_responses")
      .insert({
        supplier_id: supplier.id,
        organization_id: organizationId,
        item_key: itemKey,
        checked,
        checked_by: checked ? userId : null,
        checked_at: checked ? now : null,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setError(insertError?.message ?? "Error al guardar checklist");
      return;
    }
    setResponses((prev) => [...prev, data as SupplierApprovalResponse]);
  }

  async function advanceStage(targetStage?: SupplierApprovalStage) {
    if (!nextStage && !targetStage) return;
    const toStage = targetStage ?? nextStage!;
    setLoading(true);
    setError("");

    const block = validateApprovalAdvance(supplier.approval_stage, {
      supplier,
      documents,
      checklist,
      responses,
    });
    if (block && !targetStage) {
      setLoading(false);
      setError(block);
      return;
    }

    const supabase = createClient();
    const now = new Date().toISOString();
    const signatureHash = await computeSupplierSignatureHash({
      userId,
      supplierId: supplier.id,
      fromStage: supplier.approval_stage,
      toStage,
      timestamp: now,
    });

    const status = mapStageToStatus(toStage);
    const updates: Partial<Supplier> = {
      approval_stage: toStage,
      status,
      approval_signature_hash: signatureHash,
    };

    if (toStage === "active") {
      updates.approved_by = userId;
      updates.approval_date = now.split("T")[0];
      updates.re_evaluation_months =
        supplier.re_evaluation_months ??
        defaultReEvaluationMonths(supplier.criticality);
      const nextEval = new Date();
      nextEval.setMonth(
        nextEval.getMonth() + (updates.re_evaluation_months ?? 12)
      );
      updates.next_evaluation_date = nextEval.toISOString().split("T")[0];
    }

    const { error: updateError } = await supabase
      .from("suppliers")
      .update(updates)
      .eq("id", supplier.id);

    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

    await supabase.from("supplier_approval_log").insert({
      supplier_id: supplier.id,
      organization_id: organizationId,
      from_stage: supplier.approval_stage,
      to_stage: toStage,
      changed_by: userId,
      comment: comment.trim() || null,
      signature_hash: signatureHash,
    });

    setSupplier((s) => ({ ...s, ...updates }));
    setComment("");
    setLoading(false);
    router.refresh();
  }

  async function generatePortalLink() {
    setPortalLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/portal-token`, {
        method: "POST",
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setError(body.error ?? "No se pudo generar el enlace");
        return;
      }
      onPortalGenerated(body.url);
    } catch {
      setError("Error de red al generar enlace");
    } finally {
      setPortalLoading(false);
    }
  }

  const stageIndex = APPROVAL_STAGES.findIndex((s) => s.id === supplier.approval_stage);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Homologación
            </p>
            <h3 className="font-display text-lg font-semibold text-ink">
              {getApprovalStageLabel(supplier.approval_stage)}
            </h3>
          </div>
          <Badge
            variant={
              supplier.approval_stage === "active"
                ? "success"
                : supplier.approval_stage === "rejected" ||
                    supplier.approval_stage === "suspended"
                  ? "danger"
                  : "warning"
            }
          >
            {getApprovalStageLabel(supplier.approval_stage)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {APPROVAL_STAGES.slice(0, 4).map((stage, idx) => (
            <div
              key={stage.id}
              className={cn(
                "flex items-center gap-1 text-xs",
                idx <= stageIndex ? "text-forest" : "text-ink-faint"
              )}
            >
              {idx > 0 && <ChevronRight className="h-3 w-3 text-ink-faint" />}
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full border",
                  idx === stageIndex
                    ? "border-forest bg-breeze"
                    : "border-border"
                )}
              >
                {stage.label}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-sm font-medium text-ink">Checklist de homologación</p>
          <ul className="space-y-2">
            {checklist.map((item) => {
              const checked = responseMap.get(item.item_key)?.checked ?? false;
              return (
                <li
                  key={item.item_key}
                  className="flex items-start gap-3 text-sm border border-border rounded-md p-3"
                >
                  <button
                    type="button"
                    onClick={() => toggleChecklistItem(item.item_key, !checked)}
                    className={cn(
                      "mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0",
                      checked
                        ? "bg-sage border-sage text-white"
                        : "border-border bg-white"
                    )}
                    aria-label={item.label}
                  >
                    {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                  </button>
                  <div>
                    <p className="text-ink">{item.label}</p>
                    {item.doc_type && (
                      <p className="text-xs text-ink-faint font-mono">
                        Doc: {getDocTypeLabel(item.doc_type)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-sm font-medium text-ink">Documentos obligatorios</p>
          <div className="flex flex-wrap gap-2">
            {requiredDocs.map((docType) => {
              const doc = documents.find(
                (d) =>
                  d.doc_type === docType &&
                  d.review_status !== "rejected" &&
                  computeDocStatus(d.expiry_date) !== "expired"
              );
              return (
                <Badge
                  key={docType}
                  variant={doc ? "success" : "danger"}
                >
                  {getDocTypeLabel(docType)}
                  {doc ? " ✓" : " — pendiente"}
                </Badge>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <Textarea
            label="Comentario de transición (opcional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[4rem]"
          />

          {error && <p className="text-xs text-danger">{error}</p>}
          {validationError && nextStage && (
            <p className="text-xs text-amber">{validationError}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {nextStage && supplier.approval_stage !== "active" && (
              <Button
                type="button"
                disabled={loading || !!validationError}
                onClick={() => advanceStage()}
              >
                Avanzar a {getApprovalStageLabel(nextStage)}
              </Button>
            )}
            {supplier.approval_stage !== "rejected" &&
              supplier.approval_stage !== "suspended" && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => advanceStage("rejected")}
                >
                  Rechazar
                </Button>
              )}
            {supplier.approval_stage === "active" && (
              <Button
                type="button"
                variant="ghost"
                disabled={loading}
                onClick={() => advanceStage("suspended")}
              >
                Suspender
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink">Portal del proveedor</p>
            <p className="text-xs text-ink-faint">
              Enlace temporal para que el proveedor suba documentación.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8"
            disabled={portalLoading}
            onClick={generatePortalLink}
          >
            <Link2 className="h-4 w-4" />
            {portalUrl ? "Renovar enlace" : "Generar enlace"}
          </Button>
        </div>
        {portalUrl && (
          <code className="block text-xs font-mono bg-background border border-border rounded p-2 break-all">
            {portalUrl}
          </code>
        )}
      </div>

      {sortedLog.length > 0 && (
        <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-ink-light" />
            <p className="text-sm font-medium text-ink">Historial de aprobación</p>
          </div>
          <ul className="space-y-2">
            {sortedLog.map((entry) => (
              <li
                key={entry.id}
                className="text-xs border border-border rounded-md p-3 space-y-1"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-mono text-ink">
                    {entry.from_stage
                      ? getApprovalStageLabel(entry.from_stage)
                      : "—"}{" "}
                    → {getApprovalStageLabel(entry.to_stage)}
                  </span>
                  <span className="text-ink-faint">
                    {new Date(entry.created_at).toLocaleString("es")}
                  </span>
                </div>
                {entry.comment && (
                  <p className="text-ink-light">{entry.comment}</p>
                )}
                <p className="font-mono text-[10px] text-ink-faint truncate">
                  firma: {entry.signature_hash.slice(0, 16)}…
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
