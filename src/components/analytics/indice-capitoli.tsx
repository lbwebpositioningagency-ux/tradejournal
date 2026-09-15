"use client";

import { useEffect, useState } from "react";
import { tabClass, tabListClass } from "@/components/layout/tab-nav";
import { cn } from "@/lib/utils";

export interface VoceCapitolo {
  id: string;
  label: string;
  /** Quanti pannelli ha il capitolo: dice quanto è lungo prima di entrarci. */
  conteggio: number;
}

/**
 * INDICE DEI CAPITOLI di Analytics (tavola «Analytics - ricostruzione»).
 *
 * Da 1024px è una colonna ferma a sinistra con il capitolo visibile
 * evidenziato; sotto, le stesse voci sono le schede del sistema, ferme sotto
 * la barra in alto. Prima erano ancore in testa che sparivano allo
 * scorrimento: chi cercava il Kelly scorreva tutta la pagina.
 *
 * Il capitolo attivo lo decide un IntersectionObserver sulle sezioni: nessuno
 * stato fuori dal componente, nessun ascolto dello scroll a ogni pixel.
 */
export function IndiceCapitoli({ capitoli }: { capitoli: readonly VoceCapitolo[] }) {
  const [attivo, setAttivo] = useState(capitoli[0]?.id);
  const chiavi = capitoli.map((c) => c.id).join("|");

  useEffect(() => {
    const sezioni = chiavi
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sezioni.length === 0) return;
    const osservatore = new IntersectionObserver(
      (voci) => {
        const visibili = voci
          .filter((v) => v.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibili[0]) setAttivo(visibili[0].target.id);
      },
      /* La fascia utile è il terzo alto della finestra, sotto la barra: un
         capitolo è «attivo» quando il suo inizio è lì, non quando se ne vede
         l'ultima riga in fondo. */
      { rootMargin: "-120px 0px -55% 0px" },
    );
    sezioni.forEach((s) => osservatore.observe(s));
    return () => osservatore.disconnect();
  }, [chiavi]);

  return (
    <>
      <nav
        aria-label="Capitoli della pagina"
        className="sticky top-14 z-10 mb-4 bg-background/95 backdrop-blur lg:hidden"
      >
        <ul className={tabListClass}>
          {capitoli.map((c) => (
            <li key={c.id} className="flex shrink-0 items-stretch">
              <a
                href={`#${c.id}`}
                aria-current={attivo === c.id ? "location" : undefined}
                className={tabClass(attivo === c.id)}
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Capitoli della pagina" className="hidden lg:block">
        <div className="sticky top-20">
          <p className="stat-label mb-2">Capitoli</p>
          <ul className="flex flex-col border-l">
            {capitoli.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  aria-current={attivo === c.id ? "location" : undefined}
                  className={cn(
                    "-ml-px flex items-baseline justify-between gap-2 border-l-2 px-3 py-1.5 text-sm font-medium transition-colors",
                    attivo === c.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                  <span className="text-xs font-normal text-muted-foreground">
                    {c.conteggio}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </>
  );
}
