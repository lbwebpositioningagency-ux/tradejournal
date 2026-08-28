import Link from "next/link";
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
  type MacroHorizon,
  type MacroNews,
  type MacroNewsCategory,
  type MacroPayload,
  type MacroTone,
} from "@/lib/macro-desk-payload";
import {
  letturaConfidenza,
  unanimitaControBiasNeutro,
  SEGNO_LABEL,
  type MonitorConfidenza,
} from "@/lib/macro-desk-confidenza";
import { quandoNews } from "@/lib/macro-desk-news-quando";
import { cn } from "@/lib/utils";
import {
  Callout,
  MonoChip,
  PanelLabel,
  SectionEmpty,
  TONE_COLOR,
  ToneArrow,
} from "./primitives";

/**
 * I DUE tab del dettaglio report Macro Desk — «Asset» e «News». Componenti
 * PURI (nessuno stato): lo stato del tab attivo vive nella shell client, qui
 * solo resa dei dati. Ogni sezione degrada con eleganza se il payload non la
 * contiene.
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
        <div
          key={i}
          className="flex items-start gap-2.5 rounded-[var(--md-r-md)] border px-3.5 py-2.5 text-xs leading-relaxed"
          style={{
            borderColor: "var(--md-border)",
            backgroundColor: "var(--md-surface)",
          }}
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            style={{ color: issueColor(issue.sev) }}
            aria-hidden
          />
          <span className="text-[var(--md-text-2)]">
            {issue.sev ? (
              <span
                className="md-mono mr-1.5 uppercase"
                style={{ color: issueColor(issue.sev) }}
              >
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

/** Glifo direzionale del bias: leggibile anche dove il colore non arriva. */
const BIAS_GLIFO: Record<MacroTone, string> = { up: "▲", down: "▼", flat: "●" };

