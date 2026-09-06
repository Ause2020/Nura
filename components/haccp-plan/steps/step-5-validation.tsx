"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_EXTENSIONS,
  EVIDENCE_MAX_BYTES,
} from "@/lib/haccp-plan/constants";
import type { EvidenceFile, PlanValidation } from "@/lib/haccp-plan/types";

export function Step5Validation({
  validation,
  onChange,
  onUpload,
}: {
  validation: PlanValidation;
  onChange: (next: PlanValidation) => void;
  onUpload: (file: File) => Promise<EvidenceFile | null>;
}) {
  async function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    for (const file of Array.from(fileList)) {
      const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
      const mimeOk =
        EVIDENCE_ACCEPT.includes(file.type) || EVIDENCE_EXTENSIONS.includes(ext);
      if (!mimeOk || file.size > EVIDENCE_MAX_BYTES) {
        continue;
      }
      const uploaded = await onUpload(file);
      if (uploaded) {
        onChange({ ...validation, files: [...validation.files, uploaded] });
      }
    }
  }

  return (
    <div className="space-y-4">
      <label className="block rounded-lg border border-dashed border-border bg-white p-6 text-center cursor-pointer">
        <Upload className="h-5 w-5 text-sage mx-auto mb-2" />
        <p className="text-sm text-ink">Arrastra evidencias o haz clic</p>
        <p className="text-[11px] text-ink-faint mt-1">PDF, JPG, PNG, DOC/DOCX · máx. 10 MB</p>
        <input
          type="file"
          className="hidden"
          multiple
          accept={EVIDENCE_ACCEPT.join(",")}
          onChange={(event) => {
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      <ul className="space-y-2">
        {validation.files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-ink"
          >
            <FileText className="h-4 w-4 text-sage" />
            <span className="flex-1 truncate">{file.name}</span>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...validation,
                  files: validation.files.filter((item) => item.id !== file.id),
                })
              }
              className="text-ink-faint hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <label className="block text-xs text-ink-light">
        Acta de validación / observaciones
        <textarea
          value={validation.observations}
          placeholder="Se recorrió la línea en turno mañana y tarde. Se corrigió la etapa de enfriado omitida en el diagrama."
          onChange={(event) =>
            onChange({ ...validation, observations: event.target.value })
          }
          rows={5}
          className="mt-1 hp-input"
        />
      </label>
    </div>
  );
}
