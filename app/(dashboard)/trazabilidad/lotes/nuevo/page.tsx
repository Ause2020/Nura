import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreateLotForm } from "@/components/traceability/create-lot-form";
import { ModuleHeader } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { requireOrganizationId } from "@/lib/haccp/auth";
import { createClient } from "@/lib/supabase/server";
import type { Supplier, TraceLot } from "@/types/database";
import { getSessionUser } from "@/lib/auth/cached-session";

export default async function NuevoLotePage() {
  const orgId = await requireOrganizationId();
  const supabase = await createClient();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: suppliersData }, { data: rawLotsData }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("trace_lots")
      .select("*")
      .eq("organization_id", orgId)
      .in("lot_type", ["raw_material", "wip"])
      .order("lot_code"),
  ]);

  return (
    <>
      <ModuleHeader
        title="Registrar lote"
        description="Materia prima o producto terminado con genealogía"
        actions={
          <Link href="/trazabilidad">
            <Button variant="ghost" className="h-8">
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
          </Link>
        }
      />
      <div className="px-6 py-4">
        <CreateLotForm
          organizationId={orgId}
          userId={user.id}
          suppliers={(suppliersData ?? []) as Pick<Supplier, "id" | "name">[]}
          rawLots={(rawLotsData ?? []) as TraceLot[]}
        />
      </div>
    </>
  );
}
