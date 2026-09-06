import { redirect } from "next/navigation";
import {
  SuppliersDashboard,
  type SupplierRow,
} from "@/components/suppliers/suppliers-dashboard";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { computeDocStatus } from "@/lib/suppliers/utils";
import { createClient } from "@/lib/supabase/server";
import type {
  Supplier,
  SupplierDocument,
  SupplierEvaluation,
} from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function ProveedoresPage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [
    { data: suppliersData },
    { data: documentsData },
    { data: evaluationsData },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("supplier_documents")
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("supplier_evaluations")
      .select("*")
      .eq("organization_id", orgId)
      .order("evaluation_date", { ascending: false }),
  ]);

  const suppliers = (suppliersData ?? []) as Supplier[];
  const documents = (documentsData ?? []) as SupplierDocument[];
  const evaluations = (evaluationsData ?? []) as SupplierEvaluation[];

  const latestEvalBySupplier = new Map<string, SupplierEvaluation>();
  for (const ev of evaluations) {
    if (!latestEvalBySupplier.has(ev.supplier_id)) {
      latestEvalBySupplier.set(ev.supplier_id, ev);
    }
  }

  const docCounts = new Map<string, { expired: number; expiring: number }>();
  for (const doc of documents) {
    const status = computeDocStatus(doc.expiry_date);
    const counts = docCounts.get(doc.supplier_id) ?? {
      expired: 0,
      expiring: 0,
    };
    if (status === "expired") counts.expired++;
    if (status === "expiring") counts.expiring++;
    docCounts.set(doc.supplier_id, counts);
  }

  const rows: SupplierRow[] = suppliers.map((s) => {
    const counts = docCounts.get(s.id) ?? { expired: 0, expiring: 0 };
    const latest = latestEvalBySupplier.get(s.id);
    return {
      ...s,
      latestClassification: latest?.classification ?? null,
      expiredDocs: counts.expired,
      expiringDocs: counts.expiring,
    };
  });

  return <SuppliersDashboard suppliers={rows} documents={documents} />;
}
