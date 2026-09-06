export function isPlatformAdmin(email: string | undefined | null): boolean {
  if (!email) return false;

  const configured = process.env.NURA_ADMIN_EMAILS;
  if (!configured?.trim()) return false;

  const normalized = email.trim().toLowerCase();
  return configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalized);
}

export async function requirePlatformAdmin(): Promise<{
  email: string;
  userId: string;
}> {
  const { getSessionUser } = await import("@/lib/auth/cached-session");
  const user = await getSessionUser();

  if (!user?.email || !isPlatformAdmin(user.email)) {
    throw new Error("Unauthorized");
  }

  return { email: user.email, userId: user.id };
}
