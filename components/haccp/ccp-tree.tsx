"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { HaccpHazard, HaccpProcessStep } from "@/types/database";

type TreeStep =
  | "q1"
  | "q1_modify"
  | "q2"
  | "q3"
  | "q4"
  | "result";

type TreeResult = "ccp" | "not_ccp" | "modify_step";

interface CcpTreeProps {
  open: boolean;
  onClose: () => void;
  hazard: HaccpHazard;
  step: HaccpProcessStep;
  organizationId: string;
  existingCcpCount: number;
  onComplete: () => void;
}

const QUESTIONS: Record<string, string> = {
  q1: "¿Existen medidas preventivas de control para este peligro?",
  q1_modify: "¿Puede modificarse el paso de proceso para controlar el peligro?",
  q2: "¿Este paso elimina o reduce el peligro a un nivel aceptable?",
  q3: "¿Podría ocurrir contaminación o incrementarse el peligro más allá de los niveles aceptables?",
  q4: "¿Un paso posterior eliminará o reducirá el peligro a un nivel aceptable?",
};

const STEP_ORDER: TreeStep[] = ["q1", "q1_modify", "q2", "q3", "q4", "result"];

function getProgress(current: TreeStep): number {
  const idx = STEP_ORDER.indexOf(current);
  if (current === "result") return 4;
  return Math.min(idx + 1, 4);
}

export function CcpTree({
  open,
  onClose,
  hazard,
  step,
  organizationId,
  existingCcpCount,
  onComplete,
}: CcpTreeProps) {
  const [currentStep, setCurrentStep] = useState<TreeStep>("q1");
  const [result, setResult] = useState<TreeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [showResult, setShowResult] = useState(false);

  function reset() {
    setCurrentStep("q1");
    setResult(null);
    setShowResult(false);
    setSaving(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function answer(yes: boolean) {
    switch (currentStep) {
      case "q1":
        if (yes) setCurrentStep("q2");
        else setCurrentStep("q1_modify");
        break;
      case "q1_modify":
        if (yes) {
          setResult("modify_step");
          setShowResult(true);
        } else {
          setCurrentStep("q3");
        }
        break;
      case "q2":
        if (yes) {
          setResult("ccp");
          setShowResult(true);
        } else {
          setCurrentStep("q3");
        }
        break;
      case "q3":
        if (yes) setCurrentStep("q4");
        else {
          setResult("not_ccp");
          setShowResult(true);
        }
        break;
      case "q4":
        setResult(yes ? "not_ccp" : "ccp");
        setShowResult(true);
        break;
    }
  }

  async function saveResult() {
    if (!result) return;
    setSaving(true);
    const supabase = createClient();

    let determination: string;
    if (result === "ccp") {
      determination = "ccp";
    } else if (result === "modify_step") {
      determination = "prp";
    } else {
      determination = hazard.is_significant ? "oprp" : "not_significant";
    }

    await supabase
      .from("haccp_hazards")
      .update({ ccp_determination: determination })
      .eq("id", hazard.id);

    if (result === "ccp") {
      const ccpNumber = `CCP-${existingCcpCount + 1}`;
      await supabase.from("haccp_ccps").insert({
        hazard_id: hazard.id,
        process_step_id: step.id,
        organization_id: organizationId,
        ccp_number: ccpNumber,
        critical_limit: "Por definir",
        monitoring_what: "Por definir",
        monitoring_how: "Por definir",
        monitoring_frequency: "Por definir",
        monitoring_responsible: "Por definir",
        corrective_action: "Por definir",
      });

      await supabase
        .from("haccp_process_steps")
        .update({ is_ccp: true })
        .eq("id", step.id);
    }

    setSaving(false);
    onComplete();
    handleClose();
  }

  const progress = getProgress(currentStep);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Árbol de decisiones CCP"
      className="max-w-lg"
    >
      <div className="space-y-4 -mt-2">
        <div className="text-xs text-ink-faint">
          <span className="font-mono">Paso:</span> {step.name} ·{" "}
          <span className="font-mono">Peligro:</span>{" "}
          {hazard.hazard_description.slice(0, 60)}
          {hazard.hazard_description.length > 60 ? "…" : ""}
        </div>

        {!showResult ? (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sage rounded-full transition-all duration-150"
                  style={{ width: `${(progress / 4) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-ink-faint">
                {progress}/4
              </span>
            </div>

            <p className="text-sm font-medium text-ink leading-relaxed">
              {QUESTIONS[currentStep]}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => answer(true)}
                className="h-12 rounded-md border-2 border-sage bg-sage-light text-forest font-medium text-sm transition-colors duration-150 hover:bg-sage-light/70"
              >
                Sí
              </button>
              <button
                type="button"
                onClick={() => answer(false)}
                className="h-12 rounded-md border-2 border-border bg-white text-ink-light font-medium text-sm transition-colors duration-150 hover:bg-background"
              >
                No
              </button>
            </div>
          </>
        ) : (
          <div
            className={cn(
              "py-8 text-center rounded-md transition-all duration-300",
              result === "ccp" ? "bg-sage-light" : "bg-zinc-50"
            )}
          >
            {result === "ccp" ? (
              <>
                <Badge variant="success" className="text-sm px-4 py-1 mb-3">
                  Es un CCP
                </Badge>
                <p className="text-sm text-ink-light">
                  Este paso requiere un Punto Crítico de Control. Se creará el
                  registro CCP-{existingCcpCount + 1} para completar.
                </p>
              </>
            ) : result === "modify_step" ? (
              <>
                <Badge variant="warning" className="text-sm px-4 py-1 mb-3">
                  Modificar paso
                </Badge>
                <p className="text-sm text-ink-light">
                  Se recomienda modificar el paso de proceso. Clasificado como PRP.
                </p>
              </>
            ) : (
              <>
                <Badge variant="neutral" className="text-sm px-4 py-1 mb-3">
                  No es CCP
                </Badge>
                <p className="text-sm text-ink-light">
                  Este peligro no requiere un CCP en este paso.
                  {hazard.is_significant
                    ? " Clasificado como OPRP."
                    : " No significativo."}
                </p>
              </>
            )}

            <Button
              className="mt-6"
              onClick={saveResult}
              loading={saving}
            >
              Guardar determinación
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
