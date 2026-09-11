import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ModuleHeader } from "@/components/layout/header";
import { getSessionProfile, getSessionUser } from "@/lib/auth/cached-session";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function ConfiguracionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, profile] = await Promise.all([
    getSessionUser(),
    getSessionProfile(),
  ]);

  if (!user) redirect("/login");

  if (!hasPermission(profile?.role, PERMISSIONS.settings.manage)) {
    redirect("/dashboard");
  }

  return (
    <>
      <ModuleHeader
        title="Configuración"
        description="Personaliza Nura para tu operación"
      />
      <div className="px-6 py-4">
        <div className="grid lg:grid-cols-[240px_1fr] gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <SettingsNav />
          </aside>
          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      </div>
    </>
  );
}
