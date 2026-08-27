import { ASSET_LABELS, type ScorecardAsset } from "@/lib/macro-desk-scorecard";
import {
  K_BREAK,
  K_HIT,
  confidenceCalibration,
  scorecardMetrics,
  type ResolvedWeek,
} from "@/lib/macro-desk-scorecard-em";
import {
  PRIMA_SETTIMANA_CALCOLATA,
  SOGLIA_DISCREPANZA_EM,
} from "@/lib/percorso-impegno";
import type { PercorsoRicalcolato } from "@/lib/queries/macro-scorecard-em";
import { PanelLabel } from "./primitives";

/**
 * Vista della scorecard a Expected Move. Componente SERVER puramente
 * presentazionale: riceve le settimane già risolte e non calcola esiti.
 *
 * Regola di lettura applicata ovunque: **ogni percentuale sta accanto al
 * numero di osservazioni**. Con ~52 settimane all'anno per asset, una
 * percentuale senza denominatore darebbe un'impressione di solidità che il
 * campione non ha.
 */

const OUTCOME_TONE: Record<string, string> = {
  HIT: "var(--md-up)",
  MISS: "var(--md-down)",
  NULLO: "var(--md-muted)",
};

function pct(fraction: string | null): string {
  if (fraction === null) return "—";
  return `${(Number(fraction) * 100).toFixed(1).replace(".", ",")}%`;
}

/** Prezzo all'italiana, due decimali: le chiusure si leggono a colpo d'occhio. */
function prezzo(value: number): string {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // Il CLDR italiano non raggruppa a quattro cifre (4526, non 4.526): qui
    // sono prezzi e il separatore serve sempre.
    useGrouping: "always",
  });
}

