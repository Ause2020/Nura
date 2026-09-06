"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AuditNavTabs } from "@/components/auditorias/audit-nav-tabs";
import { ModuleHeader } from "@/components/layout/header";
import { AuditCard } from "@/components/auditorias/audit-card";
import { CreateAuditModal } from "@/components/auditorias/create-audit-modal";
import { Button } from "@/components/ui/button";
import type { Audit, AuditTemplate, Profile } from "@/types/database";

interface AuditsDashboardProps {
  upcoming: Audit[];
  completed: Audit[];
  organizationId: string;
  userId: string;
  templates: AuditTemplate[];
  members: Pick<Profile, "id" | "full_name">[];
  initialOpen?: boolean;
  initialCatalogKey?: string | null;
}

export function AuditsDashboard({
  upcoming,
  completed,
  organizationId,
  userId,
  templates,
  members,
  initialOpen = false,
  initialCatalogKey = null,
}: AuditsDashboardProps) {
  const [modalOpen, setModalOpen] = useState(initialOpen);

  return (
    <>
      <ModuleHeader
        title="Auditorías"
        description="Programa y ejecuta auditorías internas"
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Nueva auditoría
          </Button>
        }
      />
      <AuditNavTabs />

      <div className="px-6 py-4 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-ink tracking-tight mb-3">
            Próximas
          </h2>
          {upcoming.length === 0 ? (
            <div className="bg-white rounded-md border border-border px-6 py-10 text-center">
              <p className="text-sm text-ink-light">No hay auditorías programadas</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => setModalOpen(true)}
              >
                Programar auditoría
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcoming.map((audit) => (
                <AuditCard key={audit.id} audit={audit} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-ink tracking-tight mb-3">
            Completadas
          </h2>
          {completed.length === 0 ? (
            <p className="text-xs text-ink-faint">Sin auditorías completadas aún</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {completed.map((audit) => (
                <AuditCard key={audit.id} audit={audit} showScore />
              ))}
            </div>
          )}
        </section>
      </div>

      <CreateAuditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        organizationId={organizationId}
        userId={userId}
        templates={templates}
        members={members}
        initialCatalogKey={initialCatalogKey}
      />
    </>
  );
}
