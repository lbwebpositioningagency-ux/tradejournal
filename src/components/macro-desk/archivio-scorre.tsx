"use client";

import { useEffect, useRef } from "react";

/** Spazio lasciato accanto alla colonna scelta quando la si porta in vista. */
const MARGINE_PX = 24;

/**
 * Il binario che scorre dell'archivio in riga (vedi `archivio-report.tsx`).
 *
 * È in `row-reverse`: il browser lo apre già scorso sull'ultimo report e sul
 * buco, senza script. Lo script serve solo quando il report aperto è uno
 * vecchio fuori vista: la sua colonna si porta dentro il binario, senza
 * muovere la pagina. Riparte a ogni report aperto (`sceltoId`), perché la
 * navigazione fra report tiene montato lo stesso binario.
 */
export function ArchivioScorre({
  sceltoId,
  className,
  children,
}: {
  sceltoId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const binario = ref.current;
    const scelta = binario?.querySelector<HTMLElement>("[aria-current=page]");
    if (!binario || !scelta) return;
    const b = binario.getBoundingClientRect();
    const s = scelta.getBoundingClientRect();
    if (s.left < b.left) binario.scrollLeft -= b.left - s.left + MARGINE_PX;
    else if (s.right > b.right) binario.scrollLeft += s.right - b.right + MARGINE_PX;
  }, [sceltoId]);

  return (
    <ol ref={ref} data-archivio-scorre className={className}>
      {children}
    </ol>
  );
}
