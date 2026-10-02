/**
 * Fila segura para un usuario Auth sin profile.
 * Nunca admin. Nunca elige organization_id ni role desde metadata del usuario.
 */
export type MissingProfileUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export function displayNameFromUser(user: MissingProfileUser): string {
  return (
    (typeof user.user_metadata?.full_name === "string" &&
      user.user_metadata.full_name) ||
    user.email?.split("@")[0] ||
    "Usuario"
  );
}

export function missingProfileInsert(user: MissingProfileUser) {
  return {
    id: user.id,
    full_name: displayNameFromUser(user),
    role: "operator" as const,
    organization_id: null,
    onboarding_completed: false,
  };
}
