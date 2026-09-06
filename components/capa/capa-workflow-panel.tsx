"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { CapaActionsPanel } from "@/components/capa/capa-actions-panel";
import { FishboneForm } from "@/components/capa/fishbone-form";
import { FiveWhysForm } from "@/components/capa/five-whys-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  CAPA_STAGES,
  computeCapaSignatureHash,
  getNextStage,
  getStageLabel,
  isCurrentStage,
  isStageComplete,
  validateStageAdvance,
} from "@/lib/capa/workflow";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  CapaAction,
  CapaStage,
  CapaStageLog,
  EffectivenessResult,
  Nc5Whys,
  NcFishboneCause,
  Nonconformity,
  Profile,
  RootCauseMethod,
  UserRole,
} from "@/types/database";

interface CapaWorkflowPanelProps {
  nc: Nonconformity;
  actions: CapaAction[];
  fiveWhys: Nc5Whys | null;
  fishboneCauses: NcFishboneCause[];
  stageLog: CapaStageLog[];
  members: Pick<Profile, "id" | "full_name">[];
  organizationId: string;
  userId: string;
  userRole: UserRole;
  aiAvailable?: boolean;
  pendingCapaTraining?: number;
  onNcUpdate: (nc: Nonconformity) => void;
  onActionsUpdate: (actions: CapaAction[]) => void;
  onStageLogUpdate: (log: CapaStageLog[]) => void;
  onFiveWhysUpdate: (data: Nc5Whys | null) => void;
  onFishboneUpdate: (causes: NcFishboneCause[]) => void;
}

