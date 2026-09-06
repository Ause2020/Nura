"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isDueWithinHours, isPastDue } from "@/lib/capa/utils";
import type { Nonconformity } from "@/types/database";

export function useCapaAlertCount(organizationId: string | null) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!organizationId) return;

    async function load() {
      const supabase = createClient();

      const { data } = await supabase
        .from("nonconformities")
        .select("due_date, status")
        .eq("organization_id", organizationId)
        .neq("status", "closed");

      const ncs = (data ?? []) as Pick<Nonconformity, "due_date" | "status">[];
      const alerts = ncs.filter(
        (nc) =>
          isPastDue(nc.due_date, nc.status) ||
          isDueWithinHours(nc.due_date, 48)
      ).length;

      setCount(alerts);
    }

    load();
  }, [organizationId]);

  return count;
}

interface CapaNavBadgeProps {
  organizationId: string;
}

export function CapaNavBadge({ organizationId }: CapaNavBadgeProps) {
  const count = useCapaAlertCount(organizationId);

  if (count <= 0) return null;

  return (
    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-danger text-[10px] font-mono font-medium text-white px-1">
      {count > 9 ? "9+" : count}
    </span>
  );
}
