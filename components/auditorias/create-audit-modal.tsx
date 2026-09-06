"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  AUDIT_CATALOG,
  getCatalogTemplate,
  suggestedAuditTitle,
} from "@/lib/audit/catalog";
import { AUDIT_TYPE_OPTIONS } from "@/lib/audit/constants";
import { createAudit } from "@/lib/audit/create-audit";
import { hasAuditorAreaConflict } from "@/lib/audit/templates";
import { createClient } from "@/lib/supabase/client";
import type {
  AuditStandard,
  AuditTemplate,
  AuditType,
  Profile,
} from "@/types/database";

const OFFICIAL_STANDARDS: AuditStandard[] = [
  "haccp_codex",
  "iso22000",
  "brc",
  "fssc22000",
  "fda_fsma",
  "custom",
];

function resolveStandard(
  catalogStandard: AuditStandard | undefined,
  sourceStandard: string | null | undefined
): AuditStandard {
  if (catalogStandard) return catalogStandard;
  if (
    sourceStandard &&
    OFFICIAL_STANDARDS.includes(sourceStandard as AuditStandard)
  ) {
    return sourceStandard as AuditStandard;
  }
  return "haccp_codex";
}

const CATALOG_PREFIX = "catalog:";
const ORG_PREFIX = "org:";

function catalogValue(key: string) {
  return `${CATALOG_PREFIX}${key}`;
}

function orgValue(id: string) {
  return `${ORG_PREFIX}${id}`;
}

function parseSelection(value: string): {
  catalogKey: string | null;
  orgTemplateId: string | null;
} {
  if (value.startsWith(CATALOG_PREFIX)) {
    return { catalogKey: value.slice(CATALOG_PREFIX.length), orgTemplateId: null };
  }
  if (value.startsWith(ORG_PREFIX)) {
    return { catalogKey: null, orgTemplateId: value.slice(ORG_PREFIX.length) };
  }
  return { catalogKey: "haccp_codex", orgTemplateId: null };
}

interface CreateAuditModalProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  userId: string;
  templates: AuditTemplate[];
  members: Pick<Profile, "id" | "full_name">[];
  initialCatalogKey?: string | null;
}

export function CreateAuditModal({
  open,
  onClose,
  organizationId,
  userId,
  templates,
  members,
  initialCatalogKey,
}: CreateAuditModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [auditType, setAuditType] = useState<AuditType>("internal");
  const [selection, setSelection] = useState(catalogValue("haccp_codex"));
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [assignedTo, setAssignedTo] = useState("");
  const [auditorName, setAuditorName] = useState("");
  const [siteArea, setSiteArea] = useState("");
  const [siteResponsibleId, setSiteResponsibleId] = useState("");
  const [scope, setScope] = useState("");

  const { catalogKey, orgTemplateId } = parseSelection(selection);
  const catalog = catalogKey ? getCatalogTemplate(catalogKey) : undefined;
  const orgTemplate = orgTemplateId
    ? templates.find((t) => t.id === orgTemplateId)
    : undefined;

  const selectedItemCount = catalog?.items.length ?? null;
  const selectedDescription =
    catalog?.description ?? orgTemplate?.description ?? null;

  const areaConflict = hasAuditorAreaConflict({
    assignedTo: assignedTo || null,
    siteResponsibleId: siteResponsibleId || null,
  });

  const normaTemplates = useMemo(
    () => AUDIT_CATALOG.filter((t) => t.category === "norma"),
    []
  );
  const operativaTemplates = useMemo(
    () => AUDIT_CATALOG.filter((t) => t.category === "operativa"),
    []
  );

  useEffect(() => {
    if (!open) return;
    const nextKey =
      initialCatalogKey && getCatalogTemplate(initialCatalogKey)
        ? initialCatalogKey
        : "haccp_codex";
    setSelection(catalogValue(nextKey));
    setTitle(suggestedAuditTitle(nextKey));
    setTitleTouched(false);
    setError("");
    setLoading(false);
  }, [open, initialCatalogKey]);

  function handleTemplateChange(value: string) {
    setSelection(value);
    const parsed = parseSelection(value);
    if (!titleTouched) {
      if (parsed.catalogKey) {
        setTitle(suggestedAuditTitle(parsed.catalogKey));
      } else if (parsed.orgTemplateId) {
        const named = templates.find((t) => t.id === parsed.orgTemplateId);
        setTitle(named ? `${named.name} ${new Date().getFullYear()}` : "");
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("El título es requerido");
      return;
    }

    setLoading(true);
    setError("");

    const standard = resolveStandard(
      catalog?.standard,
      orgTemplate?.source_standard
    );

    const result = await createAudit(createClient(), {
      organizationId,
      userId,
      title: title.trim(),
      auditType,
      standard,
      scheduledDate,
      auditorName: auditorName.trim() || null,
      scope: scope.trim() || null,
      siteArea: siteArea.trim() || null,
      assignedTo: assignedTo || null,
      siteResponsibleId: siteResponsibleId || null,
      orgTemplateId,
      catalogKey,
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setLoading(false);
    onClose();
    router.push(`/auditorias/${result.id}/ejecutar`);
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva auditoría" className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4 -mt-2">
        <Input
          label="Título"
          placeholder="ej. Auditoría interna Q1 2026"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Tipo
            </label>
            <select
              value={auditType}
              onChange={(e) => setAuditType(e.target.value as AuditType)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              {AUDIT_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Fecha programada"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Plantilla
          </label>
          <select
            value={selection}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            <optgroup label="Normas de inocuidad">
              {normaTemplates.map((t) => (
                <option key={t.key} value={catalogValue(t.key)}>
                  {t.name} ({t.items.length} ítems)
                </option>
              ))}
            </optgroup>
            <optgroup label="Operativas de planta">
              {operativaTemplates.map((t) => (
                <option key={t.key} value={catalogValue(t.key)}>
                  {t.name} ({t.items.length} ítems)
                </option>
              ))}
            </optgroup>
            {templates.length > 0 && (
              <optgroup label="Tus plantillas">
                {templates.map((t) => (
                  <option key={t.id} value={orgValue(t.id)}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selectedDescription && (
            <p className="text-xs text-ink-faint leading-relaxed">
              {selectedDescription}
              {selectedItemCount ? ` · ${selectedItemCount} requisitos` : null}
            </p>
          )}
        </div>

        <Input
          label="Área / sitio"
          placeholder="ej. Línea 1, Almacén MP"
          value={siteArea}
          onChange={(e) => setSiteArea(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Auditor asignado
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              <option value="">Sin asignar</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Responsable del área
            </label>
            <select
              value={siteResponsibleId}
              onChange={(e) => setSiteResponsibleId(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              <option value="">Sin definir</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {areaConflict && (
          <div className="flex gap-2 items-start rounded-md border border-amber/30 bg-amber-light px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
            <p className="text-xs text-amber">
              El auditor asignado es también responsable del área auditada. Se
              recomienda designar un auditor independiente (no bloquea la
              programación).
            </p>
          </div>
        )}

        <Input
          label="Nombre del auditor (texto libre)"
          placeholder="Opcional si ya eligió perfil"
          value={auditorName}
          onChange={(e) => setAuditorName(e.target.value)}
        />

        <Textarea
          label="Alcance"
          placeholder="Áreas, procesos o productos auditados..."
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        />

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Crear auditoría
          </Button>
        </div>
      </form>
    </Modal>
  );
}