export function CapaWorkflowPanel({
  nc,
  actions,
  fiveWhys,
  fishboneCauses,
  stageLog,
  members,
  organizationId,
  userId,
  userRole,
  pendingCapaTraining = 0,
  aiAvailable = false,
  onNcUpdate,
  onActionsUpdate,
  onStageLogUpdate,
  onFiveWhysUpdate,
  onFishboneUpdate,
}: CapaWorkflowPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transitionComment, setTransitionComment] = useState("");
  const [method, setMethod] = useState<RootCauseMethod | null>(
    nc.root_cause_method
  );
  const [containment, setContainment] = useState(
    nc.containment_description ?? ""
  );
  const [assignedTo, setAssignedTo] = useState(nc.assigned_to ?? userId);
  const [targetClose, setTargetClose] = useState(
    nc.capa_target_close_date ?? nc.due_date ?? ""
  );
  const [effectivenessDue, setEffectivenessDue] = useState(
    nc.effectiveness_due_date ?? ""
  );
  const [effectivenessResult, setEffectivenessResult] =
    useState<EffectivenessResult>(nc.effectiveness_result);
  const [effectivenessNotes, setEffectivenessNotes] = useState(
    nc.effectiveness_notes ?? ""
  );
  const [recurrence, setRecurrence] = useState(nc.recurrence);

  const currentStage = nc.capa_stage;
  const canCloseRole = userRole === "admin" || userRole === "quality_manager";
  const profileMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.full_name])),
    [members]
  );

  async function saveNcPatch(patch: Partial<Nonconformity>) {
    const supabase = createClient();
    const { data, error: updateError } = await supabase
      .from("nonconformities")
      .update(patch)
      .eq("id", nc.id)
      .select("*")
      .single();

    if (updateError || !data) {
      throw new Error(updateError?.message ?? "No se pudo guardar");
    }

    onNcUpdate(data as Nonconformity);
  }

  async function advanceStage() {
    if (currentStage === "closed") return;

    const validation = validateStageAdvance(currentStage, {
      nc: {
        ...nc,
        containment_description: containment,
        assigned_to: assignedTo,
        effectiveness_result: effectivenessResult,
        effectiveness_notes: effectivenessNotes,
      },
      actions,
      fiveWhys,
      pendingCapaTraining,
    });

    if (validation) {
      setError(validation);
      return;
    }

    if (currentStage === "closure" && !canCloseRole) {
      setError("Solo Gerente de Calidad o Admin pueden cerrar la CAPA");
      return;
    }

    const next = getNextStage(currentStage);
    if (!next) return;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const signatureHash = await computeCapaSignatureHash({
        userId,
        ncId: nc.id,
        fromStage: currentStage,
        toStage: next,
        timestamp: now,
      });

      const patch: Partial<Nonconformity> = {
        capa_stage: next,
        assigned_to: assignedTo,
        capa_target_close_date: targetClose || null,
        containment_description: containment.trim() || null,
        effectiveness_due_date: effectivenessDue || null,
        effectiveness_result: effectivenessResult,
        effectiveness_notes: effectivenessNotes.trim() || null,
      };

      if (currentStage === "containment") {
        patch.containment_completed_at = now;
        patch.status = "in_analysis";
      }
      if (currentStage === "investigation") {
        patch.status = "in_progress";
      }
      if (next === "closed") {
        patch.status = "closed";
        patch.closed_at = now;
        patch.recurrence = recurrence;
      }

      if (currentStage === "effectiveness" && effectivenessResult === "effective") {
        patch.effectiveness_verified_at = now;
        patch.status = "pending_verification";
      }

      await saveNcPatch(patch);

      const { data: logRow } = await supabase
        .from("capa_stage_log")
        .insert({
          organization_id: organizationId,
          nc_id: nc.id,
          from_stage: currentStage,
          to_stage: next,
          changed_by: userId,
          comment: transitionComment.trim() || null,
          signature_hash: signatureHash,
        })
        .select("*")
        .single();

      if (logRow) {
        onStageLogUpdate([logRow as CapaStageLog, ...stageLog]);
      }

      setTransitionComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al avanzar etapa");
    } finally {
      setLoading(false);
    }
  }

  async function reopenFromIneffective() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const now = new Date().toISOString();
      const signatureHash = await computeCapaSignatureHash({
        userId,
        ncId: nc.id,
        fromStage: "effectiveness",
        toStage: "investigation",
        timestamp: now,
      });

      await saveNcPatch({
        capa_stage: "investigation",
        effectiveness_result: "pending",
        status: "in_analysis",
      });

      const { data: logRow } = await supabase
        .from("capa_stage_log")
        .insert({
          organization_id: organizationId,
          nc_id: nc.id,
          from_stage: "effectiveness",
          to_stage: "investigation",
          changed_by: userId,
          comment: "Reapertura por verificación de efectividad no conforme",
          signature_hash: signatureHash,
        })
        .select("*")
        .single();

      if (logRow) {
        onStageLogUpdate([logRow as CapaStageLog, ...stageLog]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reabrir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {nc.lot_quarantined && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md border border-danger/30 bg-danger/5 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Lote {nc.lot_number} marcado en cuarentena por severidad {nc.severity}
        </div>
      )}

      <ol className="space-y-2">
        {CAPA_STAGES.map((stage) => {
          const complete = isStageComplete(stage.id, currentStage);
          const current = isCurrentStage(stage.id, currentStage);

          return (
            <li
              key={stage.id}
              className={cn(
                "border rounded-md p-4",
                current
                  ? "border-forest bg-sage-light/30"
                  : complete
                    ? "border-sage/30 bg-white"
                    : "border-border bg-white opacity-60"
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-mono",
                    complete
                      ? "bg-sage text-white"
                      : current
                        ? "bg-forest text-white"
                        : "bg-zinc-100 text-ink-faint"
                  )}
                >
                  {complete ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    CAPA_STAGES.findIndex((s) => s.id === stage.id) + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-ink">
                      {stage.label}
                    </h3>
                    {current && (
                      <Badge variant="success">Etapa actual</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {stage.description}
                  </p>

                  {current && currentStage !== "closed" && (
                    <div className="mt-4 space-y-4">
                      {currentStage === "identification" && (
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                              Responsable CAPA
                            </label>
                            <select
                              value={assignedTo}
                              onChange={(e) => setAssignedTo(e.target.value)}
                              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                            >
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.full_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <Input
                            label="Fecha objetivo de cierre CAPA"
                            type="date"
                            value={targetClose}
                            onChange={(e) => setTargetClose(e.target.value)}
                          />
                        </div>
                      )}

                      {currentStage === "containment" && (
                        <Textarea
                          label="Descripción de contención inmediata"
                          value={containment}
                          onChange={(e) => setContainment(e.target.value)}
                          className="min-h-[80px]"
                        />
                      )}

                      {currentStage === "investigation" && (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={
                                method === "5why" ? "primary" : "secondary"
                              }
                              onClick={() => setMethod("5why")}
                            >
                              5 Porqués
                            </Button>
                            <Button
                              type="button"
                              variant={
                                method === "fishbone" ? "primary" : "secondary"
                              }
                              onClick={() => setMethod("fishbone")}
                            >
                              Ishikawa
                            </Button>
                          </div>
                          {method === "5why" && (
                            <FiveWhysForm
                              ncId={nc.id}
                              organizationId={organizationId}
                              initial={fiveWhys}
                              nc={nc}
                              aiAvailable={aiAvailable}
                              onSaved={(data) => {
                                onFiveWhysUpdate(data);
                                onNcUpdate({
                                  ...nc,
                                  root_cause_method: "5why",
                                  root_cause_summary:
                                    data.root_cause ??
                                    data.why_5 ??
                                    nc.root_cause_summary,
                                });
                              }}
                            />
                          )}
                          {method === "fishbone" && (
                            <FishboneForm
                              ncId={nc.id}
                              organizationId={organizationId}
                              initial={fishboneCauses}
                              onSaved={(causes) => {
                                onFishboneUpdate(causes);
                                onNcUpdate({
                                  ...nc,
                                  root_cause_method: "fishbone",
                                  root_cause_summary: causes
                                    .map(
                                      (c) => `${c.category}: ${c.cause_text}`
                                    )
                                    .join("; "),
                                });
                              }}
                            />
                          )}
                        </div>
                      )}

                      {(currentStage === "action_plan" ||
                        currentStage === "implementation") && (
                        <CapaActionsPanel
                          nc={nc}
                          initialActions={actions}
                          organizationId={organizationId}
                          onUpdate={onActionsUpdate}
                        />
                      )}

                      {currentStage === "effectiveness" && (
                        <div className="space-y-3">
                          <Input
                            label="Fecha programada de verificación"
                            type="date"
                            value={effectivenessDue}
                            onChange={(e) =>
                              setEffectivenessDue(e.target.value)
                            }
                          />
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                              Resultado
                            </label>
                            <select
                              value={effectivenessResult}
                              onChange={(e) =>
                                setEffectivenessResult(
                                  e.target.value as EffectivenessResult
                                )
                              }
                              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                            >
                              <option value="pending">Pendiente</option>
                              <option value="effective">Efectiva</option>
                              <option value="ineffective">No efectiva</option>
                            </select>
                          </div>
                          <Textarea
                            label="Notas de verificación"
                            value={effectivenessNotes}
                            onChange={(e) =>
                              setEffectivenessNotes(e.target.value)
                            }
                            className="min-h-[60px]"
                          />
                          {effectivenessResult === "ineffective" && (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={reopenFromIneffective}
                              loading={loading}
                            >
                              Reabrir en investigación
                            </Button>
                          )}
                        </div>
                      )}

                      {currentStage === "closure" && (
                        <div className="space-y-3">
                          <label className="flex items-center gap-2 text-sm text-ink-light">
                            <input
                              type="checkbox"
                              checked={recurrence}
                              onChange={(e) =>
                                setRecurrence(e.target.checked)
                              }
                            />
                            Marcar como reincidencia
                          </label>
                          {!canCloseRole && (
                            <p className="text-xs text-amber">
                              Requiere firma de Gerente de Calidad o
                              Administrador.
                            </p>
                          )}
                        </div>
                      )}

                      <Textarea
                        label="Comentario de transición (opcional)"
                        value={transitionComment}
                        onChange={(e) => setTransitionComment(e.target.value)}
                        className="min-h-[50px]"
                      />

                      <Button
                        type="button"
                        onClick={advanceStage}
                        loading={loading}
                        disabled={
                          currentStage === "closure" && !canCloseRole
                        }
                      >
                        <ChevronRight className="h-4 w-4" />
                        {currentStage === "closure"
                          ? "Firmar y cerrar CAPA"
                          : `Avanzar a ${getStageLabel(getNextStage(currentStage)!)}`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {stageLog.length > 0 && (
        <div className="bg-white border border-border rounded-md p-4">
          <h3 className="text-sm font-semibold text-ink mb-3">
            Auditoría de etapas
          </h3>
          <ul className="space-y-2">
            {stageLog.map((entry) => (
              <li
                key={entry.id}
                className="text-xs border-b border-border last:border-0 pb-2 last:pb-0"
              >
                <p className="text-ink">
                  {entry.from_stage
                    ? `${getStageLabel(entry.from_stage)} → ${getStageLabel(entry.to_stage)}`
                    : getStageLabel(entry.to_stage)}
                </p>
                <p className="text-ink-faint mt-0.5">
                  {profileMap.get(entry.changed_by ?? "") ?? "Sistema"} ·{" "}
                  {new Date(entry.created_at).toLocaleString("es")}
                </p>
                {entry.comment && (
                  <p className="text-ink-light mt-0.5">{entry.comment}</p>
                )}
                <p className="font-mono text-ink-faint truncate mt-0.5">
                  hash: {entry.signature_hash.slice(0, 20)}…
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
