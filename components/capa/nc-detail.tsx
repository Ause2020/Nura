"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CapaWorkflowPanel } from "@/components/capa/capa-workflow-panel";
import { SimilarNcPanel } from "@/components/capa/similar-nc-panel";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getOriginLabel,
  getSeverityBadgeVariant,
  getSeverityLabel,
  getStatusBadgeVariant,
  STATUS_LABELS,
} from "@/lib/capa/constants";
import { getStageLabel } from "@/lib/capa/workflow";
import { isPastDue } from "@/lib/capa/utils";
import type {
  CapaAction,
  CapaStageLog,
  Nc5Whys,
  NcFishboneCause,
  Nonconformity,
  Profile,
  UserRole,
} from "@/types/database";

interface NcDetailProps {
  nc: Nonconformity;
  actions: CapaAction[];
  fiveWhys: Nc5Whys | null;
  fishboneCauses: NcFishboneCause[];
  stageLog: CapaStageLog[];
  members: Pick<Profile, "id" | "full_name">[];
  similarNcs: Nonconformity[];
  organizationId: string;
  userId: string;
  userRole: UserRole;
  aiAvailable?: boolean;
}

export function NcDetail({
  nc: initialNc,
  actions: initialActions,
  fiveWhys: initialWhys,
  fishboneCauses: initialFishbone,
  stageLog: initialLog,
  members,
  similarNcs,
  organizationId,
  userId,
  userRole,
  aiAvailable = false,
}: NcDetailProps) {
  const [nc, setNc] = useState(initialNc);
  const [actions, setActions] = useState(initialActions);
  const [fiveWhys, setFiveWhys] = useState(initialWhys);
  const [fishboneCauses, setFishboneCauses] = useState(initialFishbone);
  const [stageLog, setStageLog] = useState(initialLog);

  const overdue = isPastDue(nc.due_date, nc.status);

  return (
    <>
      <ModuleHeader
        title={nc.nc_number}
        description={truncate(nc.description, 80)}
        actions={
          <Link href="/capa">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />

      <div className="px-6 py-4 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant={getSeverityBadgeVariant(nc.severity)}>
            {getSeverityLabel(nc.severity)}
          </Badge>
          <Badge variant="neutral" showDot={false}>
            {getOriginLabel(nc.origin)}
          </Badge>
          <Badge variant={getStatusBadgeVariant(nc.status)}>
            {STATUS_LABELS[nc.status]}
          </Badge>
          <Badge variant="neutral" showDot={false}>
            CAPA: {getStageLabel(nc.capa_stage)}
          </Badge>
          {nc.lot_quarantined && (
            <Badge variant="danger">Lote en cuarentena</Badge>
          )}
          {overdue && nc.status !== "closed" && (
            <Badge variant="danger">Vencida</Badge>
          )}
        </div>

        <div className="bg-white border border-border rounded-md p-4 text-sm space-y-2">
          <p className="text-ink leading-relaxed">{nc.description}</p>
          <dl className="grid sm:grid-cols-3 gap-3 text-xs text-ink-light pt-2 border-t border-border">
            <div>
              <dt className="text-ink-faint font-mono uppercase">Área</dt>
              <dd>{nc.area ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-ink-faint font-mono uppercase">Producto / Lote</dt>
              <dd>
                {nc.product_affected ?? "—"}
                {nc.lot_number ? ` · ${nc.lot_number}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-ink-faint font-mono uppercase">Detectada</dt>
              <dd>{new Date(nc.detected_at).toLocaleString("es")}</dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CapaWorkflowPanel
              nc={nc}
              actions={actions}
              fiveWhys={fiveWhys}
              fishboneCauses={fishboneCauses}
              stageLog={stageLog}
              members={members}
              organizationId={organizationId}
              userId={userId}
              userRole={userRole}
              pendingCapaTraining={0}
              aiAvailable={aiAvailable}
              onNcUpdate={setNc}
              onActionsUpdate={setActions}
              onStageLogUpdate={setStageLog}
              onFiveWhysUpdate={setFiveWhys}
              onFishboneUpdate={setFishboneCauses}
            />
          </div>
          <div className="space-y-4">
            <SimilarNcPanel currentNc={nc} historical={similarNcs} />
          </div>
        </div>
      </div>
    </>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}
