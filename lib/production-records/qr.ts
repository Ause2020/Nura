export type QrExpiryPreset = "8h" | "24h" | "7d" | "indefinite";

export const QR_INDEFINITE_EXPIRES_AT = "9999-12-31T23:59:59.000Z";

export const QR_EXPIRY_OPTIONS: { value: QrExpiryPreset; label: string }[] = [
  { value: "8h", label: "8 horas (un turno)" },
  { value: "24h", label: "24 horas" },
  { value: "7d", label: "7 días" },
  { value: "indefinite", label: "Indefinida" },
];

const PRESET_HOURS: Record<Exclude<QrExpiryPreset, "indefinite">, number> = {
  "8h": 8,
  "24h": 24,
  "7d": 24 * 7,
};

export function generateMonitorToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function expiryFromPreset(preset: QrExpiryPreset, now = new Date()): Date {
  if (preset === "indefinite") return new Date(QR_INDEFINITE_EXPIRES_AT);
  const hours = PRESET_HOURS[preset] ?? 24;
  return new Date(now.getTime() + hours * 3_600_000);
}

export function isIndefiniteExpiry(expiresAt: string): boolean {
  const year = new Date(expiresAt).getFullYear();
  return Number.isFinite(year) && year >= 9000;
}

export function formatQrExpiry(expiresAt: string): string {
  if (isIndefiniteExpiry(expiresAt)) return "vigencia indefinida";
  return `vence ${new Date(expiresAt).toLocaleString("es")}`;
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
