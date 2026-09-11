/**
 * Rate limiting — lógica pura (sin I/O).
 * El store distribuido vive en Postgres (consume_rate_limit).
 * Este módulo se usa en middleware, route handlers y tests.
 */

/** @typedef {"PUBLIC_PAGE"|"PUBLIC_FORM"|"UPLOAD"|"AUTH"|"AI"|"ADMIN"|"AUTHENTICATED"|"WRITE"|"EMAIL"|"HEAVY"|"CRON"|"UNAUTH_PROBE"} PolicyName */

/** @typedef {"ip"|"user"|"token"|"email"|"cron"} SubjectType */

/**
 * @typedef {object} PolicySpec
 * @property {number} max
 * @property {number} windowSec
 * @property {boolean} failClosed
 * @property {SubjectType[]} subjects
 * @property {{ max: number, windowSec: number } | null} [ipSecondary]
 */

export const DEFAULT_POLICIES = {
  PUBLIC_PAGE: { max: 60, windowSec: 60, failClosed: true, subjects: ["ip"] },
  PUBLIC_FORM: { max: 20, windowSec: 60, failClosed: true, subjects: ["ip", "token"] },
  UPLOAD: { max: 5, windowSec: 600, failClosed: true, subjects: ["ip", "token"] },
  AUTH: { max: 5, windowSec: 60, failClosed: true, subjects: ["ip", "email"] },
  AI: {
    max: 10,
    windowSec: 60,
    failClosed: true,
    subjects: ["user"],
    ipSecondary: { max: 60, windowSec: 60 },
  },
  ADMIN: { max: 60, windowSec: 60, failClosed: false, subjects: ["user"] },
  AUTHENTICATED: { max: 120, windowSec: 60, failClosed: false, subjects: ["user"] },
  WRITE: { max: 30, windowSec: 60, failClosed: false, subjects: ["user"] },
  EMAIL: { max: 10, windowSec: 600, failClosed: false, subjects: ["user"] },
  HEAVY: { max: 10, windowSec: 60, failClosed: false, subjects: ["user"] },
  CRON: { max: 5, windowSec: 60, failClosed: true, subjects: ["cron"] },
  UNAUTH_PROBE: { max: 20, windowSec: 60, failClosed: true, subjects: ["ip"] },
};

const ENV_KEYS = {
  PUBLIC_PAGE: ["RATE_LIMIT_PUBLIC_PAGE_MAX", "RATE_LIMIT_PUBLIC_PAGE_WINDOW_SEC"],
  PUBLIC_FORM: ["RATE_LIMIT_PUBLIC_FORM_MAX", "RATE_LIMIT_PUBLIC_FORM_WINDOW_SEC"],
  UPLOAD: ["RATE_LIMIT_UPLOAD_MAX", "RATE_LIMIT_UPLOAD_WINDOW_SEC"],
  AUTH: ["RATE_LIMIT_AUTH_MAX", "RATE_LIMIT_AUTH_WINDOW_SEC"],
  AI: ["RATE_LIMIT_AI_MAX", "RATE_LIMIT_AI_WINDOW_SEC"],
  ADMIN: ["RATE_LIMIT_ADMIN_MAX", "RATE_LIMIT_ADMIN_WINDOW_SEC"],
  AUTHENTICATED: [
    "RATE_LIMIT_AUTHENTICATED_MAX",
    "RATE_LIMIT_AUTHENTICATED_WINDOW_SEC",
  ],
  WRITE: ["RATE_LIMIT_WRITE_MAX", "RATE_LIMIT_WRITE_WINDOW_SEC"],
  EMAIL: ["RATE_LIMIT_EMAIL_MAX", "RATE_LIMIT_EMAIL_WINDOW_SEC"],
  HEAVY: ["RATE_LIMIT_HEAVY_MAX", "RATE_LIMIT_HEAVY_WINDOW_SEC"],
  CRON: ["RATE_LIMIT_CRON_MAX", "RATE_LIMIT_CRON_WINDOW_SEC"],
  UNAUTH_PROBE: [
    "RATE_LIMIT_UNAUTH_PROBE_MAX",
    "RATE_LIMIT_UNAUTH_PROBE_WINDOW_SEC",
  ],
};

const AI_IP_ENV = ["RATE_LIMIT_AI_IP_MAX", "RATE_LIMIT_AI_IP_WINDOW_SEC"];

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

