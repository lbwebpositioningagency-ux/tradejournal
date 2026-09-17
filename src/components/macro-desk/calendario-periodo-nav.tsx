"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedNav } from "@/components/ui/segmented";
import {
  giornoEsteso,
  hrefPeriodo,
  type VistaCalendario,
} from "@/lib/calendario-periodo";

/**
 * NAVIGAZIONE NEL TEMPO del Calendario — tavola CD «Macro Desk - Calendario,
 * legenda festività e navigazione», turno 3a.
 *
 * Gli stessi controlli del calendario della Dashboard: frecce `outline` a
 * icona, scelta della data con l'input nativo, «Oggi» quando il periodo non
 * contiene oggi. Tutto è un link: il periodo sta nell'URL, quindi indietro e
 * avanti del browser funzionano e un periodo si può mandare a qualcuno.
 *
 * I limiti arrivano dal server già calcolati (`hrefPrec`/`hrefSucc` nulli
 * quando il periodo accanto sta tutto fuori dai dati): una freccia che porta
 * a una pagina vuota non si mostra accesa. E sotto i controlli si dice fin
 * dove arriva la fonte, invece di lasciarlo scoprire a colpi di freccia.
 */

export interface NavigazionePeriodo {
  vista: VistaCalendario;
  /** Primo giorno del periodo mostrato. */
  ancora: string;
  oggi: string;
  hrefPrec: string | null;
  hrefSucc: string | null;
  /** Nullo quando il periodo contiene già oggi, o in «In arrivo». */
  hrefOggi: string | null;
  /** Per il cambio di vista: la settimana e il mese del periodo mostrato. */
  hrefSettimana: string;
  hrefMese: string;
  storicoDal: string;
  /** Ultimo giorno pubblicato dalla fonte; nullo se non è stato possibile leggerlo. */
  pubblicatoFino: string | null;
  /** L'ultimo giorno del periodo cade oltre `pubblicatoFino`. */
  oltreOrizzonte: boolean;
}

export function CalendarioPeriodoNav({ nav }: { nav: NavigazionePeriodo }) {
  const router = useRouter();
  const scegli = (valore: string) => {
    if (!valore) return;
    router.push(hrefPeriodo(nav.vista, valore.length === 7 ? `${valore}-01` : valore), {
      scroll: false,
    });
  };
  const inputClass =
    "md-mono h-8 rounded-lg border bg-transparent px-2.5 text-sm text-[var(--md-text)] outline-none focus-visible:ring-2 focus-visible:ring-ring [color-scheme:light] dark:[color-scheme:dark]";

  return (
    <div data-periodo className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--md-muted)]">
          Periodo
        </span>
        <SegmentedNav
          label="Periodo"
          scroll={false}
          items={[
            { key: "arrivo", href: hrefPeriodo("arrivo"), label: "In arrivo", active: nav.vista === "arrivo" },
            { key: "settimana", href: nav.hrefSettimana, label: "Settimana", active: nav.vista === "settimana" },
            { key: "mese", href: nav.hrefMese, label: "Mese", active: nav.vista === "mese" },
          ]}
        />

        {nav.vista !== "arrivo" ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Freccia
              href={nav.hrefPrec}
              etichetta={nav.vista === "settimana" ? "Settimana precedente" : "Mese precedente"}
            >
              <ChevronLeft className="size-4" />
            </Freccia>
            {nav.vista === "settimana" ? (
              <input
                type="date"
                aria-label="Scegli la settimana (un giorno qualsiasi)"
                value={nav.ancora}
                min={nav.storicoDal}
                max={nav.pubblicatoFino ?? undefined}
                onChange={(e) => scegli(e.target.value)}
                className={inputClass}
              />
            ) : (
              <input
                type="month"
                aria-label="Scegli il mese"
                value={nav.ancora.slice(0, 7)}
                min={nav.storicoDal.slice(0, 7)}
                max={nav.pubblicatoFino?.slice(0, 7)}
                onChange={(e) => scegli(e.target.value)}
                className={inputClass}
              />
            )}
            <Freccia
              href={nav.hrefSucc}
              etichetta={nav.vista === "settimana" ? "Settimana successiva" : "Mese successivo"}
            >
              <ChevronRight className="size-4" />
            </Freccia>
            {nav.hrefOggi ? (
              <Button asChild variant="outline" size="sm" className="h-8">
                <Link href={nav.hrefOggi} scroll={false}>
                  Oggi
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* I limiti veri della fonte, detti prima di andarci a sbattere. */}
      <p className="md-mono text-2xs leading-relaxed text-[var(--md-text-2)]">
        Storico dal {giornoEsteso(nav.storicoDal).replace(/^1 /, "")} ·{" "}
        {nav.pubblicatoFino ? (
          <>
            calendario pubblicato fino al {giornoEsteso(nav.pubblicatoFino)}
            {nav.oltreOrizzonte ? ": oltre, la fonte non ha ancora eventi" : ""}
          </>
        ) : (
          "orizzonte in avanti non letto: le frecce non sono limitate"
        )}
      </p>
    </div>
  );
}

function Freccia({
  href,
  etichetta,
  children,
}: {
  href: string | null;
  etichetta: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <Button
        data-freccia
        variant="outline"
        size="icon"
        disabled
        aria-label={`${etichetta}: oltre i dati della fonte`}
      >
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon">
      <Link data-freccia href={href} scroll={false} aria-label={etichetta}>
        {children}
      </Link>
    </Button>
  );
}
