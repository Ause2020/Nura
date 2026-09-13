"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Nc5Whys, Nonconformity } from "@/types/database";
import type { NcAnalysisResponse } from "@/app/api/ai/nc-analysis/route";

interface FiveWhysFormProps {
  ncId: string;
  organizationId: string;
  initial: Nc5Whys | null;
  nc: Pick<Nonconformity, "description" | "severity" | "area" | "origin" | "product_affected">;
  aiAvailable?: boolean;
  onSaved: (data: Nc5Whys) => void;
  onActionsImport?: (actions: NcAnalysisResponse["suggestedActions"]) => void;
}

const WHYS = ["why_1", "why_2", "why_3", "why_4", "why_5"] as const;

export function FiveWhysForm({
  ncId,
  organizationId,
  initial,
  nc,
  aiAvailable = false,
  onSaved,
  onActionsImport,
}: FiveWhysFormProps) {
  const [values, setValues] = useState({
    why_1: initial?.why_1 ?? "",
    why_2: initial?.why_2 ?? "",
    why_3: initial?.why_3 ?? "",
    why_4: initial?.why_4 ?? "",
    why_5: initial?.why_5 ?? "",
    root_cause: initial?.root_cause ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState("");

  function canShowWhy(index: number): boolean {
    if (index === 0) return true;
    const prev = WHYS[index - 1];
    return (values[prev]?.trim().length ?? 0) >= 10;
  }

  async function handleAiSuggest() {
    setSuggesting(true);
    setAiError("");
    try {
      const res = await fetch("/api/ai/nc-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: nc.description,
          severity: nc.severity,
          area: nc.area,
          origin: nc.origin,
          product: nc.product_affected,
        }),
      });
      const json = await res.json() as NcAnalysisResponse & { error?: string; unavailable?: boolean };

      if (!res.ok) {
        setAiError(json.error ?? "Error de IA");
        return;
      }

      // Fill in as editable draft — never auto-save
      setValues({
        why_1: json.fiveWhys[0] ?? "",
        why_2: json.fiveWhys[1] ?? "",
        why_3: json.fiveWhys[2] ?? "",
        why_4: json.fiveWhys[3] ?? "",
        why_5: json.fiveWhys[4] ?? "",
        root_cause: json.rootCause ?? "",
      });

      if (json.suggestedActions?.length && onActionsImport) {
        onActionsImport(json.suggestedActions);
      }
    } catch {
      setAiError("No se pudo conectar con la IA");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");
    const supabase = createClient();

    const payload = {
      nc_id: ncId,
      organization_id: organizationId,
      ...values,
      why_1: values.why_1 || null,
      why_2: values.why_2 || null,
      why_3: values.why_3 || null,
      why_4: values.why_4 || null,
      why_5: values.why_5 || null,
      root_cause: values.root_cause || null,
    };

    if (initial?.id) {
      const { data, error } = await supabase
        .from("nc_5whys")
        .update(payload)
        .eq("id", initial.id)
        .select("*")
        .single();
      if (!error && data) {
        onSaved(data as Nc5Whys);
        setMessage("Análisis guardado");
      }
    } else {
      const { data, error } = await supabase
        .from("nc_5whys")
        .insert(payload)
        .select("*")
        .single();
      if (!error && data) {
        onSaved(data as Nc5Whys);
        setMessage("Análisis guardado");
      }
    }

    await supabase
      .from("nonconformities")
      .update({
        root_cause_method: "5why",
        root_cause_summary: values.root_cause || values.why_5 || null,
        status: "in_analysis",
      })
      .eq("id", ncId);

    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {/* AI suggest button */}
      {aiAvailable && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            loading={suggesting}
            onClick={handleAiSuggest}
            className="h-8 text-xs gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Sugerir con IA
          </Button>
          <span className="text-xs text-ink-faint">
            Genera un borrador de análisis. Revisa y edita antes de guardar.
          </span>
        </div>
      )}
      {aiError && (
        <p className="text-xs text-danger">{aiError}</p>
      )}
      <div className="relative pl-6 space-y-4 border-l-2 border-border ml-2">
        {WHYS.map((key, index) => {
          if (!canShowWhy(index)) return null;
          const active =
            values[key].length >= 10 ||
            (index > 0 && values[WHYS[index - 1]].length >= 10);
          return (
            <div key={key} className="relative">
              <span className="absolute -left-[1.6rem] top-2 w-5 h-5 rounded-full bg-forest text-white text-xs flex items-center justify-center font-mono">
                {index + 1}
              </span>
              <Textarea
                label={`¿Por qué ${index + 1}?`}
                value={values[key]}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder="Describe la causa..."
                className={cn(active && values[key].length >= 10 && "ring-1 ring-sage/40")}
              />
            </div>
          );
        })}
      </div>

      {values.why_5.trim().length >= 10 && (
        <Textarea
          label="Causa raíz identificada"
          value={values.root_cause}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, root_cause: e.target.value }))
          }
          placeholder="Resume la causa raíz fundamental..."
        />
      )}

      {message && <p className="text-xs text-sage">{message}</p>}

      <Button onClick={handleSave} loading={saving}>
        Guardar análisis 5 Porqués
      </Button>
    </div>
  );
}
