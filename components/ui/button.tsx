import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "text-white bg-forest hover:bg-primary-hover focus-visible:ring-sage disabled:opacity-50",
  secondary:
    "text-ink-light bg-white border border-border hover:bg-background disabled:opacity-50",
  ghost:
    "text-ink-light bg-transparent hover:bg-background disabled:opacity-50",
  danger:
    "text-white bg-danger hover:bg-red-700 focus-visible:ring-danger disabled:opacity-50",
};

export function Button({
  variant = "primary",
  children,
  className,
  loading,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 h-9 px-4 text-sm font-medium rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        variantClasses[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

export type { ButtonVariant };
