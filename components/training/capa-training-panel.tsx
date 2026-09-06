"use client";

import { useState } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asignarCapacitacionCorrectiva } from "@/lib/integrations/training-from-capa";
import { getAssignmentStatusLabel } from "@/lib/training/constants";
import { createClient } from "@/lib/supabase/client";
import type {
  Profile,
  TrainingAssignment,
} from "@/types/database";

interface CapaTrainingPanelProps {
  ncId: string;
  organizationId: string;
  userId: string;
  members: Pick<Profile, "id" | "full_name">[];
  assignments: (TrainingAssignment & { course?: { title: string } | null })[];
  canManage: boolean;
}

export function CapaTrainingPanel({
  ncId,
  organizationId,
  userId,
  members,
  assignments: initialAssignments,
  canManage,
}: CapaTrainingPanelProps) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [courseTitle, setCourseTitle] = useState(
    "Capacitación correctiva — causa raíz"
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pending = assignments.filter((a) => a.status !== "completed");

  async function handleAssign() {
    if (selectedUsers.length === 0) {
      setError("Selecciona al menos un usuario");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const result = await asignarCapacitacionCorrectiva(supabase, {
      organizationId,
      ncId,
      courseTitle: courseTitle.trim(),
      userIds: selectedUsers,
      assignedBy: userId,
    });
    setLoading(false);
    if (!result) {
      setError("No se pudo crear la asignación");
      return;
    }
    window.location.reload();
  }

  function toggleUser(id: string) {
    setSelectedUsers((prev) =>
      prev.includes(id) ? prev.filter((u) => u !== id) : [...prev, id]
    );
  }

  return (
    <div className="bg-white border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-forest" />
        <h3 className="text-sm font-semibold text-ink">
          Capacitación correctiva
        </h3>
        {pending.length > 0 && (
          <Badge variant="warning">{pending.length} pendiente(s)</Badge>
        )}
      </div>

      {assignments.length > 0 && (
        <ul className="text-sm space-y-1">
          {assignments.map((a) => {
            const member = members.find((m) => m.id === a.user_id);
            return (
              <li key={a.id} className="flex justify-between gap-2">
                <span>
                  {member?.full_name ?? "Usuario"} —{" "}
                  {a.course?.title ?? "Curso"}
                </span>
                <Badge variant={a.status === "completed" ? "success" : "warning"}>
                  {getAssignmentStatusLabel(a.status)}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <div className="border-t border-border pt-3 space-y-3">
          <Input
            label="Título del curso"
            value={courseTitle}
            onChange={(e) => setCourseTitle(e.target.value)}
          />
          <div className="space-y-1">
            <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
              Asignar a
            </p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleUser(m.id)}
                  className={`text-xs px-2 py-1 rounded-full border ${
                    selectedUsers.includes(m.id)
                      ? "border-forest bg-breeze text-forest"
                      : "border-border text-ink-light"
                  }`}
                >
                  {m.full_name}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="button" className="h-8" loading={loading} onClick={handleAssign}>
            Asignar capacitación
          </Button>
        </div>
      )}

      {pending.length > 0 && (
        <p className="text-xs text-amber">
          El cierre de la CAPA requiere completar todas las capacitaciones vinculadas.
        </p>
      )}
    </div>
  );
}
