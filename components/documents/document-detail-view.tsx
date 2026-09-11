"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Upload,
  Users,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_VARIANT,
  getCategoryLabel,
  getStatusLabel,
} from "@/lib/documents/constants";
import {
  canTransitionStatus,
  computeAckProgress,
  computeDocumentSignatureHash,
  getAvailableTransitions,
  getReviewAlert,
  uploadDocumentFile,
} from "@/lib/documents/utils";
import { canManageQuality } from "@/lib/auth/permissions";
import { createNotification } from "@/lib/notifications";
import { PrivateFileLink } from "@/components/storage/private-file";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  ControlledDocument,
  DocumentReadAcknowledgment,
  DocumentStateLog,
  DocumentStatus,
  DocumentVersion,
  Profile,
  UserRole,
} from "@/types/database";

interface DocumentDetailViewProps {
  document: ControlledDocument;
  versions: DocumentVersion[];
  stateLog: DocumentStateLog[];
  acknowledgments: DocumentReadAcknowledgment[];
  profiles: Pick<Profile, "id" | "full_name" | "role">[];
  organizationId: string;
  userId: string;
  userRole: UserRole;
}

type Tab = "resumen" | "versiones" | "acuses" | "auditoria";

const TRANSITION_LABELS: Partial<Record<DocumentStatus, string>> = {
  in_review: "Enviar a revisión",
  approved: "Aprobar",
  published: "Publicar",
  draft: "Devolver a borrador",
  obsolete: "Marcar obsoleto",
};

