"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QuickNc } from "./quick-nc";
import { QuickRegistro } from "./quick-registro";
import type { ProductionFormTemplate } from "@/types/database";

type ActiveCapture = "nc" | "registro" | null;

interface QuickCaptureFabProps {
  organizationId: string; // passed from server layout, kept for future client-side use
  templates: Pick<ProductionFormTemplate, "id" | "name" | "area">[];
}

const ACTIONS = [
  {
    id: "nc" as const,
    label: "No Conformidad",
    icon: AlertTriangle,
    color: "bg-amber-500",
  },
  {
    id: "registro" as const,
    label: "Monitoreo",
    icon: ClipboardList,
    color: "bg-forest",
  },
];

export function QuickCaptureFab({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  organizationId: _organizationId,
  templates,
}: QuickCaptureFabProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ActiveCapture>(null);
  const fabRef = useRef<HTMLDivElement>(null);

  // Close speed-dial on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function openCapture(id: ActiveCapture) {
    setOpen(false);
    setActive(id);
  }

  return (
    <>
      {/* FAB — only on mobile (hidden md+) */}
      <div
        ref={fabRef}
        className="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-3 md:hidden"
      >
        {/* Speed-dial options */}
        {open && (
          <div className="flex flex-col items-end gap-2">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => openCapture(action.id)}
                className="flex items-center gap-2"
              >
                <span className="text-xs font-medium text-ink bg-white border border-border rounded-md px-2 py-1 shadow-sm">
                  {action.label}
                </span>
                <span
                  className={cn(
                    "h-11 w-11 rounded-full flex items-center justify-center shadow-md text-white shrink-0",
                    action.color
                  )}
                >
                  <action.icon className="h-5 w-5" />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Main FAB button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Cerrar menú" : "Captura rápida"}
          className={cn(
            "h-14 w-14 rounded-full shadow-xl flex items-center justify-center text-white transition-all duration-200",
            open ? "bg-ink rotate-45" : "bg-forest"
          )}
        >
          {open ? <X className="h-6 w-6" /> : <Plus className="h-7 w-7" />}
        </button>
      </div>

      {/* Modals */}
      {active === "nc" && <QuickNc onClose={() => setActive(null)} />}
      {active === "registro" && (
        <QuickRegistro
          templates={templates}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
