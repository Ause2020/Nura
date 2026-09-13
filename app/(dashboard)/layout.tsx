import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { isPlatformAdmin } from "@/lib/access/platform-admin";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { startDevTimer } from "@/lib/perf/dev-time";
import { createClient } from "@/lib/supabase/server";
import { QuickCaptureFab } from "@/components/quick-capture/quick-capture-fab";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const endTimer = startDevTimer("layout");
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);

  let organizationName = "Mi Empresa";
  let organizationLogoUrl: string | null = null;
  let userName = "Usuario";
  let userRole = "admin";
  let organizationId: string | null = null;

  if (user && profile) {
    userName = profile.full_name;
    userRole = profile.role;
    organizationId = profile.organization_id;

    if (profile.organization_id) {
      const supabase = await createClient();
      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", profile.organization_id)
        .single();

      const row = org as { name: string; logo_url: string | null } | null;
      if (row && !orgError) {
        organizationName = row.name;
        organizationLogoUrl = row.logo_url;
      }
    }
  } else if (user) {
    userName = user.email?.split("@")[0] ?? userName;
  }

  endTimer();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-background">
        <Sidebar
          organizationName={organizationName}
          organizationLogoUrl={organizationLogoUrl}
          userName={userName}
          userRole={userRole}
          organizationId={organizationId}
          userId={user?.id ?? null}
          isPlatformAdmin={isPlatformAdmin(user?.email)}
        />
        <main className="md:ml-56 ml-14 min-h-screen">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
        {organizationId && (
          <QuickCaptureFab organizationId={organizationId} />
        )}
      </div>
    </ToastProvider>
  );
}
