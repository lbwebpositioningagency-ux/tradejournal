"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * W3 — esportazione del report: stampa/salva PDF nativi del browser
 * (nessuna dipendenza di rendering immagine; la pagina è print-friendly).
 *
 * Da quando esiste l'export PDF vero il bottone si chiama solo «Stampa»:
 * chiamarlo «salva PDF» accanto a un bottone PDF farebbe sembrare due strade
 * per la stessa cosa. Sono due cose diverse — questa apre l'anteprima del
 * browser sulla pagina che stai guardando, quella scarica un documento
 * impaginato uguale su ogni macchina.
 */
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      Stampa
    </Button>
  );
}
