"use client";

import { Plus, Trash2 } from "lucide-react";
import { ChipInput } from "@/components/haccp-plan/chip-input";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/haccp-plan/types";

const CHIP_FIELDS: Record<
  string,
  { placeholder: string; helper: string; suggestions: string[] }
> = {
  Ingredientes: {
    placeholder: "Pechuga de pollo",
    helper: "Escribe y pulsa Enter o coma para fijar cada ingrediente.",
    suggestions: ["Agua", "Sal", "Azúcar", "Aceite vegetal"],
  },
  Empaque: {
    placeholder: "Bandeja PET",
    helper: "Un material o componente por chip. Enter o coma para fijar.",
    suggestions: [
      "Bandeja PET",
      "Film retráctil",
      "Bolsa al vacío",
      "Caja de cartón",
      "Frasco de vidrio",
      "MAP",
      "Etiqueta adhesiva",
    ],
  },
  "Características Físico-Químicas": {
    placeholder: "pH 6.2",
    helper: "Fija cada parámetro (pH, Aw, humedad…) con Enter o coma.",
    suggestions: ["pH 6.2", "Aw 0.97", "NaCl 1.2%", "Humedad 65%"],
  },
  Tratamiento: {
    placeholder: "Cocción 72°C / 15 s",
    helper: "Un tratamiento por chip. Enter o coma para fijar.",
    suggestions: [
      "Cocción 72°C / 15 s",
      "Pasteurización",
      "Congelado IQF",
      "Refrigeración",
      "Detector de metales",
    ],
  },
  "Condiciones de Almacenamiento": {
    placeholder: "Refrigerado 0–4°C",
    helper: "Una condición por chip. Enter o coma para fijar.",
    suggestions: [
      "Refrigerado 0–4°C",
      "Congelado ≤ −18°C",
      "Ambiente fresco y seco",
      "Cadena de frío",
    ],
  },
};

const ALLERGEN_SUGGESTIONS = [
  "Leche",
  "Huevo",
  "Soya",
  "Trigo / gluten",
  "Maní",
  "Frutos secos",
  "Pescado",
  "Crustáceos",
  "Moluscos",
  "Sulfitos",
  "Sésamo",
];

function specByLabel(product: Product, label: string) {
  return product.specs.find((spec) => spec.label === label);
}

export function Step2Product({
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

  function updateSpec(label: string, value: string) {
    const specs = product.specs.map((item) =>
      item.label === label ? { ...item, value } : item
    );
    const name = label === "Nombre del Producto" ? value || product.name : product.name;
    onChange({ ...product, specs, name });
  }

  const name = specByLabel(product, "Nombre del Producto");
  const life = specByLabel(product, "Vida Útil (Art. 107 DS 977)");
  const instructions = specByLabel(product, "Instrucciones de Uso");

  return (
    <div className="space-y-4">
      <ProductTabs
        products={products}
        activeId={product.id}
        onActiveChange={onActiveChange}
        onAdd={onAdd}
        onDelete={onDelete}
      />

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs text-ink-light">
          Nombre del Producto
          <input
            value={name?.value ?? product.name}
            placeholder="Jamón de pavo laminado"
            onChange={(event) => updateSpec("Nombre del Producto", event.target.value)}
            className="mt-1 hp-input"
          />
        </label>
        <label className="block text-xs text-ink-light">
          Resolución Sanitaria (DFL 725)
          <input
            value={product.resolutionNumber}
            placeholder="Res. Exenta 1234 / 2024"
            onChange={(event) =>
              onChange({ ...product, resolutionNumber: event.target.value })
            }
            className="mt-1 hp-input"
          />
        </label>
      </div>

      {(
        [
          "Ingredientes",
          "Empaque",
          "Características Físico-Químicas",
          "Tratamiento",
          "Condiciones de Almacenamiento",
        ] as const
      ).map((label) => {
        const config = CHIP_FIELDS[label];
        const spec = specByLabel(product, label);
        return (
          <label key={label} className="block text-xs text-ink-light">
            {label}
            <ChipInput
              value={spec?.value ?? ""}
              onChange={(value) => updateSpec(label, value)}
              placeholder={config.placeholder}
              helper={config.helper}
              suggestions={config.suggestions}
            />
          </label>
        );
      })}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-xs text-ink-light">
          Vida Útil (Art. 107 DS 977)
          <input
            value={life?.value ?? ""}
            placeholder="15 días a 0–4°C"
            onChange={(event) =>
              updateSpec("Vida Útil (Art. 107 DS 977)", event.target.value)
            }
            className="mt-1 hp-input"
          />
        </label>
        <label className="block text-xs text-ink-light">
          Instrucciones de Uso
          <textarea
            value={instructions?.value ?? ""}
            placeholder="Consumir preferentemente frío. Una vez abierto, 48 h en refrigeración."
            onChange={(event) =>
              updateSpec("Instrucciones de Uso", event.target.value)
            }
            rows={3}
            className="mt-1 hp-input"
          />
        </label>
      </div>

      <div
        className={cn(
          "rounded-md border p-4",
          product.hasAllergens
            ? "border-danger/30 bg-red-50"
            : "border-sage/30 bg-sage-light"
        )}
      >
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={product.hasAllergens}
            onChange={(event) =>
              onChange({ ...product, hasAllergens: event.target.checked })
            }
          />
          Contiene alérgenos
        </label>
        {product.hasAllergens && (
          <div className="mt-2">
            <p className="text-xs text-ink-light">Alérgenos declarados</p>
            <ChipInput
              value={product.allergens}
              onChange={(allergens) => onChange({ ...product, allergens })}
              placeholder="Leche"
              helper="Enter o coma para fijar. Usa las sugerencias del RSA / etiquetado."
              suggestions={ALLERGEN_SUGGESTIONS}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductTabs({
  products,
  activeId,
  onActiveChange,
  onAdd,
  onDelete,
}: {
  products: Product[];
  activeId: string;
  onActiveChange: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {products.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onActiveChange(item.id)}
          className={cn(
            "h-8 px-3 rounded-md text-xs border",
            item.id === activeId
              ? "bg-sage text-white border-sage"
              : "bg-white text-ink-light border-border"
          )}
        >
          {item.name || "Producto"}
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="h-8 px-3 rounded-md text-xs border border-dashed border-border text-ink-light"
      >
        <Plus className="h-3 w-3 inline" /> Agregar
      </button>
      {products.length > 1 && (
        <button
          type="button"
          onClick={() => onDelete(activeId)}
          className="h-8 w-8 rounded-md border border-border text-ink-faint flex items-center justify-center"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
