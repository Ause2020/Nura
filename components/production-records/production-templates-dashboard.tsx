"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileStack, Play, Plus } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { MonitoreoNav } from "@/components/production-records/monitoreo-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { ProductionFormTemplate } from "@/types/database";

interface ProductionTemplatesDashboardProps {
  templates: ProductionFormTemplate[];
  submissionCounts: Record<string, number>;
  canManage: boolean;
  organizationId: string;
  userId: string;
}

export function ProductionTemplatesDashboard({
  templates,
  submissionCounts,
  canManage,
  organizationId,
  userId,
}: ProductionTemplatesDashboardProps) {
  const router = useRouter();

  async function duplicateTemplate(template: ProductionFormTemplate) {
    const supabase = createClient();

    const { data: newTemplate, error } = await supabase
      .from("production_form_templates")
      .insert({
        organization_id: organizationId,
        name: `${template.name} (copia)`,
        description: template.description,
        area: template.area,
        created_by: userId,
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !newTemplate) return;

    const newId = (newTemplate as { id: string }).id;

    const { data: sections } = await supabase
      .from("production_form_sections")
      .select("*")
      .eq("template_id", template.id)
      .order("sort_order");

    for (const section of sections ?? []) {
      const s = section as { id: string; title: string; sort_order: number };
      const { data: newSection } = await supabase
        .from("production_form_sections")
        .insert({
          organization_id: organizationId,
          template_id: newId,
          title: s.title,
          sort_order: s.sort_order,
        })
        .select("id")
        .single();

      if (!newSection) continue;

      const { data: fields } = await supabase
        .from("production_form_fields")
        .select("*")
        .eq("section_id", s.id)
        .order("sort_order");

      if (fields?.length) {
        await supabase.from("production_form_fields").insert(
          fields.map((f) => {
            const field = f as {
              label: string;
              field_type: string;
              required: boolean;
              sort_order: number;
              unit: string | null;
              min_value: number | null;
              max_value: number | null;
              options: string[];
            };
            return {
              organization_id: organizationId,
              section_id: (newSection as { id: string }).id,
              label: field.label,
              field_type: field.field_type,
              required: field.required,
              sort_order: field.sort_order,
              unit: field.unit,
              min_value: field.min_value,
              max_value: field.max_value,
              options: field.options,
            };
          })
        );
      }
    }

    router.push(`/registros/plantillas/${newId}`);
    router.refresh();
  }

  return (
    <div>
      <ModuleHeader
        title="Plantillas"
        description="El ingeniero de inocuidad diseña las planillas que luego se usan en QR o en planta"
        actions={
          canManage ? (
            <Link href="/registros/plantillas/nuevo">
              <Button type="button">
                <Plus className="h-4 w-4" />
                Nueva plantilla
              </Button>
            </Link>
          ) : undefined
        }
      />
      <MonitoreoNav />

      {templates.length === 0 ? (
        <div className="mx-6 my-6 bg-white border border-border rounded-md p-8 text-center space-y-4">
          <FileStack className="h-10 w-10 text-ink-faint mx-auto" />
          <p className="text-sm text-ink-light">
            Crea plantillas reutilizables para monitoreo de PCC, GMP y controles
            de proceso.
          </p>
          {canManage && (
            <Link href="/registros/plantillas/nuevo">
              <Button type="button">Crear plantilla</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 px-6 py-6">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white border border-border rounded-md p-4 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    {template.name}
                  </h3>
                  {template.area && (
                    <p className="text-xs text-ink-faint mt-0.5">
                      {template.area}
                    </p>
                  )}
                  {template.description && (
                    <p className="text-xs text-ink-light mt-2 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                </div>
                <Badge variant={template.is_active ? "success" : "neutral"}>
                  {template.is_active ? "Activa" : "Inactiva"}
                </Badge>
              </div>
              <p className="text-xs text-ink-faint font-mono">
                {submissionCounts[template.id] ?? 0} registros
              </p>
              <div className="flex flex-wrap gap-2 mt-auto">
                <Link href={`/registros/generar`}>
                  <Button type="button">
                    <Play className="h-3.5 w-3.5" />
                    Generar QR
                  </Button>
                </Link>
                <Link href={`/registros/ejecutar/${template.id}`}>
                  <Button type="button" variant="secondary">
                    Llenar aquí
                  </Button>
                </Link>
                {canManage && (
                  <>
                    <Link href={`/registros/plantillas/${template.id}`}>
                      <Button type="button" variant="secondary">
                        Editar
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => duplicateTemplate(template)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Duplicar
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
