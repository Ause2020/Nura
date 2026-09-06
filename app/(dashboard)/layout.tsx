import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { isPlatformAdmin } from "@/lib/access/platform-admin";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { createClient } from "@/lib/supabase/server";
import { QuickCaptureFab } from "@/components/quick-capture/quick-capture-fab";
import type { ProductionFormTemplate } from "@/types/database";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);

  let organizationName = "Mi Empresa";
  let organizationLogoUrl: string | null = null;
  let userName = "Usuario";
  let userRole = "admin";
  let organizationId: string | null = null;
  let fabTemplates: Pick<ProductionFormTemplate, "id" | "name" | "area">[] = [];

  if (user && profile) {
    userName = profile.full_name;
    userRole = profile.role;
    organizationId = profile.organization_id;

    if (profile.organization_id) {
      const supabase = await createClient();
      const [orgResult, templatesResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("name, logo_url")
          .eq("id", profile.organization_id)
          .single(),
        supabase
          .from("production_form_templates")
          .select("id, name, area")
          .eq("organization_id", profile.organization_id)
          .eq("is_active", true)
          .order("name"),
      ]);

      const org = orgResult.data as { name: string; logo_url: string | null } | null;
      if (org && !orgResult.error) {
        organizationName = org.name;
        organizationLogoUrl = org.logo_url;
      }

      fabTemplates = (templatesResult.data ?? []) as Pick<
        ProductionFormTemplate,
        "id" | "name" | "area"
      >[];
    }
  } else if (user) {
    userName = user.email?.split("@")[0] ?? userName;
  }

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
          <QuickCaptureFab
            organizationId={organizationId}
            templates={fabTemplates}
          />
        )}
      </div>
    </ToastProvider>
  );
}
