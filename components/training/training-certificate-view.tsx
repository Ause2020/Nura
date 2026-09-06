"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCategoryLabel } from "@/lib/training/constants";
import type { Profile, TrainingCompletion, TrainingCourse } from "@/types/database";

interface TrainingCertificateViewProps {
  completion: TrainingCompletion;
  course: TrainingCourse;
  user: Pick<Profile, "full_name" | "job_title">;
  organizationName: string;
}

export function TrainingCertificateView({
  completion,
  course,
  user,
  organizationName,
}: TrainingCertificateViewProps) {
  return (
    <div className="min-h-screen bg-background px-4 py-8 print:bg-white">
      <div className="max-w-2xl mx-auto space-y-4 print:space-y-0">
        <div className="flex justify-end print:hidden">
          <Button
            type="button"
            variant="ghost"
            className="h-8"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Link href="/capacitacion/mis-capacitaciones" className="ml-2">
            <Button variant="ghost" className="h-8">
              Mis capacitaciones
            </Button>
          </Link>
        </div>

        <div className="bg-white border-2 border-forest rounded-md p-8 md:p-12 text-center space-y-6 print:border-forest">
          <p className="text-xs font-mono uppercase tracking-widest text-ink-faint">
            Nura · Certificado de capacitación
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-forest">
            Certificado de finalización
          </h1>
          <p className="text-sm text-ink-light">Se certifica que</p>
          <p className="font-display text-xl font-semibold text-ink">
            {user.full_name}
          </p>
          {user.job_title && (
            <p className="text-sm text-ink-faint">{user.job_title}</p>
          )}
          <p className="text-sm text-ink-light">
            completó satisfactoriamente el curso
          </p>
          <p className="font-display text-lg font-semibold text-ink">
            {course.title}
          </p>
          <p className="text-xs text-ink-faint">
            {getCategoryLabel(course.category)} · {organizationName}
          </p>

          <div className="grid grid-cols-2 gap-4 text-left max-w-md mx-auto pt-4 border-t border-border">
            <div>
              <p className="text-[10px] font-mono uppercase text-ink-faint">
                Fecha
              </p>
              <p className="text-sm font-mono">
                {new Date(completion.completed_at).toLocaleDateString("es")}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink-faint">
                Válido hasta
              </p>
              <p className="text-sm font-mono">
                {completion.valid_until
                  ? new Date(completion.valid_until).toLocaleDateString("es")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink-faint">
                Puntaje
              </p>
              <p className="text-sm font-mono">{completion.score ?? 100}%</p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase text-ink-faint">
                Código
              </p>
              <p className="text-sm font-mono">{completion.certificate_code}</p>
            </div>
          </div>

          <p className="text-[10px] font-mono text-ink-faint break-all pt-4">
            Firma digital: {completion.signature_hash.slice(0, 32)}…
          </p>
        </div>
      </div>
    </div>
  );
}
