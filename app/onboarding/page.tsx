import Link from "next/link";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  ensureUserProfileServer,
  fetchUserVisibleProfile,
  repairStuckOnboardingServer,
  type EnsureProfileResult,
} from "@/lib/auth/session-server";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./onboarding-wizard";

function OnboardingProfileError({ result }: { result: EnsureProfileResult }) {
  const message =
    result.ok === false
      ? result.message
      : "No pudimos cargar tu perfil.";

  return (
    <div className="rounded-md border border-amber/30 bg-amber-light/40 px-4 py-6 text-center space-y-3">
      <p className="text-sm text-ink">
        Tu sesión está activa, pero no pudimos cargar tu perfil en la base de
        datos.
      </p>
      <p className="text-xs text-ink-faint">{message}</p>
      {result.ok === false && result.code === "missing_service_role" && (
        <p className="text-xs text-ink-light text-left bg-white/60 rounded border border-border px-3 py-2 font-mono break-all">
          SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
        </p>
      )}
      <p className="text-xs text-ink-faint">
        En Supabase SQL Editor ejecuta{" "}
        <code className="font-mono text-ink-light">
          017_fix_profile_rls.sql
        </code>
      </p>
      <Link href="/login" className="inline-block mt-2">
        <Button type="button" variant="secondary">
          Volver al login
        </Button>
      </Link>
    </div>
  );
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/onboarding");
  }

  const profileResult = await ensureUserProfileServer(supabase, user);

  if (!profileResult.ok) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
          <div className="mb-8 text-center">
            <h1 className="font-display text-xl font-semibold text-forest">
              Nura
            </h1>
            <p className="text-xs text-ink-faint mt-1">
              Configura tu espacio de trabajo
            </p>
          </div>
          <OnboardingProfileError result={profileResult} />
        </div>
      </div>
    );
  }

  let visibleProfile = await fetchUserVisibleProfile(supabase, user.id);

  if (
    visibleProfile?.organization_id &&
    !visibleProfile.onboarding_completed
  ) {
    await repairStuckOnboardingServer(supabase);
    visibleProfile = await fetchUserVisibleProfile(supabase, user.id);
  }

  if (visibleProfile?.onboarding_completed) {
    redirect("/dashboard");
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
          <div className="mb-8 text-center">
            <h1 className="font-display text-xl font-semibold text-forest">
              Nura
            </h1>
            <p className="text-xs text-ink-faint mt-1">
              Configura tu espacio de trabajo
            </p>
          </div>
          <OnboardingWizard />
        </div>
      </div>
    </ToastProvider>
  );
}
