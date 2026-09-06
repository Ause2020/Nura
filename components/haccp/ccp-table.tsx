"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompletionBar } from "@/components/haccp/completion-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/input";
import { parseCriticalLimit, syncCcpLimitsToProductionField } from "@/lib/haccp/ccp-linking";
import { createClient } from "@/lib/supabase/client";
import type {
  HaccpCcp,
  HaccpHazard,
  HaccpProcessStep,
  HaccpProduct,
  ProductionFormField,
  ProductionFormTemplate,
} from "@/types/database";

interface CcpWithContext extends HaccpCcp {
  hazard?: HaccpHazard;
  step?: HaccpProcessStep;
}

interface CcpTableProps {
  product: HaccpProduct;
  initialCcps: CcpWithContext[];
  organizationId: string;
  templates: Pick<ProductionFormTemplate, "id" | "name">[];
  templateFields: Pick<
    ProductionFormField,
    "id" | "label" | "section_id" | "field_type"
  >[];
}

const CCP_FIELDS: (keyof HaccpCcp)[] = [
  "critical_limit",
  "monitoring_what",
  "monitoring_how",
  "monitoring_frequency",
  "monitoring_responsible",
  "corrective_action",
  "verification_activity",
  "verification_frequency",
  "records_required",
];

function getCcpCompleteness(ccp: HaccpCcp): number {
  const filled = CCP_FIELDS.filter((field) => {
    const val = ccp[field];
    return val && String(val).trim() && String(val) !== "Por definir";
  }).length;
  return Math.round((filled / CCP_FIELDS.length) * 100);
}

