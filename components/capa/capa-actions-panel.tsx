"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddActionModal } from "@/components/capa/add-action-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACTION_TYPE_LABELS } from "@/lib/capa/constants";
import { isPastDue } from "@/lib/capa/utils";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { CapaAction, CapaActionStatus, Nonconformity } from "@/types/database";

const STATUS_CYCLE: CapaActionStatus[] = [
  "pending",
  "in_progress",
  "completed",
];

interface CapaActionsPanelProps {
  nc: Nonconformity;
  initialActions: CapaAction[];
  organizationId: string;
  onUpdate: (actions: CapaAction[]) => void;
}

export function CapaActionsPanel({
  nc,
  initialActions,
  organizationId,
  onUpdate,
}: CapaActionsPanelProps) {
  const [actions, setActions] = useState(initialActions);
  const [modalOpen, setModalOpen] = useState(false);
  const [evidenceActionId, setEvidenceActionId] = useState<string | null>(null);
  const [evidenceText, setEvidenceText] = useState("");

  async function handleAdd(data: {
    action_type: CapaAction["action_type"];
    description: string;
    responsible: string;
    due_date: string;
  }) {
    const supabase = createClient();
    const { data: row, error } = await supabase
      .from("capa_actions")
      .insert({
        nc_id: nc.id,
        organization_id: organizationId,
        ...data,
        status: "pending",
      })
      .select("*")
      .single();

    if (!error && row) {
      const next = [...actions, row as CapaAction];
      setActions(next);
      onUpdate(next);

      if (nc.status === "open" || nc.status === "in_analysis") {
        await supabase
          .from("nonconformities")
          .update({ status: "in_progress" })
          .eq("id", nc.id);
      }
    }
  }

  async function cycleStatus(action: CapaAction) {
    if (action.status === "completed") return;

    const currentIndex = STATUS_CYCLE.indexOf(action.status);
    const nextStatus = STATUS_CYCLE[Math.min(currentIndex + 1, 2)];

    if (nextStatus === "completed") {
      setEvidenceActionId(action.id);
      return;
    }

    await updateAction(action.id, { status: nextStatus });
  }

  async function updateAction(
    actionId: string,
    patch: Partial<CapaAction>
  ) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("capa_actions")
      .update(patch)
      .eq("id", actionId)
      .select("*")
      .single();

    if (!error && data) {
      const next = actions.map((a) =>
        a.id === actionId ? (data as CapaAction) : a
      );
      setActions(next);
      onUpdate(next);
    }
  }

  async function completeWithEvidence() {
    if (!evidenceActionId || !evidenceText.trim()) return;

    await updateAction(evidenceActionId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      evidence_description: evidenceText.trim(),
    });

    setEvidenceActionId(null);
    setEvidenceText("");

    const allDone = actions.every(
      (a) =>
        a.id === evidenceActionId ||
        a.status === "completed"
    );
    if (allDone) {
      const supabase = createClient();
      await supabase
        .from("nonconformities")
        .update({ status: "pending_verification" })
        .eq("id", nc.id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-ink-faint">
          {actions.filter((a) => a.status === "completed").length} de{" "}
          {actions.length} acciones completadas
        </p>
        <Button className="h-8 px-3 text-xs" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar acción
        </Button>
      </div>

      {actions.length === 0 ? (
        <p className="text-sm text-ink-light py-6 text-center border border-dashed border-border rounded-md">
          Define acciones correctivas o preventivas para esta NC
        </p>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent cursor-default">
                <TableHead>Descripción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((action) => {
                const overdue =
                  action.status !== "completed" &&
                  action.status !== "overdue" &&
                  isPastDue(action.due_date, "open");
                return (
                  <TableRow
                    key={action.id}
                    className="cursor-default hover:bg-background"
                  >
                    <TableCell>{action.description}</TableCell>
                    <TableCell>
                      <Badge variant="neutral" showDot={false}>
                        {ACTION_TYPE_LABELS[action.action_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink-light">
                      {action.responsible}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-mono text-xs",
                        overdue && "text-danger"
                      )}
                    >
                      {new Date(action.due_date).toLocaleDateString("es")}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => cycleStatus(action)}
                        disabled={action.status === "completed"}
                        className="text-left"
                      >
                        <Badge
                          variant={
                            action.status === "completed"
                              ? "success"
                              : action.status === "overdue" || overdue
                                ? "danger"
                                : "warning"
                          }
                        >
                          {action.status === "pending"
                            ? "Pendiente"
                            : action.status === "in_progress"
                              ? "En progreso"
                              : action.status === "overdue"
                                ? "Vencida"
                                : "Completada"}
                        </Badge>
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {evidenceActionId && (
        <div className="border border-border rounded-md p-4 space-y-3 bg-zinc-50">
          <p className="text-sm font-medium text-ink">Evidencia de cierre</p>
          <Textarea
            label="Descripción de la evidencia"
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            placeholder="Describe cómo se verificó la acción..."
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setEvidenceActionId(null)}
            >
              Cancelar
            </Button>
            <Button onClick={completeWithEvidence} disabled={!evidenceText.trim()}>
              Marcar completada
            </Button>
          </div>
        </div>
      )}

      <AddActionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleAdd}
        severity={nc.severity}
      />
    </div>
  );
}
