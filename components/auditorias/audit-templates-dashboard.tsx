"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ClipboardList, Plus, Sparkles } from "lucide-react";
import { AuditNavTabs } from "@/components/auditorias/audit-nav-tabs";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AUDIT_CATALOG, type AuditCatalogTemplate } from "@/lib/audit/catalog";
import { getStandardLabel } from "@/lib/audit/constants";
import {
  cloneCatalogTemplate,
  duplicateAuditTemplate,
} from "@/lib/audit/templates";
import { createClient } from "@/lib/supabase/client";
import type { AuditStandard, AuditTemplate } from "@/types/database";

interface AuditTemplatesDashboardProps {
  templates: AuditTemplate[];
  itemCounts: Record<string, number>;
  canManage: boolean;
  organizationId: string;
  userId: string;
}

function CatalogCard({
  template,
  canManage,
  cloningKey,
  onClone,
}: {
  template: AuditCatalogTemplate;
  canManage: boolean;
  cloningKey: string | null;
  onClone: (key: string) => void;
}) {
  return (
    <div className="bg-white border border-border rounded-md p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{template.name}</h3>
          <p className="text-xs text-ink-light mt-2 leading-relaxed">
            {template.description}
          </p>
        </div>
        <Badge variant={template.category === "norma" ? "success" : "neutral"}>
          {template.category === "norma" ? "Norma" : "Operativa"}
        </Badge>
      </div>
      <p className="text-xs text-ink-faint font-mono">
        {template.items.length} ítems
      </p>
      <div className="flex flex-wrap gap-2 mt-auto">
        <Link href={`/auditorias?nueva=1&catalog=${template.key}`}>
          <Button variant="secondary">Usar</Button>
        </Link>
        {canManage && (
          <Button
            variant="secondary"
            loading={cloningKey === template.key}
            onClick={() => onClone(template.key)}
          >
            Personalizar
          </Button>
        )}
      </div>
    </div>
  );
}

export function AuditTemplatesDashboard({
  templates,
  itemCounts,
  canManage,
  organizationId,
  userId,
}: AuditTemplatesDashboardProps) {
  const router = useRouter();
  const [cloningKey, setCloningKey] = useState<string | null>(null);

  async function handleDuplicate(template: AuditTemplate) {
    const supabase = createClient();
    const newId = await duplicateAuditTemplate(supabase, {
      templateId: template.id,
      organizationId,
      userId,
    });
    if (newId) {
      router.push(`/auditorias/plantillas/${newId}`);
      router.refresh();
    }
  }

  async function handleCloneCatalog(catalogKey: string) {
    setCloningKey(catalogKey);
    const supabase = createClient();
    const newId = await cloneCatalogTemplate(supabase, {
      catalogKey,
      organizationId,
      userId,
    });
    setCloningKey(null);
    if (newId) {
      router.push(`/auditorias/plantillas/${newId}`);
      router.refresh();
    }
  }

  const normas = AUDIT_CATALOG.filter((t) => t.category === "norma");
  const operativas = AUDIT_CATALOG.filter((t) => t.category === "operativa");

  return (
    <>
      <ModuleHeader
        title="Auditorías"
        description="Plantillas de checklist reutilizables"
        actions={
          canManage ? (
            <Link href="/auditorias/plantillas/nuevo">
              <Button>
                <Plus className="h-4 w-4" />
                Nueva plantilla
              </Button>
            </Link>
          ) : undefined
        }
      />
      <AuditNavTabs />

      <div className="px-6 py-4 space-y-8">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sage" />
            <h2 className="text-sm font-semibold text-ink tracking-tight">
              Plantillas Nura de inocuidad
            </h2>
          </div>
          <p className="text-xs text-ink-light">
            Listas para programar una auditoría. Puedes usarlas tal cual o
            personalizarlas para tu planta.
          </p>
          <h3 className="text-xs font-medium text-ink-faint uppercase tracking-wider font-mono pt-1">
            Normas
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {normas.map((template) => (
              <CatalogCard
                key={template.key}
                template={template}
                canManage={canManage}
                cloningKey={cloningKey}
                onClone={handleCloneCatalog}
              />
            ))}
          </div>
          <h3 className="text-xs font-medium text-ink-faint uppercase tracking-wider font-mono pt-2">
            Operativas de planta
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {operativas.map((template) => (
              <CatalogCard
                key={template.key}
                template={template}
                canManage={canManage}
                cloningKey={cloningKey}
                onClone={handleCloneCatalog}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink tracking-tight">
            Tus plantillas
          </h2>
          {templates.length === 0 ? (
            <div className="bg-white border border-border rounded-md p-8 text-center space-y-3">
              <ClipboardList className="h-10 w-10 text-ink-faint mx-auto" />
              <p className="text-sm text-ink-light">
                Aún no tienes plantillas propias. Usa una de Nura o crea una
                desde cero.
              </p>
              {canManage && (
                <Link href="/auditorias/plantillas/nuevo">
                  <Button variant="secondary">Crear plantilla</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                      {template.source_standard && (
                        <p className="text-xs text-ink-faint mt-0.5">
                          Base:{" "}
                          {getStandardLabel(
                            template.source_standard as AuditStandard
                          )}
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
                    {itemCounts[template.id] ?? 0} ítems
                  </p>
                  {canManage && (
                    <div className="flex flex-wrap gap-2 mt-auto">
                      <Link href={`/auditorias/plantillas/${template.id}`}>
                        <Button variant="secondary">Editar</Button>
                      </Link>
                      <Button
                        variant="secondary"
                        onClick={() => handleDuplicate(template)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplicar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
