export type PolicyName =
  | "PUBLIC_PAGE"
  | "PUBLIC_FORM"
  | "UPLOAD"
  | "AUTH"
  | "AI"
  | "ADMIN"
  | "AUTHENTICATED"
  | "WRITE"
  | "EMAIL"
  | "HEAVY"
  | "CRON"
  | "UNAUTH_PROBE";

export type SubjectType = "ip" | "user" | "token" | "email" | "cron";

export interface PolicySpec {
  max: number;
  windowSec: number;
  failClosed: boolean;
  subjects: SubjectType[];
  ipSecondary?: { max: number; windowSec: number };
}

export const DEFAULT_POLICIES: Record<PolicyName, PolicySpec>;

export function resolvePolicies(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
): Record<PolicyName, PolicySpec>;

export function isRateLimitDisabled(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
): boolean;

export function getClientIp(
  headers: Headers | { get: (name: string) => string | null }
): string;

export function normalizePath(pathname: string): string;

export function classifyPath(
  pathname: string,
  ctx?: { hasUser?: boolean; cronAuthorized?: boolean }
): PolicyName | null;

export function isCronAuthorized(
  authorization: string | null | undefined,
  cronSecret: string | undefined
): boolean;

export function sha256Hex(value: string): Promise<string>;

export function hashSubject(value: string, pepper: string): Promise<string>;

export function buildBucketKeys(input: {
  policy: PolicyName;
  spec: PolicySpec;
  ip: string;
  userId?: string | null;
  token?: string | null;
  email?: string | null;
  pepper: string;
  only?: SubjectType[];
}): Promise<
  { type: SubjectType; key: string; max: number; windowSec: number }[]
>;

export function consumeFixedWindow(
  store: Map<string, { windowStart: number; count: number }>,
  key: string,
  limit: number,
  windowSec: number,
  nowMs?: number
): { allowed: boolean; remaining: number; retryAfter: number; count: number };

export function rateLimitResponseInit(retryAfterSec: number): {
  status: 429;
  headers: { "Retry-After": string; "Cache-Control": string };
};

export const RATE_LIMIT_ERROR_BODY: { error: string };

export function rateLimitPepper(
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>
): string;