export function CcpTable({
  product,
  initialCcps,
  organizationId,
  templates,
  templateFields,
}: CcpTableProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const [ccps, setCcps] = useState(initialCcps);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<HaccpCcp>>({});

  useEffect(() => {
    setCcps(initialCcps);
  }, [initialCcps]);

  function toggleExpand(ccp: CcpWithContext) {
    if (expandedId === ccp.id) {
      setExpandedId(null);
    } else {
      setExpandedId(ccp.id);
      setEditForm({ ...ccp });
    }
  }

  async function handleSave(ccpId: string) {
    setSaving(true);
    const supabase = createClient();

    const parsed = parseCriticalLimit(editForm.critical_limit ?? "");

    const payload = {
      critical_limit: editForm.critical_limit,
      critical_limit_min: parsed.min,
      critical_limit_max: parsed.max,
      critical_limit_unit: parsed.unit,
      monitoring_what: editForm.monitoring_what,
      monitoring_how: editForm.monitoring_how,
      monitoring_frequency: editForm.monitoring_frequency,
      monitoring_responsible: editForm.monitoring_responsible,
      corrective_action: editForm.corrective_action,
      verification_activity: editForm.verification_activity || null,
      verification_frequency: editForm.verification_frequency || null,
      records_required: editForm.records_required || null,
      production_template_id: editForm.production_template_id ?? null,
      production_field_id: editForm.production_field_id ?? null,
    };

    const { error } = await supabase
      .from("haccp_ccps")
      .update(payload)
      .eq("id", ccpId);

    if (!error) {
      const updated = { ...editForm, ...payload } as CcpWithContext;
      if (updated.production_field_id) {
        await syncCcpLimitsToProductionField(supabase, {
          ...updated,
          id: ccpId,
          organization_id: organizationId,
        });
      }
      setCcps((prev) =>
        prev.map((c) =>
          c.id === ccpId ? ({ ...c, ...payload } as CcpWithContext) : c
        )
      );
      setExpandedId(null);
    }
    setSaving(false);
    router.refresh();
  }

  if (ccps.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Sin CCPs identificados"
        description="Completa el análisis de peligros y usa el árbol de decisiones para determinar los Puntos Críticos de Control."
      />
    );
  }

  return (
    <>
      <div className="flex justify-end mb-4 print:hidden">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          <Download className="h-4 w-4" />
          Exportar plan HACCP
        </Button>
      </div>

      <div ref={printRef} id="haccp-print-area">
        <div className="hidden print:block mb-6">
          <h2 className="font-display text-lg font-semibold text-forest">
            Plan HACCP — {product.name}
          </h2>
          <p className="text-xs text-ink-faint mt-1">
            Tabla de Puntos Críticos de Control · Nura
          </p>
        </div>

        <div className="bg-white rounded-md border border-border print:border-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-zinc-50">
                  <th className="w-8 px-2 print:hidden" />
                  <th className="px-3 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                    CCP
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                    Paso / Peligro
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono">
                    Límite crítico
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-ink-faint uppercase tracking-wider font-mono print:hidden">
                    Completitud
                  </th>
                </tr>
              </thead>
              <tbody>
                {ccps.map((ccp) => {
                  const isExpanded = expandedId === ccp.id;
                  const completeness = getCcpCompleteness(ccp);

                  return (
                    <Fragment key={ccp.id}>
                      <tr
                        className="border-b border-border hover:bg-background cursor-pointer transition-colors duration-150 print:hover:bg-transparent"
                        onClick={() => toggleExpand(ccp)}
                      >
                        <td className="px-2 py-2.5 print:hidden">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-ink-faint" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-ink-faint" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="success">{ccp.ccp_number}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="text-sm text-ink">{ccp.step?.name ?? "—"}</p>
                          <p className="text-xs text-ink-faint line-clamp-1">
                            {ccp.hazard?.hazard_description ?? "—"}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-sm font-mono">
                          {ccp.critical_limit}
                        </td>
                        <td className="px-3 py-2.5 min-w-[100px] print:hidden">
                          <CompletionBar percent={completeness} showLabel />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="print:hidden">
                          <td colSpan={5} className="px-4 py-4 bg-background">
                            <div
                              className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Input
                                label="Límite crítico"
                                value={editForm.critical_limit ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    critical_limit: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Qué monitorear"
                                value={editForm.monitoring_what ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    monitoring_what: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Cómo monitorear"
                                value={editForm.monitoring_how ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    monitoring_how: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Frecuencia"
                                value={editForm.monitoring_frequency ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    monitoring_frequency: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Responsable"
                                value={editForm.monitoring_responsible ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    monitoring_responsible: e.target.value,
                                  })
                                }
                              />
                              <Textarea
                                label="Acción correctiva"
                                value={editForm.corrective_action ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    corrective_action: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Actividad de verificación"
                                value={editForm.verification_activity ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    verification_activity: e.target.value,
                                  })
                                }
                              />
                              <Input
                                label="Frecuencia verificación"
                                value={editForm.verification_frequency ?? ""}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    verification_frequency: e.target.value,
                                  })
                                }
                              />
                              <div className="md:col-span-2">
                                <Input
                                  label="Registros requeridos"
                                  value={editForm.records_required ?? ""}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      records_required: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="md:col-span-2 border-t border-border pt-3 mt-1">
                                <p className="text-xs font-mono uppercase tracking-wider text-ink-faint mb-2">
                                  Vincular formulario de monitoreo
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-xs text-ink-light">
                                      Plantilla
                                    </label>
                                    <select
                                      value={
                                        editForm.production_template_id ?? ""
                                      }
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          production_template_id:
                                            e.target.value || null,
                                          production_field_id: null,
                                        })
                                      }
                                      className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                                    >
                                      <option value="">Sin vincular</option>
                                      {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs text-ink-light">
                                      Campo numérico
                                    </label>
                                    <select
                                      value={editForm.production_field_id ?? ""}
                                      onChange={(e) =>
                                        setEditForm({
                                          ...editForm,
                                          production_field_id:
                                            e.target.value || null,
                                        })
                                      }
                                      disabled={!editForm.production_template_id}
                                      className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white disabled:opacity-50"
                                    >
                                      <option value="">Seleccionar campo</option>
                                      {templateFields
                                        .filter(
                                          (f) => f.field_type === "number"
                                        )
                                        .map((f) => (
                                          <option key={f.id} value={f.id}>
                                            {f.label}
                                          </option>
                                        ))}
                                    </select>
                                  </div>
                                </div>
                                <p className="text-xs text-ink-faint mt-2">
                                  Al guardar, el límite crítico se sincroniza como
                                  rango aceptable del campo numérico.
                                </p>
                              </div>
                            </div>
                            <div className="flex justify-end mt-4">
                              <Button
                                onClick={() => handleSave(ccp.id)}
                                loading={saving}
                              >
                                Guardar CCP
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className="hidden print:table-row border-b border-border">
                        <td colSpan={4} className="px-3 py-3 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <strong>Monitoreo:</strong> {ccp.monitoring_what}
                            </div>
                            <div>
                              <strong>Cómo:</strong> {ccp.monitoring_how}
                            </div>
                            <div>
                              <strong>Frecuencia:</strong>{" "}
                              {ccp.monitoring_frequency}
                            </div>
                            <div>
                              <strong>Responsable:</strong>{" "}
                              {ccp.monitoring_responsible}
                            </div>
                            <div className="col-span-2">
                              <strong>Acción correctiva:</strong>{" "}
                              {ccp.corrective_action}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #haccp-print-area,
          #haccp-print-area * {
            visibility: visible;
          }
          #haccp-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          aside,
          nav,
          header {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
