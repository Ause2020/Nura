"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  COMPLAINT_STATUSES,
  ROOT_CAUSE_CATEGORIES,
  RESPONSE_TEMPLATES,
  fillTemplate,
  getChannelLabel,
  getComplaintTypeLabel,
  getSeverityLabel,
  getStatusLabel,
  severityBadgeVariant,
  statusBadgeVariant,
  templateKeyForComplaint,
} from "@/lib/complaints/constants";
import {
  canCloseComplaint,
  daysOpen,
  detectRecurrence,
} from "@/lib/complaints/utils";
import { logComplaintStatusChange } from "@/lib/complaints/status-log";
import { slaStatusLabel } from "@/lib/complaints/sla";
import { createNcFromComplaint } from "@/lib/integrations/nc-from-complaint";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  CapaAction,
  ComplaintPhoto,
  ComplaintStatus,
  ComplaintStatusLog,
  CustomerComplaint,
  HaccpProduct,
  Nonconformity,
  RootCauseCategory,
  TraceEvent,
  TraceLot,
} from "@/types/database";

type Tab = "descripcion" | "investigacion" | "respuesta" | "seguimiento";

export interface LotTraceability {
  traceLots: TraceLot[];
  traceEvents: TraceEvent[];
  relatedNcs: Nonconformity[];
}

interface ComplaintDetailViewProps {
  complaint: CustomerComplaint;
  photos: ComplaintPhoto[];
  product: HaccpProduct | null;
  linkedNc: Nonconformity | null;
  ncActions: CapaAction[];
  allComplaints: CustomerComplaint[];
  traceability: LotTraceability | null;
  statusLog: ComplaintStatusLog[];
  teamMembers: { id: string; full_name: string }[];
  organizationId: string;
  userId: string;
}

