"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FISHBONE_CATEGORIES } from "@/lib/capa/constants";
import { createClient } from "@/lib/supabase/client";
import type { NcFishboneCause } from "@/types/database";

interface FishboneFormProps {
  ncId: string;
  organizationId: string;
  initial: NcFishboneCause[];
  onSaved: (causes: NcFishboneCause[]) => void;
}

export function FishboneForm({
  ncId,
  organizationId,
  initial,
  onSaved,
}: FishboneFormProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [causes, setCauses] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function addCause(category: string) {
    const text = drafts[category]?.trim();
    if (!text) return;

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("nc_fishbone_causes")
      .insert({
        nc_id: ncId,
        organization_id: organizationId,
        category,
        cause_text: text,
      })
      .select("*")
      .single();

    if (!error && data) {
      const row = data as NcFishboneCause;
      const nextCauses = [...causes, row];
      setCauses(nextCauses);
      setDrafts((prev) => ({ ...prev, [category]: "" }));

      const summary = nextCauses
        .map((c) => `${c.category}: ${c.cause_text}`)
        .join("; ");

      await supabase
        .from("nonconformities")
        .update({
          root_cause_method: "fishbone",
          root_cause_summary: summary || null,
          status: "in_analysis",
        })
        .eq("id", ncId);
    }

    setSaving(false);
  }

  async function removeCause(id: string) {
    const supabase = createClient();
    await supabase.from("nc_fishbone_causes").delete().eq("id", id);
    setCauses((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-4">
      {FISHBONE_CATEGORIES.map(({ value, label }) => {
        const categoryCauses = causes.filter((c) => c.category === value);
        return (
          <div key={value} className="border border-border rounded-md p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-light font-mono mb-2">
              {label}
            </p>
            {categoryCauses.length > 0 && (
              <ul className="space-y-1 mb-2">
                {categoryCauses.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-2 text-sm text-ink"
                  >
                    <span>{c.cause_text}</span>
                    <button
                      type="button"
                      onClick={() => removeCause(c.id)}
                      className="text-ink-faint hover:text-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Agregar posible causa..."
                value={drafts[value] ?? ""}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [value]: e.target.value }))
                }
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => addCause(value)}
                loading={saving}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        variant="secondary"
        onClick={() => onSaved(causes)}
        disabled={causes.length === 0}
      >
        Confirmar análisis Ishikawa
      </Button>
    </div>
  );
}
