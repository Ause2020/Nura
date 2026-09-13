"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Plus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { QuickNc } from "./quick-nc";
import { QuickRegistro } from "./quick-registro";
import type { ProductionFormTemplate } from "@/types/database";

type ActiveCapture = "nc" | "registro" | null;
type FabTemplate = Pick<ProductionFormTemplate, "id" | "name" | "area">;

interface QuickCaptureFabProps {
  organizationId: string;
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

export function QuickCaptureFab({ organizationId }: QuickCaptureFabProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ActiveCapture>(null);
  const [templates, setTemplates] = useState<FabTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const fabRef = useRef<HTMLDivElement>(null);
  const templatesCache = useRef<FabTemplate[] | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    templatesCache.current = null;
    inflight.current = null;
    setTemplates([]);
    setTemplatesError("");
  }, [organizationId]);

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

  async function loadTemplates() {
    if (templatesCache.current) {
      setTemplates(templatesCache.current);
      return;
    }
    if (inflight.current) {
      setTemplatesLoading(true);
      await inflight.current;
      if (templatesCache.current) {
        setTemplates(templatesCache.current);
      }
      setTemplatesLoading(false);
      return;
    }

    setTemplatesLoading(true);
    setTemplatesError("");
    const request = (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("production_form_templates")
        .select("id, name, area")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");

      if (error) {
        setTemplatesError(error.message);
        setTemplates([]);
        return;
      }

      const rows = (data ?? []) as FabTemplate[];
      templatesCache.current = rows;
      setTemplates(rows);
    })().finally(() => {
      inflight.current = null;
      setTemplatesLoading(false);
    });

    inflight.current = request;
    await request;
  }

  function openCapture(id: ActiveCapture) {
    setOpen(false);
    setActive(id);
    if (id === "registro") {
      void loadTemplates();
    }
  }

  return (
    <>
      <div
        ref={fabRef}
        className="fixed bottom-6 right-4 z-40 flex flex-col items-end gap-3 md:hidden"
      >
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

      {active === "nc" && <QuickNc onClose={() => setActive(null)} />}
      {active === "registro" && (
        <QuickRegistro
          templates={templates}
          templatesLoading={templatesLoading}
          templatesError={templatesError}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}