export function ComplaintDetailView({
  complaint: initial,
  photos,
  product,
  linkedNc,
  ncActions,
  allComplaints,
  traceability,
  statusLog: initialStatusLog,
  teamMembers,
  organizationId,
  userId,
}: ComplaintDetailViewProps) {
  const router = useRouter();
  const [complaint, setComplaint] = useState(initial);
  const [statusLog, setStatusLog] = useState(initialStatusLog);
  const [tab, setTab] = useState<Tab>("descripcion");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [traceOpen, setTraceOpen] = useState(false);
  const [responseText, setResponseText] = useState(
    complaint.response_summary ?? ""
  );
  const [commMedium, setCommMedium] = useState("email");
  const [commMessage, setCommMessage] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "descripcion", label: "Descripción" },
    { key: "investigacion", label: "Investigación" },
    { key: "respuesta", label: "Respuesta" },
    { key: "seguimiento", label: "Seguimiento" },
  ];

  async function updateComplaint(
    payload: Partial<CustomerComplaint>,
    nextStatus?: ComplaintStatus
  ) {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const previousStatus = complaint.status;
    const statusChanged = nextStatus && nextStatus !== previousStatus;

    const { data, error: updateError } = await supabase
      .from("customer_complaints")
      .update({
        ...payload,
        ...(nextStatus ? { status: nextStatus } : {}),
      })
      .eq("id", complaint.id)
      .select("*")
      .single();

    if (updateError || !data) {
      setSaving(false);
      setError(updateError?.message ?? "Error al guardar");
      return null;
    }

    if (statusChanged && nextStatus) {
      await logComplaintStatusChange(supabase, {
        complaintId: complaint.id,
        organizationId,
        fromStatus: previousStatus,
        toStatus: nextStatus,
        changedBy: userId,
      });
      const { data: logData } = await supabase
        .from("complaint_status_log")
        .select("*")
        .eq("complaint_id", complaint.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (logData) setStatusLog(logData as ComplaintStatusLog[]);
    }

    setSaving(false);

    const updated = data as CustomerComplaint;
    setComplaint(updated);
    router.refresh();
    return updated;
  }

  async function handleInvestigationSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await updateComplaint(
      {
        investigation_summary:
          String(form.get("investigation_summary")).trim() || null,
        root_cause: String(form.get("root_cause")).trim() || null,
        root_cause_category:
          (form.get("root_cause_category") as RootCauseCategory) || null,
      },
      complaint.status === "open" ? "investigating" : complaint.status
    );
  }

  async function handleCreateNc() {
    setSaving(true);
    setError("");
    const supabase = createClient();
    const severity =
      complaint.severity === "safety_critical" ? "critical" : "major";

    const result = await createNcFromComplaint(supabase, {
      organizationId,
      userId,
      complaintId: complaint.id,
      description: `Reclamo ${complaint.complaint_number}: ${complaint.description}`,
      severity,
      lotNumber: complaint.lot_number,
      productAffected: product?.name ?? null,
    });

    if (!result) {
      setSaving(false);
      setError("Error al crear NC");
      return;
    }

    await supabase
      .from("customer_complaints")
      .update({ nc_id: result.ncId })
      .eq("id", complaint.id);

    setComplaint((c) => ({ ...c, nc_id: result.ncId }));
    setSaving(false);
    router.refresh();
  }

  async function handleResponseSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const responseDate = String(form.get("response_date"));
    const summary = String(form.get("response_summary")).trim();

    await updateComplaint(
      {
        response_date: responseDate || null,
        response_summary: summary || null,
      },
      complaint.status === "investigating" || complaint.status === "open"
        ? "responded"
        : complaint.status
    );
  }

  function applyTemplate() {
    const key = templateKeyForComplaint(
      complaint.complaint_type,
      complaint.severity
    );
    const tpl = RESPONSE_TEMPLATES[key];
    setResponseText(
      fillTemplate(tpl, {
        nombre_cliente: complaint.customer_name,
        producto: product?.name ?? "el producto",
        lote: complaint.lot_number ?? "N/D",
        fecha: new Date(complaint.received_date).toLocaleDateString("es"),
      })
    );
  }

  async function appendCommunication() {
    if (!commMessage.trim()) return;
    const line = `${new Date().toLocaleDateString("es")} | ${commMedium} | ${commMessage.trim()}`;
    const log = complaint.communication_log
      ? `${complaint.communication_log}\n${line}`
      : line;

    const updated = await updateComplaint({ communication_log: log });
    if (updated) {
      setCommMessage("");
      setComplaint(updated);
    }
  }

  async function handleRecurrenceToggle(checked: boolean) {
    await updateComplaint({ recurrence: checked });
  }

  async function handleClose() {
    const check = canCloseComplaint(complaint, linkedNc, ncActions);
    if (!check.ok) {
      setError(check.reason ?? "No se puede cerrar");
      return;
    }

    await updateComplaint(
      {
        closed_at: new Date().toISOString(),
      },
      "closed"
    );
  }

  async function checkAutoRecurrence() {
    const isRecurrent = detectRecurrence(complaint, allComplaints, complaint.id);
    if (isRecurrent && !complaint.recurrence) {
      await updateComplaint({ recurrence: true });
    }
  }

  const sla = slaStatusLabel(complaint);
  const responsibleName =
    teamMembers.find((m) => m.id === complaint.response_responsible)
      ?.full_name ?? null;

  return (
    <>
      <ModuleHeader
        title={complaint.complaint_number}
        description={complaint.customer_name}
        actions={
          <Link href="/reclamos">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={severityBadgeVariant(complaint.severity)}>
            {getSeverityLabel(complaint.severity)}
          </Badge>
          <Badge variant={statusBadgeVariant(complaint.status)}>
            {getStatusLabel(complaint.status)}
          </Badge>
          <Badge
            variant={
              sla.tone === "danger"
                ? "danger"
                : sla.tone === "warning"
                  ? "warning"
                  : sla.tone === "success"
                    ? "success"
                    : "neutral"
            }
            showDot={false}
          >
            {sla.label}
          </Badge>
          {complaint.auto_nc_created && (
            <Badge variant="neutral" showDot={false}>
              NC auto
            </Badge>
          )}
          {complaint.recurrence && (
            <Badge variant="warning" showDot={false}>
              Recurrente
            </Badge>
          )}
          {complaint.status !== "closed" && (
            <span className="text-xs font-mono text-ink-faint">
              {daysOpen(complaint)} días abierto
            </span>
          )}
        </div>

        <div className="flex gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.key
                  ? "border-forest text-forest"
                  : "border-transparent text-ink-light hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        {tab === "descripcion" && (
          <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4 max-w-2xl">
            <dl className="grid md:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Canal
                </dt>
                <dd>{getChannelLabel(complaint.channel)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Fecha recepción
                </dt>
                <dd className="font-mono">
                  {new Date(complaint.received_date).toLocaleDateString("es")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Producto
                </dt>
                <dd>{product?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Lote
                </dt>
                <dd className="font-mono">{complaint.lot_number ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Vencimiento SLA
                </dt>
                <dd className="font-mono text-sm">
                  {complaint.response_due_at
                    ? new Date(complaint.response_due_at).toLocaleString("es")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Responsable respuesta
                </dt>
                <dd>
                  <select
                    value={complaint.response_responsible ?? ""}
                    onChange={async (e) => {
                      const value = e.target.value || null;
                      await updateComplaint({ response_responsible: value });
                    }}
                    className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white max-w-xs"
                  >
                    <option value="">Sin asignar</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                  {responsibleName && (
                    <p className="text-xs text-ink-faint mt-1">
                      Asignado: {responsibleName}
                    </p>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Tipo
                </dt>
                <dd>{getComplaintTypeLabel(complaint.complaint_type)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint font-mono uppercase">
                  Devolución
                </dt>
                <dd>{complaint.product_returned ? "Sí" : "No"}</dd>
              </div>
            </dl>
            <div>
              <p className="text-xs text-ink-faint font-mono uppercase mb-1">
                Descripción
              </p>
              <p className="text-sm text-ink whitespace-pre-wrap">
                {complaint.description}
              </p>
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((ph) => (
                  <a
                    key={ph.id}
                    href={ph.photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-20 h-20 rounded-md overflow-hidden border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ph.photo_url}
                      alt={ph.description ?? "Evidencia"}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                Estado del caso
              </label>
              <select
                value={complaint.status}
                onChange={async (e) => {
                  await updateComplaint(
                    {},
                    e.target.value as ComplaintStatus
                  );
                }}
                className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white max-w-xs"
              >
                {COMPLAINT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {statusLog.length > 0 && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-mono uppercase text-ink-faint mb-2">
                  Historial de estados
                </p>
                <ul className="space-y-2 text-xs">
                  {statusLog.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap gap-x-2 gap-y-1 border-b border-border pb-2"
                    >
                      <span className="font-mono text-ink-faint">
                        {new Date(entry.created_at).toLocaleString("es")}
                      </span>
                      <span>
                        {entry.from_status
                          ? getStatusLabel(entry.from_status)
                          : "—"}{" "}
                        → {getStatusLabel(entry.to_status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "investigacion" && (
          <div className="space-y-4 max-w-2xl">
            {complaint.lot_number && (
              <div className="bg-white border border-border rounded-md p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Trazabilidad del lote {complaint.lot_number}
                  </h3>
                  <div className="flex gap-2">
                    <Link href={`/trazabilidad?q=${encodeURIComponent(complaint.lot_number ?? "")}`}>
                      <Button variant="secondary" className="h-8">
                        Módulo trazabilidad
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      className="h-8"
                      onClick={() => {
                        setTraceOpen(!traceOpen);
                        if (!traceOpen) void checkAutoRecurrence();
                      }}
                    >
                      Consultar lote
                    </Button>
                  </div>
                </div>
                {traceOpen && traceability && (
                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-mono text-ink-faint uppercase mb-1">
                        Lotes en trazabilidad
                      </p>
                      {traceability.traceLots.length === 0 ? (
                        <p className="text-ink-light">Sin lotes registrados.</p>
                      ) : (
                        <ul className="space-y-1">
                          {traceability.traceLots.map((l) => (
                            <li
                              key={l.id}
                              className="flex justify-between border-b border-border py-1"
                            >
                              <span className="font-mono">{l.lot_code}</span>
                              <Badge variant="neutral" showDot={false}>
                                {l.lot_type} · {l.status}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-mono text-ink-faint uppercase mb-1">
                        Eventos CTE
                      </p>
                      {traceability.traceEvents.length === 0 ? (
                        <p className="text-ink-light">Sin eventos registrados.</p>
                      ) : (
                        <ul className="space-y-1">
                          {traceability.traceEvents.map((e) => (
                            <li
                              key={e.id}
                              className="flex justify-between border-b border-border py-1 text-ink-light"
                            >
                              <span>
                                {new Date(e.event_at).toLocaleDateString("es")} —{" "}
                                {e.event_type}
                              </span>
                              <span>{e.location ?? "—"}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-mono text-ink-faint uppercase mb-1">
                        NCs del lote
                      </p>
                      {traceability.relatedNcs.length === 0 ? (
                        <p className="text-ink-light">Sin NCs vinculadas.</p>
                      ) : (
                        <ul className="space-y-1">
                          {traceability.relatedNcs.map((nc) => (
                            <li key={nc.id}>
                              <Link
                                href={`/capa/${nc.id}`}
                                className="text-sage hover:underline font-mono text-xs"
                              >
                                {nc.nc_number} — {nc.status}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <form
              onSubmit={handleInvestigationSave}
              className="bg-white border border-border rounded-md p-4 space-y-4"
            >
              <Textarea
                name="investigation_summary"
                label="Resumen de investigación"
                defaultValue={complaint.investigation_summary ?? ""}
              />
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                  Categoría causa raíz (Ishikawa)
                </label>
                <select
                  name="root_cause_category"
                  defaultValue={complaint.root_cause_category ?? ""}
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  <option value="">Seleccionar</option>
                  {ROOT_CAUSE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <Textarea
                name="root_cause"
                label="Causa raíz identificada"
                defaultValue={complaint.root_cause ?? ""}
              />
              <Button type="submit" loading={saving}>
                Guardar investigación
              </Button>
            </form>

            <div className="bg-white border border-border rounded-md p-4">
              <h3 className="text-sm font-semibold text-ink mb-2">
                No Conformidad
              </h3>
              {complaint.nc_id && linkedNc ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm">{linkedNc.nc_number}</p>
                    <Badge variant="neutral" showDot={false} className="mt-1">
                      {linkedNc.status}
                    </Badge>
                    {complaint.auto_nc_created && (
                      <p className="text-xs text-ink-faint mt-1">
                        Generada automáticamente por severidad
                      </p>
                    )}
                  </div>
                  <Link href={`/capa/${linkedNc.id}`}>
                    <Button variant="secondary" className="h-8">
                      <ExternalLink className="h-4 w-4" />
                      Ver NC
                    </Button>
                  </Link>
                </div>
              ) : (
                <Button onClick={handleCreateNc} loading={saving}>
                  Crear No Conformidad
                </Button>
              )}
            </div>
          </div>
        )}

        {tab === "respuesta" && (
          <div className="space-y-4 max-w-2xl">
            <form
              onSubmit={handleResponseSave}
              className="bg-white border border-border rounded-md p-4 space-y-4"
            >
              <Input
                name="response_date"
                label="Fecha de respuesta al cliente"
                type="date"
                defaultValue={
                  complaint.response_date ??
                  new Date().toISOString().split("T")[0]
                }
              />
              <div className="flex justify-between items-center">
                <p className="text-xs font-mono uppercase text-ink-light">
                  Respuesta formal
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={applyTemplate}
                >
                  Usar plantilla
                </Button>
              </div>
              <Textarea
                name="response_summary"
                label=""
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                className="min-h-[240px]"
              />
              <Button type="submit" loading={saving}>
                Guardar respuesta
              </Button>
            </form>

            <div className="bg-white border border-border rounded-md p-4 space-y-3">
              <h3 className="text-sm font-semibold text-ink">
                Registro de comunicación
              </h3>
              <div className="grid md:grid-cols-3 gap-2">
                <select
                  value={commMedium}
                  onChange={(e) => setCommMedium(e.target.value)}
                  className="h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  <option value="email">Email</option>
                  <option value="phone">Teléfono</option>
                  <option value="in_person">Presencial</option>
                </select>
                <Input
                  label=""
                  placeholder="Mensaje enviado..."
                  value={commMessage}
                  onChange={(e) => setCommMessage(e.target.value)}
                  className="md:col-span-2"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-8"
                onClick={appendCommunication}
              >
                Agregar al historial
              </Button>
              {complaint.communication_log && (
                <pre className="text-xs text-ink-light whitespace-pre-wrap bg-background rounded-md p-3 font-mono">
                  {complaint.communication_log}
                </pre>
              )}
            </div>
          </div>
        )}

        {tab === "seguimiento" && (
          <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4 max-w-2xl">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={complaint.recurrence}
                onChange={(e) => handleRecurrenceToggle(e.target.checked)}
                className="accent-forest"
              />
              Reclamo recurrente (mismo tipo + producto en 90 días)
            </label>

            {complaint.recurrence && (
              <p className="text-xs text-amber bg-amber-light border border-amber/20 rounded-md px-3 py-2">
                Se recomienda registrar una acción preventiva en CAPA para
                evitar repetición.
              </p>
            )}

            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-ink mb-2">
                Cerrar reclamo
              </h3>
              <ul className="text-xs text-ink-light space-y-1 mb-4">
                <li>
                  {complaint.response_summary
                    ? "✓ Respuesta registrada"
                    : "○ Falta respuesta al cliente"}
                </li>
                <li>
                  {complaint.nc_id
                    ? ncActions.length > 0 || linkedNc?.status === "closed"
                      ? "✓ NC con acciones o cerrada"
                      : "○ NC sin acciones correctivas"
                    : "✓ Sin NC vinculada"}
                </li>
              </ul>
              <Button
                onClick={handleClose}
                loading={saving}
                disabled={complaint.status === "closed"}
              >
                Cerrar reclamo
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
