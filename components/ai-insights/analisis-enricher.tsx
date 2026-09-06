"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * If today's briefing is still the rules-only version, ask the server
 * to add the AI narrative once. Not a chat — a single background refresh.
 */
export function AnalisisEnricher({ needsAi }: { needsAi: boolean }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!needsAi || started.current) return;
    started.current = true;

    void fetch("/api/ai/daily-insight", { method: "POST" })
      .then((res) => {
        if (res.ok) router.refresh();
      })
      .catch(() => {
        /* keep the deterministic briefing */
      });
  }, [needsAi, router]);

  return null;
}
