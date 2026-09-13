import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type BadgeVariant = "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  showDot?: boolean;
}

const variantClasses: Record<BadgeVariant, { container: string; dot: string }> = {
  success: {
    container: "bg-sage-light text-forest ring-sage/30",
    dot: "bg-sage",
  },
  warning: {
    container: "bg-amber-light text-amber ring-amber/30",
    dot: "bg-amber",
  },
  danger: {
    container: "bg-red-50 text-danger ring-red-200",
    dot: "bg-danger",
  },
  neutral: {
    container: "bg-background text-ink-light ring-border",
    dot: "bg-ink-faint",
  },
};

export function Badge({
  variant = "neutral",
  children,
  className,
  showDot = true,
}: BadgeProps) {
  const styles = variantClasses[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset",
        styles.container,
        className
      )}
    >
      {showDot && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", styles.dot)} />
      )}
      {children}
    </span>
  );
}

export type { BadgeVariant };
