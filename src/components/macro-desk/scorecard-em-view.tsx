import { ChevronRight } from "lucide-react";
import { ASSET_LABELS, type ScorecardAsset } from "@/lib/macro-desk-scorecard";
import {
  K_BREAK,
  K_HIT,
  MIN_WEEKS_FOR_HIT_RATE,
  confidenceCalibration,
  scorecardMetrics,
  type ResolvedWeek,
  type WeekOutcome,
} from "@/lib/macro-desk-scorecard-em";
import type { FreschezzaReport } from "@/lib/macro-desk-freschezza";
import { biasTone } from "@/lib/macro-desk-payload";
import { quantoFa } from "@/lib/macro-desk-stato-report";
import {
  PRIMA_SETTIMANA_CALCOLATA,
  SOGLIA_DISCREPANZA_EM,
} from "@/lib/percorso-impegno";
import type { PercorsoRicalcolato } from "@/lib/queries/macro-scorecard-em";
import { formatNumber } from "@/lib/format-number";
import { cn } from "@/lib/utils";
import { Tab, Vuoto } from "./listino/primitive";
import { Glifo, PanelLabel } from "./primitives";

/**
 * Vista della scorecard a Expected Move (ricostruzione del 15/09/2026, tavola
 * Claude Design «Scorecard - ricostruzione», opzione 2a). Componente SERVER
 * puramente presentazionale: riceve le settimane già risolte e non calcola
 * esiti.
 *
 * Tre regole, le stesse del Report e di Analytics:
 *  - in testa una striscia di STATO: dove siamo, il campione verso le
 *    {MIN_WEEKS_FOR_HIT_RATE} settimane che servono a pubblicare, l'età del
 *    report da cui la pagina legge;
 *  - UNA tabella di consuntivo (asset × esiti, con il totale) al posto di tre
 *    blocchi con la stessa spiegazione ripetuta tre volte;
 *  - COLORE SOLO SUL SEGNO: verde e rosso sui valori in EM; esiti, conteggi,
 *    rami e invalidazioni sono parole neutre.
 *
 * Regola di lettura invariata: **ogni percentuale sta accanto al numero di
 * osservazioni**, e finché il campione non basta al posto della percentuale
 * c'è «X di 8».
 */

const ESITO: Record<WeekOutcome, string> = {
  HIT: "Azzeccata",
  MISS: "Sbagliata",
  NULLO: "Senza info",
};

const ASSET: readonly ScorecardAsset[] = ["xau", "wti", "idx"];

function pct(fraction: string): string {
  return `${formatNumber(Number(fraction) * 100, { decimals: 1 })}%`;
}

/** Prezzo all'italiana, due decimali. */
function prezzo(value: number): string {
  return formatNumber(value, { decimals: 2 });
}

/** Un valore in EM col segno: il colore c'è solo se il segno esiste. */
function ValoreEm({ value, unita = false }: { value: number | null; unita?: boolean }) {
  if (value === null) return <Vuoto />;
  const colore =
    value > 0 ? "var(--md-up)" : value < 0 ? "var(--md-down)" : undefined;
  return (
    <span style={colore ? { color: colore } : undefined}>
      {formatNumber(value, { decimals: 2, sign: true })}
      {unita ? " EM" : ""}
    </span>
  );
}

/** «2026-08-02» → «02/08/26». */
function settimana(iso: string): string {
  const [a, m, g] = iso.split("-");
  return a && m && g ? `${g}/${m}/${a.slice(2)}` : iso;
}

function parolaBias(bias: string): string {
  return bias.charAt(0) + bias.slice(1).toLowerCase();
}

/**
 * Q-08 — hit rate SEPARATE per bias direzionali e neutrali: le due regole
 * hanno denominatori diversi, quindi un'unica percentuale si muoverebbe col mix
 * dei bias dichiarati, non con la bravura.
 */
function splitByBiasType(rows: ResolvedWeek[]) {
  return {
    directional: rows.filter((w) => w.bias !== "NEUTRALE"),
    neutral: rows.filter((w) => w.bias === "NEUTRALE"),
  };
}

/** L'hit rate quando c'è, «X di 8» quando il campione non basta. */
function CellaHitRate({ rows }: { rows: ResolvedWeek[] }) {
  const m = scorecardMetrics(rows);
  const valutate = m.hits + m.misses;
  if (m.hitRate === null) {
    return (
      <span className="text-[var(--md-muted)]" title={m.hitRateSuppressedReason ?? undefined}>
        {valutate} di {MIN_WEEKS_FOR_HIT_RATE}
      </span>
    );
  }
  return (
    <span>
      <span className="font-semibold">{pct(m.hitRate)}</span>{" "}
      <span className="text-[var(--md-muted)]">su {valutate}</span>
    </span>
  );
}

