"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComplianceRing } from "@/components/auditorias/compliance-ring";
import { FindingDrawer } from "@/components/auditorias/finding-drawer";
import { RESULT_LABELS } from "@/lib/audit/constants";
import { createNcFromAuditFinding } from "@/lib/integrations/nc-from-audit";
import {
  calculateComplianceScore,
  countResults,
  getSectionScores,
} from "@/lib/audit/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  Audit,
  AuditChecklistItem,
  AuditChecklistResult,
  FindingType,
} from "@/types/database";

interface ItemState {
  result: AuditChecklistResult;
  finding?: string;
  finding_type?: FindingType;
  photo_url?: string | null;
}

interface ExecuteAuditProps {
  audit: Audit;
  items: AuditChecklistItem[];
  organizationId: string;
  userId: string;
}

const RESULT_BUTTONS: {
  value: AuditChecklistResult;
  label: string;
  short: string;
  className: string;
}[] = [
  { value: "complies", label: "Cumple", short: "✓", className: "border-sage/30 bg-sage-light text-forest" },
  { value: "partial", label: "Parcial", short: "~", className: "border-amber/30 bg-amber-light text-amber" },
  { value: "not_complies", label: "No cumple", short: "✗", className: "border-red-200 bg-red-50 text-danger" },
  { value: "na", label: "N/A", short: "—", className: "border-border bg-zinc-50 text-ink-light" },
];

