"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function parseChipValue(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function serializeChips(chips: string[]): string {
  return chips.join(", ");
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function ChipInput({
  value,
  onChange,
  placeholder,
  helper,
  suggestions = [],
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const chips = parseChipValue(value);
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const incoming = parseChipValue(raw).map(normalize).filter(Boolean);
    if (incoming.length === 0) {
      const single = normalize(raw);
      if (!single) return;
      incoming.push(single);
    }
    const merged = [...chips];
    for (const item of incoming) {
      if (!merged.some((chip) => chip.toLowerCase() === item.toLowerCase())) {
        merged.push(item);
      }
    }
    if (merged.length !== chips.length) onChange(serializeChips(merged));
    setDraft("");
  }

  function remove(index: number) {
    onChange(serializeChips(chips.filter((_, i) => i !== index)));
  }

  const unusedSuggestions = suggestions.filter(
    (item) => !chips.some((chip) => chip.toLowerCase() === item.toLowerCase())
  );

  return (
    <div>
      <div
        className={cn(
          "mt-1 min-h-10 rounded-md border border-border bg-white px-2 py-1.5 flex flex-wrap gap-1.5 focus-within:border-sage",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        {chips.map((chip, index) => (
          <span
            key={`${chip}-${index}`}
            className="inline-flex items-center gap-1 max-w-full rounded-full bg-sage-light text-forest text-[11px] font-medium pl-2 pr-1 py-0.5"
          >
            <span className="truncate">{chip}</span>
            <button
              type="button"
              onClick={() => remove(index)}
              className="h-4 w-4 rounded-full hover:bg-white/70 flex items-center justify-center"
              aria-label={`Quitar ${chip}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          disabled={disabled}
          placeholder={chips.length === 0 ? placeholder : ""}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === ";") {
              event.preventDefault();
              commit(draft);
            }
            if (event.key === "Backspace" && !draft && chips.length > 0) {
              event.preventDefault();
              remove(chips.length - 1);
            }
          }}
          onBlur={() => commit(draft)}
          className="flex-1 min-w-[120px] h-7 bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      {helper && (
        <p className="mt-1 text-[11px] text-ink-faint">{helper}</p>
      )}
      {unusedSuggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unusedSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => commit(item)}
              className="h-6 px-2 rounded-full text-[11px] border border-dashed border-border text-ink-light hover:border-sage hover:text-forest"
            >
              + {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
