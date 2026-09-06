export type QrExpiryPreset = "8h" | "24h" | "7d";

export const QR_EXPIRY_OPTIONS: { value: QrExpiryPreset; label: string; hours: number }[] =
  [
    { value: "8h", label: "8 horas (un turno)", hours: 8 },
    { value: "24h", label: "24 horas", hours: 24 },
    { value: "7d", label: "7 días", hours: 24 * 7 },
  ];

export function generateMonitorToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function expiryFromPreset(preset: QrExpiryPreset, now = new Date()): Date {
  const option = QR_EXPIRY_OPTIONS.find((o) => o.value === preset) ?? QR_EXPIRY_OPTIONS[1];
  return new Date(now.getTime() + option.hours * 3_600_000);
}

export function fieldMonitorUrl(token: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : null) ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/m/${token}`;
}

export function isQrLinkActive(link: {
  expires_at: string;
  revoked_at: string | null;
}): boolean {
  if (link.revoked_at) return false;
  return new Date(link.expires_at).getTime() > Date.now();
}

export const MONITORING_SOURCE_LABELS = {
  form: "En planta",
  qr: "Terreno (QR)",
  ocr: "Digitalizado",
} as const;
