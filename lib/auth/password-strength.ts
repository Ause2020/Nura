export type PasswordStrength = "weak" | "medium" | "strong" | "empty";

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (password.length < 8) return "weak";
  if (score <= 2) return "weak";
  if (score <= 4) return "medium";
  return "strong";
}

export const strengthConfig: Record<
  Exclude<PasswordStrength, "empty">,
  { label: string; width: string; color: string }
> = {
  weak: { label: "Débil", width: "w-1/3", color: "bg-danger" },
  medium: { label: "Media", width: "w-2/3", color: "bg-amber" },
  strong: { label: "Fuerte", width: "w-full", color: "bg-sage" },
};
