"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { STEP_CHECKLISTS, stepChecklistStats } from "@/lib/haccp-plan/checklists";
import type { ChecklistProgress } from "@/lib/haccp-plan/types";
import { cn } from "@/lib/utils";

export function StepChecklist({
  stepId,
  progress,
  onToggle,
}: {
  stepId: number;
  progress: ChecklistProgress;
  onToggle: (reqIndex: number, value: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const items = STEP_CHECKLISTS[stepId] ?? [];
  const { done, total } = stepChecklistStats(stepId, progress);
  const step = progress[String(stepId)] ?? {};

  return (
    <div className="rounded-md border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-xs font-medium text-ink">Checklist NCh 2861</p>
          <p className="text-[11px] text-ink-faint mt-0.5">
            {done} / {total} requisitos
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ink-faint transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      <div className="h-1 bg-background">
        <div
          className="h-full bg-sage transition-all"
          style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
        />
      </div>
      {open && (
        <ul className="px-4 py-3 space-y-2">
          {items.map((item, index) => {
            const checked = step[String(index)] === true;
            return (
              <li key={item}>
                <label className="flex items-start gap-2 text-xs text-ink-light cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onToggle(index, event.target.checked)}
                    className="mt-0.5 accent-[#40916C]"
                  />
                  {item}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