export function ExecuteAudit({
  audit,
  items,
  organizationId,
  userId,
}: ExecuteAuditProps) {
  const router = useRouter();
  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.position - b.position),
    [items]
  );

  const sections = useMemo(() => {
    const map = new Map<string, AuditChecklistItem[]>();
    for (const item of sortedItems) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return Array.from(map.entries());
  }, [sortedItems]);

  const [responses, setResponses] = useState<Record<string, ItemState>>(() => {
    const init: Record<string, ItemState> = {};
    for (const item of sortedItems) {
      if (item.result && item.result !== "not_evaluated") {
        init[item.id] = {
          result: item.result,
          finding: item.finding ?? undefined,
          photo_url: item.photo_url,
        };
      }
    }
    return init;
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(sections.map(([s]) => s))
  );
  const [drawerItemId, setDrawerItemId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (audit.status !== "scheduled") return;
    const supabase = createClient();
    supabase
      .from("audits")
      .update({ status: "in_progress" })
      .eq("id", audit.id)
      .then(() => {});
  }, [audit.id, audit.status]);

  const scoreItems = sortedItems.map((item) => ({
    result: responses[item.id]?.result ?? item.result,
  }));
  const liveScore = calculateComplianceScore(scoreItems);
  const counts = countResults(scoreItems);
  const answered = sortedItems.length - counts.pending;

  function toggleSection(section: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  function setResult(itemId: string, result: AuditChecklistResult) {
    if (result === "not_complies" || result === "partial") {
      setDrawerItemId(itemId);
      setResponses((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], result },
      }));
    } else {
      setResponses((prev) => ({
        ...prev,
        [itemId]: { result, finding: undefined, photo_url: null },
      }));
      void persistItem(itemId, {
        result,
        finding: undefined,
        photo_url: null,
      });
    }
  }

  async function persistItem(itemId: string, state: ItemState) {
    const supabase = createClient();
    await supabase
      .from("audits")
      .update({ status: "in_progress" })
      .eq("id", audit.id);
    await supabase
      .from("audit_checklist_items")
      .update({
        result: state.result,
        finding: state.finding ?? null,
        photo_url: state.photo_url ?? null,
      })
      .eq("id", itemId);
    setSavedAt(new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }));
  }

  function saveFinding(
    itemId: string,
    data: { finding_type: FindingType; finding: string; photo_url: string | null }
  ) {
    const next: ItemState = {
      result: responses[itemId]?.result ?? "not_complies",
      finding: data.finding,
      finding_type: data.finding_type,
      photo_url: data.photo_url,
    };
    setResponses((prev) => ({
      ...prev,
      [itemId]: next,
    }));
    void persistItem(itemId, next);
  }

  async function persistAllProgress(): Promise<boolean> {
    setSaving(true);
    setError("");
    const supabase = createClient();

    await supabase
      .from("audits")
      .update({ status: "in_progress" })
      .eq("id", audit.id);

    for (const item of sortedItems) {
      const r = responses[item.id];
      if (!r?.result) continue;
      await supabase
        .from("audit_checklist_items")
        .update({
          result: r.result,
          finding: r.finding ?? null,
          photo_url: r.photo_url ?? null,
        })
        .eq("id", item.id);
    }

    setSaving(false);
    setSavedAt(new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }));
    return true;
  }

  async function handlePause() {
    await persistAllProgress();
    router.push("/auditorias");
    router.refresh();
  }

  function findingSeverity(type: FindingType) {
    if (type === "major_nc") return "major" as const;
    if (type === "minor_nc") return "minor" as const;
    return "observation" as const;
  }

  async function handleFinalize() {
    if (counts.pending > 0) {
      setError(`Faltan ${counts.pending} requisitos por evaluar`);
      return;
    }

    const missingFindings = sortedItems.filter((item) => {
      const r = responses[item.id];
      if (!r) return false;
      return (
        (r.result === "not_complies" || r.result === "partial") &&
        (!r.finding?.trim() || !r.finding_type)
      );
    });
    if (missingFindings.length > 0) {
      setError("Registra el hallazgo en los ítems No cumple o Parcial");
      return;
    }

    setSubmitting(true);
    setError("");
    const supabase = createClient();

    await supabase
      .from("audits")
      .update({ status: "in_progress" })
      .eq("id", audit.id);

    for (const item of sortedItems) {
      const r = responses[item.id];
      if (!r) continue;

      await supabase
        .from("audit_checklist_items")
        .update({
          result: r.result,
          finding: r.finding ?? null,
          photo_url: r.photo_url ?? null,
        })
        .eq("id", item.id);
    }

    const findingsToCreate: {
      checklist_item_id: string;
      finding_type: FindingType;
      description: string;
    }[] = [];

    for (const item of sortedItems) {
      const r = responses[item.id];
      if (
        r &&
        (r.result === "not_complies" || r.result === "partial") &&
        r.finding &&
        r.finding_type
      ) {
        findingsToCreate.push({
          checklist_item_id: item.id,
          finding_type: r.finding_type,
          description: r.finding,
        });
      }
    }

    const complianceScore = calculateComplianceScore(
      sortedItems.map((item) => ({ result: responses[item.id]?.result ?? null }))
    );

    const sectionScores = getSectionScores(
      sortedItems.map((item) => ({
        section: item.section,
        result: responses[item.id]?.result ?? null,
      }))
    );
    const complianceBySection = Object.fromEntries(
      sectionScores.map((s) => [s.section, s.score])
    );

    await supabase
      .from("audits")
      .update({
        status: "completed",
        completed_date: new Date().toISOString().split("T")[0],
        compliance_score: complianceScore,
        compliance_by_section: complianceBySection,
      })
      .eq("id", audit.id);

    let insertedFindings: {
      id: string;
      checklist_item_id: string;
      finding_type: FindingType;
      description: string;
    }[] = [];

    if (findingsToCreate.length > 0) {
      const { data: findingRows } = await supabase
        .from("audit_findings")
        .insert(
          findingsToCreate.map((f) => ({
            audit_id: audit.id,
            organization_id: organizationId,
            checklist_item_id: f.checklist_item_id,
            finding_type: f.finding_type,
            description: f.description,
          }))
        )
        .select("id, checklist_item_id, finding_type, description");

      insertedFindings = (findingRows ?? []) as typeof insertedFindings;
    }

    for (const finding of insertedFindings) {
      if (
        finding.finding_type !== "major_nc" &&
        finding.finding_type !== "minor_nc"
      ) {
        continue;
      }

      const item = sortedItems.find((i) => i.id === finding.checklist_item_id);
      const response = item ? responses[item.id] : undefined;

      const ncResult = await createNcFromAuditFinding(supabase, {
        organizationId,
        userId,
        auditId: audit.id,
        findingId: finding.id,
        description: finding.description,
        severity: findingSeverity(finding.finding_type),
        area: audit.site_area ?? item?.section ?? null,
        clauseReference: item?.reference ?? null,
        evidenceUrl: response?.photo_url ?? null,
      });

      if (ncResult) {
        await supabase
          .from("audit_findings")
          .update({ capa_id: ncResult.ncId })
          .eq("id", finding.id);
      }
    }

    setSubmitting(false);
    router.push(`/auditorias/${audit.id}/informe`);
    router.refresh();

    fetch("/api/notifications/audit-completed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditId: audit.id }),
    }).catch(() => undefined);
  }

  const drawerItem = drawerItemId
    ? sortedItems.find((i) => i.id === drawerItemId)
    : null;

  return (
    <div className="pb-24 max-w-lg mx-auto">
      <div className="sticky top-0 z-10 bg-white border-b border-border py-3 px-4 -mx-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{audit.title}</h2>
            <p className="text-xs text-ink-faint">
              {answered}/{sortedItems.length} evaluados
              {savedAt ? ` · Guardado ${savedAt}` : ""}
            </p>
          </div>
          <ComplianceRing score={liveScore} size={48} />
        </div>
        <div className="h-1.5 bg-zinc-100 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-sage rounded-full transition-all duration-150"
            style={{ width: `${(answered / sortedItems.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {sections.map(([section, sectionItems]) => {
          const isOpen = expandedSections.has(section);
          return (
            <div
              key={section}
              className="bg-white rounded-md border border-border overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleSection(section)}
                className="w-full flex items-center gap-2 px-4 h-10 bg-zinc-50 text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-ink-faint" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                )}
                <span className="text-xs font-medium uppercase tracking-wider text-ink-light">
                  {section}
                </span>
                <span className="ml-auto text-xs font-mono text-ink-faint">
                  {sectionItems.filter((i) => responses[i.id]?.result).length}/
                  {sectionItems.length}
                </span>
              </button>

              {isOpen && (
                <div className="divide-y divide-border">
                  {sectionItems.map((item) => {
                    const r = responses[item.id];
                    return (
                      <div key={item.id} className="p-4">
                        {item.reference && (
                          <span className="text-xs font-mono text-ink-faint">
                            {item.reference}
                          </span>
                        )}
                        <p className="text-sm text-ink mt-1 mb-3 leading-snug">
                          {item.requirement}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {RESULT_BUTTONS.map((btn) => (
                            <button
                              key={btn.value}
                              type="button"
                              onClick={() => setResult(item.id, btn.value)}
                              className={cn(
                                "h-11 rounded-md border text-sm font-medium transition-colors duration-150",
                                r?.result === btn.value
                                  ? cn(btn.className, "ring-2 ring-offset-1 ring-forest/30")
                                  : "border-border bg-white hover:bg-background"
                              )}
                            >
                              {btn.short}
                            </button>
                          ))}
                        </div>
                        {r?.result && (
                          <p className="text-xs text-ink-faint mt-2">
                            {RESULT_LABELS[r.result]}
                            {r.finding && ` · ${r.finding.slice(0, 40)}…`}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-danger text-center mt-4">{error}</p>
      )}

      <div className="fixed bottom-0 left-0 right-0 md:left-56 bg-white border-t border-border p-4 z-20 space-y-2">
        <div className="max-w-lg mx-auto flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            loading={saving}
            onClick={handlePause}
          >
            Guardar y continuar después
          </Button>
          <Button className="flex-1" loading={submitting} onClick={handleFinalize}>
            Finalizar
          </Button>
        </div>
      </div>

      {drawerItem && (
        <FindingDrawer
          open={!!drawerItemId}
          onClose={() => setDrawerItemId(null)}
          onSave={(data) => saveFinding(drawerItem.id, data)}
          initial={responses[drawerItem.id]}
          organizationId={organizationId}
          auditId={audit.id}
          itemId={drawerItem.id}
        />
      )}
    </div>
  );
}
