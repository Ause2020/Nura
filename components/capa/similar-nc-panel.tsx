"use client";

import Link from "next/link";
import type { Nonconformity } from "@/types/database";

interface SimilarNcPanelProps {
  currentNc: Nonconformity;
  historical: Nonconformity[];
}

/**
 * Referencia no bloqueante de NC similares.
 * TODO v2: reemplazar por sugerencias con LLM/embeddings cuando haya integración IA.
 */
export function SimilarNcPanel({
  currentNc,
  historical,
}: SimilarNcPanelProps) {
  const tokens = currentNc.description
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4);

  const similar = historical
    .filter((nc) => nc.id !== currentNc.id)
    .map((nc) => {
      const text = nc.description.toLowerCase();
      const score = tokens.filter((t) => text.includes(t)).length;
      return { nc, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (similar.length === 0) return null;

  return (
    <div className="bg-white border border-border rounded-md p-4">
      <p className="text-xs font-medium text-ink-light uppercase tracking-wider font-mono mb-2">
        NC históricas similares (referencia)
      </p>
      <ul className="space-y-2">
        {similar.map(({ nc }) => (
          <li key={nc.id}>
            <Link
              href={`/capa/${nc.id}`}
              className="text-sm text-forest hover:underline font-mono"
            >
              {nc.nc_number}
            </Link>
            <p className="text-xs text-ink-faint line-clamp-2 mt-0.5">
              {nc.description}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-ink-faint mt-3">
        TODO: sugerencia de causa raíz con IA cuando esté disponible.
      </p>
    </div>
  );
}
