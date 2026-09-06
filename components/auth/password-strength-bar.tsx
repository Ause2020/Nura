"use client";

import { cn } from "@/lib/utils";
import {
  getPasswordStrength,
  strengthConfig,
  type PasswordStrength,
} from "@/lib/auth/password-strength";

interface PasswordStrengthBarProps {
  password: string;
}

export function PasswordStrengthBar({ password }: PasswordStrengthBarProps) {
  const strength = getPasswordStrength(password);

  if (strength === "empty") return null;

  const config = strengthConfig[strength];

  return (
    <div className="space-y-1">
      <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-150",
            config.width,
            config.color
          )}
        />
      </div>
      <p className="text-xs text-ink-faint">
        Fortaleza:{" "}
        <span
          className={cn(
            strength === "weak" && "text-danger",
            strength === "medium" && "text-amber",
            strength === "strong" && "text-sage"
          )}
        >
          {config.label}
        </span>
      </p>
    </div>
  );
}

export type { PasswordStrength };
