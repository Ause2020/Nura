"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { getReviewAlert } from "@/lib/documents/utils";
import {
  computeHaccpPlanSignatureHash,
  getAvailablePlanTransitions,
  getPlanStatusBadgeVariant,
  PLAN_STATUS_LABELS,
  type HaccpPlanStatus,
} from "@/lib/haccp/versioning";
import { createClient } from "@/lib/supabase/client";
import type {
  HaccpCcp,
  HaccpHazard,
  HaccpPlanVersion,
  HaccpPlanVersionLog,
  HaccpProcessStep,
  HaccpProduct,
  UserRole,
} from "@/types/database";

interface HaccpPlanVersionPanelProps {
  product: HaccpProduct;
  steps: HaccpProcessStep[];
  hazards: HaccpHazard[];
  ccps: HaccpCcp[];
  versions: HaccpPlanVersion[];
  versionLog: HaccpPlanVersionLog[];
  organizationId: string;
  userId: string;
  userRole: UserRole;
}

const TRANSITION_LABELS: Partial<Record<HaccpPlanStatus, string>> = {
  in_review: "Enviar a revisión",
  approved: "Aprobar",
  published: "Publicar",
  draft: "Volver a borrador",
  obsolete: "Marcar obsoleto",
};

export function HaccpPlanVersionPanel({
  product,
  steps,
  hazards,
  ccps,
  versions,
  versionLog,
  organizationId,
  userId,
  userRole,
}: HaccpPlanVersionPanelProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(
    product.effective_date ?? new Date().toISOString().split("T")[0]
  );
  const [nextReviewDate, setNextReviewDate] = useState(
    product.next_review_date ?? ""
  );
  const [changeSummary, setChangeSummary] = useState("");

  const planStatus = (product.plan_status ?? "draft") as HaccpPlanStatus;
  const transitions = getAvailablePlanTransitions(userRole, planStatus);
  const reviewAlert = getReviewAlert(product.next_review_date);

  async function buildSnapshot() {
    return {
      product,
      steps,
      hazards,
      ccps,
      exported_at: new Date().toISOString(),
    };
  }

  async function transitionPlan(toStatus: HaccpPlanStatus) {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const now = new Date().toISOString();

    const snapshot = await buildSnapshot();
    const nextVersion = (product.current_version ?? 1) + (toStatus === "published" ? 1 : 0);
    const versionNumber =
      toStatus === "published" ? nextVersion : product.current_version ?? 1;

    let versionId: string | null = null;

    if (toStatus === "published") {
      const signatureHash = await computeHaccpPlanSignatureHash({
        userId,
        productId: product.id,
        fromStatus: planStatus,
        toStatus,
        timestamp: now,
      });

      const { data: versionRow, error: versionError } = await supabase
        .from("haccp_plan_versions")
        .insert({
          product_id: product.id,
          organization_id: organizationId,
          version_number: versionNumber,
          snapshot,
          change_summary: changeSummary.trim() || `Publicación v${versionNumber}`,
          status: "published",
          effective_date: effectiveDate || null,
          next_review_date: nextReviewDate || null,
          created_by: userId,
          approved_by: userId,
          approved_at: now,
          published_at: now,
          signature_hash: signatureHash,
        })
        .select("id")
        .single();

      if (versionError || !versionRow) {
        setSaving(false);
        setError(versionError?.message ?? "Error al crear versión");
        return;
      }

      versionId = (versionRow as { id: string }).id;

      await supabase
        .from("haccp_products")
        .update({
          plan_status: "published",
          status: "active",
          current_version: versionNumber,
          effective_date: effectiveDate || null,
          next_review_date: nextReviewDate || null,
          approved_by: userId,
          published_at: now,
        })
        .eq("id", product.id);
    } else {
      const updates: Partial<HaccpProduct> = { plan_status: toStatus };
      if (toStatus === "approved") {
        updates.approved_by = userId;
      }
      await supabase.from("haccp_products").update(updates).eq("id", product.id);
    }

    const signatureHash = await computeHaccpPlanSignatureHash({
      userId,
      productId: product.id,
      versionId,
      fromStatus: planStatus,
      toStatus,
      timestamp: now,
    });

    await supabase.from("haccp_plan_version_log").insert({
      product_id: product.id,
      organization_id: organizationId,
      version_id: versionId,
      from_status: planStatus,
      to_status: toStatus,
      changed_by: userId,
      comment: comment.trim() || null,
      signature_hash: signatureHash,
    });

    setSaving(false);
    setComment("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-border rounded-md p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono uppercase tracking-wider text-ink-faint">
            Estado del plan
          </span>
          <Badge variant={getPlanStatusBadgeVariant(planStatus)}>
            {PLAN_STATUS_LABELS[planStatus]}
          </Badge>
          <span className="text-xs text-ink-faint font-mono">
            v{product.current_version ?? 1}
          </span>
          {reviewAlert === "overdue" && (
            <Badge variant="danger">Revisión vencida</Badge>
          )}
          {reviewAlert === "due_soon" && (
            <Badge variant="warning">Revisión próxima</Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <Input
            label="Fecha de vigencia"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
          <Input
            label="Próxima revisión"
            type="date"
            value={nextReviewDate}
            onChange={(e) => setNextReviewDate(e.target.value)}
          />
        </div>

        {transitions.includes("published") && (
          <Textarea
            label="Resumen de cambios (al publicar)"
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            placeholder="Qué cambió en esta versión del plan..."
          />
        )}

        {transitions.length > 0 && (
          <div className="space-y-2">
            <Textarea
              label="Comentario de transición"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Opcional"
            />
            <div className="flex flex-wrap gap-2">
              {transitions.map((to) => (
                <Button
                  key={to}
                  variant={to === "published" ? "primary" : "secondary"}
                  loading={saving}
                  onClick={() => transitionPlan(to)}
                >
                  {TRANSITION_LABELS[to] ?? to}
                </Button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint">
          Historial de versiones
        </h3>
        {versions.length === 0 ? (
          <p className="text-sm text-ink-light">
            Aún no hay versiones publicadas. Publica el plan para congelar un
            snapshot.
          </p>
        ) : (
          <div className="bg-white border border-border rounded-md divide-y divide-border">
            {versions.map((v) => (
              <div key={v.id} className="px-4 py-3 flex justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Versión {v.version_number}
                  </p>
                  <p className="text-xs text-ink-faint">
                    {v.change_summary ?? "Sin resumen"}
                  </p>
                  {v.published_at && (
                    <p className="text-xs text-ink-faint mt-0.5">
                      Publicada{" "}
                      {new Date(v.published_at).toLocaleDateString("es")}
                    </p>
                  )}
                </div>
                <Badge variant={getPlanStatusBadgeVariant(v.status)}>
                  {PLAN_STATUS_LABELS[v.status]}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-faint">
          Audit trail
        </h3>
        <div className="bg-white border border-border rounded-md divide-y divide-border max-h-64 overflow-y-auto">
          {versionLog.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-light">Sin movimientos</p>
          ) : (
            versionLog.map((entry) => (
              <div key={entry.id} className="px-4 py-3">
                <p className="text-sm text-ink">
                  {entry.from_status
                    ? `${PLAN_STATUS_LABELS[entry.from_status as HaccpPlanStatus] ?? entry.from_status} → `
                    : ""}
                  {PLAN_STATUS_LABELS[entry.to_status as HaccpPlanStatus] ??
                    entry.to_status}
                </p>
                <p className="text-xs text-ink-faint mt-0.5">
                  {new Date(entry.created_at).toLocaleString("es")}
                  {entry.comment ? ` · ${entry.comment}` : ""}
                </p>
                <p className="text-[10px] font-mono text-ink-faint mt-1">
                  {entry.signature_hash.slice(0, 24)}…
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
