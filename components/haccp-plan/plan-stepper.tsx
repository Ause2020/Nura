"use client";

import { Check } from "lucide-react";
import { isStepComplete } from "@/lib/haccp-plan/checklists";
import { STEP_META } from "@/lib/haccp-plan/constants";
import type { ChecklistProgress } from "@/lib/haccp-plan/types";
import { cn } from "@/lib/utils";

export function PlanStepper({
  currentStep,
  progress,
  onSelect,
}: {
  currentStep: number;
  progress: ChecklistProgress;
  onSelect: (step: number) => void;
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {STEP_META.map((step) => {
        const complete = isStepComplete(step.id, progress);
        const active = currentStep === step.id;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(step.id)}
            className={cn(
              "shrink-0 h-8 px-2.5 rounded-full text-[11px] font-medium border flex items-center gap-1.5",
              active && "bg-ink text-white border-ink",
              !active && complete && "bg-sage text-white border-sage",
              !active && !complete && "bg-white text-ink-light border-border"
            )}
          >
            {complete && !active && <Check className="h-3 w-3" />}
            {step.id} {step.short}
          </button>
        );
      })}
    </div>
  );
}
