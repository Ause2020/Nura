"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Plus,
  Upload,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EvaluationTrendChart } from "@/components/suppliers/evaluation-trend-chart";
import { SupplierApprovalPanel } from "@/components/suppliers/supplier-approval-panel";
import { SupplierScorecardPanel } from "@/components/suppliers/supplier-scorecard-panel";
import {
  CLASSIFICATION_LABELS,
  DOC_TYPES,
  INCIDENT_TYPES,
  SUPPLIER_CATEGORIES,
  SUPPLIER_CRITICALITIES,
  SUPPLIER_STATUSES,
  getCategoryLabel,
  getCriticalityLabel,
  getDocTypeLabel,
  getIncidentTypeLabel,
  getStatusLabel,
} from "@/lib/suppliers/constants";
import {
  classifySupplier,
  computeDocStatus,
  computeOverallScore,
  daysUntil,
  DOC_EXPIRY_WARNING_DAYS,
  suggestNextEvaluationDate,
} from "@/lib/suppliers/utils";
import { SCORECARD_CRITERIA, parseScorecardWeights } from "@/lib/suppliers/scorecard";
import { createNcFromSupplier } from "@/lib/integrations/nc-from-supplier";
import { SEVERITY_OPTIONS } from "@/lib/capa/constants";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  NcSeverity,
  Nonconformity,
  Supplier,
  SupplierApprovalChecklistItem,
  SupplierApprovalLog,
  SupplierApprovalResponse,
  SupplierDocType,
  SupplierDocument,
  SupplierEvaluation,
  SupplierIncident,
  SupplierIncidentType,
  SupplierScorecardWeights,
} from "@/types/database";

type Tab =
  | "perfil"
  | "homologacion"
  | "documentos"
  | "evaluaciones"
  | "scorecard"
  | "incidentes";

interface SupplierDetailViewProps {
  supplier: Supplier;
  documents: SupplierDocument[];
  evaluations: SupplierEvaluation[];
  incidents: SupplierIncident[];
  checklist: SupplierApprovalChecklistItem[];
  approvalResponses: SupplierApprovalResponse[];
  approvalLog: SupplierApprovalLog[];
  linkedNcs: Nonconformity[];
  scorecardWeights: SupplierScorecardWeights | null;
  organizationId: string;
  userId: string;
  initialPortalUrl?: string | null;
}

function docStatusTone(status: string) {
  if (status === "expired") return "text-danger";
  if (status === "expiring") return "text-amber";
  return "text-sage";
}

function docStatusLabel(status: string) {
  if (status === "expired") return "Vencido";
  if (status === "expiring") return "Por vencer";
  return "Válido";
}

