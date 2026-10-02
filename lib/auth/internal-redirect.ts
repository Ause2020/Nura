/**
 * Destinos de navegación post-auth: solo paths internos de Nura.
 * Pensado para valores de URLSearchParams.get() (ya decodificados una vez).
 * No vuelve a decodeURIComponent.
 */
export function sanitizeInternalRedirect(
  value: string | null | undefined,
  fallback = "/dashboard"
): string {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  if (!path) return fallback;

  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.includes("\\")) return fallback;
  if (path.includes("://")) return fallback;
  if (/[\u0000-\u001F\u007F]/.test(path)) return fallback;

  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  const afterSlash = pathname.slice(1);
  if (!afterSlash && pathname !== "/") {
    return fallback;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(afterSlash)) return fallback;

  return path;
}
