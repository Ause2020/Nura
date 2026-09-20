export function StepChunkFallback() {
  return (
    <div
      className="h-48 rounded-md border border-border bg-white"
      aria-busy="true"
      aria-label="Cargando paso"
    >
      <div className="h-full animate-pulse rounded-md bg-zinc-50" />
    </div>
  );
}