export function SupplierDetailView({
  supplier: initialSupplier,
  documents: initialDocs,
  evaluations: initialEvals,
  incidents: initialIncidents,
  checklist,
  approvalResponses,
  approvalLog,
  linkedNcs,
  scorecardWeights,
  organizationId,
  userId,
  initialPortalUrl = null,
}: SupplierDetailViewProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("perfil");
  const [supplier, setSupplier] = useState(initialSupplier);
  const [documents, setDocuments] = useState(initialDocs);
  const [evaluations, setEvaluations] = useState(initialEvals);
  const [incidents, setIncidents] = useState(initialIncidents);
  const [portalUrl, setPortalUrl] = useState(initialPortalUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [incidentLoading, setIncidentLoading] = useState(false);

  const [qualityScore, setQualityScore] = useState(80);
  const [deliveryScore, setDeliveryScore] = useState(80);
  const [serviceScore, setServiceScore] = useState(80);
  const [complianceScore, setComplianceScore] = useState(80);

  const weights = parseScorecardWeights(scorecardWeights);

  const overallPreview = computeOverallScore(
    {
      quality_score: qualityScore,
      delivery_score: deliveryScore,
      service_score: serviceScore,
      compliance_score: complianceScore,
    },
    weights
  );
  const classPreview = classifySupplier(overallPreview);

  const trendData = useMemo(() => {
    const sorted = [...evaluations].sort(
      (a, b) =>
        new Date(a.evaluation_date).getTime() -
        new Date(b.evaluation_date).getTime()
    );
    return {
      scores: sorted.map((e) => e.overall_score ?? 0),
      labels: sorted.map((e) =>
        new Date(e.evaluation_date).toLocaleDateString("es", {
          month: "short",
          year: "2-digit",
        })
      ),
    };
  }, [evaluations]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "perfil", label: "Perfil" },
    { key: "homologacion", label: "Homologación" },
    { key: "documentos", label: "Documentos" },
    { key: "evaluaciones", label: "Evaluaciones" },
    { key: "scorecard", label: "Scorecard" },
    { key: "incidentes", label: "Incidentes" },
  ];

  async function handleProfileSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const supabase = createClient();

    const payload = {
      name: String(form.get("name")).trim(),
      category: form.get("category"),
      criticality: form.get("criticality"),
      contact_name: String(form.get("contact_name")).trim() || null,
      contact_email: String(form.get("contact_email")).trim() || null,
      contact_phone: String(form.get("contact_phone")).trim() || null,
      address: String(form.get("address")).trim() || null,
      country: String(form.get("country")).trim() || null,
      status: form.get("status"),
      approval_date: String(form.get("approval_date")) || null,
      next_evaluation_date: String(form.get("next_evaluation_date")) || null,
      notes: String(form.get("notes")).trim() || null,
    };

    const { data, error: updateError } = await supabase
      .from("suppliers")
      .update(payload)
      .eq("id", supplier.id)
      .select("*")
      .single();

    setSaving(false);
    if (updateError || !data) {
      setError(updateError?.message ?? "Error al guardar");
      return;
    }
    setSupplier(data as Supplier);
    router.refresh();
  }

  async function handleDocUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDocLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const file = form.get("file") as File | null;
    const expiryDate = String(form.get("expiry_date")) || null;
    const docStatus = computeDocStatus(expiryDate);

    let fileUrl: string | null = null;
    const supabase = createClient();

    if (file && file.size > 0) {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${organizationId}/${supplier.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("supplier-docs")
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setDocLoading(false);
        setError(uploadError.message);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("supplier-docs")
        .getPublicUrl(path);
      fileUrl = urlData.publicUrl;
    }

    const { data, error: insertError } = await supabase
      .from("supplier_documents")
      .insert({
        supplier_id: supplier.id,
        organization_id: organizationId,
        doc_type: form.get("doc_type") as SupplierDocType,
        doc_name: String(form.get("doc_name")).trim(),
        file_url: fileUrl,
        issue_date: String(form.get("issue_date")) || null,
        expiry_date: expiryDate,
        status: docStatus,
        review_status: "approved",
        portal_upload: false,
      })
      .select("*")
      .single();

    setDocLoading(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Error al registrar documento");
      return;
    }

    setDocuments((prev) => [data as SupplierDocument, ...prev]);
    setDocModalOpen(false);

    if (expiryDate && daysUntil(expiryDate) <= DOC_EXPIRY_WARNING_DAYS) {
      const { notifyOrgManagers } = await import("@/lib/notifications");
      await notifyOrgManagers(supabase, organizationId, {
        type: "supplier_doc_expiring",
        title: "Documento de proveedor por vencer",
        message: `${supplier.name}: ${String(form.get("doc_name"))} vence el ${new Date(expiryDate).toLocaleDateString("es")}`,
        link: `/proveedores/${supplier.id}`,
        dedupKey: `supplier-doc-${(data as SupplierDocument).id}`,
      });
    }

    router.refresh();
  }

  async function handleEvaluationSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEvalLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const scores = {
      quality_score: qualityScore,
      delivery_score: deliveryScore,
      service_score: serviceScore,
      compliance_score: complianceScore,
    };
    const overall = computeOverallScore(scores, weights);
    const classification = classifySupplier(overall);
    const actionRequired = overall < 70;

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("supplier_evaluations")
      .insert({
        supplier_id: supplier.id,
        organization_id: organizationId,
        evaluation_date: String(form.get("evaluation_date")),
        evaluated_by: userId,
        period: String(form.get("period")).trim() || null,
        ...scores,
        overall_score: overall,
        classification,
        observations: String(form.get("observations")).trim() || null,
        action_required: actionRequired,
      })
      .select("*")
      .single();

    if (insertError || !data) {
      setEvalLoading(false);
      setError(insertError?.message ?? "Error al registrar evaluación");
      return;
    }

    const nextEval =
      String(form.get("next_evaluation_date")) ||
      suggestNextEvaluationDate(
        supplier.criticality,
        supplier.re_evaluation_months
      );

    await supabase
      .from("suppliers")
      .update({ next_evaluation_date: nextEval })
      .eq("id", supplier.id);

    setEvaluations((prev) => [data as SupplierEvaluation, ...prev]);
    setSupplier((s) => ({ ...s, next_evaluation_date: nextEval }));
    setEvalLoading(false);
    router.refresh();
  }

  async function handleIncidentSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIncidentLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const severity = form.get("severity") as NcSeverity;
    const createNc = form.get("create_nc") === "on";
    const description = String(form.get("description")).trim();

    const supabase = createClient();

    const { data: incidentRow, error: insertError } = await supabase
      .from("supplier_incidents")
      .insert({
        supplier_id: supplier.id,
        organization_id: organizationId,
        incident_date: String(form.get("incident_date")),
        incident_type: form.get("incident_type") as SupplierIncidentType,
        description,
        severity,
        nc_id: null,
      })
      .select("*")
      .single();

    if (insertError || !incidentRow) {
      setIncidentLoading(false);
      setError(insertError?.message ?? "Error al registrar incidente");
      return;
    }

    let ncId: string | null = null;

    if (createNc) {
      const ncResult = await createNcFromSupplier(supabase, {
        organizationId,
        userId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        incidentId: (incidentRow as SupplierIncident).id,
        description,
        severity,
      });

      if (!ncResult) {
        setIncidentLoading(false);
        setError("Error al crear NC");
        return;
      }

      ncId = ncResult.ncId;
      await supabase
        .from("supplier_incidents")
        .update({ nc_id: ncId })
        .eq("id", (incidentRow as SupplierIncident).id);
    }

    setIncidentLoading(false);
    setIncidents((prev) => [
      { ...(incidentRow as SupplierIncident), nc_id: ncId },
      ...prev,
    ]);
    router.refresh();
  }

  async function reviewPortalDocument(
    docId: string,
    decision: "approved" | "rejected"
  ) {
    const supabase = createClient();
    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase
      .from("supplier_documents")
      .update({
        review_status: decision,
        reviewed_by: userId,
        reviewed_at: now,
      })
      .eq("id", docId)
      .select("*")
      .single();

    if (updateError || !data) {
      setError(updateError?.message ?? "Error al revisar documento");
      return;
    }

    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? (data as SupplierDocument) : d))
    );
  }

  return (
    <>
      <ModuleHeader
        title={supplier.name}
        description={getCategoryLabel(supplier.category)}
        actions={
          <Link href="/proveedores">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={supplier.status === "approved" ? "success" : "warning"}>
            {getStatusLabel(supplier.status)}
          </Badge>
          <Badge
            variant={
              supplier.criticality === "critical" ? "danger" : "neutral"
            }
          >
            {getCriticalityLabel(supplier.criticality)}
          </Badge>
          {evaluations[0]?.classification && (
            <Badge variant="neutral">
              Clasificación {evaluations[0].classification} —{" "}
              {CLASSIFICATION_LABELS[evaluations[0].classification] ?? ""}
            </Badge>
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

        {tab === "perfil" && (
          <form
            onSubmit={handleProfileSave}
            className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4 max-w-2xl"
          >
            <Input name="name" label="Nombre" defaultValue={supplier.name} required />
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                  Categoría
                </label>
                <select
                  name="category"
                  defaultValue={supplier.category}
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                  Criticidad
                </label>
                <select
                  name="criticality"
                  defaultValue={supplier.criticality}
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  {SUPPLIER_CRITICALITIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Input
                name="contact_name"
                label="Contacto"
                defaultValue={supplier.contact_name ?? ""}
              />
              <Input
                name="contact_email"
                label="Email"
                type="email"
                defaultValue={supplier.contact_email ?? ""}
              />
              <Input
                name="contact_phone"
                label="Teléfono"
                defaultValue={supplier.contact_phone ?? ""}
              />
              <Input
                name="country"
                label="País"
                defaultValue={supplier.country ?? ""}
              />
            </div>
            <Input
              name="address"
              label="Dirección"
              defaultValue={supplier.address ?? ""}
            />
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                  Estado
                </label>
                <select
                  name="status"
                  defaultValue={supplier.status}
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  {SUPPLIER_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                name="approval_date"
                label="Fecha aprobación"
                type="date"
                defaultValue={supplier.approval_date ?? ""}
              />
              <Input
                name="next_evaluation_date"
                label="Próxima evaluación"
                type="date"
                defaultValue={supplier.next_evaluation_date ?? ""}
              />
            </div>
            <Textarea
              name="notes"
              label="Notas"
              defaultValue={supplier.notes ?? ""}
            />
            <Button type="submit" loading={saving}>
              Guardar perfil
            </Button>
          </form>
        )}

        {tab === "homologacion" && (
          <SupplierApprovalPanel
            supplier={supplier}
            documents={documents}
            checklist={checklist}
            responses={approvalResponses}
            approvalLog={approvalLog}
            organizationId={organizationId}
            userId={userId}
            portalUrl={portalUrl}
            onPortalGenerated={setPortalUrl}
          />
        )}

        {tab === "documentos" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button className="h-8" onClick={() => setDocModalOpen(true)}>
                <Upload className="h-4 w-4" />
                Subir documento
              </Button>
            </div>

            {documents.length === 0 ? (
              <div className="bg-white border border-border rounded-md px-6 py-10 text-center">
                <FileText className="h-8 w-8 text-ink-faint mx-auto mb-2" />
                <p className="text-sm text-ink-light">
                  Sin documentos de homologación registrados.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-mono uppercase tracking-wider text-ink-faint border-b border-border">
                      <th className="px-4 py-2 text-left">Documento</th>
                      <th className="px-4 py-2 text-left">Tipo</th>
                      <th className="px-4 py-2 text-left">Vencimiento</th>
                      <th className="px-4 py-2 text-left">Estado</th>
                      <th className="px-4 py-2 text-left">Revisión</th>
                      <th className="px-4 py-2 text-left" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => {
                      const status = computeDocStatus(doc.expiry_date);
                      return (
                        <tr
                          key={doc.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">{doc.doc_name}</td>
                          <td className="px-4 py-3 text-ink-light">
                            {getDocTypeLabel(doc.doc_type)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-ink-faint">
                            {doc.expiry_date
                              ? new Date(doc.expiry_date).toLocaleDateString("es")
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "text-xs font-mono uppercase",
                                docStatusTone(status)
                              )}
                            >
                              {docStatusLabel(status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {doc.review_status === "pending_review" ? (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    reviewPortalDocument(doc.id, "approved")
                                  }
                                >
                                  Aprobar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-7 text-xs"
                                  onClick={() =>
                                    reviewPortalDocument(doc.id, "rejected")
                                  }
                                >
                                  Rechazar
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-faint capitalize">
                                {doc.review_status === "approved"
                                  ? "Aprobado"
                                  : doc.review_status === "rejected"
                                    ? "Rechazado"
                                    : "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {doc.file_url && (
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sage hover:text-forest"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "evaluaciones" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleEvaluationSubmit}
              className="bg-white border border-border rounded-md p-4 space-y-4"
            >
              <h3 className="text-sm font-semibold text-ink">Nueva evaluación</h3>
              <Input
                name="evaluation_date"
                label="Fecha"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
                required
              />
              <Input name="period" label="Período (ej. 2026-S1)" />

              {(
                SCORECARD_CRITERIA.map((criterion) => {
                  const stateMap = {
                    quality_score: [qualityScore, setQualityScore] as const,
                    compliance_score: [complianceScore, setComplianceScore] as const,
                    delivery_score: [deliveryScore, setDeliveryScore] as const,
                    service_score: [serviceScore, setServiceScore] as const,
                  };
                  const [value, setter] = stateMap[criterion.scoreKey];
                  return [
                    `${criterion.label} (${Math.round(weights[criterion.key] * 100)}%)`,
                    value,
                    setter,
                  ] as const;
                })
              ).map(([label, value, setter]) => (
                <div key={label} className="space-y-1">
                  <div className="flex justify-between text-xs text-ink-light">
                    <span>{label}</span>
                    <span className="font-mono">{value}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) => setter(Number(e.target.value))}
                    className="w-full accent-forest"
                  />
                </div>
              ))}

              <div className="bg-background rounded-md px-3 py-2 text-sm">
                Puntaje global:{" "}
                <strong className="font-mono">{overallPreview}</strong> — Clasificación{" "}
                <strong>{classPreview}</strong> (
                {CLASSIFICATION_LABELS[classPreview]})
              </div>

              <Textarea name="observations" label="Observaciones" />
              <Input
                name="next_evaluation_date"
                label="Próxima evaluación"
                type="date"
                defaultValue={suggestNextEvaluationDate(
                  supplier.criticality,
                  supplier.re_evaluation_months
                )}
              />
              <Button type="submit" loading={evalLoading}>
                Registrar evaluación
              </Button>
            </form>

            <div className="space-y-4">
              {trendData.scores.length > 0 && (
                <div className="bg-white border border-border rounded-md p-4">
                  <h3 className="text-sm font-semibold text-ink mb-3">
                    Tendencia de puntaje
                  </h3>
                  <EvaluationTrendChart
                    scores={trendData.scores}
                    labels={trendData.labels}
                  />
                </div>
              )}

              <div className="bg-white border border-border rounded-md divide-y divide-border">
                {evaluations.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-ink-light text-center">
                    Sin evaluaciones previas.
                  </p>
                ) : (
                  evaluations.map((ev) => (
                    <div key={ev.id} className="px-4 py-3 text-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-ink">
                          {new Date(ev.evaluation_date).toLocaleDateString("es")}
                        </span>
                        <Badge variant="neutral">
                          {ev.classification} — {ev.overall_score} pts
                        </Badge>
                      </div>
                      {ev.observations && (
                        <p className="text-xs text-ink-light mt-1">
                          {ev.observations}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "scorecard" && (
          <SupplierScorecardPanel
            evaluations={evaluations}
            linkedNcs={linkedNcs}
            scorecardWeights={scorecardWeights}
          />
        )}

        {tab === "incidentes" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleIncidentSubmit}
              className="bg-white border border-border rounded-md p-4 space-y-4"
            >
              <h3 className="text-sm font-semibold text-ink">Registrar incidente</h3>
              <Input
                name="incident_date"
                label="Fecha"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
                required
              />
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                  Tipo
                </label>
                <select
                  name="incident_type"
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  {INCIDENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
                  Severidad
                </label>
                <select
                  name="severity"
                  defaultValue="major"
                  className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
                >
                  {SEVERITY_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <Textarea name="description" label="Descripción" required />
              <label className="flex items-center gap-2 text-sm text-ink-light">
                <input type="checkbox" name="create_nc" className="accent-forest" />
                Crear No Conformidad vinculada
              </label>
              <Button type="submit" loading={incidentLoading}>
                <Plus className="h-4 w-4" />
                Registrar incidente
              </Button>
            </form>

            <div className="bg-white border border-border rounded-md divide-y divide-border">
              {incidents.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-light text-center">
                  Sin incidentes registrados.
                </p>
              ) : (
                incidents.map((inc) => (
                  <div key={inc.id} className="px-4 py-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-mono text-xs text-ink-faint">
                        {new Date(inc.incident_date).toLocaleDateString("es")}
                      </span>
                      <Badge variant="neutral">
                        {getIncidentTypeLabel(inc.incident_type)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-ink">{inc.description}</p>
                    {inc.nc_id && (
                      <Link
                        href={`/capa/${inc.nc_id}`}
                        className="text-xs text-sage hover:underline mt-1 inline-block"
                      >
                        Ver NC vinculada →
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Modal
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        title="Subir documento"
        className="max-w-md"
      >
        <form onSubmit={handleDocUpload} className="space-y-4 -mt-2">
          <Input name="doc_name" label="Nombre del documento" required />
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Tipo
            </label>
            <select
              name="doc_type"
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <Input name="issue_date" label="Fecha emisión" type="date" />
          <Input name="expiry_date" label="Fecha vencimiento" type="date" />
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Archivo (PDF o imagen)
            </label>
            <input
              name="file"
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              className="w-full text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDocModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={docLoading}>
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
