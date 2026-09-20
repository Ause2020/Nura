/** Next.js App Router prefetch (viewport or `router.prefetch`). Not client-spoofable for security decisions. */
export function isRouterPrefetch(headers: {
  get(name: string): string | null;
}): boolean {
  const nextPrefetch = headers.get("next-router-prefetch");
  if (nextPrefetch === "1" || nextPrefetch === "true") return true;
  return headers.get("purpose") === "prefetch";
}