const TOKENIZED_PREFIXES = [
  "/proveedor/",
  "/m/",
  "/invitacion/",
  "/registro-calidad/",
];

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function parseBoundInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function resolvePolicies(env = process.env) {
  /** @type {Record<PolicyName, PolicySpec>} */
  const policies = {};
  for (const [name, defaults] of Object.entries(DEFAULT_POLICIES)) {
    const [maxKey, windowKey] = ENV_KEYS[name];
    const spec = {
      max: parseBoundInt(env[maxKey], defaults.max, 1, 10_000),
      windowSec: parseBoundInt(env[windowKey], defaults.windowSec, 1, 86_400),
      failClosed: defaults.failClosed,
      subjects: [...defaults.subjects],
    };
    if (defaults.ipSecondary) {
      spec.ipSecondary = {
        max: parseBoundInt(env[AI_IP_ENV[0]], defaults.ipSecondary.max, 1, 10_000),
        windowSec: parseBoundInt(
          env[AI_IP_ENV[1]],
          defaults.ipSecondary.windowSec,
          1,
          86_400
        ),
      };
    }
    policies[name] = spec;
  }
  return policies;
}

export function isRateLimitDisabled(env = process.env) {
  const raw = String(env.RATE_LIMIT_DISABLED ?? "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * IP del cliente. No se puede eludir cambiando headers no confiables:
 * si Vercel ya identificó la IP, se ignora el resto.
 *
 * @param {Headers | { get: (name: string) => string | null }} headers
 */
export function getClientIp(headers) {
  const vercel = firstIp(headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  const forwarded = firstIp(headers.get("x-forwarded-for"));
  if (forwarded) return forwarded;

  return "0.0.0.0";
}

/**
 * @param {string | null} value
 */
function firstIp(value) {
  if (!value) return null;
  const part = value.split(",")[0]?.trim() ?? "";
  if (!part || part.length > 128) return null;
  return part;
}

/**
 * @param {string} pathname
 */
export function normalizePath(pathname) {
  const raw = String(pathname || "/").split("?")[0] || "/";
  let path = raw.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  for (const prefix of TOKENIZED_PREFIXES) {
    if (path === prefix.slice(0, -1) || path.startsWith(prefix)) {
      return `${prefix.slice(0, -1)}/:token`;
    }
  }

  path = path.replace(UUID_RE, ":id");
  path = path.replace(
    /^(\/api\/export\/audit-pdf)\/[^/]+$/i,
    "$1/:id"
  );
  path = path.replace(/^(\/api\/suppliers)\/[^/]+(\/portal-token)$/i, "$1/:id$2");
  path = path.replace(/^(\/api\/team\/members)\/[^/]+$/i, "$1/:id");
  path = path.replace(/^(\/api\/team\/invitations)\/[^/]+$/i, "$1/:id");
  return path;
}

/**
 * @param {string} pathname
 * @param {{ hasUser?: boolean, cronAuthorized?: boolean }} [ctx]
 * @returns {PolicyName | null}
 */
export function classifyPath(pathname, ctx = {}) {
  const path = normalizePath(pathname);

  if (path === "/api/quality-control/submit") return "PUBLIC_FORM";
  if (path === "/api/proveedor/upload") return "UPLOAD";
  if (path === "/api/monitoreo/qr-submit") return "PUBLIC_FORM";

  if (path === "/api/auth/login" || path === "/api/auth/forgot-password") {
    return "AUTH";
  }
  if (path === "/auth/callback") return "AUTH";
  if (path === "/api/team/accept") return "AUTH";

  if (path.startsWith("/api/ai/") || path === "/api/monitoreo/ocr") {
    return ctx.hasUser ? "AI" : "UNAUTH_PROBE";
  }

  if (
    path === "/api/capa/escalate" ||
    path === "/api/settings/export" ||
    path.startsWith("/api/export/")
  ) {
    return ctx.hasUser ? "HEAVY" : "UNAUTH_PROBE";
  }

  if (path === "/api/notifications/cron") {
    if (ctx.cronAuthorized) return "CRON";
    return ctx.hasUser ? "HEAVY" : "UNAUTH_PROBE";
  }
  if (path.startsWith("/api/notifications/")) {
    return ctx.hasUser ? "EMAIL" : "UNAUTH_PROBE";
  }

  if (path.startsWith("/api/admin/")) {
    return ctx.hasUser ? "ADMIN" : "UNAUTH_PROBE";
  }

  if (path === "/api/team/invite" || path === "/api/team/create-user") {
    return ctx.hasUser ? "EMAIL" : "UNAUTH_PROBE";
  }

  if (path.startsWith("/api/quick-capture/")) {
    return ctx.hasUser ? "WRITE" : "UNAUTH_PROBE";
  }

  if (path.startsWith("/api/")) {
    return ctx.hasUser ? "AUTHENTICATED" : "UNAUTH_PROBE";
  }

  if (
    path === "/proveedor/:token" ||
    path === "/m/:token" ||
    path === "/registro-calidad/:token"
  ) {
    return "PUBLIC_PAGE";
  }
  if (path === "/invitacion/:token") return "PUBLIC_PAGE";

  return null;
}

/**
 * @param {string | null | undefined} authorization
 * @param {string | undefined} cronSecret
 */
export function isCronAuthorized(authorization, cronSecret) {
  if (!cronSecret || !authorization) return false;
  const expected = `Bearer ${cronSecret}`;
  if (expected.length !== authorization.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ authorization.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * @param {string} value
 */
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * @param {string} value
 * @param {string} pepper
 */
export async function hashSubject(value, pepper) {
  const hex = await sha256Hex(`${pepper}|${value}`);
  return hex.slice(0, 32);
}

/**
 * @param {object} input
 * @param {PolicyName} input.policy
 * @param {PolicySpec} input.spec
 * @param {string} input.ip
 * @param {string | null | undefined} [input.userId]
 * @param {string | null | undefined} [input.token]
 * @param {string | null | undefined} [input.email]
 * @param {string} input.pepper
 * @param {SubjectType[] | undefined} [input.only]
 */
export async function buildBucketKeys(input) {
  const wanted = new Set(input.only ?? input.spec.subjects);
  /** @type {{ type: SubjectType, key: string, max: number, windowSec: number }[]} */
  const buckets = [];

  const add = async (type, raw, max, windowSec) => {
    if (!wanted.has(type) || !raw) return;
    const hash = await hashSubject(String(raw).trim().toLowerCase(), input.pepper);
    buckets.push({
      type,
      key: `rl:${input.policy}:${type}:${hash}`,
      max,
      windowSec,
    });
  };

  await add("ip", input.ip, input.spec.max, input.spec.windowSec);
  await add("user", input.userId, input.spec.max, input.spec.windowSec);
  await add("token", input.token, input.spec.max, input.spec.windowSec);
  await add("email", input.email, input.spec.max, input.spec.windowSec);
  await add("cron", "global", input.spec.max, input.spec.windowSec);

  if (input.spec.ipSecondary && wanted.has("user") && input.ip) {
    const hash = await hashSubject(input.ip, input.pepper);
    buckets.push({
      type: "ip",
      key: `rl:${input.policy}:ipsec:${hash}`,
      max: input.spec.ipSecondary.max,
      windowSec: input.spec.ipSecondary.windowSec,
    });
  }

  return buckets;
}

/**
 * Ventana fija alineada a epoch — misma semántica que consume_rate_limit en SQL.
 *
 * @param {Map<string, { windowStart: number, count: number }>} store
 * @param {string} key
 * @param {number} limit
 * @param {number} windowSec
 * @param {number} [nowMs]
 */
export function consumeFixedWindow(store, key, limit, windowSec, nowMs = Date.now()) {
  const windowStart = Math.floor(nowMs / 1000 / windowSec) * windowSec;
  const current = store.get(key);
  const count =
    current && current.windowStart === windowStart ? current.count + 1 : 1;
  store.set(key, { windowStart, count });
  const allowed = count <= limit;
  const elapsed = Math.floor(nowMs / 1000) - windowStart;
  const retryAfter = allowed ? 0 : Math.max(1, windowSec - elapsed);
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfter,
    count,
  };
}

/**
 * @param {number} retryAfterSec
 */
export function rateLimitResponseInit(retryAfterSec) {
  const retry = Math.max(1, Math.floor(retryAfterSec));
  return {
    status: 429,
    headers: {
      "Retry-After": String(retry),
      "Cache-Control": "no-store",
    },
  };
}

export const RATE_LIMIT_ERROR_BODY = { error: "Too many requests" };

export function rateLimitPepper(env = process.env) {
  return (
    env.RATE_LIMIT_PEPPER ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    "nura-rate-limit-v1"
  );
}
