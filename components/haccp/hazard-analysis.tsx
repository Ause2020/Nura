"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CcpTree } from "@/components/haccp/ccp-tree";
import { HazardModal, type HazardFormData } from "@/components/haccp/hazard-modal";
import { getStepTypeConfig } from "@/lib/haccp/constants";
import {
  calculateRisk,
  DETERMINATION_LABELS,
  getRiskBadgeVariant,
  HAZARD_TYPE_CONFIG,
} from "@/lib/haccp/risk-matrix";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { HaccpHazard, HaccpProcessStep } from "@/types/database";

interface HazardAnalysisProps {
  steps: HaccpProcessStep[];
  initialHazards: HaccpHazard[];
  organizationId: string;
  ccpCount: number;
}

export function HazardAnalysis({
  steps,
  initialHazards,
  organizationId,
  ccpCount,
}: HazardAnalysisProps) {
  const router = useRouter();
  const [hazards, setHazards] = useState(initialHazards);
  const [modalOpen, setModalOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(false);
  const [activeStep, setActiveStep] = useState<HaccpProcessStep | null>(null);
  const [editingHazard, setEditingHazard] = useState<HaccpHazard | null>(null);
  const [treeHazard, setTreeHazard] = useState<HaccpHazard | null>(null);
  const [treeStep, setTreeStep] = useState<HaccpProcessStep | null>(null);
  const [saving, setSaving] = useState(false);

  const sortedSteps = [...steps].sort((a, b) => a.position - b.position);

  useEffect(() => {
    setHazards(initialHazards);
  }, [initialHazards]);

  function openAdd(step: HaccpProcessStep) {
    setActiveStep(step);
    setEditingHazard(null);
    setModalOpen(true);
  }

  function openTree(hazard: HaccpHazard, step: HaccpProcessStep) {
    setTreeHazard(hazard);
    setTreeStep(step);
    setTreeOpen(true);
  }

  async function handleSave(data: HazardFormData) {
    if (!activeStep) return;
    setSaving(true);
    const supabase = createClient();
    const risk = calculateRisk(data.severity, data.probability);

    const payload = {
      hazard_type: data.hazard_type,
      hazard_description: data.hazard_description.trim(),
      source: data.source.trim() || null,
      severity: data.severity,
      probability: data.probability,
      risk_level: risk.risk_level,
      is_significant: risk.is_significant,
      control_measures: data.control_measures.trim() || null,
      notes: data.notes.trim() || null,
    };

    if (editingHazard) {
      const { error } = await supabase
        .from("haccp_hazards")
        .update(payload)
        .eq("id", editingHazard.id);

      if (!error) {
        setHazards((prev) =>
          prev.map((h) =>
            h.id === editingHazard.id ? { ...h, ...payload } : h
          )
        );
      }
    } else {
      const { data: newHazard, error } = await supabase
        .from("haccp_hazards")
        .insert({
          ...payload,
          process_step_id: activeStep.id,
          organization_id: organizationId,
        })
        .select("*")
        .single();

      if (!error && newHazard) {
        setHazards((prev) => [...prev, newHazard as HaccpHazard]);
      }
    }

    setSaving(false);
    setModalOpen(false);
    router.refresh();
  }

  if (sortedSteps.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="Primero define tu diagrama de proceso"
        description="Agrega pasos en la pestaña Diagrama de proceso antes de analizar peligros."
      />
    );
  }

  return (
    <div className="space-y-6">
      {sortedSteps.map((step) => {
        const stepHazards = hazards.filter((h) => h.process_step_id === step.id);
        const stepConfig = getStepTypeConfig(step.step_type);
        const StepIcon = stepConfig.icon;

        return (
          <div
            key={step.id}
            className="bg-white rounded-md border border-border overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 h-8 bg-zinc-50 border-b border-border">
              <div className="flex items-center gap-2">
                <StepIcon className="h-3.5 w-3.5 text-ink-faint" />
                <span className="text-xs uppercase tracking-wider text-ink-faint font-mono">
                  {step.name}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => openAdd(step)}
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar peligro
              </Button>
            </div>

            {stepHazards.length === 0 ? (
              <p className="px-4 py-6 text-xs text-ink-faint text-center">
                Sin peligros identificados en este paso
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Tipo
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Descripción
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Severidad
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Probabilidad
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Riesgo
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Signif.
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                        Determinación
                      </th>
                      <th className="px-4 py-2 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {stepHazards.map((hazard) => {
                      const typeConfig = HAZARD_TYPE_CONFIG[hazard.hazard_type];
                      const TypeIcon = typeConfig?.icon;

                      return (
                        <tr
                          key={hazard.id}
                          className="border-b border-border last:border-0 hover:bg-background transition-colors duration-150"
                        >
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset",
                                typeConfig?.className
                              )}
                            >
                              {TypeIcon && (
                                <TypeIcon className="h-3 w-3 shrink-0" />
                              )}
                              {typeConfig?.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-ink max-w-[200px]">
                            <span className="line-clamp-2">
                              {hazard.hazard_description}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="neutral" showDot={false}>
                              {hazard.severity}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant="neutral" showDot={false}>
                              {hazard.probability}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              variant={getRiskBadgeVariant(hazard.risk_level)}
                            >
                              {hazard.risk_level ?? "—"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2.5 text-sm">
                            {hazard.is_significant ? "Sí" : "No"}
                          </td>
                          <td className="px-4 py-2.5">
                            {hazard.ccp_determination ? (
                              <Badge
                                variant={
                                  hazard.ccp_determination === "ccp"
                                    ? "success"
                                    : "neutral"
                                }
                              >
                                {DETERMINATION_LABELS[hazard.ccp_determination] ??
                                  hazard.ccp_determination}
                              </Badge>
                            ) : (
                              <span className="text-xs text-ink-faint">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {hazard.is_significant &&
                              !hazard.ccp_determination && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-7 text-xs px-2"
                                  onClick={() => openTree(hazard, step)}
                                >
                                  <GitBranch className="h-3 w-3" />
                                  CCP
                                </Button>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {activeStep && (
        <HazardModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          step={activeStep}
          hazard={editingHazard}
          saving={saving}
        />
      )}

      {treeHazard && treeStep && (
        <CcpTree
          open={treeOpen}
          onClose={() => setTreeOpen(false)}
          hazard={treeHazard}
          step={treeStep}
          organizationId={organizationId}
          existingCcpCount={ccpCount}
          onComplete={() => {
            setTreeOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
