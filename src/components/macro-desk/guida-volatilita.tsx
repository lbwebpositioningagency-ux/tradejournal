import { PanelLabel } from "./primitives";

/**
 * COME SI LEGGE LA SEZIONE VOLATILITÀ — la guida breve, in pagina.
 *
 * Chiusa per default, come la sorella del Driver Desk e per la stessa
 * ragione: si legge una volta, i dati si consultano ogni mattina, e in un
 * terminale ciò che si guarda tutti i giorni non sta sotto ciò che si legge
 * una volta sola. Il `summary` porta con sé la cosa più importante che c'è
 * dentro, così chiuderla non nasconde che questa sezione non prevede niente.
 *
 * QUI STA SOLO L'ESSENZIALE: cosa è ciascun blocco e a quale decisione serve.
 * La guida estesa — con l'aritmetica dello stop e della size, gli esempi
 * lavorati sui numeri veri e la lettura d'insieme dei tre strumenti — sta in
 * `docs/macro-desk/GUIDA-MACRO-DESK.md`. Metterla tutta qui rifarebbe il
 * difetto che questa revisione ha appena tolto dalla Sintesi: riquadri di
 * testo che occupano lo spazio dei numeri.
 *
 * Componente PURO: nessuno stato, nessun hook, nessun dato.
 */
export function GuidaVolatilita() {
  return (
    <details className="md-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--md-text)]">
        Come si legge questa sezione
        <span className="ml-2 font-normal text-[var(--md-muted)]">
          — risponde a «quanto sarà larga la giornata», mai a «dove va il prezzo»
        </span>
      </summary>

      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-[var(--md-text-2)]">
        <p>
          Questa sezione serve a <strong>dimensionare stop e size</strong>, e a
          nient&apos;altro. Non contiene una sola riga che dica dove andrà il
          prezzo. Fino al 27/08/2026 conteneva un{" "}
          <em>termometro di volatilità</em> che classificava ogni strumento come
          ESPANSA o COMPRESSA: la soglia era tarata una volta, su oro e WTI
          aveva smesso di separare due gruppi per otto mesi, ed è stato tolto.
          Nessun fatto è stato tolto con lui.
        </p>

        <div>
          <PanelLabel>Eventi programmati</PanelLabel>
          <p className="mt-1">
            Solo eventi il cui orario è pubblicato in anticipo
            dall&apos;istituzione che li produce. Conta la{" "}
            <strong>distanza</strong>, non la data: se c&apos;è qualcosa fra due
            ore, il resto della pagina descrive un mercato che fra due ore non
            esisterà più.
          </p>
        </div>

        <div>
          <PanelLabel>Indice di volatilità implicita (GVZ · OVX · VIX)</PanelLabel>
          <p className="mt-1">
            Quanto il mercato delle opzioni <strong>fa pagare oggi</strong> per
            i prossimi trenta giorni. Non si legge mai il livello nudo — «GVZ
            27,69» non dice se è alto o basso — ma il <strong>rango</strong>
            accanto, che è un confronto con la propria storia e non scade
            quando il regime cambia.
          </p>
        </div>

        <div>
          <PanelLabel>Implicita contro realizzata</PanelLabel>
          <p className="mt-1">
            Quanto si paga contro quanto ci si è mossi davvero, entrambe in
            percentuale annua. È il <strong>controllo di calibrazione</strong>:
            un&apos;implicita molto sopra la realizzata è un premio che il
            movimento non ha ancora giustificato. Il disallineamento fra i
            sottostanti (opzioni sull&apos;ETF, prezzo sullo spot o sul future) è
            dichiarato riga per riga: va letto.
          </p>
        </div>

        <div>
          <PanelLabel>Escursione vera della giornata — il numero dello stop</PanelLabel>
          <p className="mt-1">
            Massimo meno minimo diviso la chiusura: lo{" "}
            <strong>spazio che il prezzo attraversa</strong>, che è quello che
            uno stop incontra. La mediana a 20 sedute è l&apos;ambiente di
            adesso, quella a 60 il termine di paragone; la banda 25-75% dice
            quanto fidarsi della mediana. Uno stop dentro la banda viene toccato
            da una giornata ordinaria, non da un evento.
          </p>
        </div>

        <div>
          <PanelLabel>Struttura a termine, VVIX e SKEW</PanelLabel>
          <p className="mt-1">
            La curva del VIX distingue <strong>volatilità alta</strong> da{" "}
            <strong>volatilità alta adesso</strong>: sopra 1 il mercato prezza
            più movimento nelle prossime due settimane che nel mese. VVIX e SKEW
            sono il prezzo della copertura, e servono a leggere il sottotesto
            quando il VIX è basso: un VIX basso con uno SKEW alto non è una
            contraddizione — nessuno teme il movimento ordinario, molti pagano
            ancora per quello raro.
          </p>
        </div>

        <div>
          <PanelLabel>Quel che arriva dal report</PanelLabel>
          <p className="mt-1">
            MOVE e PUT/CALL sono le uniche due misure che nessuna fonte gratuita
            pubblica: vengono dal report, che è generato a mano, e portano due
            date — quella del report e il vintage che il report dichiara. Se un
            numero del report diverge da uno dell&apos;archivio,{" "}
            <strong>vince l&apos;archivio</strong>.
          </p>
        </div>

        <p className="text-xs text-[var(--md-muted)]">
          La guida estesa — l&apos;aritmetica di stop e size, cosa costa usare la
          finestra sbagliata, e la lettura d&apos;insieme dei quattro strumenti —
          sta in <span className="md-mono">docs/macro-desk/GUIDA-MACRO-DESK.md</span>,
          che copre tutte le sezioni del desk.
        </p>
      </div>
    </details>
  );
}
