/**
 * Parser DIFENSIVO del campo `MacroDeskReport.payload` (Json).
 * Schema autoritativo: docs/macro-desk-sample-report.json.
 *
 * Regola: mai lanciare — un report con sezioni mancanti/malformate produce
 * un payload con array vuoti e campi undefined, e la UI degrada con eleganza.
 */

export interface MacroDataIssue {
  sev?: string;
  text: string;
}
export interface MacroPillar {
  k: string;
  dir?: string;
  note?: string;
}
export interface MacroHorizon {
  bias?: string;
  biasLabel?: string;
  confidence?: number;
  confLabel?: string;
  since?: string;
  pillars: MacroPillar[];
  edge?: string;
  invalid?: string;
  narrative?: string;
}
export interface MacroDriver {
  k: string;
  v?: string;
  cls?: string;
  hz?: string;
}
export interface MacroAsset {
  id?: string;
  icon?: string;
  name?: string;
  ticker?: string;
  weekly?: MacroHorizon;
  quarterly?: MacroHorizon;
  drivers: MacroDriver[];
}
export interface MacroPill {
  k: string;
  v?: string;
}
export interface MacroSynthesis {
  pills: MacroPill[];
  risks?: string;
  conclusion?: string;
}
export interface MacroVolItem {
  k: string;
  v?: string;
  chg?: string;
  dir?: string;
  note?: string;
}
export interface MacroVolPanel {
  asOf?: string;
  items: MacroVolItem[];
  reading?: string;
}
export interface MacroEventRow {
  event?: string;
  when?: string;
  consensus?: string;
  gold?: string;
  oil?: string;
  idx?: string;
}
export interface MacroTile {
  k: string;
  v?: string;
  d?: string;
  t?: string;
}
export interface MacroSection {
  title?: string;
  rows: string[][];
  note?: string;
}
export interface MacroNews {
  src?: string;
  when?: string;
  title?: string;
  impl?: string;
  tags: string[];
}
export interface MacroHistoryRow {
  date?: string;
  xau?: string;
  wti?: string;
  idx?: string;
  note?: string;
}

export interface MacroPayload {
  lastUpdate?: string;
  reportType?: string;
  disclaimer?: string;
  dataIssues: MacroDataIssue[];
  newsTriage?: string;
  assets: MacroAsset[];
  synthesis?: MacroSynthesis;
  volPanel?: MacroVolPanel;
  watch: string[];
  eventMap: MacroEventRow[];
  macroTiles: MacroTile[];
  macroSections: MacroSection[];
  news: MacroNews[];
  history: MacroHistoryRow[];
}

/* ── primitive tolleranti ─────────────────────────────────────────────── */

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function obj(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

/* ── parser per sezione ───────────────────────────────────────────────── */

function parseHorizon(raw: unknown): MacroHorizon | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  return {
    bias: str(o.bias),
    biasLabel: str(o.biasLabel),
    confidence: num(o.confidence),
    confLabel: str(o.confLabel),
    since: str(o.since),
    pillars: arr(o.pillars).flatMap((p) => {
      const po = obj(p);
      const k = po && str(po.k);
      return k ? [{ k, dir: str(po.dir), note: str(po.note) }] : [];
    }),
    edge: str(o.edge),
    invalid: str(o.invalid),
    narrative: str(o.narrative),
  };
}

export function parseMacroPayload(raw: unknown): MacroPayload {
  const o = obj(raw) ?? {};
  return {
    lastUpdate: str(o.lastUpdate),
    reportType: str(o.reportType),
    disclaimer: str(o.disclaimer),
    dataIssues: arr(o.dataIssues).flatMap((i) => {
      const io = obj(i);
      const text = io && str(io.text);
      return text ? [{ sev: str(io.sev), text }] : [];
    }),
    newsTriage: str(o.newsTriage),
    assets: arr(o.assets).flatMap((a) => {
      const ao = obj(a);
      if (!ao) return [];
      return [
        {
          id: str(ao.id),
          icon: str(ao.icon),
          name: str(ao.name),
          ticker: str(ao.ticker),
          weekly: parseHorizon(ao.weekly),
          quarterly: parseHorizon(ao.quarterly),
          drivers: arr(ao.drivers).flatMap((d) => {
            const dObj = obj(d);
            const k = dObj && str(dObj.k);
            return k
              ? [{ k, v: str(dObj.v), cls: str(dObj.cls), hz: str(dObj.hz) }]
              : [];
          }),
        },
      ];
    }),
    synthesis: (() => {
      const s = obj(o.synthesis);
      if (!s) return undefined;
      return {
        pills: arr(s.pills).flatMap((p) => {
          const po = obj(p);
          const k = po && str(po.k);
          return k ? [{ k, v: str(po.v) }] : [];
        }),
        risks: str(s.risks),
        conclusion: str(s.conclusion),
      };
    })(),
    volPanel: (() => {
      const v = obj(o.volPanel);
      if (!v) return undefined;
      return {
        asOf: str(v.asOf),
        items: arr(v.items).flatMap((i) => {
          const io = obj(i);
          const k = io && str(io.k);
          return k
            ? [
                {
                  k,
                  v: str(io.v),
                  chg: str(io.chg),
                  dir: str(io.dir),
                  note: str(io.note),
                },
              ]
            : [];
        }),
        reading: str(v.reading),
      };
    })(),
    watch: arr(o.watch).flatMap((w) => (typeof w === "string" ? [w] : [])),
    eventMap: arr(o.eventMap).flatMap((e) => {
      const eo = obj(e);
      if (!eo) return [];
      return [
        {
          event: str(eo.event),
          when: str(eo.when),
          consensus: str(eo.consensus),
          gold: str(eo.gold),
          oil: str(eo.oil),
          idx: str(eo.idx),
        },
      ];
    }),
    macroTiles: arr(o.macroTiles).flatMap((t) => {
      const to = obj(t);
      const k = to && str(to.k);
      return k ? [{ k, v: str(to.v), d: str(to.d), t: str(to.t) }] : [];
    }),
    macroSections: arr(o.macroSections).flatMap((s) => {
      const so = obj(s);
      if (!so) return [];
      return [
        {
          title: str(so.title),
          rows: arr(so.rows).map((r) =>
            arr(r).map((cell) => (typeof cell === "string" ? cell : "")),
          ),
          note: str(so.note),
        },
      ];
    }),
    news: arr(o.news).flatMap((n) => {
      const no = obj(n);
      if (!no) return [];
      return [
        {
          src: str(no.src),
          when: str(no.when),
          title: str(no.title),
          impl: str(no.impl),
          tags: arr(no.tags).flatMap((t) => (typeof t === "string" ? [t] : [])),
        },
      ];
    }),
    history: arr(o.history).flatMap((h) => {
      const ho = obj(h);
      if (!ho) return [];
      return [
        {
          date: str(ho.date),
          xau: str(ho.xau),
          wti: str(ho.wti),
          idx: str(ho.idx),
          note: str(ho.note),
        },
      ];
    }),
  };
}

