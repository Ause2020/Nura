import { NextResponse } from "next/server";
import {
  buildBucketKeys,
  classifyPath,
  getClientIp,
  hashSubject,
  isCronAuthorized,
  isRateLimitDisabled,
  normalizePath,
  RATE_LIMIT_ERROR_BODY,
  rateLimitPepper,
  rateLimitResponseInit,
  resolvePolicies,
  type PolicyName,
  type SubjectType,
} from "./core.mjs";
import { consumeRateLimitBuckets, recordAbuseEvent } from "./store";

export type RateLimitDecision = {
  allowed: boolean;
  policy: PolicyName | null;
  retryAfter: number;
  response: NextResponse | null;
};

type EnforceInput = {
  request: Request;
  pathname?: string;
  userId?: string | null;
  token?: string | null;
  email?: string | null;
  cronAuthorized?: boolean;
  only?: SubjectType[];
  policy?: PolicyName;
};

function deniedResponse(retryAfter: number): NextResponse {
  return NextResponse.json(RATE_LIMIT_ERROR_BODY, rateLimitResponseInit(retryAfter));
}

export async function enforceRateLimit(
  input: EnforceInput
): Promise<RateLimitDecision> {
  if (isRateLimitDisabled()) {
    return { allowed: true, policy: null, retryAfter: 0, response: null };
  }

  const url = new URL(input.request.url);
  const pathname = normalizePath(input.pathname ?? url.pathname);
  const cronAuthorized =
    input.cronAuthorized ??
    isCronAuthorized(
      input.request.headers.get("authorization"),
      process.env.CRON_SECRET
    );

  const policy =
    input.policy ??
    classifyPath(pathname, {
      hasUser: Boolean(input.userId),
      cronAuthorized,
    });

  if (!policy) {
    return { allowed: true, policy: null, retryAfter: 0, response: null };
  }

  const spec = resolvePolicies()[policy];
  const ip = getClientIp(input.request.headers);
  const buckets = await buildBucketKeys({
    policy,
    spec,
    ip,
    userId: input.userId,
    token: input.token,
    email: input.email,
    pepper: rateLimitPepper(),
    only: input.only,
  });

  const effectiveBuckets =
    buckets.length > 0
      ? buckets
      : [
          {
            type: "ip" as const,
            key: `rl:${policy}:ip:${await hashSubject(ip, rateLimitPepper())}`,
            max: spec.max,
            windowSec: spec.windowSec,
          },
        ];

  const result = await consumeRateLimitBuckets(
    effectiveBuckets.map((bucket) => ({
      key: bucket.key,
      max: bucket.max,
      windowSec: bucket.windowSec,
    }))
  );

  if (result.unavailable) {
    return { allowed: true, policy, retryAfter: 0, response: null };
  }

  if (result.allowed) {
    return { allowed: true, policy, retryAfter: 0, response: null };
  }

  const denied = effectiveBuckets[0];
  const retryAfter = result.retryAfter || denied.windowSec;
  const subjectHash = denied.key.split(":").pop() ?? "unknown";
  try {
    await recordAbuseEvent({
      policy,
      path: pathname,
      method: input.request.method,
      subjectType: denied.type,
      subjectHash,
      retryAfter,
    });
  } catch {
    // Logging must never break the deny path.
  }

  return {
    allowed: false,
    policy,
    retryAfter,
    response: deniedResponse(retryAfter),
  };
}

export async function rateLimitResponse(
  input: EnforceInput
): Promise<NextResponse | null> {
  const decision = await enforceRateLimit(input);
  return decision.response;
}
