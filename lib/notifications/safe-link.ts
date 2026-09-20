/**
 * Links persistidos en notifications: solo paths internos de la app.
 * Misma regla que public.is_safe_notification_link() (049).
 */
export function isSafeNotificationLink(
  link: string | null | undefined
): boolean {
  if (link == null) return true;
  const trimmed = link.trim();
  if (trimmed.length <= 1) return false;
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("\\") || trimmed.includes("\n") || trimmed.includes("\r")) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  return true;
}

export function sanitizeNotificationLink(
  link: string | null | undefined
): string | null {
  if (link == null) return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  return isSafeNotificationLink(trimmed) ? trimmed : null;
}
