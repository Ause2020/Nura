import { QuickCaptureFab } from "@/components/quick-capture/quick-capture-fab";
import { getSessionOrganizationId } from "@/lib/auth/cached-session";

export async function DashboardQuickCapture() {
  const organizationId = await getSessionOrganizationId();
  if (!organizationId) return null;
  return <QuickCaptureFab organizationId={organizationId} />;
}
