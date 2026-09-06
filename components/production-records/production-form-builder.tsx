"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { PRODUCTION_FIELD_TYPES } from "@/lib/production-records/constants";
import { parseFieldOptions } from "@/lib/production-records/utils";
import { createClient } from "@/lib/supabase/client";
import type {
  ProductionFieldType,
  ProductionFormField,
  ProductionFormSection,
  ProductionFormTemplate,
} from "@/types/database";

interface BuilderField {
  id: string;
  label: string;
  field_type: ProductionFieldType;
  required: boolean;
  sort_order: number;
  unit: string;
  min_value: string;
  max_value: string;
  options: string;
}

interface BuilderSection {
  id: string;
  title: string;
  sort_order: number;
  fields: BuilderField[];
}

interface ProductionFormBuilderProps {
  organizationId: string;
  userId: string;
  template?: ProductionFormTemplate;
  initialSections?: ProductionFormSection[];
  initialFields?: ProductionFormField[];
}

function newSection(order: number): BuilderSection {
  return {
    id: crypto.randomUUID(),
    title: "",
    sort_order: order,
    fields: [],
  };
}

function newField(order: number): BuilderField {
  return {
    id: crypto.randomUUID(),
    label: "",
    field_type: "text",
    required: false,
    sort_order: order,
    unit: "",
    min_value: "",
    max_value: "",
    options: "",
  };
}

function fromDb(
  sections: ProductionFormSection[],
  fields: ProductionFormField[]
): BuilderSection[] {
  const bySection = new Map<string, BuilderField[]>();
  for (const field of fields) {
    const list = bySection.get(field.section_id) ?? [];
    list.push({
      id: field.id,
      label: field.label,
      field_type: field.field_type,
      required: field.required,
      sort_order: field.sort_order,
      unit: field.unit ?? "",
      min_value: field.min_value != null ? String(field.min_value) : "",
      max_value: field.max_value != null ? String(field.max_value) : "",
      options: parseFieldOptions(field.options).join(", "),
    });
    bySection.set(field.section_id, list);
  }

  return [...sections]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      id: s.id,
      title: s.title,
      sort_order: s.sort_order,
      fields: [...(bySection.get(s.id) ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order
      ),
    }));
}

