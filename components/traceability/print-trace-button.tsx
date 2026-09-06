"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintTraceButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      <span className="hidden sm:inline">Imprimir</span>
    </Button>
  );
}
