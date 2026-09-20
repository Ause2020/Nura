import { Sidebar } from "@/components/layout/sidebar";
import { isPlatformAdmin } from "@/lib/access/platform-admin";
import {
  getSessionOrganizationBrand,
  getSessionProfile,
  getSessionUser,
} from "@/lib/auth/cached-session";
import { startNavTimer, timeNav } from "@/lib/perf/dev-time";
import { rscNavCtx } from "@/lib/perf/rsc-nav";

export async function DashboardSidebar() {
  const nav = await rscNavCtx("(dashboard)");
  const endLayout = startNavTimer("RSC", "layout total", nav);
  const [user, profile] = await Promise.all([
    timeNav("RSC", "getSessionUser", nav, () => getSessionUser()),
    timeNav("RSC", "getSessionProfile", nav, () => getSessionProfile()),
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
      const brand = await timeNav("RSC", "organization lookup", nav, () =>
        getSessionOrganizationBrand()
      );
      if (brand) {
        organizationName = brand.name;
        organizationLogoUrl = brand.logo_url;
      }
    }
  } else if (user) {
    userName = user.email?.split("@")[0] ?? userName;
  }

  endLayout();

  return (
    <Sidebar
      organizationName={organizationName}
      organizationLogoUrl={organizationLogoUrl}
      userName={userName}
      userRole={userRole}
      organizationId={organizationId}
      userId={user?.id ?? null}
      isPlatformAdmin={isPlatformAdmin(user?.email)}
    />
  );
}
