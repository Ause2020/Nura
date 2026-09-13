"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { AUDIT_CATALOG } from "@/lib/audit/catalog";
import { sectionsFromCatalog } from "@/lib/audit/templates";
import { createClient } from "@/lib/supabase/client";
import type {
  AuditStandard,
  AuditTemplate,
  AuditTemplateItem,
  AuditTemplateSection,
} from "@/types/database";

interface BuilderItem {
  id: string;
  requirement: string;
  reference: string;
  position: number;
}

interface BuilderSection {
  id: string;
  name: string;
  position: number;
  items: BuilderItem[];
}

interface AuditTemplateBuilderProps {
  organizationId: string;
  userId: string;
  template?: AuditTemplate;
  initialSections?: AuditTemplateSection[];
  initialItems?: AuditTemplateItem[];
}

function newSection(order: number): BuilderSection {
  return {
    id: crypto.randomUUID(),
    name: "",
    position: order,
    items: [newItem(0)],
  };
}

function newItem(order: number): BuilderItem {
  return {
    id: crypto.randomUUID(),
    requirement: "",
    reference: "",
    position: order,
  };
}

function fromDb(
  sections: AuditTemplateSection[],
  items: AuditTemplateItem[]
): BuilderSection[] {
  const bySection = new Map<string, BuilderItem[]>();
  for (const item of items) {
    const list = bySection.get(item.section_id) ?? [];
    list.push({
      id: item.id,
      requirement: item.requirement,
      reference: item.reference ?? "",
      position: item.position,
    });
    bySection.set(item.section_id, list);
  }

  return [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      items: [...(bySection.get(s.id) ?? [])].sort(
        (a, b) => a.position - b.position
      ),
    }));
}

