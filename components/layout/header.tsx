import type { ReactNode } from "react";

interface ModuleHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function ModuleHeader({ title, description, actions }: ModuleHeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4">
      <div className="flex items-center justify-between gap-4 max-w-5xl">
        <div>
          <h1 className="text-sm font-semibold text-ink tracking-tight font-display">
            {title}
          </h1>
          {description && (
            <p className="text-xs text-ink-faint mt-0.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
