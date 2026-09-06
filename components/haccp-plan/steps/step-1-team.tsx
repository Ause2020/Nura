"use client";

import { FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_EXTENSIONS,
  EVIDENCE_MAX_BYTES,
} from "@/lib/haccp-plan/constants";
import type { EvidenceFile, TeamMember } from "@/lib/haccp-plan/types";

export function Step1Team({
  team,
  onAdd,
  onChange,
  onDelete,
  onUploadTraining,
}: {
  team: TeamMember[];
  onAdd: () => void;
  onChange: (member: TeamMember) => void;
  onDelete: (id: string) => void;
  onUploadTraining: (member: TeamMember, file: File) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {team.length === 0 && (
        <p className="text-sm text-ink-light">
          Aún no hay equipo. Agrega al líder HACCP y a Calidad, Producción y Mantención.
        </p>
      )}
      <div className="overflow-x-auto rounded-md border border-border bg-white">
        <table className="w-full text-xs">
          <thead className="bg-background text-ink-faint uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Nombre</th>
              <th className="text-left px-3 py-2 font-medium">Cargo</th>
              <th className="text-left px-3 py-2 font-medium">Área</th>
              <th className="text-left px-3 py-2 font-medium">Cualificaciones</th>
              <th className="text-left px-3 py-2 font-medium min-w-[220px]">
                Última capacitación
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {team.map((member) => (
              <tr key={member.id} className="border-t border-border align-top">
                {(["name", "role", "area", "qual"] as const).map((field) => (
                  <td key={field} className="px-2 py-1.5">
                    <input
                      value={member[field]}
                      placeholder={
                        field === "name"
                          ? "Laura Soto"
                          : field === "role"
                            ? "Líder HACCP"
                            : field === "area"
                              ? "Calidad"
                              : "Curso HACCP 16 h"
                      }
                      onChange={(event) =>
                        onChange({ ...member, [field]: event.target.value })
                      }
                      className="hp-input"
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <TrainingEvidenceCell
                    member={member}
                    onChange={onChange}
                    onUpload={onUploadTraining}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => onDelete(member.id)}
                    className="text-ink-faint hover:text-danger"
                    aria-label="Eliminar miembro"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="h-8 px-3 rounded-md text-xs bg-white border border-border text-ink-light inline-flex items-center gap-1"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar miembro
      </button>
    </div>
  );
}

function TrainingEvidenceCell({
  member,
  onChange,
  onUpload,
}: {
  member: TeamMember;
  onChange: (member: TeamMember) => void;
  onUpload: (member: TeamMember, file: File) => Promise<void>;
}) {
  const evidence = member.trainingEvidence;

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
    const mimeOk =
      EVIDENCE_ACCEPT.includes(file.type) || EVIDENCE_EXTENSIONS.includes(ext);
    if (!mimeOk || file.size > EVIDENCE_MAX_BYTES) return;
    await onUpload(member, file);
  }

  return (
    <div className="space-y-1.5 min-w-[200px]">
      <input
        type="date"
        value={member.trainingDate}
        onChange={(event) =>
          onChange({ ...member, trainingDate: event.target.value })
        }
        className="hp-input"
      />
      {evidence ? (
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
          <FileText className="h-3.5 w-3.5 text-sage shrink-0" />
          {evidence.url ? (
            <a
              href={evidence.url}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate text-forest hover:underline"
            >
              {evidence.name}
            </a>
          ) : (
            <span className="flex-1 truncate text-ink-light">{evidence.name}</span>
          )}
          <button
            type="button"
            onClick={() => onChange({ ...member, trainingEvidence: null })}
            className="text-ink-faint hover:text-danger"
            aria-label="Quitar evidencia"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-dashed border-border text-ink-light cursor-pointer hover:bg-background">
          <Paperclip className="h-3.5 w-3.5" />
          Adjuntar
          <input
            type="file"
            className="hidden"
            accept={EVIDENCE_ACCEPT.join(",")}
            onChange={(event) => {
              void handleFile(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
