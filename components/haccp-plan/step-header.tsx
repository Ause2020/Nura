import { STEP_META } from "@/lib/haccp-plan/constants";

export function StepHeader({
  stepId,
  onCreateVersion,
}: {
  stepId: number;
  onCreateVersion: () => void;
}) {
  const meta = STEP_META.find((item) => item.id === stepId);
  if (!meta) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-sage">
          Paso {stepId} de 12
        </p>
        <h2 className="font-display text-xl font-semibold text-ink mt-1">
          {meta.title}
        </h2>
        <p className="text-xs text-ink-light mt-1 max-w-2xl">{meta.description}</p>
        {meta.banner && (
          <p className="mt-2 text-xs text-forest bg-sage-light border border-sage/20 rounded-md px-3 py-2">
            {meta.banner}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onCreateVersion}
        className="h-9 px-3 rounded-md text-xs font-medium bg-white text-ink-light border border-border hover:bg-background shrink-0"
      >
        Crear Versión
      </button>
    </div>
  );
}
