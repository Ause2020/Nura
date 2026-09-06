import type {
  MockRecallReport,
  TraceLot,
  TraceLotComposition,
} from "@/types/database";

export interface TraceTreeNode {
  lot: TraceLot;
  relation?: "root" | "upstream" | "downstream";
  edgeLabel?: string;
  children: TraceTreeNode[];
}

export interface TraceGraphData {
  root: TraceLot;
  upstream: TraceTreeNode;
  downstream: TraceTreeNode;
  allLots: TraceLot[];
}

function lotMap(lots: TraceLot[]): Map<string, TraceLot> {
  return new Map(lots.map((l) => [l.id, l]));
}

/** Ingredientes / materias que entraron en este lote (parent → children) */
function buildUpstreamTree(
  lotId: string,
  lotById: Map<string, TraceLot>,
  parentToIngredients: Map<string, { childId: string; label?: string }[]>,
  visited: Set<string>,
  isRoot = false
): TraceTreeNode {
  const lot = lotById.get(lotId)!;
  const edges = parentToIngredients.get(lotId) ?? [];

  const children: TraceTreeNode[] = [];
  for (const edge of edges) {
    if (visited.has(edge.childId)) continue;
    visited.add(edge.childId);
    const node = buildUpstreamTree(
      edge.childId,
      lotById,
      parentToIngredients,
      visited
    );
    node.relation = "upstream";
    node.edgeLabel = edge.label;
    children.push(node);
  }

  return {
    lot,
    relation: isRoot ? "root" : "upstream",
    children,
  };
}

/** Productos / destinos derivados de este lote (child → parents) */
function buildDownstreamTree(
  lotId: string,
  lotById: Map<string, TraceLot>,
  childToProducts: Map<string, { parentId: string; label?: string }[]>,
  visited: Set<string>,
  isRoot = false
): TraceTreeNode {
  const lot = lotById.get(lotId)!;
  const edges = childToProducts.get(lotId) ?? [];

  const children: TraceTreeNode[] = [];
  for (const edge of edges) {
    if (visited.has(edge.parentId)) continue;
    visited.add(edge.parentId);
    const node = buildDownstreamTree(
      edge.parentId,
      lotById,
      childToProducts,
      visited
    );
    node.relation = "downstream";
    node.edgeLabel = edge.label;
    children.push(node);
  }

  return {
    lot,
    relation: isRoot ? "root" : "downstream",
    children,
  };
}

export function buildTraceGraph(
  rootLot: TraceLot,
  allLots: TraceLot[],
  compositions: TraceLotComposition[]
): TraceGraphData {
  const lotById = lotMap(allLots);

  const parentToIngredients = new Map<
    string,
    { childId: string; label?: string }[]
  >();
  const childToProducts = new Map<
    string,
    { parentId: string; label?: string }[]
  >();

  for (const comp of compositions) {
    const label =
      comp.quantity_used != null
        ? `${comp.quantity_used}${comp.quantity_unit ? ` ${comp.quantity_unit}` : ""}`
        : undefined;

    const ingredients = parentToIngredients.get(comp.parent_lot_id) ?? [];
    ingredients.push({ childId: comp.child_lot_id, label });
    parentToIngredients.set(comp.parent_lot_id, ingredients);

    const products = childToProducts.get(comp.child_lot_id) ?? [];
    products.push({ parentId: comp.parent_lot_id, label });
    childToProducts.set(comp.child_lot_id, products);
  }

  const upstream = buildUpstreamTree(
    rootLot.id,
    lotById,
    parentToIngredients,
    new Set([rootLot.id]),
    true
  );

  const downstream = buildDownstreamTree(
    rootLot.id,
    lotById,
    childToProducts,
    new Set([rootLot.id]),
    true
  );

  return { root: rootLot, upstream, downstream, allLots };
}

export function computeMockRecallReport(
  targetLots: TraceLot[],
  graphLots: TraceLot[],
  compositions: TraceLotComposition[]
): MockRecallReport {
  const lotById = lotMap(graphLots);
  const childToProducts = new Map<string, string[]>();

  for (const comp of compositions) {
    const list = childToProducts.get(comp.child_lot_id) ?? [];
    list.push(comp.parent_lot_id);
    childToProducts.set(comp.child_lot_id, list);
  }

  const found = new Map<string, MockRecallReport["lots_found"][number]>();

  function walkForward(lotId: string, depth: number) {
    const lot = lotById.get(lotId);
    if (!lot || found.has(lotId)) return;

    found.set(lotId, {
      lot_id: lot.id,
      lot_code: lot.lot_code,
      lot_type: lot.lot_type,
      product_name: lot.product_name,
      quantity: lot.quantity,
      quantity_unit: lot.quantity_unit,
      destination: lot.destination,
      depth,
    });

    for (const parentId of childToProducts.get(lotId) ?? []) {
      walkForward(parentId, depth + 1);
    }
  }

  for (const target of targetLots) {
    walkForward(target.id, 0);
  }

  const lotsFound = Array.from(found.values()).sort(
    (a, b) => a.depth - b.depth || a.lot_code.localeCompare(b.lot_code)
  );

  const totalQuantity = lotsFound.reduce(
    (sum, row) => sum + (row.quantity ?? 0),
    0
  );

  const destinations = Array.from(
    new Set(
      lotsFound
        .map((l) => l.destination)
        .filter((d): d is string => Boolean(d?.trim()))
    )
  );

  return {
    target_lot_codes: targetLots.map((l) => l.lot_code),
    lots_found: lotsFound,
    total_quantity: totalQuantity,
    destinations,
    customers_affected: destinations,
  };
}

export function loadGraphFromData(
  rootLot: TraceLot,
  allLots: TraceLot[],
  compositions: TraceLotComposition[]
): TraceGraphData {
  const relevantIds = new Set<string>([rootLot.id]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const comp of compositions) {
      if (
        relevantIds.has(comp.parent_lot_id) &&
        !relevantIds.has(comp.child_lot_id)
      ) {
        relevantIds.add(comp.child_lot_id);
        changed = true;
      }
      if (
        relevantIds.has(comp.child_lot_id) &&
        !relevantIds.has(comp.parent_lot_id)
      ) {
        relevantIds.add(comp.parent_lot_id);
        changed = true;
      }
    }
  }

  const filteredLots = allLots.filter((l) => relevantIds.has(l.id));
  const filteredComps = compositions.filter(
    (c) => relevantIds.has(c.parent_lot_id) && relevantIds.has(c.child_lot_id)
  );

  return buildTraceGraph(rootLot, filteredLots, filteredComps);
}
