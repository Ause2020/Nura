"use client";

import { useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Primitive: large tap-target toggle button ───────────────────────────────

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  cols = 2,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
        {label}
      </p>
      <div
        className={cn(
          "grid gap-2",
          cols === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-12 rounded-md border text-sm font-medium transition-colors duration-150 px-2",
              value === opt.value
                ? "border-forest bg-sage-light text-forest"
                : "border-border bg-white text-ink-light hover:bg-background"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Primitive: photo capture ─────────────────────────────────────────────────

export function PhotoCapture({
  onChange,
  preview,
}: {
  onChange: (file: File | null) => void;
  preview: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
        Foto (opcional)
      </p>
      {preview ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Vista previa"
            className="w-full max-h-48 object-cover rounded-md border border-border"
          />
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="absolute top-1 right-1 bg-ink/70 text-white rounded-full p-0.5"
            aria-label="Quitar foto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-20 rounded-md border-2 border-dashed border-border flex items-center justify-center text-sm text-ink-faint hover:border-sage/50 hover:bg-background transition-colors"
        >
          Tomar o elegir foto
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          if (file) onChange(file);
        }}
      />
    </div>
  );
}

// ─── Base modal shell ─────────────────────────────────────────────────────────

export function QuickCaptureShell({
  title,
  onClose,
  onSubmit,
  loading,
  error,
  children,
  submitLabel = "Guardar",
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
  children: ReactNode;
  submitLabel?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet — slides up on mobile, centred on sm+ */}
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl shadow-xl max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border shrink-0">
          {/* Drag handle (mobile) */}
          <span className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-border sm:hidden" />
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-faint hover:text-ink p-1"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {children}
        </div>

        {/* Footer */}
        <div className="px-4 pb-6 pt-3 border-t border-border shrink-0 space-y-2">
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="w-full h-12 rounded-md bg-forest text-white text-sm font-semibold disabled:opacity-50 transition-colors hover:bg-forest/90 flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            )}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
