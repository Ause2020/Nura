type SupabaseClient = ReturnType<
  typeof import("@/lib/supabase/client").createClient
>;

export async function generateSimulationNumber(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SR-${year}-`;

  const { data } = await supabase
    .from("mock_recall_simulations")
    .select("simulation_number")
    .eq("organization_id", organizationId)
    .like("simulation_number", `${prefix}%`)
    .order("simulation_number", { ascending: false })
    .limit(1);

  const last = (data?.[0] as { simulation_number: string } | undefined)
    ?.simulation_number;

  let seq = 1;
  if (last) {
    const match = last.match(/-(\d+)$/);
    if (match) seq = Number(match[1]) + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}
