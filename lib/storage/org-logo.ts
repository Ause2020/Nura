import { PUBLIC_STORAGE_BUCKETS } from "@/lib/storage/paths";
import { LOGO_MAX_BYTES } from "@/lib/settings/constants";

export const LOGOS_BUCKET = PUBLIC_STORAGE_BUCKETS.logos;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;
const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const OBJECT_PATH_RE =
  /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/logos\/(.+)$/;

export type OrgLogoImage = {
  data: Uint8Array;
  format: "png" | "jpg";
};

export type OrgLogoParseOptions = {
  organizationId: string;
  supabaseUrl?: string | null;
};

export type OrgLogoDownloader = (objectPath: string) => Promise<Uint8Array | null>;

function configuredSupabaseUrl(explicit?: string | null): URL | null {
  const raw = (explicit ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function originKey(url: URL): string {
  const protocol = url.protocol.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const port =
    url.port || (protocol === "https:" ? "443" : protocol === "http:" ? "80" : url.port);
  return `${protocol}//${hostname}:${port}`;
}

function isSafeObjectPath(path: string, organizationId: string): boolean {
  if (!path || path.includes("\\") || path.includes("..")) return false;
  const segments = path.split("/");
  if (segments.length !== 2) return false;
  const [folder, filename] = segments;
  if (!folder || !filename) return false;
  if (folder === "." || folder === ".." || filename === "." || filename === "..") {
    return false;
  }
  if (!UUID_RE.test(folder) || folder.toLowerCase() !== organizationId.toLowerCase()) {
    return false;
  }
  if (!FILENAME_RE.test(filename)) return false;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXT.has(ext);
}

function pathFromThisProjectStorageUrl(
  value: string,
  project: URL
): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (originKey(url) !== originKey(project)) return null;

  const match = OBJECT_PATH_RE.exec(url.pathname);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * Returns a logos-bucket object path `{orgId}/{file}` if `stored` is a path
 * or a Storage URL of THIS Supabase project. Otherwise null (do not fetch).
 */
export function parseOrgLogoObjectPath(
  stored: string | null | undefined,
  options: OrgLogoParseOptions
): string | null {
  if (!stored || !options.organizationId) return null;
  const value = stored.trim();
  if (!value) return null;

  const lowered = value.toLowerCase();
  if (
    lowered.startsWith("file:") ||
    lowered.startsWith("data:") ||
    lowered.startsWith("blob:") ||
    lowered.startsWith("javascript:")
  ) {
    return null;
  }

  let path: string | null = null;

  if (/^https?:\/\//i.test(value)) {
    const project = configuredSupabaseUrl(options.supabaseUrl);
    if (!project) return null;
    path = pathFromThisProjectStorageUrl(value, project);
  } else if (value.includes("://") || value.startsWith("//")) {
    return null;
  } else {
    path = value.replace(/^\/+/, "");
  }

  if (!path) return null;
  if (!isSafeObjectPath(path, options.organizationId)) return null;
  return path;
}

/** Persistable value: object path or null. Throws on a non-empty untrusted string. */
export function normalizeOrgLogoForWrite(
  stored: string | null | undefined,
  organizationId: string,
  supabaseUrl?: string | null
): string | null {
  if (stored === undefined || stored === null || String(stored).trim() === "") {
    return null;
  }
  const path = parseOrgLogoObjectPath(String(stored), {
    organizationId,
    supabaseUrl,
  });
  if (!path) {
    throw new Error("Logo inválido");
  }
  return path;
}

export function resolveOrgLogoPublicUrl(
  stored: string | null | undefined,
  organizationId: string,
  supabaseUrl?: string | null
): string | null {
  const path = parseOrgLogoObjectPath(stored, { organizationId, supabaseUrl });
  const project = configuredSupabaseUrl(supabaseUrl);
  if (!path || !project) return null;
  const base = project.origin.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${LOGOS_BUCKET}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function detectPngOrJpeg(bytes: Uint8Array): "png" | "jpg" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  return null;
}

/**
 * Loads logo bytes via a caller-supplied Storage download (never fetch(userUrl)).
 * Invalid / legacy / oversized / non PNG-JPEG → null.
 */
export async function loadOrgLogoImageBytes(
  stored: string | null | undefined,
  organizationId: string,
  download: OrgLogoDownloader,
  options?: { supabaseUrl?: string | null; maxBytes?: number }
): Promise<OrgLogoImage | null> {
  const path = parseOrgLogoObjectPath(stored, {
    organizationId,
    supabaseUrl: options?.supabaseUrl,
  });
  if (!path) return null;

  let bytes: Uint8Array | null;
  try {
    bytes = await download(path);
  } catch {
    return null;
  }
  if (!bytes) return null;

  const maxBytes = options?.maxBytes ?? LOGO_MAX_BYTES;
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;

  const format = detectPngOrJpeg(bytes);
  if (!format) return null;

  return { data: bytes, format };
}
