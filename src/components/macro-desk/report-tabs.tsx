"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowUpRight, ChevronRight, Newspaper } from "lucide-react";
import {
  assetAccentVar,
  biasTone,
  dirTone,
  groupNewsByCategory,
  isCriticalIssue,
  sanitizeInlineHtml,
  type MacroAsset,
  type MacroDataIssue,
  type MacroDriver,
  type MacroHorizon,
  type MacroNews,
  type MacroNewsCategory,
  type MacroPayload,
} from "@/lib/macro-desk-payload";
import {
  letturaConfidenza,
  notaSenzaMotivo,
  stessaFrase,
  unanimitaControBiasNeutro,
  SEGNO_LABEL,
  type LetturaConfidenza,
  type MonitorConfidenza,
  type MotivoConfidenza,
} from "@/lib/macro-desk-confidenza";
import { quandoNews } from "@/lib/macro-desk-news-quando";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tab, Vuoto } from "./listino/primitive";
import {
  Glifo,
  MonoChip,
  PanelLabel,
  SectionEmpty,
  TONE_COLOR,
} from "./primitives";

/**
 * I DUE tab del dettaglio report Macro Desk — «Asset» e «News». Lo stato del
 * tab attivo vive nella shell client; qui c'è un solo stato, l'asset di cui si
 * legge la lettura (dal 15/09/2026, tavola «Report MD - ricostruzione»). Ogni
 * sezione degrada con eleganza se il payload non la contiene.
 *
 * Panoramica, Eventi & Watch, Macro e Storico sono state rimosse il
 * 28/08/2026. Il perché, per chi tornerà qui:
 *
 *  - `history` duplicava lo storico dell'indice `/macro-desk/report`, che è
 *    cliccabile e mostra gli stessi bias;
 *  - `eventMap`/`watch` puntavano quasi sempre allo stesso evento già citato
 *    dal pilastro «Eventi» e dal Radar rischi, e la sezione Volatilità ha un
 *    proprio calendario;
 *  - `macroTiles`/`macroSections` erano un cruscotto macro statico che si
 *    sovrapponeva a Driver Desk e Sintesi;
 *  - la Panoramica NON è stata buttata: i suoi contenuti vivi (disclaimer,
 *    data issues, pills del quadro, verdetto, radar rischi, lettura della
 *    struttura vol) sono ricollocati — i primi due nella shell, gli altri in
 *    testa e in coda a questo tab.
 *
 * Il parser `macro-desk-payload.ts` resta INVARIATO: è difensivo, non costa
 * nulla, e continuare a leggere quei campi non fa male a nessuno.
 */

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

function InlineHtml({ html, className }: { html: string; className?: string }) {
  return (
    <span
      className={className}
      // Fonte: il nostro stesso sistema; comunque ripulito a b/i/em/strong/br.
      dangerouslySetInnerHTML={{ __html: sanitizeInlineHtml(html) }}
    />
  );
}

export function issueColor(sev?: string): string {
  const s = (sev ?? "").toLowerCase();
  if (s === "major" || s === "critical" || s === "error") return "var(--md-down)";
  if (s === "minor" || s === "warn" || s === "warning") return "var(--md-warn)";
  return "var(--md-info)";
}

/**
 * Lista dei `dataIssues`. I critici li rende la shell in testa alla pagina
 * (valgono per tutto il report, non per un tab); i minori stanno in coda al
 * tab Asset, dietro un disclosure.
 */
