import { getSessionOrganizationId } from "@/lib/auth/cached-session";
import { redirect } from "next/navigation";

export async function getOrganizationId(): Promise<string | null> {
  return getSessionOrganizationId();
}

export async function requireOrganizationId(): Promise<string> {
  const orgId = await getOrganizationId();
  if (!orgId) redirect("/onboarding");
  return orgId;
}