export function AuditTemplateBuilder({
  organizationId,
  userId,
  template,
  initialSections = [],
  initialItems = [],
}: AuditTemplateBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [sourceStandard, setSourceStandard] = useState<AuditStandard | "custom">(
    (template?.source_standard as AuditStandard) ?? "custom"
  );
  const [importKey, setImportKey] = useState("custom");
  const [sections, setSections] = useState<BuilderSection[]>(() =>
    initialSections.length
      ? fromDb(initialSections, initialItems)
      : [newSection(0)]
  );
  const [dragSectionId, setDragSectionId] = useState<string | null>(null);
  const [dragField, setDragField] = useState<{
    sectionId: string;
    fieldId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reorderSections(sourceId: string, targetId: string) {
    setSections((prev) => {
      const list = [...prev];
      const from = list.findIndex((s) => s.id === sourceId);
      const to = list.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0 || from === to) return prev;
      const [item] = list.splice(from, 1);
      list.splice(to, 0, item);
      return list.map((s, i) => ({ ...s, position: i }));
    });
  }

  function reorderFields(
    sectionId: string,
    sourceFieldId: string,
    targetFieldId: string
  ) {
    setSections((prev) =>
      prev.map((section) => {
        if (section.id !== sectionId) return section;
        const list = [...section.items];
        const from = list.findIndex((f) => f.id === sourceFieldId);
        const to = list.findIndex((f) => f.id === targetFieldId);
        if (from < 0 || to < 0 || from === to) return section;
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item);
        return {
          ...section,
          items: list.map((f, i) => ({ ...f, position: i })),
        };
      })
    );
  }

  function importFromCatalog(catalogKey: string) {
    const picked = AUDIT_CATALOG.find((t) => t.key === catalogKey);
    setImportKey(catalogKey);
    setSourceStandard(picked?.standard ?? "custom");
    setSections(sectionsFromCatalog(catalogKey));
    if (!name.trim() && picked) {
      setName(picked.name);
    }
    if (!description.trim() && picked) {
      setDescription(picked.description);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es requerido");
      return;
    }

    const validSections = sections.filter((s) => s.name.trim());
    if (validSections.length === 0) {
      setError("Agrega al menos una sección");
      return;
    }

    setLoading(true);
    setError("");
    const supabase = createClient();

    let templateId = template?.id;

    if (templateId) {
      const { error: updateError } = await supabase
        .from("audit_templates")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          source_standard:
            sourceStandard === "custom" ? null : sourceStandard,
          updated_at: new Date().toISOString(),
        })
        .eq("id", templateId);

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      const { data: existingSections } = await supabase
        .from("audit_template_sections")
        .select("id")
        .eq("template_id", templateId);

      const sectionIds = (existingSections ?? []).map(
        (s) => (s as { id: string }).id
      );

      if (sectionIds.length) {
        await supabase
          .from("audit_template_items")
          .delete()
          .in("section_id", sectionIds);
        await supabase
          .from("audit_template_sections")
          .delete()
          .eq("template_id", templateId);
      }
    } else {
      const { data: created, error: createError } = await supabase
        .from("audit_templates")
        .insert({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || null,
          source_standard:
            sourceStandard === "custom" ? null : sourceStandard,
          created_by: userId,
          is_active: true,
        })
        .select("id")
        .single();

      if (createError || !created) {
        setError(createError?.message ?? "Error al crear plantilla");
        setLoading(false);
        return;
      }

      templateId = (created as { id: string }).id;
    }

    for (const section of validSections) {
      const items = section.items.filter((i) => i.requirement.trim());
      if (items.length === 0) continue;

      const { data: sectionRow, error: sectionError } = await supabase
        .from("audit_template_sections")
        .insert({
          organization_id: organizationId,
          template_id: templateId,
          name: section.name.trim(),
          position: section.position,
        })
        .select("id")
        .single();

      if (sectionError || !sectionRow) continue;

      await supabase.from("audit_template_items").insert(
        items.map((item, index) => ({
          organization_id: organizationId,
          section_id: (sectionRow as { id: string }).id,
          requirement: item.requirement.trim(),
          reference: item.reference.trim() || null,
          position: index,
        }))
      );
    }

    setLoading(false);
    router.push("/auditorias/plantillas");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-border rounded-md p-4 space-y-4">
        <Input
          label="Nombre de plantilla"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ej. Auditoría interna BPM"
          required
        />
        <Textarea
          label="Descripción"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Alcance o notas para el auditor..."
        />
        {!template && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
              Importar desde norma
            </label>
            <select
              value={importKey}
              onChange={(e) => {
                const value = e.target.value;
                if (value !== "custom") importFromCatalog(value);
                else {
                  setImportKey("custom");
                  setSourceStandard("custom");
                }
              }}
              className="w-full h-9 px-3 text-sm border border-border rounded-md bg-white"
            >
              <option value="custom">Plantilla en blanco</option>
              <optgroup label="Normas de inocuidad">
                {AUDIT_CATALOG.filter((t) => t.category === "norma").map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Operativas de planta">
                {AUDIT_CATALOG.filter((t) => t.category === "operativa").map(
                  (t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  )
                )}
              </optgroup>
            </select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.id}
            className="bg-white border border-border rounded-md overflow-hidden"
            draggable
            onDragStart={() => setDragSectionId(section.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragSectionId && dragSectionId !== section.id) {
                reorderSections(dragSectionId, section.id);
              }
              setDragSectionId(null);
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-border">
              <GripVertical className="h-4 w-4 text-ink-faint shrink-0 cursor-grab" />
              <Input
                value={section.name}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((s) =>
                      s.id === section.id ? { ...s, name: e.target.value } : s
                    )
                  )
                }
                placeholder="Nombre de sección"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 p-0 text-ink-faint hover:text-danger"
                onClick={() =>
                  setSections((prev) =>
                    prev.length > 1
                      ? prev.filter((s) => s.id !== section.id)
                      : prev
                  )
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-3 space-y-2">
              {section.items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-2 items-start border border-border rounded-md p-2"
                  draggable
                  onDragStart={() =>
                    setDragField({ sectionId: section.id, fieldId: item.id })
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (
                      dragField &&
                      dragField.sectionId === section.id &&
                      dragField.fieldId !== item.id
                    ) {
                      reorderFields(
                        section.id,
                        dragField.fieldId,
                        item.id
                      );
                    }
                    setDragField(null);
                  }}
                >
                  <GripVertical className="h-4 w-4 text-ink-faint mt-2 shrink-0 cursor-grab" />
                  <div className="flex-1 space-y-2">
                    <Textarea
                      value={item.requirement}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s) =>
                            s.id === section.id
                              ? {
                                  ...s,
                                  items: s.items.map((f) =>
                                    f.id === item.id
                                      ? { ...f, requirement: e.target.value }
                                      : f
                                  ),
                                }
                              : s
                          )
                        )
                      }
                      placeholder="Requisito / ítem del checklist"
                    />
                    <Input
                      value={item.reference}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s) =>
                            s.id === section.id
                              ? {
                                  ...s,
                                  items: s.items.map((f) =>
                                    f.id === item.id
                                      ? { ...f, reference: e.target.value }
                                      : f
                                  ),
                                }
                              : s
                          )
                        )
                      }
                      placeholder="Referencia (cláusula, principio...)"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-ink-faint hover:text-danger shrink-0"
                    onClick={() =>
                      setSections((prev) =>
                        prev.map((s) =>
                          s.id === section.id
                            ? {
                                ...s,
                                items:
                                  s.items.length > 1
                                    ? s.items.filter((f) => f.id !== item.id)
                                    : s.items,
                              }
                            : s
                        )
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="h-8 text-xs"
                onClick={() =>
                  setSections((prev) =>
                    prev.map((s) =>
                      s.id === section.id
                        ? {
                            ...s,
                            items: [
                              ...s.items,
                              newItem(s.items.length),
                            ],
                          }
                        : s
                    )
                  )
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Agregar ítem
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setSections((prev) => [...prev, newSection(prev.length)])
          }
        >
          <Plus className="h-4 w-4" />
          Agregar sección
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/auditorias/plantillas")}
        >
          Cancelar
        </Button>
        <Button type="submit" loading={loading}>
          {template ? "Guardar cambios" : "Crear plantilla"}
        </Button>
      </div>
    </form>
  );
}
