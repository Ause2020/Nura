import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAccessAllowed, resolveAccessStatus } from "@/lib/access/constants";
import { isPlatformAdmin } from "@/lib/access/platform-admin";
import type { AccessStatus, UserRole } from "@/types/database";

export async function updateSession(request: NextRequest) {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let onboardingCompleted = false;
  let accessAllowed = true;
  let userRole: UserRole | null = null;
  const platformAdmin = isPlatformAdmin(user?.email);

  if (user) {
    type SessionProfile = {
      onboarding_completed: boolean;
      organization_id: string | null;
      role: UserRole;
    };

    let profile: SessionProfile | null = null;

    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      "get_my_profile"
    );

    if (!rpcError && rpcRows) {
      const row = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
      if (row && typeof row === "object") {
        profile = row as SessionProfile;
      }
    }

    if (!profile) {
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed, organization_id, role")
        .eq("id", user.id)
        .maybeSingle();
      profile = (data as SessionProfile | null) ?? null;
    }

    onboardingCompleted = profile?.onboarding_completed ?? false;
    userRole = profile?.role ?? null;

    if (profile?.organization_id && !platformAdmin) {
      const { data: orgData } = await supabase
        .from("organizations")
        .select("access_status, access_expires_at")
        .eq("id", profile.organization_id)
        .single();

      const org = orgData as {
        access_status: AccessStatus;
        access_expires_at: string | null;
      } | null;

      if (org) {
        const resolved = resolveAccessStatus(
          org.access_status,
          org.access_expires_at
        );
        accessAllowed = isAccessAllowed(resolved, org.access_expires_at);
      } else {
        accessAllowed = false;
      }
    }
  }

  return {
    supabaseResponse,
    user,
    onboardingCompleted,
    accessAllowed,
    platformAdmin,
    userRole,
  };
}
