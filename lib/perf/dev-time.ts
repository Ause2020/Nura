/**
 * Temporary navigation-path timings. Local only.
 * Enable: `next dev`, localhost `next start`, or `NURA_PERF_TRACE=1`.
 * Logs labels + milliseconds only. No JWT, cookies, emails, or HACCP payloads.
 */

const PREFIX = "[nura:nav]";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/analisis",
  "/planta",
  "/haccp",
  "/auditorias",
  "/capa",
  "/documentos",
  "/registros",
  "/configuracion",
  "/admin",
  "/onboarding",
] as const;

export type NavPhase = "REQUEST" | "MW" | "RSC" | "PAGE";

export type NavTraceCtx = {
  path?: string;
  host?: string | null;
};

function isLocalHostname(host?: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0]?.toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function isNavTraceEnabled(host?: string | null): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NURA_PERF_TRACE === "1" ||
    isLocalHostname(host)
  );
}

export function isProtectedNavPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function ctxOf(pathOrCtx?: string | NavTraceCtx): NavTraceCtx {
  if (!pathOrCtx) return {};
  if (typeof pathOrCtx === "string") return { path: pathOrCtx };
  return pathOrCtx;
}

function shouldLog(pathOrCtx?: string | NavTraceCtx): boolean {
  const { path, host } = ctxOf(pathOrCtx);
  if (!isNavTraceEnabled(host)) return false;
  if (!path) return true;
  if (path === "(dashboard)") return true;
  return isProtectedNavPath(path);
}

function line(phase: NavPhase, label: string, path?: string, ms?: number): string {
  const route = path ?? "-";
  const time = ms === undefined ? "" : ` ${ms}ms`;
  return `${PREFIX} ${phase.padEnd(7)} ${route}  ${label}${time}`;
}

export function logNav(
  phase: NavPhase,
  label: string,
  pathOrCtx?: string | NavTraceCtx
): void {
  if (!shouldLog(pathOrCtx)) return;
  console.info(line(phase, label, ctxOf(pathOrCtx).path));
}

export function startNavTimer(
  phase: NavPhase,
  label: string,
  pathOrCtx?: string | NavTraceCtx
): () => number {
  if (!shouldLog(pathOrCtx)) {
    return () => 0;
  }
  const path = ctxOf(pathOrCtx).path;
  const started = performance.now();
  return () => {
    const ms = Math.round(performance.now() - started);
    console.info(line(phase, label, path, ms));
    return ms;
  };
}

export async function timeNav<T>(
  phase: NavPhase,
  label: string,
  pathOrCtx: string | NavTraceCtx,
  fn: () => Promise<T> | T
): Promise<T> {
  const end = startNavTimer(phase, label, pathOrCtx);
  try {
    return await fn();
  } finally {
    end();
  }
}

/** @deprecated Prefer startNavTimer / timeNav. Kept for existing page totals. */
export function startDevTimer(label: string): () => void {
  const path = label.startsWith("/") ? label : undefined;
  const end = startNavTimer("PAGE", path ? "total" : label, path);
  return () => {
    end();
  };
}
