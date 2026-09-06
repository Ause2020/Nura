"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EvaluationTrendChart } from "@/components/suppliers/evaluation-trend-chart";
import {
  SCORECARD_CRITERIA,
  DEFAULT_SCORECARD_WEIGHTS,
  parseScorecardWeights,
} from "@/lib/suppliers/scorecard";
import { CLASSIFICATION_LABELS } from "@/lib/suppliers/constants";
import { classifySupplier } from "@/lib/suppliers/utils";
import type {
  Nonconformity,
  SupplierEvaluation,
  SupplierScorecardWeights,
} from "@/types/database";

interface SupplierScorecardPanelProps {
  evaluations: SupplierEvaluation[];
  linkedNcs: Nonconformity[];
  scorecardWeights: SupplierScorecardWeights | null;
}

export function SupplierScorecardPanel({
  evaluations,
  linkedNcs,
  scorecardWeights,
}: SupplierScorecardPanelProps) {
  const weights = parseScorecardWeights(
    scorecardWeights ?? DEFAULT_SCORECARD_WEIGHTS
  );
  const latest = evaluations[0];

  const trendData = {
    scores: [...evaluations]
      .sort(
        (a, b) =>
          new Date(a.evaluation_date).getTime() -
          new Date(b.evaluation_date).getTime()
      )
      .map((e) => e.overall_score ?? 0),
    labels: [...evaluations]
      .sort(
        (a, b) =>
          new Date(a.evaluation_date).getTime() -
          new Date(b.evaluation_date).getTime()
      )
      .map((e) =>
        new Date(e.evaluation_date).toLocaleDateString("es", {
          month: "short",
          year: "2-digit",
        })
      ),
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-ink-light">
            Scorecard configurable
          </p>
          <p className="text-sm text-ink-faint mt-1">
            Pesos definidos a nivel organización. Clasificación: A ≥85, B ≥70, C
            &lt;70.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {SCORECARD_CRITERIA.map((criterion) => (
            <div
              key={criterion.key}
              className="border border-border rounded-md p-3 text-center"
            >
              <p className="text-xs text-ink-faint">{criterion.label}</p>
              <p className="font-mono text-lg text-forest">
                {Math.round(weights[criterion.key] * 100)}%
              </p>
            </div>
          ))}
        </div>

        {latest && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
            <Badge variant="neutral">
              Última evaluación: {latest.overall_score ?? "—"}/100
            </Badge>
            {latest.classification && (
              <Badge variant="success">
                {latest.classification} —{" "}
                {CLASSIFICATION_LABELS[latest.classification] ??
                  classifySupplier(latest.overall_score ?? 0)}
              </Badge>
            )}
          </div>
        )}

        {trendData.scores.length > 1 && (
          <EvaluationTrendChart
            scores={trendData.scores}
            labels={trendData.labels}
          />
        )}
      </div>

      <div className="bg-white border border-border rounded-md p-4 md:p-6 space-y-3">
        <p className="text-sm font-medium text-ink">
          No conformidades vinculadas ({linkedNcs.length})
        </p>
        {linkedNcs.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Sin NC registradas para este proveedor.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {linkedNcs.map((nc) => (
              <li
                key={nc.id}
                className="py-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <p className="font-mono text-sm text-ink">{nc.nc_number}</p>
                  <p className="text-xs text-ink-faint line-clamp-1">
                    {nc.description}
                  </p>
                </div>
                <Link
                  href={`/capa/${nc.id}`}
                  className="inline-flex items-center gap-1 text-xs text-forest hover:underline"
                >
                  Ver CAPA
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
