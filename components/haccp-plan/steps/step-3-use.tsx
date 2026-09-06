"use client";

import { YOPI_GROUPS } from "@/lib/haccp-plan/constants";
import { ProductTabs } from "@/components/haccp-plan/steps/step-2-product";
import type { Product } from "@/lib/haccp-plan/types";

export function Step3Use({
  products,
  activeId,
  onActiveChange,
  onAdd,
  onDelete,
  onChange,
}: {
  products: Product[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onChange: (product: Product) => void;
}) {
  const product = products.find((item) => item.id === activeId) ?? products[0];
  if (!product) return null;

  return (
    <div className="space-y-4">
      <ProductTabs
        products={products}
        activeId={product.id}
        onActiveChange={onActiveChange}
        onAdd={onAdd}
        onDelete={onDelete}
      />
      <label className="block text-xs text-ink-light">
        Uso previsto
        <textarea
          value={product.intendedUse.usage}
          placeholder="Consumo listo para el plato (RTE) o requiere cocción previa a 72°C / 15 s"
          onChange={(event) =>
            onChange({
              ...product,
              intendedUse: { ...product.intendedUse, usage: event.target.value },
            })
          }
          rows={4}
          className="mt-1 hp-input"
        />
      </label>
      <label className="block text-xs text-ink-light">
        Observaciones adicionales
        <textarea
          value={product.intendedUse.additionalNotes}
          onChange={(event) =>
            onChange({
              ...product,
              intendedUse: {
                ...product.intendedUse,
                additionalNotes: event.target.value,
              },
            })
          }
          rows={2}
          className="mt-1 hp-input"
        />
      </label>
      <div>
        <p className="text-xs text-ink-light mb-2">Consumidores / grupos vulnerables (YOPI)</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {YOPI_GROUPS.map((group) => (
            <label key={group.key} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={product.consumerGroups[group.key]}
                onChange={(event) =>
                  onChange({
                    ...product,
                    consumerGroups: {
                      ...product.consumerGroups,
                      [group.key]: event.target.checked,
                    },
                  })
                }
              />
              {group.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