/* ── striscia dello stato ─────────────────────────────────────────────── */

function CellaReport({ freschezza }: { freschezza: FreschezzaReport | null }) {
  const base = "border-t py-2.5 sm:border-t-0 sm:border-l sm:pl-4";
  if (freschezza === null) {
    return (
      <div className={base} style={{ borderColor: "var(--md-border)" }}>
        <PanelLabel>Report · non verificabile</PanelLabel>
        <p className="mt-0.5 text-xs text-[var(--md-text-2)]">
          L&apos;età del report non si è potuta leggere.
        </p>
      </div>
    );
  }
  if (!freschezza.stantio) {
    return (
      <div className={base} style={{ borderColor: "var(--md-border)" }}>
        <PanelLabel>Report · aggiornato</PanelLabel>
        <p className="mt-0.5 text-base font-semibold">
          {freschezza.oreDiRitardo === null ? "—" : quantoFa(freschezza.oreDiRitardo)}
        </p>
      </div>
    );
  }
  return (
    <div
      role="status"
      className={cn(base, "bg-warning/10 px-3 shadow-[inset_0_2px_0_var(--warning)] sm:pr-4")}
      style={{ borderColor: "var(--md-border)" }}
    >
      <PanelLabel>
        {freschezza.motivo === "nessun_report" ? "Report · nessuno" : "Report · in ritardo"}
      </PanelLabel>
      <p className="mt-0.5 flex items-center gap-2 text-base font-semibold">
        <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-warning" />
        {freschezza.oreDiRitardo === null ? "mai arrivato" : quantoFa(freschezza.oreDiRitardo)}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-[var(--md-text-2)]">
        La Scorecard legge dai report: le settimane nuove si fermano con loro.
      </p>
    </div>
  );
}