export function DataIssuesList({ issues }: { issues: MacroDataIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue, i) => (
        /* Una NOTA (fondo muted, niente bordo): il colore della gravità sta
           sull'icona, che è grafica; l'etichetta resta testo neutro, perché
           sul riempimento ambra e rosso scendono sotto 4,5:1. */
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-md bg-[var(--md-surface-2)] px-3 py-2 text-xs leading-relaxed"
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            style={{ color: issueColor(issue.sev) }}
            aria-hidden
          />
          <span className="text-[var(--md-text-2)]">
            {issue.sev ? (
              <span className="mr-1.5 font-semibold uppercase text-[var(--md-text)]">
                [{issue.sev}]
              </span>
            ) : null}
            {issue.text}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════ 1 · ASSET ═══════════════ */

/**
 * Come questo report si comporta col bias della settimana. Dal 02/08/2026
 * (schemaVersion 2) il bias è emesso la DOMENICA nel report settimanale e i
 * giornalieri della settimana lo verificano soltanto — lo si legge nei
 * disclaimer stessi («il run giornaliero non riscrive il bias») e nei dati:
 * oro RIALZISTA 60·60·60·62·60 dal 10 al 14 agosto.
 *
 * I giornalieri v1 invece il bias lo riemettevano davvero, quindi la frase
 * cambia: dire «lo verifica, non lo riemette» su un report di luglio sarebbe
 * falso. La distinzione la fa la pagina, che ha `type` e `schemaVersion`.
 */
export type NaturaBias = "emesso" | "monitorato" | "aggiornato";

const NATURA_TESTO: Record<NaturaBias, string> = {
  emesso: "bias della settimana, emesso in questo report",
  monitorato:
    "bias della settimana, emesso la domenica: questo report lo verifica, non lo riemette",
  aggiornato: "bias della settimana, aggiornato da questo report giornaliero",
};

/**
 * I QUATTRO PILASTRI — dal 15/09/2026 una tabella del listino (pilastro,
 * segno, nota) al posto di quattro scatole col bordo superiore colorato:
 * quello che si ripete diventa una riga (tavola «Report MD - ricostruzione»).
 * Prima ancora, al posto del termometro semicircolare.
 *
 * Il gauge è stato tolto perché mostrava, con un ago che si muove di poco, un
 * numero che su 138 osservazioni reali vive fra 41 e 65 (dev.std ~5) e che
 * correla 0,06 con la composizione dei pilastri: l'ago prometteva una
 * misurazione che il dato non regge. I quattro pilastri, invece, il conflitto
 * lo mostrano davvero — è normale trovarne due opposti nello stesso asset.
 *
 * Tripla codifica del segno (glifo + parola + colore) perché sia leggibile
 * senza colore: la parola «rialzista/ribassista/neutro» è testo, non stile.
 */
function TabellaPilastri({
  horizon,
  motivo,
}: {
  horizon: MacroHorizon;
  /**
   * Il motivo della confidenza. Se è ANCORATO a un pilastro (`confPilastro`,
   * o in ripiego il confronto testuale) viene reso DENTRO quel pilastro; il
   * blocco confidenza allora non lo ripete.
   */
  motivo?: MotivoConfidenza;
}) {
  if (horizon.pillars.length === 0) return null;
  return (
    <Tab>
      <thead>
        <tr>
          <th className="ml-sx">Pilastro</th>
          <th className="ml-sx">Segno</th>
          <th className="ml-sx">Nota</th>
        </tr>
      </thead>
      <tbody>
        {horizon.pillars.map((pillar) => {
          const tone = dirTone(pillar.dir);
          /* UN SOLO POSTO PER QUELLA FRASE, e quel posto è la riga del
             pilastro che commenta: accanto alla misura si legge come una
             conseguenza, staccata in fondo si leggeva come un'eco. La
             deduplica resta VERBATIM: togliere una frase perché «somiglia» a
             un'altra prima o poi toglie qualcosa che serviva. */
          const ancorato = motivo?.pilastro === pillar.k ? motivo : undefined;
          const nota = notaSenzaMotivo(pillar.note, ancorato?.testo);
          return (
            <tr key={pillar.k}>
              <td className="ml-sx ml-wrap max-w-[9rem] align-top font-semibold leading-snug">{pillar.k}</td>
              {/* Tripla codifica del segno: glifo, parola, colore solo sul
                  glifo. La parola è testo, non stile. */}
              <td className="ml-sx align-top">
                <Glifo tone={tone} />{" "}
                <span className="text-[var(--md-text-2)]">{SEGNO_LABEL[tone]}</span>
              </td>
              <td className="ml-sx ml-wrap min-w-[10rem] align-top leading-relaxed text-[var(--md-text-2)] sm:min-w-[12rem]">
                {nota ? <span>{nota}</span> : ancorato ? null : <Vuoto />}
                {ancorato ? (
                  <span className={cn("block text-[var(--md-text)]", nota && "mt-1.5")}>
                    <span className="mr-1 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--md-muted)]">
                      {ancorato.fonte === "estratto" ? "Da qui la confidenza" : "Motivo della confidenza"}
                    </span>
                    «{ancorato.testo}»
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Tab>
  );
}

/** Un punteggio con la sua fascia, calcolata dall'app. Mai il `confLabel`. */
function Punteggio({
  valore,
  fascia,
  forte,
}: {
  valore: number;
  fascia: string;
  forte?: boolean;
}) {
  return (
    <span className="whitespace-nowrap">
      <span
        className={cn(
          "md-mono font-bold",
          forte ? "text-sm text-[var(--md-text)]" : "text-sm text-[var(--md-text-2)]",
        )}
      >
        {valore}/100
      </span>
      <span className="md-mono ml-1.5 text-2xs text-[var(--md-muted)]">{fascia}</span>
    </span>
  );
}

/**
 * La confidenza, in secondo piano — e accanto il MOTIVO, quando esiste.
 *
 * Niente barra e niente ago: su tutti i report reali il numero resta fra 41 e
 * 65, cioè in un quarto del binario. Una barra prometterebbe una variabilità
 * che il dato non ha.
 *
 * Senza motivo il blocco NON compare affatto — `letturaConfidenza` torna
 * `null` e qui non si rende niente. Il perché sta in quel modulo: un numero
 * con dev.std ~5 e correlazione ~0 coi pilastri, da solo, non sposta nessuna
 * decisione, mentre il bias e la striscia sì.
 *
 * Quando l'impegno della domenica e la lettura di oggi divergono si mostrano
 * ENTRAMBI, con la differenza: non sono uno la correzione dell'altro, sono
 * due misure di due momenti diversi. Dirlo è metà del lavoro.
 */
function BloccoConfidenza({
  lettura,
  mostraMotivo,
}: {
  lettura: LetturaConfidenza | null;
  /** Falso quando il motivo è già reso dentro il suo pilastro: non si ripete. */
  mostraMotivo: boolean;
}) {
  if (!lettura) return null;
  const {
    impegno,
    fasciaImpegno,
    oggi,
    fasciaOggi,
    delta,
    motivi,
    scostamentoNonMotivato,
  } = lettura;
  const stimato = motivi.length > 0 && motivi[0].fonte === "estratto";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--md-muted)]">
          Confidenza
        </span>

        {oggi === undefined ? (
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <Punteggio valore={impegno} fascia={fasciaImpegno} forte />
            <span className="text-2xs text-[var(--md-muted)]">
              dichiarata dal report: quanto si fida della propria lettura, non
              una probabilità
            </span>
          </p>
        ) : (
          /* La fascia sta SOLO sul numero di oggi: l'impegno è l'ancora
             storica, la lettura di oggi è quella viva. Due fasce sulla stessa
             riga facevano cinque elementi dove ne bastano tre.
             La didascalia che spiega le due misure non è qui: si dice una
             volta sola in testa al tab, sopra le tre card. */
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xs text-[var(--md-muted)]">
              impegno di domenica
            </span>
            <span className="md-mono text-sm font-bold text-[var(--md-text-2)]">
              {impegno}
            </span>
            <span className="text-[var(--md-muted)]" aria-hidden>
              →
            </span>
            <span className="text-2xs text-[var(--md-muted)]">lettura di oggi</span>
            <Punteggio valore={oggi} fascia={fasciaOggi!} forte />
            <span
              className="md-mono text-xs font-bold"
              style={{ color: delta! > 0 ? "var(--md-up)" : "var(--md-down)" }}
            >
              {delta! > 0 ? "+" : "−"}
              {Math.abs(delta!)}
            </span>
          </p>
        )}
      </div>

      {/* LO SCOSTAMENTO NON MOTIVATO. Dal 28/08/2026 il report deve dichiarare
          il perché di ogni scarto fra impegno e lettura di oggi: se non lo fa,
          la card lo dice invece di far finta di niente. Nasconderlo sarebbe
          esattamente il difetto del 18/08 — un errore invisibile perché la
          pagina non lo espone. Tono da constatazione, non da accusa: chi legge
          deve sapere che manca qualcosa, non sentirsi rimproverare. */}
      {scostamentoNonMotivato ? (
        <div>
          <p
            className="text-2xs font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--md-down)" }}
          >
            Scostamento non motivato
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--md-text-2)]">
            Il report ha cambiato la propria confidenza senza dichiarare perché.
            Il motivo è previsto a ogni scostamento: qui manca, e il numero di
            oggi va letto sapendolo.
          </p>
        </div>
      ) : null}

      {/* Il blocco a sé è il RIPIEGO: c'è solo quando il motivo non ha trovato
          il suo pilastro — niente `confPilastro` e nessuna corrispondenza nel
          testo. Con l'ancora, la frase sta lassù accanto alla sua misura. */}
      {mostraMotivo && motivi.length > 0 ? (
      <div>
        <p
          className="text-2xs font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--md-warn)" }}
        >
          {stimato ? "Motivo riconosciuto nel testo" : "Motivo dichiarato"}
        </p>
        {/* L'ANCORAGGIO. Il pilastro c'è per l'estratto (viene da lì) e ora
            anche per il dichiarato, via `confPilastro`: dice da quale delle
            quattro forze arriva il taglio, che è metà dell'informazione. */}
        {motivi.slice(0, 2).map((motivo, i) => (
          <p
            key={`${motivo.pilastro ?? "dichiarato"}-${i}`}
            className="mt-1 text-xs leading-relaxed text-[var(--md-text-2)]"
          >
            {motivo.pilastro ? (
              <span className="md-mono text-2xs text-[var(--md-muted)]">
                {motivo.pilastro} ·{" "}
              </span>
            ) : null}
            «{motivo.testo}»
          </p>
        ))}
        {/* L'euristica va DICHIARATA come tale — e SOLO quando è lei a parlare:
            appiccicare l'avvertenza a un campo dichiarato dal desk lo
            sminuirebbe senza motivo. */}
        {stimato ? (
          <p className="mt-1.5 text-2xs leading-tight text-[var(--md-muted)]">
            Frase riconosciuta nella nota del pilastro: questo report non porta
            il campo dedicato, che esiste dal 28 agosto 2026.
          </p>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}

/**
 * I pilastri concordi contro un bias NEUTRALE: 5 casi su 69 nei report reali.
 * Prima la card mostrava l'ago al centro e tre frecce dalla stessa parte,
 * senza una parola. Qui si constata e basta — la lettura resta quella
 * dichiarata dal desk, non la si corregge.
 */
function NotaUnanimita({ horizon }: { horizon: MacroHorizon }) {
  const u = unanimitaControBiasNeutro(horizon);
  if (!u) return null;
  return (
    <p className="rounded-md bg-[var(--md-surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--md-text-2)]">
      <span className="mr-1.5 font-semibold text-[var(--md-text)]">
        Da notare
      </span>
      {u.conSegno} pilastri su {u.totale} hanno un segno, e puntano tutti al{" "}
      {u.verso === "up" ? "rialzo" : "ribasso"}; il bias dichiarato resta
      NEUTRALE. La direzione dichiarata non segue la somma dei pilastri.
    </p>
  );
}

/**
 * CHE COSA È SUCCESSO OGGI — `monitor.state` + `monitor.note`.
 *
 * Due campi che finora non comparivano in pagina pur essendo in archivio da
 * agosto, e sono le righe più concrete che il report scriva: «Oro sui massimi
 * ~3 mesi; PCE core in linea ha ridotto le odds di rialzo Fed a ~34%».
 *
 * Sta in cima alla lettura settimanale, subito sotto il bias, perché è il
 * fatto del giorno e va letto prima delle forze che lo spiegano.
 *
 * COMPITI DISTINTI, e la card li tiene distinti: `note` dice che cosa è
 * successo, `confMotivo` perché la fiducia si è mossa. Quando però dicono la
 * stessa cosa — e capiterà, sono scritte dallo stesso generatore nello stesso
 * momento — se ne stampa UNA sola: qui sparisce la nota, perché il motivo è
 * ancorato al numero che spiega e senza di esso quel numero resterebbe muto.
 */
function NotaDelGiorno({
  monitor,
  motivo,
}: {
  monitor?: MonitorConfidenza;
  /** Il motivo già stampato altrove: se la nota lo ripete, la nota tace. */
  motivo?: string;
}) {
  const nota = monitor?.note?.trim();
  const stato = monitor?.state?.trim().toLowerCase();
  if (!nota && !stato) return null;
  if (nota && stessaFrase(nota, motivo)) return null;

  /* Lo stato del monitoraggio è una PAROLA neutra: «stress» non è una
     perdita e «conferma» non è un guadagno, quindi niente verde e rosso (e
     niente striscia colorata a sinistra, sistema v2). */
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-relaxed text-[var(--md-text-2)]">
      <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--md-muted)]">
        Oggi
      </span>
      {stato ? (
        <span className="text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--md-text)]">
          {stato}
        </span>
      ) : null}
      {nota ? <span>{nota}</span> : null}
    </p>
  );
}

/** Nel testo di una cella: «NEUTRALE» → «Neutrale». */
function parolaBias(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** Voce di prosa etichettata (Edge, Radar rischi…): niente scatola né striscia. */
function Voce({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div>
      <PanelLabel>{etichetta}</PanelLabel>
      <div className="mt-1 max-w-[80ch] text-sm leading-relaxed text-[var(--md-text-2)]">
        {children}
      </div>
    </div>
  );
}

/**
 * La lettura TRIMESTRALE: regime di fondo, subordinata a quella settimanale.
 * Nei report reali non porta mai pilastri né edge: bias, confidenza, `since`,
 * invalidazione e narrativa.
 *
 * La regola del silenzio vale ANCHE qui, con la stessa precedenza stretta:
 * `quarterly.confMotivo` dichiarato dal generatore (dal 28/08/2026), poi
 * l'euristica, poi niente. La confidenza trimestrale ha dev.std 5,46 su 69
 * osservazioni: senza motivo non si mostra.
 */
function LetturaTrimestrale({ horizon }: { horizon: MacroHorizon }) {
  const tone = biasTone(horizon.biasLabel, horizon.bias);
  const conf = letturaConfidenza(horizon);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>Trimestrale · regime di fondo</PanelLabel>
        {horizon.since ? <MonoChip>invariato dal {horizon.since}</MonoChip> : null}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Glifo tone={tone} />
        <span className="text-sm font-semibold text-[var(--md-text)]">
          {horizon.biasLabel ?? "non dichiarato"}
        </span>
        {conf ? (
          <span className="text-2xs text-[var(--md-muted)]">
            confidenza {conf.impegno}/100 · {conf.fasciaImpegno}
          </span>
        ) : null}
      </p>
      {conf ? (
        <p className="text-xs leading-relaxed text-[var(--md-text-2)]">
          <span className="font-semibold text-[var(--md-text)]">
            {conf.motivi[0].fonte === "estratto"
              ? "Motivo riconosciuto nel testo · "
              : "Motivo dichiarato · "}
          </span>
          «{conf.motivi[0].testo}»
        </p>
      ) : null}
      {horizon.narrative ? (
        <p className="text-xs leading-relaxed text-[var(--md-text-2)]">{horizon.narrative}</p>
      ) : null}
      {horizon.invalid ? (
        <p className="text-xs leading-relaxed text-[var(--md-text-2)]">
          <span className="font-semibold text-[var(--md-text)]">Invalidazione · </span>
          {horizon.invalid}
        </p>
      ) : null}
    </div>
  );
}

/** I driver dell'asset: una tabella di tre colonne invece di cinque scatole. */
function TabellaDriver({ drivers }: { drivers: MacroDriver[] }) {
  return (
    <div>
      <PanelLabel>Driver</PanelLabel>
      <Tab className="mt-1">
        <tbody>
          {drivers.map((driver) => {
            const tono = dirTone(driver.cls);
            return (
              <tr key={driver.k}>
                <td className="ml-sx ml-wrap text-[var(--md-text-2)]">{driver.k}</td>
                <td
                  className="font-semibold"
                  style={{
                    color:
                      driver.cls === "fl" || tono === "flat"
                        ? "var(--md-text)"
                        : TONE_COLOR[tono],
                  }}
                >
                  {driver.v ?? "—"}
                </td>
                <td
                  className="text-[var(--md-muted)]"
                  title="Orizzonte del driver: W settimanale, Q trimestrale"
                >
                  {driver.hz ?? ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tab>
    </div>
  );
}

/**
 * LA LETTURA DI UN ASSET — una alla volta, scelta dalla tabella dei bias o dal
 * segmentato (tavola «Report MD - ricostruzione», opzione 1a). Prima erano tre
 * schede verticali identiche, 4.340px a 1440 e 9.599 a 390.
 *
 * La colonna laterale (confidenza, trimestrale, driver) viene PRIMA nel DOM e
 * va a destra solo a schermo: il numero della confidenza sta così accanto al
 * nome dell'asset anche per chi legge in sequenza.
 */
function LetturaAsset({
  asset,
  natura,
  monitor,
}: {
  asset: MacroAsset;
  natura: NaturaBias;
  monitor?: MonitorConfidenza;
}) {
  const weekly = asset.weekly;
  /* UNA SOLA lettura per asset: la usano in tre e devono dire la stessa cosa. */
  const lettura = weekly ? letturaConfidenza(weekly, monitor) : null;
  const motivo = lettura?.motivi[0];
  /* Ancorato = il pilastro esiste davvero in questo orizzonte. Un
     `confPilastro` che punta a un pilastro assente torna al blocco a sé. */
  const ancorato = Boolean(
    weekly && motivo?.pilastro && weekly.pillars.some((p) => p.k === motivo.pilastro),
  );
  const tone = weekly ? biasTone(weekly.biasLabel, weekly.bias) : "flat";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-base font-semibold text-[var(--md-text)]">
          {asset.name ?? "Asset"}
        </h3>
        {asset.ticker ? (
          <span className="text-xs text-[var(--md-muted)]">{asset.ticker}</span>
        ) : null}
      </div>

      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* `order-last` sempre, non solo a colonne affiancate: su mobile la
            settimana viene prima del trimestrale e dei driver. */}
        <div className="order-last flex min-w-0 flex-col gap-5">
          {weekly ? <BloccoConfidenza lettura={lettura} mostraMotivo={!ancorato} /> : null}
          {asset.quarterly ? <LetturaTrimestrale horizon={asset.quarterly} /> : null}
          {asset.drivers.length > 0 ? <TabellaDriver drivers={asset.drivers} /> : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {weekly ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <PanelLabel>Settimanale</PanelLabel>
                  {weekly.biasLabel ? (
                    <span className="text-sm font-semibold text-[var(--md-text)]">
                      <Glifo tone={tone} /> {weekly.biasLabel}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--md-muted)]">
                      Bias settimanale non dichiarato.
                    </span>
                  )}
                </div>
                <span className="text-2xs text-[var(--md-muted)]">{NATURA_TESTO[natura]}</span>
              </div>
              <NotaDelGiorno monitor={monitor} motivo={motivo?.testo} />
              <TabellaPilastri horizon={weekly} motivo={ancorato ? motivo : undefined} />
              <NotaUnanimita horizon={weekly} />
              {weekly.edge ? <Voce etichetta="Edge">{weekly.edge}</Voce> : null}
              {/* L'invalidazione settimanale sta nella tabella dei bias, accanto
                  alle altre due: qui non si ripete. */}
              {weekly.narrative ? (
                <details className="group/narrativa">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.06em] text-[var(--md-muted)] hover:text-[var(--md-text)]">
                    <ChevronRight
                      className="size-3 transition-transform group-open/narrativa:rotate-90"
                      aria-hidden
                    />
                    Narrativa
                  </summary>
                  <p className="mt-1.5 max-w-[80ch] text-sm leading-relaxed text-[var(--md-text-2)]">
                    {weekly.narrative}
                  </p>
                </details>
              ) : null}
            </>
          ) : null}
          {!weekly && !asset.quarterly ? (
            <p className="text-sm text-[var(--md-muted)]">
              Nessuna lettura dichiarata per questo asset.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** I nomi brevi delle colonne dei pilastri: «Pricing / posizionamento» → «Pricing». */
function colonneDeiPilastri(assets: MacroAsset[]): string[] {
  const chiavi: string[] = [];
  for (const a of assets) {
    for (const p of a.weekly?.pillars ?? []) if (!chiavi.includes(p.k)) chiavi.push(p.k);
  }
  return chiavi;
}

/**
 * LA TABELLA DEI BIAS — la risposta della pagina in tre righe: per ogni asset
 * il bias della settimana, lo stato di oggi, il segno dei pilastri, il regime
 * trimestrale e la condizione che invalida la lettura. La riga scelta apre la
 * lettura qui sotto.
 *
 * Senza ticker di proposito: il nome basta a riconoscere la riga, e il ticker
 * accompagna la lettura, dove serve.
 */
function TabellaBias({
  assets,
  monitor,
  scelto,
  onScegli,
}: {
  assets: MacroAsset[];
  monitor?: Record<string, MonitorConfidenza>;
  scelto: number;
  onScegli: (indice: number) => void;
}) {
  const colonne = colonneDeiPilastri(assets);
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <PanelLabel>Bias per asset · settimana, pilastri, regime</PanelLabel>
        <span className="text-2xs text-[var(--md-muted)]">
          ▲ rialzista · ● neutrale · ▼ ribassista · clic su una riga per la lettura
        </span>
      </div>
      <Tab>
        <thead>
          <tr>
            <th className="ml-sx">Asset</th>
            <th className="ml-sx">Settimana</th>
            <th className="ml-sx">Oggi</th>
            {colonne.map((k) => (
              <th key={k} className="text-center" title={k}>
                {k.split(/\s*\/\s*/)[0]}
              </th>
            ))}
            <th className="ml-sx">Trimestrale</th>
            <th className="ml-sx">Invalidazione</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset, i) => {
            const w = asset.weekly;
            const q = asset.quarterly;
            const stato = asset.id ? monitor?.[asset.id]?.state?.trim() : undefined;
            return (
              <tr
                key={asset.id ?? i}
                className={cn("cursor-pointer", i === scelto && "ml-scelta")}
                onClick={() => onScegli(i)}
              >
                <td className="ml-sx align-top">
                  <button
                    type="button"
                    aria-pressed={i === scelto}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScegli(i);
                    }}
                    className="font-semibold text-[var(--md-text)] underline-offset-2 hover:underline"
                  >
                    {asset.name ?? `Asset ${i + 1}`}
                  </button>
                </td>
                <td className="ml-sx align-top">
                  {w?.biasLabel ? (
                    <>
                      <Glifo tone={biasTone(w.biasLabel, w.bias)} /> {parolaBias(w.biasLabel)}
                    </>
                  ) : (
                    <Vuoto />
                  )}
                </td>
                <td className="ml-sx align-top text-[var(--md-text-2)]">
                  {stato ? stato.toLowerCase() : <Vuoto />}
                </td>
                {colonne.map((k) => {
                  const p = w?.pillars.find((x) => x.k === k);
                  if (!p) {
                    return (
                      <td key={k} className="text-center align-top">
                        <Vuoto />
                      </td>
                    );
                  }
                  const t = dirTone(p.dir);
                  return (
                    <td key={k} className="text-center align-top" title={`${k}: ${SEGNO_LABEL[t]}`}>
                      <Glifo tone={t} />
                      <span className="sr-only">{SEGNO_LABEL[t]}</span>
                    </td>
                  );
                })}
                <td className="ml-sx align-top">
                  {q?.biasLabel ? (
                    <>
                      <Glifo tone={biasTone(q.biasLabel, q.bias)} /> {parolaBias(q.biasLabel)}
                      {q.since ? (
                        <span className="mt-1 block text-[var(--md-muted)]">dal {q.since}</span>
                      ) : null}
                    </>
                  ) : (
                    <Vuoto />
                  )}
                </td>
                <td className="ml-sx ml-wrap min-w-[11rem] align-top leading-relaxed text-[var(--md-text-2)]">
                  {w?.invalid ?? <Vuoto />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tab>
    </div>
  );
}

/** Blocco della pagina: filetto sopra, niente scatola. */
const BLOCCO = "border-t pt-3";
const FILETTO = { borderColor: "var(--ml-rule)" } as const;

export function AssetsTab({
  payload,
  natura,
  monitor,
}: {
  payload: MacroPayload;
  /** Come questo report tratta il bias settimanale (vedi `NaturaBias`). */
  natura: NaturaBias;
  /** Lettura del giorno per asset, dalla colonna `monitor`. Chiave: `id`. */
  monitor?: Record<string, MonitorConfidenza>;
}) {
  const [scelto, setScelto] = useState(0);
  const { assets, synthesis, volPanel } = payload;
  const pills = synthesis?.pills ?? [];
  /* Quanti asset mostrano DAVVERO due numeri: la didascalia si stampa solo
     allora, e una volta sola. Si chiede alla stessa funzione che poi decide
     nella lettura, così le due cose non possono dissentire. */
  const scostamenti = assets.filter((a) => {
    if (!a.weekly) return false;
    const l = letturaConfidenza(a.weekly, a.id ? monitor?.[a.id] : undefined);
    return l?.oggi !== undefined;
  }).length;
  // I critici li rende la shell in testa alla pagina: qui restano gli altri.
  const riserve = payload.dataIssues.filter((issue) => !isCriticalIssue(issue.sev));

  return (
    <div className="flex flex-col gap-6">
      {/* ── TESTA: il quadro condiviso dai tre asset ────────────────────── */}
      {pills.length > 0 ? (
        <div>
          <PanelLabel>Il quadro, comune ai tre asset</PanelLabel>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 xl:grid-cols-4">
            {pills.map((pill) => (
              <div key={pill.k} className="min-w-0">
                <PanelLabel>{pill.k}</PanelLabel>
                <p className="mt-0.5 text-sm font-semibold text-[var(--md-text)]">
                  {pill.v ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* LA DIDASCALIA DELLE DUE MISURE, una volta sola per report, e solo se
          almeno un asset ha davvero due numeri diversi. */}
      {scostamenti > 0 ? (
        <p className="text-xs leading-relaxed text-[var(--md-muted)]">
          <span className="mr-1.5 font-semibold uppercase tracking-[0.06em] text-[var(--md-text-2)]">
            Le due confidenze
          </span>
          Dove trovi due numeri non ce n&apos;è uno corretto e uno sbagliato:
          l&apos;<strong className="font-semibold">impegno di domenica</strong> è
          dichiarato all&apos;apertura della settimana e resta fermo, la{" "}
          <strong className="font-semibold">lettura di oggi</strong> dice quanto
          il desk si fida di quel bias adesso.
        </p>
      ) : null}

      {synthesis?.conclusion ? (
        <div className={BLOCCO} style={FILETTO}>
          <PanelLabel>Verdetto</PanelLabel>
          <p className="mt-1.5 max-w-[80ch] text-base leading-relaxed text-[var(--md-text)] text-pretty">
            {synthesis.conclusion}
          </p>
        </div>
      ) : null}

      {/* ── CORPO: la tabella dei bias e UNA lettura alla volta ─────────── */}
      {assets.length > 0 ? (
        <>
          <div className={BLOCCO} style={FILETTO}>
            <TabellaBias
              assets={assets}
              monitor={monitor}
              scelto={Math.min(scelto, assets.length - 1)}
              onScegli={setScelto}
            />
          </div>
          <div className={BLOCCO} style={FILETTO}>
            {assets.length > 1 ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <PanelLabel>Lettura per asset</PanelLabel>
                <SegmentedControl
                  label="Asset da leggere"
                  options={assets.map((a, i) => ({
                    value: String(i),
                    label: a.name ?? `Asset ${i + 1}`,
                  }))}
                  value={String(Math.min(scelto, assets.length - 1))}
                  onValueChange={(v) => {
                    if (v !== null) setScelto(Number(v));
                  }}
                />
              </div>
            ) : null}
            {/* Le letture non scelte restano nel documento, nascoste: la
                ricerca del browser e la stampa le trovano comunque. */}
            {assets.map((asset, i) => (
              <div key={asset.id ?? i} hidden={i !== Math.min(scelto, assets.length - 1)}>
                <LetturaAsset
                  asset={asset}
                  natura={natura}
                  monitor={asset.id ? monitor?.[asset.id] : undefined}
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <SectionEmpty what="Analisi per asset" />
      )}

      {/* ── CODA: cosa può rompere la lettura ───────────────────────────── */}
      {synthesis?.risks ? (
        <div className={BLOCCO} style={FILETTO}>
          <Voce etichetta="Radar rischi">
            <InlineHtml html={synthesis.risks} />
          </Voce>
        </div>
      ) : null}

      {volPanel?.reading ? (
        <div className={BLOCCO} style={FILETTO}>
          <Voce etichetta="Lettura della struttura vol">
            {volPanel.reading}
            {volPanel.asOf ? (
              <span className="mt-2 block text-xs text-[var(--md-muted)]">{volPanel.asOf}</span>
            ) : null}
            {/* I NUMERI stanno nella sezione Volatilità, con il rango storico
                dall'archivio CBOE: qui c'è solo la prosa del report. */}
            <Link
              href="/macro-desk/volatilita"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--md-text)] underline underline-offset-2"
            >
              Indici e rango storico nella sezione Volatilità
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Voce>
        </div>
      ) : null}

      {riserve.length > 0 ? (
        <details className={BLOCCO} style={FILETTO}>
          <summary className="cursor-pointer text-xs font-semibold text-[var(--md-text-2)]">
            {riserve.length} riserve dichiarate dal report
          </summary>
          <div className="mt-3">
            <DataIssuesList issues={riserve} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

/* ═══════════════ 2 · NEWS ═══════════════ */

const NEWS_CATEGORY_META: Record<MacroNewsCategory, { label: string; accent: string }> = {
  global: { label: "Global", accent: "var(--md-info)" },
  gold: { label: "Gold", accent: "var(--md-gold)" },
  oil: { label: "Oil", accent: "var(--md-oil)" },
  idx: { label: "Indices", accent: "var(--md-idx)" },
};

/**
 * I tag di una notizia, meno quello che ripete il gruppo che la contiene.
 *
 * Sotto l'intestazione «GOLD», un chip «gold» su ogni card è inchiostro che
 * non dice niente di nuovo — e affolla proprio la riga dove i tag NON ovvi
 * (`fed`, `macro`, `opec`) dovrebbero saltare all'occhio. Nel gruppo Global
 * non si toglie nulla: lì per costruzione non c'è un tag asset da ripetere.
 */
function tagDaMostrare(tags: string[], categoria: MacroNewsCategory): string[] {
  return categoria === "global" ? tags : tags.filter((t) => t !== categoria);
}

/**
 * La scheda di UNA notizia. Esportata perché il Radar di settore la RIUSA
 * così com'è (`radar-view.tsx`): il registro settimanale ha la stessa forma
 * — voce con titolo, fonte, data, riga di sintesi e approfondimento chiuso —
 * e ridisegnarla a parte significava due stili per la stessa cosa. Chi tocca
 * questo componente tocca due sezioni: verificare anche il Radar.
 */
export function NewsCard({
  item,
  categoria,
  reportDate,
}: {
  item: MacroNews;
  categoria: MacroNewsCategory;
  reportDate?: Date;
}) {
  /* Senza `reportDate` non si ancora niente: meglio la frase originale che una
     data sbagliata. Succede solo dove il componente è reso fuori dalla pagina. */
  const quando = reportDate ? quandoNews(item.when, reportDate) : null;
  const tags = tagDaMostrare(item.tags, categoria);
  return (
    <div className="md-card md-card-hover flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.src ? <MonoChip color="var(--md-text)">{item.src}</MonoChip> : null}
        {quando ? (
          <span
            className="md-mono text-2xs text-[var(--md-muted)]"
            /* Il vago resta vago e si vede che lo è: un «Questa settimana» in
               corsivo non finge di essere una data di calendario. */
            style={quando.assoluta ? undefined : { fontStyle: "italic" }}
          >
            {quando.testo}
          </span>
        ) : item.when ? (
          <span className="md-mono text-2xs text-[var(--md-muted)]">{item.when}</span>
        ) : null}
        <span className="ml-auto flex gap-1.5">
          {tags.map((tag) => (
            <MonoChip key={tag} color={assetAccentVar(tag)}>
              {tag}
            </MonoChip>
          ))}
        </span>
      </div>
      {item.title ? (
        item.url ? (
          /* Fonte esterna: `noreferrer` oltre a `noopener` perché il referrer
             porterebbe l'id del report nell'URL a un sito terzo. */
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group/fonte inline-flex items-start gap-1 text-sm font-semibold leading-snug text-[var(--md-text)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-info)]"
          >
            <span>{item.title}</span>
            <ArrowUpRight
              className="mt-0.5 size-3.5 shrink-0 text-[var(--md-muted)] transition-colors group-hover/fonte:text-[var(--md-info)]"
              aria-label="apri la fonte in una nuova scheda"
            />
          </a>
        ) : (
          <p className="text-sm font-semibold leading-snug text-[var(--md-text)]">
            {item.title}
          </p>
        )
      ) : null}
      {item.impl ? (
        <p
          className="border-l-2 pl-2.5 text-xs leading-relaxed text-[var(--md-text-2)]"
          style={{ borderColor: "var(--md-info)" }}
        >
          {item.impl}
        </p>
      ) : null}

      {/* L'APPROFONDIMENTO, chiuso di default e senza JavaScript: `details` fa
          già tutto — apertura al click, tastiera, e il testo resta nel DOM per
          la ricerca del browser. Titolo e riga di sintesi restano identici a
          prima: qui sotto si aggiunge, non si sostituisce.

          Una notizia senza `dettaglio` non mostra nemmeno il comando: un
          «apri» che apre il vuoto è peggio di niente. */}
      {item.dettaglio ? (
        <details className="group/news mt-0.5">
          <summary className="md-mono flex cursor-pointer list-none items-center gap-1.5 text-2xs text-[var(--md-muted)] transition-colors hover:text-[var(--md-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-info)]">
            <ChevronRight
              className="size-3 transition-transform group-open/news:rotate-90"
              aria-hidden
            />
            Approfondimento
          </summary>
          <p className="mt-2 whitespace-pre-line border-l-2 pl-2.5 text-xs leading-relaxed text-[var(--md-text-2)]" style={{ borderColor: "var(--md-border)" }}>
            {item.dettaglio}
          </p>
        </details>
      ) : null}
    </div>
  );
}

export function NewsTab({
  payload,
  reportDate,
}: {
  payload: MacroPayload;
  /** Ancora delle date relative: vedi `macro-desk-news-quando.ts`. */
  reportDate?: Date;
}) {
  const { newsTriage, news } = payload;
  if (!newsTriage && news.length === 0) return <SectionEmpty what="Rassegna news" />;
  const groups = groupNewsByCategory(news);
  return (
    <div className="flex flex-col gap-6">
      {newsTriage ? (
        <div className="md-card md-fade flex items-start gap-3 p-4" style={fade(0)}>
          <Newspaper
            className="mt-0.5 size-4 shrink-0"
            style={{ color: "var(--md-info)" }}
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-[var(--md-text-2)]">{newsTriage}</p>
        </div>
      ) : null}
      {groups.map(({ category, items }, gi) => {
        const meta = NEWS_CATEGORY_META[category];
        return (
          <div key={category} className="md-fade flex flex-col gap-3" style={fade(gi + 1)}>
            <div className="flex items-center gap-2">
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: meta.accent }}
                aria-hidden
              />
              <h3
                className="text-xs font-bold uppercase tracking-[0.14em]"
                style={{ color: meta.accent }}
              >
                {meta.label}
              </h3>
              <span className="md-mono text-2xs text-[var(--md-muted)]">
                {items.length}
              </span>
            </div>
            <div className="grid gap-3 xl:grid-cols-2">
              {items.map((item, i) => (
                <NewsCard
                  key={`${category}-${i}`}
                  item={item}
                  categoria={category}
                  reportDate={reportDate}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