export function ProductionFormBuilder({
  organizationId,
  userId,
  template,
  initialSections = [],
  initialFields = [],
}: ProductionFormBuilderProps) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [area, setArea] = useState(template?.area ?? "");
  const [sections, setSections] = useState<BuilderSection[]>(() =>
    initialSections.length
      ? fromDb(initialSections, initialFields)
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
      return list.map((s, i) => ({ ...s, sort_order: i }));
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
        const list = [...section.fields];
        const from = list.findIndex((f) => f.id === sourceFieldId);
        const to = list.findIndex((f) => f.id === targetFieldId);
        if (from < 0 || to < 0 || from === to) return section;
        const [item] = list.splice(from, 1);
        list.splice(to, 0, item);
        return {
          ...section,
          fields: list.map((f, i) => ({ ...f, sort_order: i })),
        };
      })
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("El nombre es requerido");
      return;
    }

    if (sections.length === 0 || sections.every((s) => !s.title.trim())) {
      setError("Agrega al menos una sección con título");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    let templateId = template?.id;

    try {
      if (templateId) {
        const { error: updateError } = await supabase
          .from("production_form_templates")
          .update({
            name: name.trim(),
            description: description.trim() || null,
            area: area.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", templateId);

        if (updateError) throw new Error(updateError.message);

        const { data: existingSections } = await supabase
          .from("production_form_sections")
          .select("id")
          .eq("template_id", templateId);

        const keepSectionIds = sections.map((s) => s.id);
        const toDeleteSections = (existingSections ?? [])
          .map((s) => (s as { id: string }).id)
          .filter((id) => !keepSectionIds.includes(id));

        if (toDeleteSections.length) {
          await supabase
            .from("production_form_sections")
            .delete()
            .in("id", toDeleteSections);
        }
      } else {
        const { data, error: insertError } = await supabase
          .from("production_form_templates")
          .insert({
            organization_id: organizationId,
            name: name.trim(),
            description: description.trim() || null,
            area: area.trim() || null,
            created_by: userId,
          })
          .select("id")
          .single();

        if (insertError || !data) {
          throw new Error(insertError?.message ?? "No se pudo crear");
        }
        templateId = (data as { id: string }).id;
      }

      const allFieldIds = sections.flatMap((s) => s.fields.map((f) => f.id));
      const { data: existingFields } = await supabase
        .from("production_form_fields")
        .select("id, section_id")
        .in(
          "section_id",
          sections.map((s) => s.id).length
            ? sections.map((s) => s.id)
            : ["00000000-0000-0000-0000-000000000000"]
        );

      const toDeleteFields = (existingFields ?? [])
        .map((f) => (f as { id: string }).id)
        .filter((id) => !allFieldIds.includes(id));

      if (toDeleteFields.length) {
        await supabase
          .from("production_form_fields")
          .delete()
          .in("id", toDeleteFields);
      }

      for (let si = 0; si < sections.length; si++) {
        const section = sections[si];
        if (!section.title.trim()) continue;

        const sectionRow = {
          organization_id: organizationId,
          template_id: templateId!,
          title: section.title.trim(),
          sort_order: si,
        };

        const { data: existingSection } = await supabase
          .from("production_form_sections")
          .select("id")
          .eq("id", section.id)
          .maybeSingle();

        let sectionId = section.id;
        if (existingSection) {
          await supabase
            .from("production_form_sections")
            .update(sectionRow)
            .eq("id", section.id);
        } else {
          const { data: inserted } = await supabase
            .from("production_form_sections")
            .insert({ ...sectionRow, id: section.id })
            .select("id")
            .single();
          sectionId = (inserted as { id: string } | null)?.id ?? section.id;
        }

        for (let fi = 0; fi < section.fields.length; fi++) {
          const field = section.fields[fi];
          if (!field.label.trim()) continue;

          const fieldRow = {
            organization_id: organizationId,
            section_id: sectionId,
            label: field.label.trim(),
            field_type: field.field_type,
            required: field.required,
            sort_order: fi,
            unit:
              field.field_type === "number" ? field.unit.trim() || null : null,
            min_value:
              field.field_type === "number" && field.min_value
                ? Number(field.min_value)
                : null,
            max_value:
              field.field_type === "number" && field.max_value
                ? Number(field.max_value)
                : null,
            options:
              field.field_type === "select" || field.field_type === "multiselect"
                ? field.options
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                : [],
          };

          const { data: existingField } = await supabase
            .from("production_form_fields")
            .select("id")
            .eq("id", field.id)
            .maybeSingle();

          if (existingField) {
            await supabase
              .from("production_form_fields")
              .update(fieldRow)
              .eq("id", field.id);
          } else {
            await supabase
              .from("production_form_fields")
              .insert({ ...fieldRow, id: field.id });
          }
        }
      }

      router.push(`/registros/plantillas/${templateId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      <Input
        label="Nombre de la plantilla"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Monitoreo PCC — Cocción"
        required
      />
      <Textarea
        label="Descripción"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="min-h-[60px]"
      />
      <Input
        label="Área (opcional)"
        value={area}
        onChange={(e) => setArea(e.target.value)}
        placeholder="Línea 1 — Cocción"
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
            Secciones y campos
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setSections((prev) => [...prev, newSection(prev.length)])
            }
          >
            <Plus className="h-4 w-4" />
            Sección
          </Button>
        </div>

        {sections.map((section) => (
          <div
            key={section.id}
            draggable
            onDragStart={() => setDragSectionId(section.id)}
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={() => {
              if (dragSectionId && dragSectionId !== section.id) {
                reorderSections(dragSectionId, section.id);
              }
              setDragSectionId(null);
            }}
            className="border border-border rounded-md p-4 bg-white space-y-3"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-ink-faint shrink-0 cursor-grab" />
              <Input
                label="Título de sección"
                value={section.title}
                onChange={(e) =>
                  setSections((prev) =>
                    prev.map((s) =>
                      s.id === section.id
                        ? { ...s, title: e.target.value }
                        : s
                    )
                  )
                }
                placeholder="Datos del monitoreo"
              />
              {sections.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSections((prev) => prev.filter((s) => s.id !== section.id))
                  }
                  className="self-end h-9 text-ink-faint hover:text-danger"
                  aria-label="Eliminar sección"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="space-y-2 pl-6 border-l-2 border-sage/20">
              {section.fields.map((field) => (
                <div
                  key={field.id}
                  draggable
                  onDragStart={() =>
                    setDragField({ sectionId: section.id, fieldId: field.id })
                  }
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => {
                    if (
                      dragField &&
                      dragField.sectionId === section.id &&
                      dragField.fieldId !== field.id
                    ) {
                      reorderFields(
                        section.id,
                        dragField.fieldId,
                        field.id
                      );
                    }
                    setDragField(null);
                  }}
                  className="border border-border rounded-md p-3 space-y-2 bg-background/40"
                >
                  <div className="flex gap-2 items-start">
                    <GripVertical className="h-4 w-4 text-ink-faint mt-6 cursor-grab" />
                    <div className="flex-1 grid gap-2 sm:grid-cols-2">
                      <Input
                        label="Etiqueta"
                        value={field.label}
                        onChange={(e) =>
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id
                                        ? { ...f, label: e.target.value }
                                        : f
                                    ),
                                  }
                                : s
                            )
                          )
                        }
                      />
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono">
                          Tipo
                        </label>
                        <select
                          value={field.field_type}
                          onChange={(e) =>
                            setSections((prev) =>
                              prev.map((s) =>
                                s.id === section.id
                                  ? {
                                      ...s,
                                      fields: s.fields.map((f) =>
                                        f.id === field.id
                                          ? {
                                              ...f,
                                              field_type: e.target
                                                .value as ProductionFieldType,
                                            }
                                          : f
                                      ),
                                    }
                                  : s
                              )
                            )
                          }
                          className="w-full h-9 px-2 text-sm border border-border rounded-md bg-white"
                        >
                          {PRODUCTION_FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSections((prev) =>
                          prev.map((s) =>
                            s.id === section.id
                              ? {
                                  ...s,
                                  fields: s.fields.filter(
                                    (f) => f.id !== field.id
                                  ),
                                }
                              : s
                          )
                        )
                      }
                      className="mt-6 text-ink-faint hover:text-danger"
                      aria-label="Eliminar campo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {field.field_type === "number" && (
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        label="Unidad"
                        value={field.unit}
                        onChange={(e) =>
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id
                                        ? { ...f, unit: e.target.value }
                                        : f
                                    ),
                                  }
                                : s
                            )
                          )
                        }
                        placeholder="°C"
                      />
                      <Input
                        label="Mín"
                        type="number"
                        step="any"
                        value={field.min_value}
                        onChange={(e) =>
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id
                                        ? { ...f, min_value: e.target.value }
                                        : f
                                    ),
                                  }
                                : s
                            )
                          )
                        }
                      />
                      <Input
                        label="Máx"
                        type="number"
                        step="any"
                        value={field.max_value}
                        onChange={(e) =>
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === section.id
                                ? {
                                    ...s,
                                    fields: s.fields.map((f) =>
                                      f.id === field.id
                                        ? { ...f, max_value: e.target.value }
                                        : f
                                    ),
                                  }
                                : s
                            )
                          )
                        }
                      />
                    </div>
                  )}

                  {(field.field_type === "select" ||
                    field.field_type === "multiselect") && (
                    <Input
                      label="Opciones (separadas por coma)"
                      value={field.options}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s) =>
                            s.id === section.id
                              ? {
                                  ...s,
                                  fields: s.fields.map((f) =>
                                    f.id === field.id
                                      ? { ...f, options: e.target.value }
                                      : f
                                  ),
                                }
                              : s
                          )
                        )
                      }
                      placeholder="OK, Observación, No conforme"
                    />
                  )}

                  <label className="flex items-center gap-2 text-xs text-ink-light">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) =>
                        setSections((prev) =>
                          prev.map((s) =>
                            s.id === section.id
                              ? {
                                  ...s,
                                  fields: s.fields.map((f) =>
                                    f.id === field.id
                                      ? { ...f, required: e.target.checked }
                                      : f
                                  ),
                                }
                              : s
                          )
                        )
                      }
                    />
                    Obligatorio
                  </label>
                </div>
              ))}

              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSections((prev) =>
                    prev.map((s) =>
                      s.id === section.id
                        ? {
                            ...s,
                            fields: [
                              ...s.fields,
                              newField(s.fields.length),
                            ],
                          }
                        : s
                    )
                  )
                }
              >
                <Plus className="h-4 w-4" />
                Campo
              </Button>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          {template ? "Guardar plantilla" : "Crear plantilla"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