function em(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2).replace(".", ",")} EM`;
}

/**
 * Q-08 — hit-rate PUBBLICATE SEPARATE per bias direzionali e neutrali: le
 * due regole hanno denominatori diversi (i direzionali scartano la zona
 * NULLO, i neutrali sono sempre valutati), quindi un'unica percentuale si
 * muoverebbe col mix dei bias dichiarati, non con la bravura.
 */
function splitByBiasType(rows: ResolvedWeek[]) {
  return {
    directional: rows.filter((w) => w.bias !== "NEUTRALE"),
    neutral: rows.filter((w) => w.bias === "NEUTRALE"),
  };
}

function HitRateLine({
  label,
  rows,
}: {
  label: string;
  rows: ResolvedWeek[];
}) {
  const m = scorecardMetrics(rows);
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xs" style={{ color: "var(--md-muted)" }}>
        {label}
      </span>
      {m.hitRate !== null ? (
        <>
          <span className="md-mono text-lg font-bold">{pct(m.hitRate)}</span>
          <span className="text-2xs" style={{ color: "var(--md-muted)" }}>
            su {m.hits + m.misses} valutate
          </span>
        </>
      ) : (
        <span className="text-2xs" style={{ color: "var(--md-warn)" }}>
          {m.hitRateSuppressedReason}
        </span>
      )}
    </div>
  );
}

function AssetBlock({
  asset,
  weeks,
}: {
  asset: ScorecardAsset;
  weeks: ResolvedWeek[];
}) {
  const rows = weeks.filter((w) => w.asset === asset);
  const m = scorecardMetrics(rows);
  const { directional, neutral } = splitByBiasType(rows);
  // Q-07 — calibrazione sui soli direzionali (il filtro sta nella funzione;
  // qui si passa tutto e si dichiara in nota).
  const calibration = confidenceCalibration(rows);

  return (
    <div className="md-card-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{ASSET_LABELS[asset]}</h3>
        <span className="md-mono text-2xs" style={{ color: "var(--md-muted)" }}>
          {m.weeks} {m.weeks === 1 ? "settimana" : "settimane"}
        </span>
      </div>

      {/* Q-08 — due percentuali, mai una sola: denominatori diversi. */}
      <div className="mt-2 flex flex-col gap-1">
        <HitRateLine label="Direzionali" rows={directional} />
        <HitRateLine label="Neutrali" rows={neutral} />
      </div>

      {/* I conteggi grezzi restano SEMPRE visibili, anche quando la
          percentuale è soppressa: il dato non si nasconde, si contestualizza. */}
      <dl className="mt-3 flex flex-col gap-1 text-2xs">
        <Row label="Azzeccate" value={m.hits} tone="var(--md-up)" />
        <Row label="Sbagliate" value={m.misses} tone="var(--md-down)" />
        <Row label="Senza informazione" value={m.nulls} tone="var(--md-muted)" />
        <Row label="Invalidate" value={m.invalidated} tone="var(--md-warn)" />
        <Row label="Con ramo attivato" value={m.branched} tone="var(--md-info)" />
        <Row
          label="Calibrazione"
          value={
            calibration === null
              ? "—"
              : Number(calibration).toFixed(2).replace(".", ",")
          }
          tone="var(--md-text-2)"
        />
      </dl>
      <p className="mt-2 text-2xs leading-relaxed" style={{ color: "var(--md-muted)" }}>
        «Senza informazione» = movimento sotto {K_HIT} EM: fuori dal
        denominatore insieme alle invalidate. Un ramo attivato non è un errore.
        Le hit-rate sono separate perché le due regole hanno denominatori
        diversi (i neutrali non hanno la zona senza informazione). La
        calibrazione è la correlazione fra confidenza dichiarata e risultato,
        sui soli bias direzionali.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt style={{ color: "var(--md-muted)" }}>{label}</dt>
      <dd className="md-mono font-semibold" style={{ color: tone }}>
        {value}
      </dd>
    </div>
  );
}

/**
 * DA DOVE VENGONO LE CHIUSURE, settimana per settimana — e dove il report
 * diceva un'altra cosa.
 *
 * Dal 27/08/2026 il percorso delle settimane nuove è calcolato sull'archivio
 * e non più letto dal report. Una scorecard che misura prezzi senza dire da
 * dove vengono chiede fiducia invece di darla: qui c'è la serie usata, per
 * ogni asset, e l'elenco dei punti in cui il report dichiarava un prezzo
 * abbastanza diverso da spostare la lettura.
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
    <div className="md-card-2 mt-4 flex flex-col gap-2 p-4">
      <PanelLabel>Da dove vengono le chiusure</PanelLabel>
      <ul className="flex flex-col gap-1">
        {[...fonti.entries()].map(([fonte, assets]) => (
          <li key={fonte} className="text-2xs" style={{ color: "var(--md-text-2)" }}>
            <span className="md-mono font-semibold">
              {[...assets].sort().join(" · ")}
            </span>{" "}
            — {fonte}
          </li>
        ))}
      </ul>
      <p className="text-2xs" style={{ color: "var(--md-muted)" }}>
        Il percorso di queste settimane è calcolato sull&apos;archivio
        giornaliero, non letto dal report. Restano invece dichiarati dal report
        lo <em>stato</em> del bias e l&apos;armamento delle invalidazioni: le
        loro condizioni sono scritte in prosa, e valutarle richiederebbe di
        indovinare. Le settimane precedenti al {PRIMA_SETTIMANA_CALCOLATA}{" "}
        conservano il percorso che avevano.
      </p>

      {conDiscrepanze.length > 0 ? (
        <div
          className="mt-1 flex flex-col gap-1 border-t pt-2"
          style={{ borderColor: "var(--md-border)" }}
        >
          <span
            className="md-mono text-2xs font-semibold"
            style={{ color: "var(--md-warn)" }}
          >
            Dove il report diceva un&apos;altra cosa
          </span>
          {conDiscrepanze.map((p) =>
            p.discrepanze.map((d) => (
              <p
                key={`${p.weekStart}-${p.asset}-${d.giorno}`}
                className="text-2xs"
                style={{ color: "var(--md-text-2)" }}
              >
                <span className="md-mono">{d.giorno}</span>{" "}
                {ASSET_LABELS[p.asset] ?? p.asset}: archivio{" "}
                <span className="md-mono font-semibold">
                  {prezzo(d.pxArchivio)}
                </span>
                , report{" "}
                <span className="md-mono">{prezzo(d.pxReport)}</span> —{" "}
                <span className="md-mono">{prezzo(d.scartoEm)} EM</span> di
                scarto. La Scorecard usa il primo.
              </p>
            )),
          )}
          <p className="text-2xs" style={{ color: "var(--md-muted)" }}>
            Si mostrano gli scarti oltre{" "}
            {SOGLIA_DISCREPANZA_EM.toFixed(2).replace(".", ",")} EM, metà della
            soglia con cui una settimana viene giudicata: sotto quella misura
            due fonti che non coincidono al centesimo non cambiano una lettura.
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
}: {
  weeks: ResolvedWeek[];
  eligibleReports: number;
  excludedReports: number;
  trackRecordStart: string | null;
  /** Settimane col percorso calcolato dall'archivio: fonte e discrepanze. */
  percorsiRicalcolati: PercorsoRicalcolato[];
}) {
  const overall = scorecardMetrics(weeks);
  const overallSplit = splitByBiasType(weeks);

  return (
    <div className="p-4 sm:p-6">
      <div className="md-fade">
        <h2 className="text-base font-semibold">
          Track record settimanale in Expected Move
        </h2>
        <p className="mt-1 text-xs" style={{ color: "var(--md-text-2)" }}>
          Il desk dichiara un bias con orizzonte settimanale: qui viene valutato
          sulla settimana, non giorno per giorno. Il metro è l&apos;Expected
          Move dell&apos;asset — una soglia in punti direbbe cose diverse su oro
          e petrolio, e cose diverse sullo stesso asset in settimane di
          volatilità diversa.
        </p>
        <p className="mt-2 text-2xs" style={{ color: "var(--md-muted)" }}>
          Azzeccata: chiusura oltre {K_HIT} EM nel verso del bias · Sbagliata:
          oltre {K_HIT} EM contro · In mezzo: settimana senza informazione,
          fuori dal denominatore. Un bias neutrale è azzeccato solo se chiude
          piatto <em>e</em> non ha mai superato {K_BREAK} EM di escursione.
        </p>
      </div>

      {weeks.length === 0 ? (
        <div className="md-card-2 mt-4 p-6 text-center">
          <p className="text-sm font-medium">Track record non ancora iniziato</p>
          <p className="mt-1 text-xs" style={{ color: "var(--md-text-2)" }}>
            {trackRecordStart
              ? `La prima settimana valutata parte dal ${trackRecordStart}.`
              : "La prima settimana valutabile arriverà col primo Weekly Bias Record."}
          </p>
          <p className="mt-3 text-2xs" style={{ color: "var(--md-muted)" }}>
            {excludedReports} report storici restano in archivio ma fuori dai
            conteggi: prodotti con una metodologia diversa (valutazione
            giornaliera close-to-close), non sono confrontabili con questi.
          </p>
        </div>
      ) : (
        <>
          <div className="md-card-2 mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 p-4">
            <div>
              <div className="text-2xs" style={{ color: "var(--md-muted)" }}>
                Complessivo (per tipo di bias: denominatori diversi, mai una
                percentuale unica)
              </div>
              <div className="mt-1 flex flex-col gap-1">
                <HitRateLine label="Direzionali" rows={overallSplit.directional} />
                <HitRateLine label="Neutrali" rows={overallSplit.neutral} />
              </div>
            </div>
            <div className="text-2xs" style={{ color: "var(--md-muted)" }}>
              {overall.weeks} righe · {eligibleReports} report idonei ·{" "}
              {excludedReports} esclusi (legacy o non idonei)
              {trackRecordStart && ` · dal ${trackRecordStart}`}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(["xau", "wti", "idx"] as const).map((asset) => (
              <AssetBlock key={asset} asset={asset} weeks={weeks} />
            ))}
          </div>

          <h3 className="mt-6 text-sm font-semibold">Settimane</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr
                  className="text-left text-2xs"
                  style={{ color: "var(--md-muted)" }}
                >
                  <th className="py-2 pr-3 font-medium">Settimana</th>
                  <th className="py-2 pr-3 font-medium">Asset</th>
                  <th className="py-2 pr-3 font-medium">Bias</th>
                  <th className="py-2 pr-3 text-right font-medium">Conf.</th>
                  <th className="py-2 pr-3 text-right font-medium">Chiusura</th>
                  <th className="py-2 pr-3 text-right font-medium">MFE / MAE</th>
                  <th className="py-2 pr-3 font-medium">Esito</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr
                    key={`${w.weekStart}-${w.asset}`}
                    style={{ borderTop: "1px solid var(--md-border)" }}
                  >
                    <td className="md-mono whitespace-nowrap py-2 pr-3">{w.weekStart}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{ASSET_LABELS[w.asset]}</td>
                    <td className="py-2 pr-3">{w.bias}</td>
                    <td className="md-mono py-2 pr-3 text-right">
                      {w.confidence ?? "—"}
                    </td>
                    <td className="md-mono whitespace-nowrap py-2 pr-3 text-right">
                      {em(w.closeEm)}
                    </td>
                    <td
                      className="md-mono whitespace-nowrap py-2 pr-3 text-right"
                      style={{ color: "var(--md-muted)" }}
                    >
                      {em(w.mfeEm)} / {em(w.maeEm)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className="font-semibold"
                        style={{ color: OUTCOME_TONE[w.outcome] }}
                      >
                        {w.outcome}
                      </span>
                    </td>
                    <td className="py-2" style={{ color: "var(--md-muted)" }}>
                      {w.unresolvedReason && <span>{w.unresolvedReason}</span>}
                      {w.branched && !w.unresolvedReason && (
                        <span style={{ color: "var(--md-info)" }}>
                          ramo attivato: il bias è proseguito
                        </span>
                      )}
                      {w.invalidated && (
                        <span style={{ color: "var(--md-warn)" }}>
                          invalidata · risolta sul segmento vivo
                          {w.maeAtTriggerEm !== null &&
                            ` · avverso già passato ${em(w.maeAtTriggerEm)}`}
                          {Math.abs(w.maeAtTriggerEm ?? 0) > 1 &&
                            " (trigger tardivo)"}
                          {w.counterfactual &&
                            ` · a venerdì sarebbe stata ${w.counterfactual}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ProvenienzaPercorsi percorsi={percorsiRicalcolati} />

          <p className="mt-4 text-2xs" style={{ color: "var(--md-muted)" }}>
            Circa 52 osservazioni all&apos;anno per asset: le percentuali si
            stabilizzano lentamente e sono pubblicate solo oltre un minimo di
            settimane valutate. I {excludedReports} report precedenti alla
            ripartenza restano in archivio ma fuori da questi conteggi.
          </p>
        </>
      )}
    </div>
  );
}
