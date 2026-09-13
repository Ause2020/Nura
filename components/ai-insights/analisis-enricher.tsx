"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Regeneración explícita. No corre al montar ni al abrir el Dashboard. */
export function AnalisisRegenerate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRegenerate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ai/daily-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) {
        setError("No se pudo regenerar");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo regenerar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-danger">{error}</span> : null}
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => void handleRegenerate()}
      >
        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Regenerando…" : "Regenerar"}
      </Button>
    </div>
  );
}
