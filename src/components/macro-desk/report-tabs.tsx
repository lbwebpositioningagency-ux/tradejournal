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
  ragioniDelTaglio,
  unanimitaControBiasNeutro,
  SEGNO_LABEL,
} from "@/lib/macro-desk-confidenza";
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

/**
 * La confidenza, in secondo piano — e accanto la RAGIONE del taglio quando
 * il desk la dichiara.
 *
 * Niente barra: una barra che su tutti i report reali resta fra il 41% e il
 * 65% del suo binario suggerisce una variabilità che non c'è. Resta il
 * numero, con la scala dichiarata.
 *
 * `confLabel` NON si mostra più: non è funzione di `confidence` (51 valeva
 * «Bassa» il 27/08 e «Media» il 28/08 sullo stesso asset). Tornerà quando il
 * generatore definirà le fasce.
 */
function BloccoConfidenza({ horizon }: { horizon: MacroHorizon }) {
  if (horizon.confidence === undefined) return null;
  const conf = Math.max(0, Math.min(100, horizon.confidence));
  const ragioni = ragioniDelTaglio(horizon);
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--md-muted)]">
          Confidenza
        </span>
        <span className="md-mono text-sm font-bold text-[var(--md-text-2)]">
          {conf}/100
        </span>
        <span className="text-2xs text-[var(--md-muted)]">
          dichiarata dal report: quanto si fida della propria lettura, non una
          probabilità
        </span>
      </p>

      {ragioni.length > 0 ? (
        <div
          className="rounded-[var(--md-r-sm)] py-1.5 pl-2.5"
          style={{ borderLeft: "2px solid var(--md-warn)" }}
        >
          <p
            className="text-2xs font-semibold uppercase tracking-[0.12em]"
            style={{ color: "var(--md-warn)" }}
          >
            Motivo dichiarato del taglio
          </p>
          {ragioni.slice(0, 2).map((ragione) => (
            <p
              key={ragione.pilastro}
              className="mt-1 text-xs leading-relaxed text-[var(--md-text-2)]"
            >
              <span className="md-mono text-2xs text-[var(--md-muted)]">
                {ragione.pilastro} ·{" "}
              </span>
              «{ragione.frase}»
            </p>
          ))}
          {/* L'euristica va DICHIARATA: il payload non ha un campo per questo. */}
          <p className="mt-1.5 text-[10px] leading-tight text-[var(--md-muted)]">
            Frase riconosciuta nella nota del pilastro. Il report non ha un
            campo dedicato: quando non la si riconosce, resta il solo numero.
          </p>
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
}: {
  horizon: MacroHorizon;
  natura: NaturaBias;
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
      <BloccoConfidenza horizon={horizon} />

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
 */
function LetturaTrimestrale({ horizon }: { horizon: MacroHorizon }) {
  const tone = biasTone(horizon.biasLabel, horizon.bias);
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
        {horizon.confidence !== undefined ? (
          <span className="md-mono text-2xs text-[var(--md-muted)]">
            confidenza {Math.max(0, Math.min(100, horizon.confidence))}/100
          </span>
        ) : null}
      </p>

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
}: {
  asset: MacroAsset;
  index: number;
  natura: NaturaBias;
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
          <LetturaSettimanale horizon={asset.weekly} natura={natura} />
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
}: {
  payload: MacroPayload;
  /** Come questo report tratta il bias settimanale (vedi `NaturaBias`). */
  natura: NaturaBias;
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
          <CardAsset key={asset.id ?? i} asset={asset} index={i + 2} natura={natura} />
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

function NewsCard({ item }: { item: MacroNews }) {
  return (
    <div className="md-card md-card-hover flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {item.src ? <MonoChip color="var(--md-text)">{item.src}</MonoChip> : null}
        {item.when ? (
          <span className="md-mono text-2xs text-[var(--md-muted)]">{item.when}</span>
        ) : null}
        <span className="ml-auto flex gap-1.5">
          {item.tags.map((tag) => (
            <MonoChip key={tag} color={assetAccentVar(tag)}>
              {tag}
            </MonoChip>
          ))}
        </span>
      </div>
      {item.title ? (
        <p className="text-sm font-semibold leading-snug text-[var(--md-text)]">
          {item.title}
        </p>
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

export function NewsTab({ payload }: { payload: MacroPayload }) {
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
                <NewsCard key={`${category}-${i}`} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