/* ── helper di presentazione (puri, testabili) ────────────────────────── */

/**
 * `risks` e `watch` arrivano come HTML dal NOSTRO sistema (solo grassetti):
 * difesa a buon mercato comunque — sopravvivono solo b/i/em/strong/br.
 */
export function sanitizeInlineHtml(html: string): string {
  return html.replace(/<(?!\/?(?:b|i|em|strong|br)\b)[^>]*>/gi, "");
}

/** Tono semantico condiviso da dir (up/dn/fl), cls e trend tile (u/s/d). */
export type MacroTone = "up" | "down" | "flat";

export function dirTone(dir?: string): MacroTone {
  if (dir === "up" || dir === "u") return "up";
  if (dir === "dn" || dir === "down" || dir === "d") return "down";
  return "flat";
}

/** Bias → tono: RIALZISTA/bull verde, RIBASSISTA/bear rosso, altro ambra. */
export function biasTone(label?: string, bias?: string): MacroTone {
  const l = (label ?? bias ?? "").toLowerCase();
  if (l.startsWith("rialz") || l === "bull" || l === "up") return "up";
  if (l.startsWith("ribass") || l === "bear" || l === "dn") return "down";
  return "flat";
}

/** Severità "critica": la sola che resta in alto nella Panoramica. */
export function isCriticalIssue(sev?: string): boolean {
  const s = (sev ?? "").toLowerCase();
  return s === "major" || s === "critical" || s === "error";
}

/**
 * Smistamento delle news per categoria (scheda News): Gold/Oil/Indices per
 * il tag asset corrispondente — una news multi-tag (es. gold+oil) compare
 * in ENTRAMBI i gruppi pertinenti, di proposito; Global per le news SENZA
 * alcun tag asset (fed/macro pure, tag sconosciuti, o nessun tag) — così
 * nessuna news si perde mai. Ordine fisso Global→Gold→Oil→Indices; i gruppi
 * vuoti per questo report non compaiono nel risultato.
 */
export type MacroNewsCategory = "global" | "gold" | "oil" | "idx";

const ASSET_TAGS: readonly ("gold" | "oil" | "idx")[] = ["gold", "oil", "idx"];

export interface MacroNewsGroup {
  category: MacroNewsCategory;
  items: MacroNews[];
}

export function groupNewsByCategory(news: MacroNews[]): MacroNewsGroup[] {
  const byTag = (tag: (typeof ASSET_TAGS)[number]) =>
    news.filter((item) => item.tags.includes(tag));
  const global = news.filter(
    (item) => !item.tags.some((tag) => (ASSET_TAGS as readonly string[]).includes(tag)),
  );
  return [
    { category: "global" as const, items: global },
    { category: "gold" as const, items: byTag("gold") },
    { category: "oil" as const, items: byTag("oil") },
    { category: "idx" as const, items: byTag("idx") },
  ].filter((group) => group.items.length > 0);
}

/** Accento dell'asset dal suo id/ticker (oro/petrolio/indici/cross). */
export function assetAccentVar(idOrTicker?: string): string {
  const s = (idOrTicker ?? "").toLowerCase();
  if (s.includes("gold") || s.includes("xau")) return "var(--md-gold)";
  if (s.includes("oil") || s.includes("wti") || s.includes("usoil"))
    return "var(--md-oil)";
  if (s.includes("idx") || s.includes("ger40") || s.includes("s&p"))
    return "var(--md-idx)";
  return "var(--md-cross)";
}
