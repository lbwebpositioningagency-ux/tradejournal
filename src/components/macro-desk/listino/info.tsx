"use client";

import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * ICONA INFORMATIVA — la spiegazione accanto alla misura che spiega.
 *
 * Nasce da una correzione precisa alla direzione «Listino»: la prima stesura
 * mandava tutta la prosa in fondo alla pagina come note numerate, e le note
 * erano venticinque — un terzo dell'altezza della pagina occupato da testo
 * che si legge una volta sola. Adesso la stessa prosa sta qui, ancorata al
 * numero, e si apre al CLICK.
 *
 * Click e non hover, di proposito: un tooltip al passaggio del mouse non si
 * apre da tastiera, non si apre sul tattile, e si apre per sbaglio mentre si
 * scorre una tabella fitta. `Popover` di Radix dà a un bottone vero il
 * comportamento giusto in tutti e tre i casi.
 *
 * Il bottone è `type="button"`: dentro una tabella non c'è un form, ma il
 * default `submit` è una trappola che si paga il giorno in cui ce n'è uno.
 */
export function Info({
  titolo,
  children,
  etichetta,
}: {
  /** Riga di testa della finestrella: cos'è la misura, in tre parole. */
  titolo?: string;
  /** La spiegazione. */
  children: ReactNode;
  /** Nome accessibile del bottone: senza, è un «i» muto per chi non vede. */
  etichetta: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="ml-info"
        aria-label={`Spiegazione: ${etichetta}`}
      >
        {/* La «i» è il disegno del bottone, non il suo nome: senza
            `aria-hidden` il testo dell'intestazione viene letto come
            «RANGOi», e chi usa uno screen reader sente una lettera in più su
            ogni colonna. Il nome vero è l'`aria-label` qui sopra. */}
        <span aria-hidden>i</span>
      </PopoverTrigger>
      {/* Il contenuto vive in un PORTALE, cioè fuori da `.md-listino`: i token
          `--md-*` lì non esistono e vanno usati i colori dell'app. È anche la
          scelta giusta di merito — la finestrella è cromo dell'applicazione,
          non una riga del listino. */}
      <PopoverContent
        align="start"
        collisionPadding={12}
        className="ml-info-corpo w-[min(30rem,calc(100vw-2rem))]"
      >
        {titolo ? (
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {titolo}
          </p>
        ) : null}
        {children}
      </PopoverContent>
    </Popover>
  );
}
