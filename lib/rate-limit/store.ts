import { createAdminClient } from "@/lib/supabase/admin";

export type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  unavailable?: boolean;
};

type RpcRow = {
  allowed?: boolean;
  remaining?: number;
  retry_after?: number;
};

function asResult(data: unknown): ConsumeResult | null {
  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
  if (!row || typeof row.allowed !== "boolean") return null;
  return {
    allowed: row.allowed,
    remaining: Number(row.remaining ?? 0),
    retryAfter: Number(row.retry_after ?? 0),
  };
}

const STORE_TIMEOUT_MS = 1_500;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("rate-limit store timeout")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function consumeRateLimitBuckets(
  items: { key: string; max: number; windowSec: number }[]
): Promise<ConsumeResult> {
  const fallbackWindow = items[0]?.windowSec ?? 60;
  if (items.length === 0) {
    return { allowed: true, remaining: 0, retryAfter: 0, unavailable: true };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { allowed: false, remaining: 0, retryAfter: fallbackWindow, unavailable: true };
  }

  try {
    const { data, error } = await withTimeout<{
      data: unknown;
      error: { message?: string } | null;
    }>(
      admin.rpc("consume_rate_limits", {
        p_items: items.map((item) => ({
          key: item.key,
          limit: item.max,
          window_seconds: item.windowSec,
        })),
      }),
      STORE_TIMEOUT_MS
    );

    if (error) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: fallbackWindow,
        unavailable: true,
      };
    }

    return (
      asResult(data) ?? {
        allowed: false,
        remaining: 0,
        retryAfter: fallbackWindow,
        unavailable: true,
      }
    );
  } catch {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: fallbackWindow,
      unavailable: true,
    };
  }
}

export async function consumeRateLimitBucket(input: {
  key: string;
  max: number;
  windowSec: number;
}): Promise<ConsumeResult> {
  return consumeRateLimitBuckets([input]);
}

export async function recordAbuseEvent(input: {
  policy: string;
  path: string;
  method: string;
  subjectType: string;
  subjectHash: string;
  retryAfter: number;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;

  try {
    await withTimeout(
      admin.rpc("record_rate_limit_abuse", {
        p_policy: input.policy.slice(0, 32),
        p_path: input.path.slice(0, 200),
        p_method: input.method.slice(0, 12),
        p_subject_type: input.subjectType.slice(0, 16),
        p_subject_hash: input.subjectHash.slice(0, 64),
        p_retry_after: input.retryAfter,
      }),
      STORE_TIMEOUT_MS
    );
  } catch {
    // Abuse logging must never block the 429 path.
  }
}
