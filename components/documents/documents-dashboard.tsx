"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import { ModuleHeader } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_VARIANT,
  getCategoryLabel,
  getStatusLabel,
} from "@/lib/documents/constants";
import { daysUntil, getReviewAlert } from "@/lib/documents/utils";
import { cn } from "@/lib/utils";
import type {
  ControlledDocument,
  DocumentCategory,
  DocumentStatus,
  UserRole,
} from "@/types/database";

interface DocumentsDashboardProps {
  documents: ControlledDocument[];
  canManage: boolean;
}

interface Filters {
  category: DocumentCategory | "all";
  status: DocumentStatus | "all";
  review: "all" | "due_soon" | "overdue";
}

export function DocumentsDashboard({
  documents,
  canManage,
}: DocumentsDashboardProps) {
  const [filters, setFilters] = useState<Filters>({
    category: "all",
    status: canManage ? "all" : "published",
    review: "all",
  });

  const filtered = useMemo(() => {
    return documents
      .filter((doc) => {
        if (filters.category !== "all" && doc.category !== filters.category) {
          return false;
        }
        if (filters.status !== "all" && doc.status !== filters.status) {
          return false;
        }
        if (filters.review !== "all") {
          const alert = getReviewAlert(doc.next_review_date);
          if (alert !== filters.review) return false;
        }
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [documents, filters]);

  const reviewCounts = useMemo(() => {
    let dueSoon = 0;
    let overdue = 0;
    for (const doc of documents) {
      const alert = getReviewAlert(doc.next_review_date);
      if (alert === "due_soon") dueSoon++;
      if (alert === "overdue") overdue++;
    }
    return { dueSoon, overdue };
  }, [documents]);

  return (
    <div>
      <ModuleHeader
        title="Control de documentos"
        description="Versiones, aprobación y acuses de lectura"
        actions={
          canManage ? (
            <Link href="/documentos/nuevo">
              <Button type="button">
                <Plus className="h-4 w-4" />
                Nuevo documento
              </Button>
            </Link>
          ) : undefined
        }
      />

      {(reviewCounts.overdue > 0 || reviewCounts.dueSoon > 0) && canManage && (
        <div className="mb-4 flex flex-wrap gap-2">
          {reviewCounts.overdue > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({ ...f, review: "overdue", status: "all" }))
              }
              className="text-xs px-3 py-1.5 rounded-md border border-danger/30 bg-danger/5 text-danger"
            >
              {reviewCounts.overdue} revisión(es) vencida(s)
            </button>
          )}
          {reviewCounts.dueSoon > 0 && (
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({ ...f, review: "due_soon", status: "all" }))
              }
              className="text-xs px-3 py-1.5 rounded-md border border-amber/30 bg-amber/5 text-amber"
            >
              {reviewCounts.dueSoon} por vencer (&lt;30 días)
            </button>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {canManage && (
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: e.target.value as Filters["status"],
              }))
            }
            className="h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            <option value="all">Todos los estados</option>
            {(Object.keys(DOCUMENT_STATUS_LABELS) as DocumentStatus[]).map(
              (s) => (
                <option key={s} value={s}>
                  {getStatusLabel(s)}
                </option>
              )
            )}
          </select>
        )}
        <select
          value={filters.category}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              category: e.target.value as Filters["category"],
            }))
          }
          className="h-9 px-3 text-sm border border-border rounded-md bg-white"
        >
          <option value="all">Todas las categorías</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {canManage && (
          <select
            value={filters.review}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                review: e.target.value as Filters["review"],
              }))
            }
            className="h-9 px-3 text-sm border border-border rounded-md bg-white"
          >
            <option value="all">Próxima revisión: todas</option>
            <option value="due_soon">Por vencer (&lt;30 días)</option>
            <option value="overdue">Vencidas</option>
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        canManage ? (
          <div className="bg-white border border-border rounded-md p-8 text-center space-y-4">
            <FileText className="h-10 w-10 text-ink-faint mx-auto" />
            <p className="text-sm text-ink-light">
              Crea el primer documento controlado de tu sistema de inocuidad.
            </p>
            <Link href="/documentos/nuevo">
              <Button type="button">Crear documento</Button>
            </Link>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Sin documentos"
            description="No hay documentos publicados disponibles."
          />
        )
      ) : (
        <div className="bg-white border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-faint border-b border-border">
                <th className="text-left font-medium px-4 py-3">Código</th>
                <th className="text-left font-medium px-4 py-3">Título</th>
                <th className="text-left font-medium px-4 py-3">Categoría</th>
                <th className="text-left font-medium px-4 py-3">Estado</th>
                <th className="text-left font-medium px-4 py-3">
                  Próx. revisión
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const reviewAlert = getReviewAlert(doc.next_review_date);
                const days = daysUntil(doc.next_review_date);

                return (
                  <tr
                    key={doc.id}
                    className="border-b border-border last:border-0 hover:bg-background/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/documentos/${doc.id}`}
                        className="text-forest hover:underline"
                      >
                        {doc.code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {doc.title}
                    </td>
                    <td className="px-4 py-3 text-ink-light">
                      {getCategoryLabel(doc.category)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={DOCUMENT_STATUS_VARIANT[doc.status]}>
                        {getStatusLabel(doc.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {doc.next_review_date ? (
                        <span
                          className={cn(
                            "text-xs font-mono",
                            reviewAlert === "overdue" && "text-danger",
                            reviewAlert === "due_soon" && "text-amber",
                            reviewAlert === "none" && "text-ink-light"
                          )}
                        >
                          {new Date(doc.next_review_date).toLocaleDateString(
                            "es"
                          )}
                          {days != null && reviewAlert !== "none" && (
                            <span className="ml-1">
                              ({days < 0 ? `${Math.abs(days)}d vencido` : `${days}d`})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
