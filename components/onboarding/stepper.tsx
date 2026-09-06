import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface StepperProps {
  currentStep: number;
  steps: { label: string }[];
}

export function Stepper({ currentStep, steps }: StepperProps) {
  return (
    <nav aria-label="Progreso del onboarding" className="mb-8">
      <ol className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <li
              key={step.label}
              className={cn(
                "flex flex-1 items-center",
                index < steps.length - 1 && "after:content-[''] after:flex-1 after:h-px after:mx-2 after:bg-border"
              )}
            >
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-mono transition-colors duration-150",
                    isCompleted && "bg-sage text-white",
                    isCurrent && "bg-forest text-white",
                    !isCompleted && !isCurrent && "bg-zinc-100 text-ink-faint"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    stepNumber
                  )}
                </span>
                <span
                  className={cn(
                    "hidden sm:inline text-xs font-medium",
                    isCurrent ? "text-forest" : "text-ink-faint"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
