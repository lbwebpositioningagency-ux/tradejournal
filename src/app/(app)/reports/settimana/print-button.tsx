"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * W3 — esportazione del report: stampa/salva PDF nativi del browser
 * (nessuna dipendenza di rendering immagine; la pagina è print-friendly).
 */
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      Stampa / salva PDF
    </Button>
  );
}