/**
 * STRISCIA DEI PILASTRI — il protagonista della card, al posto del vecchio
 * termometro semicircolare.
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
function StrisciaPilastri({ horizon }: { horizon: MacroHorizon }) {
  if (horizon.pillars.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {horizon.pillars.map((pillar) => {
        const tone = dirTone(pillar.dir);
        const muted = tone === "flat";
        const colore = muted ? "var(--md-muted)" : TONE_COLOR[tone];
        return (
          <div
            key={pillar.k}
            className="flex flex-col rounded-[var(--md-r-sm)] border p-2.5"
            style={{
              borderColor: "var(--md-border)",
              backgroundColor: "var(--md-surface)",
              borderTopColor: muted ? "var(--md-border)" : colore,
              borderTopWidth: 2,
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold leading-snug text-[var(--md-text)]">
                {pillar.k}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <ToneArrow tone={tone} muted={muted} />
                <span className="md-mono text-2xs leading-none" style={{ color: colore }}>
                  {SEGNO_LABEL[tone]}
                </span>
              </span>
            </div>
            {pillar.note ? (
              <p className="mt-1.5 text-2xs leading-relaxed text-[var(--md-muted)]">
                {pillar.note}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
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
  horizon,
  monitor,
}: {
  horizon: MacroHorizon;
  monitor?: MonitorConfidenza;
}) {
  const lettura = letturaConfidenza(horizon, monitor);
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
          <>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-2xs text-[var(--md-muted)]">
                impegno di domenica
              </span>
              <Punteggio valore={impegno} fascia={fasciaImpegno} />
              <span className="text-[var(--md-muted)]" aria-hidden>
                →
              </span>
              <span className="text-2xs text-[var(--md-muted)]">lettura di oggi</span>
              <Punteggio valore={oggi} fascia={fasciaOggi!} forte />
              <span
                className="md-mono rounded-[var(--md-r-sm)] px-1.5 py-0.5 text-2xs font-bold"
                style={{
                  color: delta! > 0 ? "var(--md-up)" : "var(--md-down)",
                  backgroundColor: "var(--md-surface-3)",
                }}
              >
                {delta! > 0 ? "+" : "−"}
                {Math.abs(delta!)}
              </span>
            </p>
            {/* La riga che impedisce la lettura sbagliata: senza, il secondo
                numero sembra la correzione di un errore nel primo. */}
            <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
              Due misure, non una corretta e una sbagliata: l&apos;impegno è
              dichiarato la domenica e resta fermo tutta la settimana, la
              lettura di oggi dice quanto il desk si fida di quel bias adesso.
            </p>
          </>
        )}
      </div>

      {/* LO SCOSTAMENTO NON MOTIVATO. Dal 28/08/2026 il report deve dichiarare
          il perché di ogni scarto fra impegno e lettura di oggi: se non lo fa,
          la card lo dice invece di far finta di niente. Nasconderlo sarebbe
          esattamente il difetto del 18/08 — un errore invisibile perché la
          pagina non lo espone. Tono da constatazione, non da accusa: chi legge
          deve sapere che manca qualcosa, non sentirsi rimproverare. */}
      {scostamentoNonMotivato ? (
        <div
          className="rounded-[var(--md-r-sm)] py-1.5 pl-2.5"
          style={{ borderLeft: "2px solid var(--md-down)" }}
        >
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

      {motivi.length > 0 ? (
      <div
        className="rounded-[var(--md-r-sm)] py-1.5 pl-2.5"
        style={{ borderLeft: "2px solid var(--md-warn)" }}
      >
        <p
          className="text-2xs font-semibold uppercase tracking-[0.12em]"
          style={{ color: "var(--md-warn)" }}
        >
          {stimato ? "Motivo riconosciuto nel testo" : "Motivo dichiarato"}
        </p>
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
          <p className="mt-1.5 text-[10px] leading-tight text-[var(--md-muted)]">
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
    <p
      className="rounded-[var(--md-r-sm)] border px-3 py-2 text-xs leading-relaxed text-[var(--md-text-2)]"
      style={{ borderColor: "var(--md-border)", backgroundColor: "var(--md-surface-2)" }}
    >
      <span className="md-mono mr-1.5 text-2xs uppercase tracking-wider text-[var(--md-muted)]">
        Da notare
      </span>
      {u.conSegno} pilastri su {u.totale} hanno un segno, e puntano tutti al{" "}
      {u.verso === "up" ? "rialzo" : "ribasso"}; il bias dichiarato resta
      NEUTRALE. La direzione dichiarata non segue la somma dei pilastri.
    </p>
  );
}

/** La lettura SETTIMANALE: il blocco principale della card. */
function LetturaSettimanale({
  horizon,
  natura,
  monitor,
}: {
  horizon: MacroHorizon;
  natura: NaturaBias;
  monitor?: MonitorConfidenza;
}) {
  const tone = biasTone(horizon.biasLabel, horizon.bias);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>Settimanale</PanelLabel>
        <span className="text-2xs text-[var(--md-muted)]">{NATURA_TESTO[natura]}</span>
      </div>

      {horizon.biasLabel ? (
        <p className="flex items-baseline gap-2">
          <span className="md-mono text-lg leading-none" style={{ color: TONE_COLOR[tone] }} aria-hidden>
            {BIAS_GLIFO[tone]}
          </span>
          <span
            className="md-mono text-2xl font-extrabold tracking-tight"
            style={{ color: TONE_COLOR[tone] }}
          >
            {horizon.biasLabel}
          </span>
        </p>
      ) : (
        <p className="text-sm text-[var(--md-muted)]">Bias settimanale non dichiarato.</p>
      )}

      <StrisciaPilastri horizon={horizon} />
      <NotaUnanimita horizon={horizon} />
      <BloccoConfidenza horizon={horizon} monitor={monitor} />

      {horizon.edge ? (
        <Callout label="Edge" color="var(--md-info)">
          {horizon.edge}
        </Callout>
      ) : null}
      {horizon.invalid ? (
        <Callout label="Invalidazione" color="var(--md-warn)">
          {horizon.invalid}
        </Callout>
      ) : null}
      {horizon.narrative ? (
        <div>
          <PanelLabel>Narrativa</PanelLabel>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--md-text-2)]">
            {horizon.narrative}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * La lettura TRIMESTRALE: regime di fondo, visivamente subordinata a quella
 * settimanale — fondo diverso, tipografia più piccola, `since` in evidenza.
 * Nei report reali non porta mai pilastri né edge: bias, confidenza, `since`,
 * invalidazione e narrativa.
 *
 * La regola del silenzio vale ANCHE qui, con la stessa precedenza stretta:
 * `quarterly.confMotivo` dichiarato dal generatore (dal 28/08/2026), poi
 * l'euristica, poi niente. Sui 23 report storici resterà sempre niente, ed è
 * il risultato giusto: nessuno di quei numeri trimestrali è mai stato
 * motivato, e la confidenza trimestrale ha dev.std 5,46 su 69 osservazioni —
 * ancora meno informativa di quella settimanale.
 */
function LetturaTrimestrale({ horizon }: { horizon: MacroHorizon }) {
  const tone = biasTone(horizon.biasLabel, horizon.bias);
  const conf = letturaConfidenza(horizon);
  return (
    <div className="md-card-2 flex flex-col gap-2.5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PanelLabel>Trimestrale · regime di fondo</PanelLabel>
        {horizon.since ? <MonoChip>invariato dal {horizon.since}</MonoChip> : null}
      </div>

      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="md-mono text-sm leading-none" style={{ color: TONE_COLOR[tone] }} aria-hidden>
          {BIAS_GLIFO[tone]}
        </span>
        <span className="md-mono text-base font-bold" style={{ color: TONE_COLOR[tone] }}>
          {horizon.biasLabel ?? "non dichiarato"}
        </span>
        {conf ? (
          <span className="md-mono text-2xs text-[var(--md-muted)]">
            confidenza {conf.impegno}/100 · {conf.fasciaImpegno}
          </span>
        ) : null}
      </p>

      {conf ? (
        <p className="text-2xs leading-relaxed text-[var(--md-text-2)]">
          <span
            className="font-semibold uppercase tracking-wider"
            style={{ color: "var(--md-warn)" }}
          >
            {conf.motivi[0].fonte === "estratto"
              ? "Motivo riconosciuto nel testo · "
              : "Motivo dichiarato · "}
          </span>
          «{conf.motivi[0].testo}»
        </p>
      ) : null}

      {horizon.narrative ? (
        <p className="text-xs leading-relaxed text-[var(--md-text-2)]">
          {horizon.narrative}
        </p>
      ) : null}
      {horizon.invalid ? (
        <p className="text-2xs leading-relaxed text-[var(--md-muted)]">
          <span className="font-semibold uppercase tracking-wider" style={{ color: "var(--md-warn)" }}>
            Invalidazione ·{" "}
          </span>
          {horizon.invalid}
        </p>
      ) : null}
    </div>
  );
}

function CardAsset({
  asset,
  index,
  natura,
  monitor,
}: {
  asset: MacroAsset;
  index: number;
  natura: NaturaBias;
  monitor?: MonitorConfidenza;
}) {
  const accent = assetAccentVar(asset.id ?? asset.ticker);
  return (
    <div className="md-card md-fade overflow-hidden" style={fade(index)}>
      <div className="h-[3px]" style={{ backgroundColor: accent }} />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          {asset.icon ? (
            <span className="text-xl" aria-hidden>
              {asset.icon}
            </span>
          ) : null}
          <h3 className="text-base font-bold">{asset.name ?? "Asset"}</h3>
          {asset.ticker ? (
            <span className="md-mono text-xs" style={{ color: accent }}>
              {asset.ticker}
            </span>
          ) : null}
        </div>

        {asset.weekly ? (
          <LetturaSettimanale
            horizon={asset.weekly}
            natura={natura}
            monitor={monitor}
          />
        ) : null}
        {asset.quarterly ? <LetturaTrimestrale horizon={asset.quarterly} /> : null}
        {!asset.weekly && !asset.quarterly ? (
          <p className="text-sm text-[var(--md-muted)]">
            Nessuna lettura dichiarata per questo asset.
          </p>
        ) : null}

        {asset.drivers.length > 0 ? (
          <div>
            <PanelLabel>Driver</PanelLabel>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {asset.drivers.map((driver) => {
                const dTone = dirTone(driver.cls);
                return (
                  <div
                    key={driver.k}
                    className="md-card-2 md-card-hover flex flex-col gap-1 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs text-[var(--md-muted)]">{driver.k}</span>
                      {driver.hz ? (
                        <MonoChip title="Orizzonte del driver: W settimanale, Q trimestrale">
                          {driver.hz}
                        </MonoChip>
                      ) : null}
                    </div>
                    <span
                      className="md-mono text-sm font-semibold"
                      style={{
                        color: driver.cls === "fl" ? "var(--md-text-2)" : TONE_COLOR[dTone],
                      }}
                    >
                      {driver.v ?? "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
  const { assets, synthesis, volPanel } = payload;
  const pills = synthesis?.pills ?? [];
  // I critici li rende la shell in testa alla pagina: qui restano gli altri.
  const riserve = payload.dataIssues.filter((issue) => !isCriticalIssue(issue.sev));

  return (
    <div className="flex flex-col gap-5">
      {/* ── TESTA: il quadro condiviso dai tre asset ────────────────────── */}
      {pills.length > 0 ? (
        <div className="md-fade flex flex-col gap-2" style={fade(0)}>
          <PanelLabel>Il quadro, comune ai tre asset</PanelLabel>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {pills.map((pill) => (
              <div key={pill.k} className="md-card-2 px-3.5 py-2.5">
                <PanelLabel>{pill.k}</PanelLabel>
                <p className="mt-1 text-sm font-medium text-[var(--md-text)]">
                  {pill.v ?? "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {synthesis?.conclusion ? (
        <div
          className="md-card md-fade p-5"
          style={{
            ...fade(1),
            borderColor: "color-mix(in oklab, var(--md-info) 35%, var(--md-border))",
          }}
        >
          <PanelLabel>Verdetto</PanelLabel>
          <p className="mt-2 text-base font-medium leading-relaxed text-[var(--md-text)]">
            {synthesis.conclusion}
          </p>
        </div>
      ) : null}

      {/* ── CORPO: le letture per asset ─────────────────────────────────── */}
      {assets.length > 0 ? (
        assets.map((asset, i) => (
          <CardAsset
            key={asset.id ?? i}
            asset={asset}
            index={i + 2}
            natura={natura}
            monitor={asset.id ? monitor?.[asset.id] : undefined}
          />
        ))
      ) : (
        <SectionEmpty what="Analisi per asset" />
      )}

      {/* ── CODA: cosa può rompere la lettura ───────────────────────────── */}
      {synthesis?.risks ? (
        <div className="md-fade" style={fade(5)}>
          <Callout label="Radar rischi" color="var(--md-warn)" className="md-card p-5">
            <InlineHtml html={synthesis.risks} />
          </Callout>
        </div>
      ) : null}

      {volPanel?.reading ? (
        <div className="md-fade" style={fade(6)}>
          <Callout
            label="Lettura della struttura vol"
            color="var(--md-info)"
            className="md-card p-5"
          >
            {volPanel.reading}
            {volPanel.asOf ? (
              <span className="md-mono mt-2 block text-xs text-[var(--md-muted)]">
                {volPanel.asOf}
              </span>
            ) : null}
            {/* I NUMERI stanno nella sezione Volatilità, con il rango storico
                dall'archivio CBOE: qui c'è solo la prosa del report. */}
            <Link
              href="/macro-desk/volatilita"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--md-info)] underline-offset-2 hover:underline"
            >
              Indici e rango storico nella sezione Volatilità
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Callout>
        </div>
      ) : null}

      {riserve.length > 0 ? (
        <details className="md-card md-fade p-4" style={fade(7)}>
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

function NewsCard({
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
