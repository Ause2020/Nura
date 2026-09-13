/** Timing only in `next dev`. No-op in production builds. */
export function startDevTimer(label: string): () => void {
  if (process.env.NODE_ENV !== "development") {
    return () => undefined;
  }
  const started = performance.now();
  return () => {
    const ms = Math.round(performance.now() - started);
    console.debug(`[nura:nav] ${label} ${ms}ms`);
  };
}
