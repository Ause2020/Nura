import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  required?: boolean;
  hint?: string;
}

export function Input({
  label,
  error,
  required,
  hint,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono"
        >
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full h-9 px-3 text-sm text-ink bg-white border rounded-md outline-none transition-colors duration-150",
          "placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1",
          error
            ? "border-danger focus-visible:ring-danger"
            : "border-border",
          className
        )}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Textarea({
  label,
  error,
  required,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  required?: boolean;
}) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono"
        >
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn(
          "w-full min-h-[80px] px-3 py-2 text-sm text-ink bg-white border rounded-md outline-none resize-y transition-colors duration-150",
          "placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1",
          error ? "border-danger" : "border-border",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
