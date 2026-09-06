"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CcpTable } from "@/components/haccp/ccp-table";
import { CompletionBar } from "@/components/haccp/completion-bar";
import { HaccpPlanVersionPanel } from "@/components/haccp/haccp-plan-version-panel";
import {
  HaccpSummaryTable,
  type CcpSummaryRow,
} from "@/components/haccp/haccp-summary-table";
import { HazardAnalysis } from "@/components/haccp/hazard-analysis";
import { ProcessDiagram } from "@/components/haccp/process-diagram";
import {
  getCategoryLabel,
  getPackagingLabel,
  getStatusBadgeVariant,
  HACCP_TABS,
  STATUS_LABELS,
  type HaccpTabId,
} from "@/lib/haccp/constants";
import {
  getPlanStatusBadgeVariant,
  PLAN_STATUS_LABELS,
  type HaccpPlanStatus,
} from "@/lib/haccp/versioning";
import { cn } from "@/lib/utils";
import type {
  HaccpCcp,
  HaccpHazard,
  HaccpPlanVersion,
  HaccpPlanVersionLog,
  HaccpProcessStep,
  HaccpProduct,
  ProductionFormField,
  ProductionFormTemplate,
  UserRole,
} from "@/types/database";

interface CcpWithContext extends HaccpCcp {
  hazard?: HaccpHazard;
  step?: HaccpProcessStep;
}

interface ProductDetailProps {
  product: HaccpProduct;
  steps: HaccpProcessStep[];
  hazards: HaccpHazard[];
  ccps: CcpWithContext[];
  summaryRows: CcpSummaryRow[];
  versions: HaccpPlanVersion[];
  versionLog: HaccpPlanVersionLog[];
  templates: Pick<ProductionFormTemplate, "id" | "name">[];
  templateFields: Pick<
    ProductionFormField,
    "id" | "label" | "section_id" | "field_type"
  >[];
  organizationId: string;
  userId: string;
  userRole: UserRole;
}

export function ProductDetail({
  product,
  steps,
  hazards,
  ccps,
  summaryRows,
  versions,
  versionLog,
  templates,
  templateFields,
  organizationId,
  userId,
  userRole,
}: ProductDetailProps) {
  const [activeTab, setActiveTab] = useState<HaccpTabId>("diagrama");
  const planStatus = (product.plan_status ?? "draft") as HaccpPlanStatus;

  return (
    <div>
      <div className="sticky top-0 z-10 bg-white border-b border-border px-6 py-4">
        <Link
          href="/haccp"
          className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink transition-colors duration-150 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a productos
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-semibold text-ink tracking-tight font-display">
                {product.name}
              </h1>
              <Badge variant={getStatusBadgeVariant(product.status)}>
                {STATUS_LABELS[product.status]}
              </Badge>
              <Badge variant={getPlanStatusBadgeVariant(planStatus)}>
                {PLAN_STATUS_LABELS[planStatus]}
              </Badge>
            </div>
            <p className="text-xs text-ink-faint mt-0.5">
              {getCategoryLabel(product.category)} · v
              {product.current_version ?? 1}
            </p>
          </div>
          <div className="w-full sm:w-40">
            <p className="text-xs text-ink-faint mb-1 font-mono uppercase tracking-wider">
              Completitud
            </p>
            <CompletionBar percent={product.plan_completion} showLabel />
          </div>
        </div>

        <nav className="flex gap-4 mt-4 overflow-x-auto -mb-px">
          {HACCP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "pb-2 text-sm whitespace-nowrap border-b-2 transition-colors duration-150",
                activeTab === tab.id
                  ? "text-forest font-medium border-forest"
                  : "text-ink-faint border-transparent hover:text-ink-light"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-6 py-4">
        {activeTab === "ficha" && <FichaTecnica product={product} />}
        {activeTab === "diagrama" && (
          <ProcessDiagram
            product={product}
            initialSteps={steps}
            organizationId={organizationId}
          />
        )}
        {activeTab === "peligros" && (
          <HazardAnalysis
            steps={steps}
            initialHazards={hazards}
            organizationId={organizationId}
            ccpCount={ccps.length}
          />
        )}
        {activeTab === "ccps" && (
          <CcpTable
            product={product}
            initialCcps={ccps}
            organizationId={organizationId}
            templates={templates}
            templateFields={templateFields}
          />
        )}
        {activeTab === "resumen" && (
          <HaccpSummaryTable rows={summaryRows} />
        )}
        {activeTab === "versiones" && (
          <HaccpPlanVersionPanel
            product={product}
            steps={steps}
            hazards={hazards}
            ccps={ccps}
            versions={versions}
            versionLog={versionLog}
            organizationId={organizationId}
            userId={userId}
            userRole={userRole}
          />
        )}
      </div>
    </div>
  );
}

function FichaTecnica({ product }: { product: HaccpProduct }) {
  const fields = [
    { label: "Descripción", value: product.description },
    { label: "Uso previsto", value: product.intended_use },
    { label: "Consumidor objetivo", value: product.target_consumer },
    {
      label: "Vida útil",
      value: product.shelf_life_days
        ? `${product.shelf_life_days} días`
        : null,
    },
    { label: "Almacenamiento", value: product.storage_conditions },
    {
      label: "Empaque",
      value: product.packaging_type
        ? getPackagingLabel(product.packaging_type)
        : null,
    },
    {
      label: "Vigencia del plan",
      value: product.effective_date
        ? new Date(product.effective_date).toLocaleDateString("es")
        : null,
    },
    {
      label: "Próxima revisión",
      value: product.next_review_date
        ? new Date(product.next_review_date).toLocaleDateString("es")
        : null,
    },
  ];

  return (
    <div className="bg-white rounded-md border border-border divide-y divide-border">
      {fields.map(({ label, value }) => (
        <div
          key={label}
          className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-1"
        >
          <span className="text-xs text-ink-faint uppercase tracking-wider font-mono">
            {label}
          </span>
          <span className="sm:col-span-2 text-sm text-ink">
            {value || (
              <span className="text-ink-faint italic">Sin definir</span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