export function DocumentDetailView({
  document: initialDoc,
  versions: initialVersions,
  stateLog: initialLog,
  acknowledgments: initialAcks,
  profiles,
  organizationId,
  userId,
  userRole,
}: DocumentDetailViewProps) {
  const router = useRouter();
  const [doc, setDoc] = useState(initialDoc);
  const [versions, setVersions] = useState(initialVersions);
  const [stateLog, setStateLog] = useState(initialLog);
  const [acks, setAcks] = useState(initialAcks);
  const [tab, setTab] = useState<Tab>("resumen");
  const [transitionComment, setTransitionComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [newVersionSummary, setNewVersionSummary] = useState("");
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);

  const canManage = canManageQuality(userRole);
  const currentVersion = versions.find((v) => v.id === doc.current_version_id);
  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );
  const ackProgress = computeAckProgress(acks);
  const myPendingAck = acks.find(
    (a) => a.user_id === userId && a.status === "pending"
  );
  const reviewAlert = getReviewAlert(doc.next_review_date);
  const transitions = getAvailableTransitions(userRole, doc.status);

  async function logTransition(
    supabase: ReturnType<typeof createClient>,
    input: {
      from: DocumentStatus | null;
      to: DocumentStatus;
      versionId: string | null;
      comment: string;
      action: string;
    }
  ) {
    const timestamp = new Date().toISOString();
    const signatureHash = await computeDocumentSignatureHash({
      userId,
      action: input.action,
      documentId: doc.id,
      versionId: input.versionId,
      timestamp,
    });

    const { data } = await supabase
      .from("document_state_log")
      .insert({
        organization_id: organizationId,
        document_id: doc.id,
        version_id: input.versionId,
        from_status: input.from,
        to_status: input.to,
        changed_by: userId,
        comment: input.comment || null,
        signature_hash: signatureHash,
      })
      .select("*")
      .single();

    if (data) {
      setStateLog((prev) => [data as DocumentStateLog, ...prev]);
    }

    return signatureHash;
  }

  async function createReadAckTasks(
    supabase: ReturnType<typeof createClient>,
    versionId: string
  ) {
    const targetUsers = profiles.filter((p) =>
      doc.read_target_roles.includes(p.role)
    );

    if (targetUsers.length === 0) return;

    const rows = targetUsers.map((u) => ({
      organization_id: organizationId,
      document_id: doc.id,
      version_id: versionId,
      user_id: u.id,
      status: "pending" as const,
    }));

    const { data } = await supabase
      .from("document_read_acknowledgments")
      .insert(rows)
      .select("*");

    if (data) {
      setAcks(data as DocumentReadAcknowledgment[]);

      for (const user of targetUsers) {
        await createNotification(supabase, {
          organizationId,
          userId: user.id,
          type: "document_read_required",
          title: "Acuse de lectura pendiente",
          message: `Debes confirmar lectura: ${doc.code} — ${doc.title}`,
          link: `/documentos/${doc.id}`,
          dedupKey: `doc-read-${versionId}-${user.id}`,
        });
      }
    }
  }

  async function handleTransition(toStatus: DocumentStatus) {
    if (!canTransitionStatus(userRole, doc.status, toStatus)) {
      setError("No tienes permiso para esta transición");
      return;
    }

    if (!currentVersion && toStatus !== "obsolete") {
      setError("El documento no tiene versión activa");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();
    const now = new Date().toISOString();

    try {
      if (toStatus === "published") {
        await supabase
          .from("document_versions")
          .update({ version_status: "obsolete" })
          .eq("document_id", doc.id)
          .eq("version_status", "published");

        const publishHash = await computeDocumentSignatureHash({
          userId,
          action: "publish",
          documentId: doc.id,
          versionId: currentVersion!.id,
          timestamp: now,
        });

        await supabase
          .from("document_versions")
          .update({
            version_status: "published",
            published_at: now,
            publish_signature_hash: publishHash,
            approved_by:
              doc.status === "approved" ? userId : currentVersion!.approved_by,
            approved_at:
              doc.status === "approved" ? now : currentVersion!.approved_at,
            approval_signature_hash:
              currentVersion!.approval_signature_hash ?? publishHash,
          })
          .eq("id", currentVersion!.id);

        setVersions((prev) =>
          prev.map((v) =>
            v.id === currentVersion!.id
              ? {
                  ...v,
                  version_status: "published",
                  published_at: now,
                  publish_signature_hash: publishHash,
                }
              : v.version_status === "published"
                ? { ...v, version_status: "obsolete" }
                : v
          )
        );

        await createReadAckTasks(supabase, currentVersion!.id);
      }

      if (toStatus === "approved" && currentVersion) {
        const approvalHash = await computeDocumentSignatureHash({
          userId,
          action: "approve",
          documentId: doc.id,
          versionId: currentVersion.id,
          timestamp: now,
        });

        await supabase
          .from("document_versions")
          .update({
            approved_by: userId,
            approved_at: now,
            approval_signature_hash: approvalHash,
          })
          .eq("id", currentVersion.id);
      }

      await supabase
        .from("controlled_documents")
        .update({ status: toStatus, updated_at: now })
        .eq("id", doc.id);

      await logTransition(supabase, {
        from: doc.status,
        to: toStatus,
        versionId: currentVersion?.id ?? null,
        comment: transitionComment,
        action: `status_${toStatus}`,
      });

      setDoc((prev) => ({ ...prev, status: toStatus, updated_at: now }));
      setTransitionComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar estado");
    } finally {
      setLoading(false);
    }
  }

  async function handleNewVersion(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;

    setLoading(true);
    setError("");
    const supabase = createClient();
    const nextNumber =
      Math.max(...versions.map((v) => v.version_number), 0) + 1;

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (newVersionFile && newVersionFile.size > 0) {
      const uploaded = await uploadDocumentFile(
        supabase,
        organizationId,
        doc.id,
        newVersionFile
      );
      if ("error" in uploaded) {
        setLoading(false);
        setError(uploaded.error);
        return;
      }
      fileUrl = uploaded.fileUrl;
      fileName = uploaded.fileName;
    }

    const { data: versionData, error: versionError } = await supabase
      .from("document_versions")
      .insert({
        organization_id: organizationId,
        document_id: doc.id,
        version_number: nextNumber,
        file_url: fileUrl,
        file_name: fileName,
        change_summary: newVersionSummary.trim() || `Versión ${nextNumber}`,
        created_by: userId,
        version_status: "draft",
      })
      .select("*")
      .single();

    if (versionError || !versionData) {
      setLoading(false);
      setError(versionError?.message ?? "No se pudo crear la versión");
      return;
    }

    const version = versionData as DocumentVersion;
    const newStatus: DocumentStatus = "draft";

    await supabase
      .from("controlled_documents")
      .update({
        current_version_id: version.id,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);

    await logTransition(supabase, {
      from: doc.status,
      to: newStatus,
      versionId: version.id,
      comment: `Nueva versión ${nextNumber} creada`,
      action: "new_version",
    });

    setVersions((prev) => [version, ...prev]);
    setDoc((prev) => ({
      ...prev,
      status: newStatus,
      current_version_id: version.id,
    }));
    setAcks([]);
    setVersionModalOpen(false);
    setNewVersionSummary("");
    setNewVersionFile(null);
    setLoading(false);
    router.refresh();
  }

  async function handleAcknowledge() {
    if (!myPendingAck) return;

    setLoading(true);
    setError("");
    const supabase = createClient();
    const now = new Date().toISOString();
    const signatureHash = await computeDocumentSignatureHash({
      userId,
      action: "read_ack",
      documentId: doc.id,
      versionId: myPendingAck.version_id,
      timestamp: now,
    });

    const { data, error: ackError } = await supabase
      .from("document_read_acknowledgments")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
        signature_hash: signatureHash,
      })
      .eq("id", myPendingAck.id)
      .select("*")
      .single();

    setLoading(false);

    if (ackError || !data) {
      setError(ackError?.message ?? "No se pudo registrar el acuse");
      return;
    }

    setAcks((prev) =>
      prev.map((a) => (a.id === myPendingAck.id ? (data as DocumentReadAcknowledgment) : a))
    );
    router.refresh();
  }

  if (!canManage && doc.status !== "published" && doc.status !== "obsolete") {
    return (
      <div className="p-8 text-center text-sm text-ink-faint">
        Este documento aún no está publicado.
      </div>
    );
  }

  return (
    <div>
      <ModuleHeader
        title={`${doc.code} — ${doc.title}`}
        description={`${getCategoryLabel(doc.category)} · ${getStatusLabel(doc.status)}`}
        actions={
          <Link href="/documentos">
            <Button type="button" variant="secondary">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      {reviewAlert !== "none" && canManage && (
        <div
          className={cn(
            "mb-4 px-4 py-3 rounded-md border text-xs",
            reviewAlert === "overdue"
              ? "border-danger/30 bg-danger/5 text-danger"
              : "border-amber/30 bg-amber/5 text-amber"
          )}
        >
          {reviewAlert === "overdue"
            ? "La fecha de próxima revisión está vencida."
            : "La próxima revisión vence en menos de 30 días."}
        </div>
      )}

      {myPendingAck && (
        <div className="mb-4 bg-sage-light border border-sage/30 rounded-md p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-forest">
              Tienes un acuse de lectura pendiente
            </p>
            <p className="text-xs text-ink-light mt-0.5">
              Confirma que leíste y comprendiste esta versión publicada.
            </p>
          </div>
          <Button type="button" onClick={handleAcknowledge} loading={loading}>
            <CheckCircle2 className="h-4 w-4" />
            Confirmar lectura
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ["resumen", "Resumen"],
            ["versiones", "Versiones"],
            ["acuses", "Acuses"],
            ["auditoria", "Auditoría"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium border",
              tab === id
                ? "bg-sage-light text-forest border-sage/30"
                : "bg-white border-border text-ink-light"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-border rounded-md p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status]}>
                    {getStatusLabel(doc.status)}
                  </Badge>
                  {currentVersion && (
                    <p className="text-xs text-ink-faint mt-2 font-mono">
                      Versión actual: v{currentVersion.version_number}
                    </p>
                  )}
                </div>
                {currentVersion?.file_url && (
                  <PrivateFileLink
                    kind="document-version"
                    id={currentVersion.id}
                    className="inline-flex items-center gap-1 text-xs text-forest hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver archivo
                  </PrivateFileLink>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-faint">Responsable</dt>
                  <dd className="text-ink">
                    {profileMap.get(doc.owner_id ?? "")?.full_name ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Vigencia</dt>
                  <dd className="text-ink">
                    {doc.effective_date
                      ? new Date(doc.effective_date).toLocaleDateString("es")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Próxima revisión</dt>
                  <dd className="text-ink">
                    {doc.next_review_date
                      ? new Date(doc.next_review_date).toLocaleDateString("es")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-faint">Acuse de lectura</dt>
                  <dd className="text-ink">
                    {ackProgress.total > 0
                      ? `${ackProgress.percent}% (${ackProgress.completed}/${ackProgress.total})`
                      : doc.status === "published"
                        ? "Pendiente de generar"
                        : "—"}
                  </dd>
                </div>
              </dl>

              {currentVersion?.change_summary && (
                <p className="text-xs text-ink-light border-t border-border pt-3">
                  {currentVersion.change_summary}
                </p>
              )}
            </div>

            {canManage && transitions.length > 0 && (
              <div className="bg-white border border-border rounded-md p-4 space-y-3">
                <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                  Flujo de aprobación
                </p>
                <Textarea
                  label="Comentario (opcional)"
                  value={transitionComment}
                  onChange={(e) => setTransitionComment(e.target.value)}
                  className="min-h-[60px]"
                />
                <div className="flex flex-wrap gap-2">
                  {transitions.map((to) => (
                    <Button
                      key={to}
                      type="button"
                      variant={to === "published" ? "primary" : "secondary"}
                      loading={loading}
                      onClick={() => handleTransition(to)}
                    >
                      {TRANSITION_LABELS[to] ?? getStatusLabel(to)}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {canManage && doc.status === "published" && (
              <div className="bg-white border border-border rounded-md p-4">
                <p className="text-sm font-medium text-ink mb-2">
                  Nueva versión
                </p>
                <p className="text-xs text-ink-faint mb-3">
                  Al publicar una nueva versión, la anterior quedará obsoleta y
                  se generarán acuses de lectura.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setVersionModalOpen(true)}
                >
                  <Upload className="h-4 w-4" />
                  Subir versión
                </Button>
              </div>
            )}

            <div className="bg-white border border-border rounded-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-forest" />
                <p className="text-sm font-medium text-ink">Lectura confirmada</p>
              </div>
              <p className="text-2xl font-semibold text-forest font-display">
                {ackProgress.percent}%
              </p>
              <p className="text-xs text-ink-faint mt-1">
                {ackProgress.completed} de {ackProgress.total} usuarios
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === "versiones" && (
        <div className="bg-white border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-faint border-b border-border">
                <th className="text-left font-medium px-4 py-2">Versión</th>
                <th className="text-left font-medium px-4 py-2">Estado</th>
                <th className="text-left font-medium px-4 py-2">Cambios</th>
                <th className="text-left font-medium px-4 py-2">Archivo</th>
                <th className="text-left font-medium px-4 py-2">Aprobó</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">v{v.version_number}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={
                        v.version_status === "published"
                          ? "success"
                          : v.version_status === "obsolete"
                            ? "neutral"
                            : "warning"
                      }
                    >
                      {v.version_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-ink-light text-xs max-w-xs">
                    {v.change_summary ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {v.file_url ? (
                      <PrivateFileLink
                        kind="document-version"
                        id={v.id}
                        className="text-forest hover:underline text-xs inline-flex items-center gap-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {v.file_name ?? "Archivo"}
                      </PrivateFileLink>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-faint">
                    {v.approved_by
                      ? profileMap.get(v.approved_by)?.full_name ?? "—"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "acuses" && (
        <div className="bg-white border border-border rounded-md overflow-hidden">
          {acks.length === 0 ? (
            <p className="text-sm text-ink-faint p-6 text-center">
              Sin acuses registrados. Se generan al publicar una versión.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-faint border-b border-border">
                  <th className="text-left font-medium px-4 py-2">Usuario</th>
                  <th className="text-left font-medium px-4 py-2">Estado</th>
                  <th className="text-left font-medium px-4 py-2">Fecha</th>
                  <th className="text-left font-medium px-4 py-2">Firma</th>
                </tr>
              </thead>
              <tbody>
                {acks.map((ack) => (
                  <tr key={ack.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      {profileMap.get(ack.user_id)?.full_name ?? ack.user_id}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          ack.status === "acknowledged" ? "success" : "warning"
                        }
                      >
                        {ack.status === "acknowledged"
                          ? "Confirmado"
                          : "Pendiente"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-ink-light">
                      {ack.acknowledged_at
                        ? new Date(ack.acknowledged_at).toLocaleString("es")
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-ink-faint truncate max-w-[120px]">
                      {ack.signature_hash
                        ? `${ack.signature_hash.slice(0, 12)}…`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "auditoria" && (
        <div className="bg-white border border-border rounded-md divide-y divide-border">
          {stateLog.length === 0 ? (
            <p className="text-sm text-ink-faint p-6 text-center">
              Sin registros de auditoría.
            </p>
          ) : (
            stateLog.map((entry) => (
              <div key={entry.id} className="px-4 py-3 flex gap-3">
                <History className="h-4 w-4 text-ink-faint shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {entry.from_status
                      ? `${getStatusLabel(entry.from_status)} → ${getStatusLabel(entry.to_status)}`
                      : getStatusLabel(entry.to_status)}
                  </p>
                  <p className="text-xs text-ink-faint mt-0.5">
                    {profileMap.get(entry.changed_by ?? "")?.full_name ?? "Sistema"}{" "}
                    · {new Date(entry.created_at).toLocaleString("es")}
                  </p>
                  {entry.comment && (
                    <p className="text-xs text-ink-light mt-1">{entry.comment}</p>
                  )}
                  <p className="text-xs font-mono text-ink-faint mt-1 truncate">
                    hash: {entry.signature_hash.slice(0, 24)}…
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-danger mt-4" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
        title="Nueva versión"
      >
        <form onSubmit={handleNewVersion} className="space-y-4">
          <Textarea
            label="Comentarios de cambio"
            value={newVersionSummary}
            onChange={(e) => setNewVersionSummary(e.target.value)}
            className="min-h-[80px]"
            required
          />
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Archivo
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setNewVersionFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setVersionModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Crear versión
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
