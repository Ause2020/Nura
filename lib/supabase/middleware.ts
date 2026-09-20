import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/access/platform-admin";
import {
  resolveSessionGates,
  type SessionGateOrg,
  type SessionGateProfile,
} from "@/lib/access/session-gates";
import { isRouterPrefetch } from "@/lib/nav/router-prefetch";
import { logNav, startNavTimer } from "@/lib/perf/dev-time";
import type { UserRole } from "@/types/database";

async function loadSessionGates(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<{ profile: SessionGateProfile | null; org: SessionGateOrg | null }> {
  const [profile, org] = await Promise.all([
    loadGateProfile(supabase, userId),
    loadGateOrg(supabase),
  ]);
  return { profile, org };
}

async function loadGateProfile(
  supabase: ReturnType<typeof createServerClient>,
  userId: string
): Promise<SessionGateProfile | null> {
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "get_my_profile"
  );

  if (!rpcError && rpcRows) {
    const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (row && typeof row === "object") {
      return row as SessionGateProfile;
    }
  }

  const { data } = await supabase
    .from("profiles")
    .select("onboarding_completed, organization_id, role")
    .eq("id", userId)
    .maybeSingle();

  return (data as SessionGateProfile | null) ?? null;
}

async function loadGateOrg(
  supabase: ReturnType<typeof createServerClient>
): Promise<SessionGateOrg | null> {
  const { data } = await supabase
    .from("organizations")
    .select("access_status, access_expires_at")
    .maybeSingle();

  return (data as SessionGateOrg | null) ?? null;
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const nav = { path, host: request.nextUrl.hostname };
  const purpose = isRouterPrefetch(request.headers) ? "prefetch" : "document";
  logNav("REQUEST", `${request.method} ${purpose}`, nav);
  const endMiddleware = startNavTimer("MW", "total", nav);

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const endGetUser = startNavTimer("MW", "auth.getUser()", nav);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  endGetUser();

  let onboardingCompleted = false;
  let accessAllowed = true;
  let userRole: UserRole | null = null;
  const platformAdmin = isPlatformAdmin(user?.email);

  if (user) {
    const endGates = startNavTimer("MW", "session gates", nav);
    const { profile, org } = await loadSessionGates(supabase, user.id);
    endGates();

    const gates = resolveSessionGates({ profile, org, platformAdmin });
    onboardingCompleted = gates.onboardingCompleted;
    accessAllowed = gates.accessAllowed;
    userRole = gates.userRole;
  }

  endMiddleware();
  return {
    supabaseResponse,
    user,
    onboardingCompleted,
    accessAllowed,
    platformAdmin,
    userRole,
  };
}
