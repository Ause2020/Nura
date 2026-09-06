"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CompletionBar } from "@/components/haccp/completion-bar";
import {
  DropdownItem,
  DropdownMenu,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCategoryLabel,
  getStatusBadgeVariant,
  STATUS_LABELS,
} from "@/lib/haccp/constants";
import { formatRelativeDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { HaccpProduct, HaccpProductStatus } from "@/types/database";

export interface ProductRow extends HaccpProduct {
  step_count: number;
  ccp_count: number;
}

interface ProductsTableProps {
  products: ProductRow[];
}

export function ProductsTable({ products: initialProducts }: ProductsTableProps) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);

  async function handleArchive(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("haccp_products")
      .update({ status: "archived" as HaccpProductStatus })
      .eq("id", id);

    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="bg-white rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent cursor-default">
            <TableHead>Producto</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Completitud</TableHead>
            <TableHead>Pasos</TableHead>
            <TableHead>CCPs</TableHead>
            <TableHead>Actualización</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow
              key={product.id}
              onClick={() => router.push(`/haccp/${product.id}`)}
            >
              <TableCell>
                <div>
                  <p className="font-medium text-ink">{product.name}</p>
                  <Badge variant="neutral" showDot={false} className="mt-1">
                    {getCategoryLabel(product.category)}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(product.status)}>
                  {STATUS_LABELS[product.status]}
                </Badge>
              </TableCell>
              <TableCell className="min-w-[120px]">
                <CompletionBar percent={product.plan_completion} showLabel />
              </TableCell>
              <TableCell>
                <span className="font-mono text-sm">{product.step_count}</span>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 font-mono text-sm">
                  {product.ccp_count > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sage" />
                  )}
                  {product.ccp_count}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-ink-faint font-mono">
                  {formatRelativeDate(product.updated_at)}
                </span>
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu
                  trigger={
                    <button
                      type="button"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-background transition-colors duration-150"
                      aria-label="Acciones"
                    >
                      <MoreHorizontal className="h-4 w-4 text-ink-faint" />
                    </button>
                  }
                >
                  <DropdownItem
                    onClick={() => router.push(`/haccp/${product.id}`)}
                  >
                    Editar
                  </DropdownItem>
                  <DropdownItem
                    destructive
                    onClick={() => {
                      if (
                        window.confirm(
                          `¿Archivar "${product.name}"? Podrás recuperarlo después.`
                        )
                      ) {
                        handleArchive(product.id);
                      }
                    }}
                  >
                    Archivar
                  </DropdownItem>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
