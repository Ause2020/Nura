"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  DOCUMENT_CATEGORIES,
  READ_TARGET_ROLE_OPTIONS,
} from "@/lib/documents/constants";
import {
  computeDocumentSignatureHash,
  uploadDocumentFile,
} from "@/lib/documents/utils";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/types/database";

interface DocumentFormProps {
  organizationId: string;
  userId: string;
  members: { id: string; full_name: string }[];
}

export function DocumentForm({
  organizationId,
  userId,
  members,
}: DocumentFormProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(DOCUMENT_CATEGORIES[0].value);
  const [ownerId, setOwnerId] = useState(userId);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [nextReviewDate, setNextReviewDate] = useState("");
  const [changeSummary, setChangeSummary] = useState("Versión inicial");
  const [targetRoles, setTargetRoles] = useState<UserRole[]>([
    "admin",
    "quality_manager",
    "operator",
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggleRole(role: UserRole) {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!code.trim() || !title.trim()) {
      setError("Código y título son requeridos");
      return;
    }

    if (targetRoles.length === 0) {
      setError("Selecciona al menos un rol para acuse de lectura");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const now = new Date().toISOString();

    const { data: docData, error: docError } = await supabase
      .from("controlled_documents")
      .insert({
        organization_id: organizationId,
        code: code.trim().toUpperCase(),
        title: title.trim(),
        category,
        owner_id: ownerId || userId,
        effective_date: effectiveDate || null,
        next_review_date: nextReviewDate || null,
        read_target_roles: targetRoles,
        created_by: userId,
        status: "draft",
      })
      .select("id")
      .single();

    if (docError || !docData) {
      setLoading(false);
      setError(docError?.message ?? "No se pudo crear el documento");
      return;
    }

    const documentId = (docData as { id: string }).id;
    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file && file.size > 0) {
      const uploaded = await uploadDocumentFile(
        supabase,
        organizationId,
        documentId,
        file
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
        document_id: documentId,
        version_number: 1,
        file_url: fileUrl,
        file_name: fileName,
        change_summary: changeSummary.trim() || "Versión inicial",
        created_by: userId,
        version_status: "draft",
      })
      .select("id")
      .single();

    if (versionError || !versionData) {
      setLoading(false);
      setError(versionError?.message ?? "No se pudo crear la versión");
      return;
    }

    const versionId = (versionData as { id: string }).id;
    const signatureHash = await computeDocumentSignatureHash({
      userId,
      action: "create",
      documentId,
      versionId,
      timestamp: now,
    });

    await supabase
      .from("controlled_documents")
      .update({ current_version_id: versionId, updated_at: now })
      .eq("id", documentId);

    await supabase.from("document_state_log").insert({
      organization_id: organizationId,
      document_id: documentId,
      version_id: versionId,
      from_status: null,
      to_status: "draft",
      changed_by: userId,
      comment: "Documento creado",
      signature_hash: signatureHash,
    });

    setLoading(false);
    router.push(`/documentos/${documentId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Código"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="PO-001"
          required
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Categoría
          </label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as typeof category)
            }
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Input
        label="Título"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Procedimiento de limpieza y sanitización"
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Responsable
          </label>
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Vigencia desde"
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
        />
      </div>

      <Input
        label="Próxima revisión"
        type="date"
        value={nextReviewDate}
        onChange={(e) => setNextReviewDate(e.target.value)}
      />

      <Textarea
        label="Comentarios de la versión 1"
        value={changeSummary}
        onChange={(e) => setChangeSummary(e.target.value)}
        className="min-h-[60px]"
      />

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
          Acuse de lectura requerido para
        </p>
        <div className="flex flex-wrap gap-3">
          {READ_TARGET_ROLE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 text-sm text-ink-light"
            >
              <input
                type="checkbox"
                checked={targetRoles.includes(opt.value)}
                onChange={() => toggleRole(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
          Archivo (PDF, Word, Excel, imagen)
        </label>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-light file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:bg-white"
        />
      </div>

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          Crear documento
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
