"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isStepComplete, STEP_CHECKLISTS } from "@/lib/haccp-plan/checklists";
import type { ChecklistProgress } from "@/lib/haccp-plan/types";

export function Step12Docs({ progress }: { progress: ChecklistProgress }) {
  const complete = Object.keys(STEP_CHECKLISTS).filter((id) =>
    isStepComplete(Number(id), progress)
  ).length;

  return (
    <div className="rounded-lg border border-border bg-white p-6 text-center space-y-3">
      <h3 className="text-lg font-display text-ink">Documentación del plan</h3>
      <p className="text-sm text-ink-light max-w-lg mx-auto">
        El manual HACCP vive en Documentos, organizado por paso. Usa “Crear Versión”
        en cada paso para dejar un snapshot controlado.
      </p>
      <p className="text-xs text-ink-faint font-mono">
        {complete} de 12 pasos con checklist completo
      </p>
      <Link
        href="/documentos"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-sage text-white text-sm"
      >
        Ir a Documentación
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