function StrisciaStato({
  weeks,
  trackRecordStart,
  freschezza,
}: {
  weeks: ResolvedWeek[];
  trackRecordStart: string | null;
  freschezza: FreschezzaReport | null;
}) {
  const overall = scorecardMetrics(weeks);
  const { directional, neutral } = splitByBiasType(weeks);
  const dir = scorecardMetrics(directional);
  const neu = scorecardMetrics(neutral);
  const dirValutate = dir.hits + dir.misses;
  const neuValutate = neu.hits + neu.misses;
  const nessunaPubblicabile = dir.hitRate === null && neu.hitRate === null;

  return (
    <div
      className="grid border-y sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"
      style={{ borderTopColor: "var(--ml-rule)", borderBottomColor: "var(--md-border)" }}
    >
      <div className="py-2.5 sm:pr-4">
        <PanelLabel>Dove siamo</PanelLabel>
        {weeks.length === 0 ? (
          <>
            <p className="mt-0.5 text-base font-semibold">Track record non ancora iniziato</p>
            <p className="mt-0.5 text-xs text-[var(--md-text-2)]">
              {trackRecordStart
                ? `La prima settimana valutata parte dal ${trackRecordStart}.`
                : "La prima settimana valutabile arriverà col primo Weekly Bias Record."}
            </p>
          </>
        ) : (
          <p className="mt-1 max-w-xl text-sm leading-relaxed">
            {overall.weeks} settimane per asset
            {trackRecordStart ? ` dal ${settimana(trackRecordStart)}` : ""}:{" "}
            <strong className="font-semibold">{overall.hits} azzeccate</strong>,{" "}
            <strong className="font-semibold">{overall.misses} sbagliate</strong>,{" "}
            {overall.nulls} senza informazione.
            {nessunaPubblicabile ? " Nessun hit rate è ancora pubblicabile." : ""}
          </p>
        )}
      </div>
      <div className="border-t py-2.5 sm:border-t-0 sm:border-l sm:px-4" style={{ borderColor: "var(--md-border)" }}>
        <PanelLabel>Campione · direzionali</PanelLabel>
        <p className="mt-0.5 text-base font-semibold">
          {dirValutate >= MIN_WEEKS_FOR_HIT_RATE
            ? `${dirValutate} valutate`
            : `${dirValutate} di ${MIN_WEEKS_FOR_HIT_RATE}`}
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--ml-track)" }}
          role="img"
          aria-label={`${dirValutate} settimane direzionali valutate su ${MIN_WEEKS_FOR_HIT_RATE} necessarie`}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (dirValutate / MIN_WEEKS_FOR_HIT_RATE) * 100)}%`,
              backgroundColor: "var(--md-text-2)",
            }}
          />
        </div>
        <p className="mt-1.5 text-xs text-[var(--md-muted)]">
          neutrali {neuValutate} di {MIN_WEEKS_FOR_HIT_RATE} · servono{" "}
          {MIN_WEEKS_FOR_HIT_RATE} settimane valutate per pubblicare
        </p>
      </div>
      <CellaReport freschezza={freschezza} />
    </div>
  );
}

/* ── consuntivo ───────────────────────────────────────────────────────── */

function RigaConsuntivo({
  etichetta,
  rows,
  calibrazione,
  totale = false,
}: {
  etichetta: string;
  rows: ResolvedWeek[];
  /** Solo per asset: la calibrazione complessiva non si calcola. */
  calibrazione?: string | null;
  totale?: boolean;
}) {
  const m = scorecardMetrics(rows);
  const { directional, neutral } = splitByBiasType(rows);
  return (
    <tr className={totale ? "ml-totale" : undefined}>
      <td className={cn("ml-sx", !totale && "font-semibold")}>{etichetta}</td>
      <td>{m.weeks}</td>
      <td className="ml-sep">{m.hits}</td>
      <td>{m.misses}</td>
      <td>{m.nulls}</td>
      <td>{m.invalidated}</td>
      <td>{m.branched}</td>
      <td className="ml-sep">
        <CellaHitRate rows={directional} />
      </td>
      <td>
        <CellaHitRate rows={neutral} />
      </td>
      <td className="ml-sep">
        {totale ? null : calibrazione === null || calibrazione === undefined ? (
          <Vuoto />
        ) : (
          formatNumber(calibrazione, { decimals: 2 })
        )}
      </td>
    </tr>
  );
}

function Consuntivo({
  weeks,
  eligibleReports,
  excludedReports,
  trackRecordStart,
}: {
  weeks: ResolvedWeek[];
  eligibleReports: number;
  excludedReports: number;
  trackRecordStart: string | null;
}) {
  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--ml-rule)" }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <PanelLabel>Consuntivo per asset</PanelLabel>
        <span className="text-xs text-[var(--md-muted)]">
          {eligibleReports} report idonei · {excludedReports} esclusi (legacy o non
          idonei){trackRecordStart ? ` · dal ${settimana(trackRecordStart)}` : ""}
        </span>
      </div>
      <Tab>
        <thead>
          <tr>
            <th className="ml-sx">Asset</th>
            <th>Settimane</th>
            <th className="ml-sep">Azzeccate</th>
            <th>Sbagliate</th>
            <th>Senza info</th>
            <th>Invalidate</th>
            <th>Ramo attivato</th>
            <th className="ml-sep">Hit rate direzionali</th>
            <th>Hit rate neutrali</th>
            <th className="ml-sep">Calibrazione</th>
          </tr>
        </thead>
        <tbody>
          {ASSET.map((asset) => {
            const rows = weeks.filter((w) => w.asset === asset);
            return (
              <RigaConsuntivo
                key={asset}
                etichetta={ASSET_LABELS[asset]}
                rows={rows}
                calibrazione={confidenceCalibration(rows)}
              />
            );
          })}
          <RigaConsuntivo etichetta="Complessivo" rows={weeks} totale />
        </tbody>
      </Tab>

      {/* LA SPIEGAZIONE, UNA VOLTA. Prima stava sotto ognuno dei tre asset. */}
      <details className="group/metodo mt-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-[var(--md-muted)] hover:text-[var(--md-text)]">
          <ChevronRight className="size-3.5 transition-transform group-open/metodo:rotate-90" aria-hidden />
          Metodo · due hit rate, cosa esce dal denominatore, la calibrazione
        </summary>
        <div className="mt-2 flex max-w-[80ch] flex-col gap-2 text-xs leading-relaxed text-[var(--md-text-2)]">
          <p>
            Il desk dichiara un bias con orizzonte settimanale: qui viene valutato
            sulla settimana, non giorno per giorno. Il metro è l&apos;Expected Move
            dell&apos;asset — una soglia in punti direbbe cose diverse su oro e
            petrolio, e cose diverse sullo stesso asset in settimane di volatilità
            diversa.
          </p>
          <p>
            «Senza informazione» = movimento sotto {formatNumber(K_HIT, { decimals: 1 })} EM: fuori dal
            denominatore insieme alle invalidate. Un ramo attivato non è un errore.
            Le hit rate sono separate perché le due regole hanno denominatori
            diversi (i neutrali non hanno la zona senza informazione): mai una
            percentuale unica. «X di {MIN_WEEKS_FOR_HIT_RATE}» sono le settimane
            valutate raccolte finora; la percentuale compare da{" "}
            {MIN_WEEKS_FOR_HIT_RATE}. La calibrazione è la correlazione fra
            confidenza dichiarata e risultato, sui soli bias direzionali.
          </p>
          <p>
            Circa 52 osservazioni all&apos;anno per asset: le percentuali si
            stabilizzano lentamente e sono pubblicate solo oltre un minimo di
            settimane valutate. I {excludedReports} report precedenti alla
            ripartenza restano in archivio ma fuori da questi conteggi.
          </p>
        </div>
      </details>
    </div>
  );
}

/* ── settimane ────────────────────────────────────────────────────────── */

function TabellaSettimane({ weeks }: { weeks: ResolvedWeek[] }) {
  /* Le più recenti in alto; dentro la settimana l'ordine degli asset resta. */
  const righe = weeks
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.weekStart.localeCompare(a.w.weekStart) || a.i - b.i)
    .map(({ w }) => w);

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--ml-rule)" }}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <PanelLabel>Settimane</PanelLabel>
        <span className="text-xs text-[var(--md-muted)]">
          {righe.length} righe · le più recenti in alto · EM = Expected Move
        </span>
      </div>
      <Tab>
        <thead>
          <tr>
            <th className="ml-sx">Settimana</th>
            <th className="ml-sx">Asset</th>
            <th className="ml-sx">Bias</th>
            <th>Conf.</th>
            <th className="ml-sep">Chiusura</th>
            <th>MFE</th>
            <th>MAE</th>
            <th className="ml-sx ml-sep">Esito</th>
            <th className="ml-sx">Note</th>
          </tr>
        </thead>
        <tbody>
          {righe.map((w) => (
            <tr key={`${w.weekStart}-${w.asset}`}>
              <td className="ml-sx">{settimana(w.weekStart)}</td>
              <td className="ml-sx">{ASSET_LABELS[w.asset]}</td>
              <td className="ml-sx">
                <Glifo tone={biasTone(w.bias)} /> {parolaBias(w.bias)}
              </td>
              <td>{w.confidence ?? <Vuoto />}</td>
              <td className="ml-sep font-semibold">
                <ValoreEm value={w.closeEm} />
              </td>
              <td>
                <ValoreEm value={w.mfeEm} />
              </td>
              <td>
                <ValoreEm value={w.maeEm} />
              </td>
              <td className={cn("ml-sx ml-sep", w.outcome !== "NULLO" && "font-semibold")}>
                {ESITO[w.outcome]}
              </td>
              {/* Larghezza minima: senza, a 390 la nota andava a capo a ogni
                  parola e la riga diventava alta come tre (misurato). */}
              <td className="ml-sx ml-wrap min-w-[16rem] text-[var(--md-text-2)]">
                {w.unresolvedReason && <span>{w.unresolvedReason}</span>}
                {w.branched && !w.unresolvedReason && (
                  <span>ramo attivato: il bias è proseguito</span>
                )}
                {w.invalidated && (
                  <span>
                    invalidata · risolta sul segmento vivo
                    {w.maeAtTriggerEm !== null &&
                      ` · avverso già passato ${formatNumber(w.maeAtTriggerEm, { decimals: 2, sign: true })} EM`}
                    {Math.abs(w.maeAtTriggerEm ?? 0) > 1 && " (trigger tardivo)"}
                    {w.counterfactual && ` · a venerdì sarebbe stata ${w.counterfactual}`}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Tab>
    </div>
  );
}

/**
 * DA DOVE VENGONO LE CHIUSURE, settimana per settimana — e dove il report
 * diceva un'altra cosa.
 *
 * Dal 27/08/2026 il percorso delle settimane nuove è calcolato sull'archivio e
 * non più letto dal report. Una scorecard che misura prezzi senza dire da dove
 * vengono chiede fiducia invece di darla.
 */
function ProvenienzaPercorsi({ percorsi }: { percorsi: PercorsoRicalcolato[] }) {
  if (percorsi.length === 0) return null;

  const fonti = new Map<string, Set<string>>();
  for (const p of percorsi) {
    const insieme = fonti.get(p.fonte) ?? new Set<string>();
    insieme.add(ASSET_LABELS[p.asset] ?? p.asset);
    fonti.set(p.fonte, insieme);
  }
  const conDiscrepanze = percorsi.filter((p) => p.discrepanze.length > 0);

  return (
    <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--ml-rule)" }}>
      <PanelLabel>Da dove vengono le chiusure</PanelLabel>
      <ul className="flex flex-col gap-1">
        {[...fonti.entries()].map(([fonte, assets]) => (
          <li key={fonte} className="text-xs text-[var(--md-text-2)]">
            <span className="font-semibold text-[var(--md-text)]">
              {[...assets].sort().join(" · ")}
            </span>{" "}
            — {fonte}
          </li>
        ))}
      </ul>
      <p className="max-w-[80ch] text-xs leading-relaxed text-[var(--md-muted)]">
        Il percorso di queste settimane è calcolato sull&apos;archivio
        giornaliero, non letto dal report. Restano invece dichiarati dal report lo{" "}
        <em>stato</em> del bias e l&apos;armamento delle invalidazioni: le loro
        condizioni sono scritte in prosa, e valutarle richiederebbe di indovinare.
        Le settimane precedenti al {PRIMA_SETTIMANA_CALCOLATA} conservano il
        percorso che avevano.
      </p>

      {conDiscrepanze.length > 0 ? (
        <div className="flex max-w-[80ch] flex-col gap-1 rounded-md bg-[var(--md-surface-2)] px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--md-text)]">
            <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-warning" />
            Dove il report diceva un&apos;altra cosa
          </p>
          {conDiscrepanze.map((p) =>
            p.discrepanze.map((d) => (
              <p
                key={`${p.weekStart}-${p.asset}-${d.giorno}`}
                className="text-xs text-[var(--md-text-2)]"
              >
                {d.giorno} {ASSET_LABELS[p.asset] ?? p.asset}: archivio{" "}
                <span className="font-semibold text-[var(--md-text)]">
                  {prezzo(d.pxArchivio)}
                </span>
                , report {prezzo(d.pxReport)} — {prezzo(d.scartoEm)} EM di scarto. La
                Scorecard usa il primo.
              </p>
            )),
          )}
          <p className="text-xs text-[var(--md-muted)]">
            Si mostrano gli scarti oltre{" "}
            {formatNumber(SOGLIA_DISCREPANZA_EM, { decimals: 2 })} EM, metà della
            soglia con cui una settimana viene giudicata: sotto quella misura due
            fonti che non coincidono al centesimo non cambiano una lettura.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ScorecardEmView({
  weeks,
  eligibleReports,
  excludedReports,
  trackRecordStart,
  percorsiRicalcolati,
  freschezza = null,
}: {
  weeks: ResolvedWeek[];
  eligibleReports: number;
  excludedReports: number;
  trackRecordStart: string | null;
  /** Settimane col percorso calcolato dall'archivio: fonte e discrepanze. */
  percorsiRicalcolati: PercorsoRicalcolato[];
  /** Età del report giornaliero da cui la Scorecard legge. */
  freschezza?: FreschezzaReport | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <StrisciaStato weeks={weeks} trackRecordStart={trackRecordStart} freschezza={freschezza} />
        <p className="mt-2 max-w-[100ch] text-xs leading-relaxed text-[var(--md-muted)]">
          Azzeccata: chiusura oltre {formatNumber(K_HIT, { decimals: 1 })} EM nel
          verso del bias · Sbagliata: oltre {formatNumber(K_HIT, { decimals: 1 })} EM
          contro · In mezzo: senza informazione, fuori dal denominatore. Un bias
          neutrale è azzeccato solo se chiude piatto <em>e</em> non ha mai superato{" "}
          {formatNumber(K_BREAK, { decimals: 0 })} EM di escursione.
        </p>
      </div>

      {weeks.length === 0 ? (
        /* La frase parla di report ESCLUSI: con zero esclusi non ha oggetto. */
        excludedReports > 0 ? (
          <p className="text-xs text-[var(--md-muted)]">
            {excludedReports} report storici restano in archivio ma fuori dai
            conteggi: prodotti con una metodologia diversa (valutazione giornaliera
            close-to-close), non sono confrontabili con questi.
          </p>
        ) : null
      ) : (
        <>
          <Consuntivo
            weeks={weeks}
            eligibleReports={eligibleReports}
            excludedReports={excludedReports}
            trackRecordStart={trackRecordStart}
          />
          <TabellaSettimane weeks={weeks} />
          <ProvenienzaPercorsi percorsi={percorsiRicalcolati} />
        </>
      )}
    </div>
  );
}
