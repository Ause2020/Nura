import { redirect } from "next/navigation";
import { AdminAccessDashboard } from "@/components/admin/admin-access-dashboard";
import { isPlatformAdmin } from "@/lib/access/platform-admin";
import { listOrganizationsForAdmin } from "@/lib/admin/provision";
import type { AccessStatus } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function AdminAccesoPage() {
  const user = await getSessionUser();

  if (!isPlatformAdmin(user)) {
    redirect("/dashboard");
  }

  let organizations: Awaited<ReturnType<typeof listOrganizationsForAdmin>> = [];

  try {
    organizations = await listOrganizationsForAdmin();
  } catch {
    organizations = [];
  }

  return (
    <AdminAccessDashboard
      initialOrganizations={organizations.map((org) => ({
        ...org,
        access_status: org.access_status as AccessStatus,
      }))}
    />
  );
}
