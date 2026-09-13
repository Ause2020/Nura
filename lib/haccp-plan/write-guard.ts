/**
 * Evita writes idénticos a Supabase. Las huellas ignoran `updated_at`
 * porque ese campo cambia en cada intento y anularía la comparación.
 */

export function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

export function samePayload(a: unknown, b: unknown): boolean {
  return fingerprint(a) === fingerprint(b);
}

export function stripUpdatedAt<T extends Record<string, unknown>>(
  row: T
): Omit<T, "updated_at"> {
  const rest = { ...row };
  delete rest.updated_at;
  return rest;
}

const lastWrites = new Map<string, string>();

export function shouldSkipWrite(key: string, payload: unknown): boolean {
  return lastWrites.get(key) === fingerprint(payload);
}

export function rememberWrite(key: string, payload: unknown): void {
  lastWrites.set(key, fingerprint(payload));
}

export function forgetWrite(key: string): void {
  lastWrites.delete(key);
}

export function clearWriteCache(): void {
  lastWrites.clear();
}

export function persistableDiagrams(
  diagrams: Array<{
    id: string;
    name: string;
    nodes: unknown;
    edges: unknown;
    zoom: number;
    panX: number;
    panY: number;
  }>
) {
  return diagrams.map((diagram, order) => ({
    id: diagram.id,
    name: diagram.name,
    nodes: diagram.nodes,
    edges: diagram.edges,
    zoom: Math.round(diagram.zoom * 1000) / 1000,
    panX: Math.round(diagram.panX),
    panY: Math.round(diagram.panY),
    order,
  }));
}
