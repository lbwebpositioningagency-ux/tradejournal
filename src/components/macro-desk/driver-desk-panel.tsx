/**
 * Pannello Driver Desk — resa per il tab "Driver" del Macro Desk.
 *
 * Pannello PURAMENTE DESCRITTIVO, come il pannello COT: per ogni strumento
 * mostra quanto è forte rispetto ai suoi pari (Blocco A), in che contesto
 * macro si trova (Blocco B) e quanto le relazioni con i suoi driver stanno
 * reggendo adesso (Blocco C). Niente previsioni, niente probabilità di
 * salita/discesa, nessun composito che fonda paniere e driver: ogni numero
 * resta separato e confrontato SOLO con la propria storia.
 *
 * Convenzioni ereditate: linguaggio piano (mai "87° percentile"), bande
 * verbali con le soglie del COT, niente verde/rosso (riservati al P&L),
 * ogni componente assente è DICHIARATO a schermo con il motivo.
 *
 * Componente puro (nessuno stato): si testa con renderToStaticMarkup.
 */

import { AlertTriangle } from "lucide-react";
import type {
  DriverCardPayload,
  DriverContext,
  MissingComponent,
  RelationStability,
  StrengthWindow,
} from "@/lib/driver-desk/cards";
import { fmtIt } from "@/lib/driver-desk/cards";
import type { DriverDeskData } from "@/lib/queries/driver-desk";
import type { DriverBanda } from "@/lib/driver-desk/engine";
import { Callout, MonoChip, PanelLabel, RangeBar } from "./primitives";

function fade(index: number) {
  return { animationDelay: `${index * 60}ms` };
}

/** Stessa semantica del pannello COT: ambra per gli estremi, blu per
 * alto/basso, neutro per la norma. MAI verde/rosso. */
const COLORE_BANDA: Record<DriverBanda, string> = {
  "MOLTO BASSO": "var(--md-warn)",
  BASSO: "var(--md-info)",
  "NELLA NORMA": "var(--md-text-2)",
  ALTO: "var(--md-info)",
  "MOLTO ALTO": "var(--md-warn)",
};

const CONFINI_BANDE = [10, 30, 70, 90];

function BandaChip({ banda }: { banda: DriverBanda | null }) {
  if (banda === null) {
    return (
      <span className="md-mono text-2xs text-[var(--md-muted)]">
        campione insufficiente
      </span>
    );
  }
  const colore = COLORE_BANDA[banda];
  return (
    <span
      className="md-mono self-start rounded px-1.5 py-0.5 text-2xs font-bold"
      style={{ color: colore, border: `1px solid ${colore}` }}
    >
      {banda}
    </span>
  );
}

/** Riga standard: banda + barra di posizione nel range storico + frase. */
function RigaStatistica({
  banda,
  percentile,
  sentence,
  chips,
}: {
  banda: DriverBanda | null;
  percentile: number | null;
  sentence: string;
  chips?: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <BandaChip banda={banda} />
        {chips?.map((c) => <MonoChip key={c}>{c}</MonoChip>)}
      </div>
      {percentile !== null ? (
        <RangeBar
          position={percentile}
          color={banda ? COLORE_BANDA[banda] : "var(--md-text-2)"}
          ticks={CONFINI_BANDE}
          ariaLabel={`Posizione nel range storico: ${Math.round(percentile)} su 100`}
        />
      ) : null}
      <p className="text-sm leading-relaxed text-[var(--md-text-2)]">{sentence}</p>
    </div>
  );
}

function AssenzaDichiarata({ item }: { item: MissingComponent }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-[var(--md-r-md)] border px-3 py-2.5 text-xs leading-relaxed"
      style={{
        borderColor: "var(--md-border)",
        backgroundColor: "var(--md-surface)",
      }}
    >
      <AlertTriangle
        className="mt-0.5 size-3.5 shrink-0"
        style={{ color: "var(--md-warn)" }}
        aria-hidden
      />
      <span className="text-[var(--md-text-2)]">
        <span className="md-mono mr-1.5 font-semibold uppercase">
          {item.label} assente:
        </span>
        {item.reason}
      </span>
    </div>
  );
}

function BloccoForza({
  strength,
  unavailable,
}: {
  strength: StrengthWindow[] | null;
  unavailable?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>Forza nel paniere</PanelLabel>
      {strength === null ? (
        <p className="text-sm leading-relaxed text-[var(--md-muted)]">
          {unavailable ?? "Confronto di paniere non disponibile."}
        </p>
      ) : (
        strength.map((s) => (
          <RigaStatistica
            key={s.window}
            banda={s.band}
            percentile={s.percentile}
            sentence={s.sentence}
            chips={[
              `${s.window} sedute`,
              ...(s.z !== null ? [`z ${fmtIt(s.z, 1)}`] : []),
            ]}
          />
        ))
      )}
    </div>
  );
}

function fmtLivello(driver: DriverContext): string {
  const decimals = Math.abs(driver.level) >= 100 ? 1 : 2;
  return `${fmtIt(driver.level, decimals)} ${driver.unit}`;
}

function BloccoDriver({ drivers }: { drivers: DriverContext[] }) {
  if (drivers.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>Contesto driver — ciascuno da solo, mai sommati</PanelLabel>
      {drivers.map((d) => (
        <div key={d.label} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-[var(--md-text)]">
              {d.label}
            </span>
            <span className="md-mono text-xs text-[var(--md-text)]">
              {fmtLivello(d)}
            </span>
          </div>
          <RigaStatistica
            banda={d.band}
            percentile={d.percentile}
            sentence={d.sentence}
            chips={[
              ...(d.zLevel !== null ? [`z livello ${fmtIt(d.zLevel, 1)}`] : []),
              ...(d.zDelta !== null ? [`z var. 20 sedute ${fmtIt(d.zDelta, 1)}`] : []),
            ]}
          />
        </div>
      ))}
    </div>
  );
}

function BloccoRelazioni({ relations }: { relations: RelationStability[] }) {
  if (relations.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <PanelLabel>Stabilità delle relazioni (60 sedute)</PanelLabel>
      {relations.map((r) => (
        <div key={r.label} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-[var(--md-text)]">
              {r.label}
            </span>
            <span className="md-mono text-xs text-[var(--md-text)]">
              ρ {fmtIt(r.rho, 2)}
            </span>
          </div>
          <RigaStatistica
            banda={r.band}
            percentile={r.percentile}
            sentence={r.sentence}
          />
          <p className="text-xs leading-relaxed text-[var(--md-muted)]">
            {r.signSentence}. Il segno si misura, non si assume: quando la
            relazione si indebolisce è la barra a dirlo.
          </p>
        </div>
      ))}
    </div>
  );
}

function SchedaStrumento({
  card,
  indice,
}: {
  card: DriverCardPayload;
  indice: number;
}) {
  return (
    <div
      className="md-card md-card-hover md-fade flex flex-col overflow-hidden"
      style={fade(indice + 1)}
    >
      <div className="h-[3px]" style={{ backgroundColor: card.colorToken }} />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-[var(--md-text)]">
            {card.label}
          </span>
          <span
            className="md-mono text-[11px] font-semibold"
            style={{ color: card.colorToken }}
          >
            {card.ticker}
          </span>
        </div>

        <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
          dati al {card.calendar.end} · storia comune dal {card.calendar.start} ·{" "}
          {card.calendar.sessions} sedute (solo giorni con TUTTE le serie
          quotate, mai riempimenti)
        </p>

        {card.missing.map((m) => (
          <AssenzaDichiarata key={m.label} item={m} />
        ))}

        <BloccoForza
          strength={card.strength}
          unavailable={card.strengthUnavailable}
        />
        <div
          className="border-t"
          style={{ borderColor: "var(--md-border)" }}
          aria-hidden
        />
        <BloccoDriver drivers={card.drivers} />
        <div
          className="border-t"
          style={{ borderColor: "var(--md-border)" }}
          aria-hidden
        />
        <BloccoRelazioni relations={card.relations} />

        {card.freshnessNote ? (
          <p className="mt-auto border-t pt-2 text-[11px] leading-relaxed text-[var(--md-muted)]"
             style={{ borderColor: "var(--md-border)" }}>
            {card.freshnessNote}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DriverDeskPanel({ data }: { data: DriverDeskData }) {
  const { cards, errors, coverage, empty } = data;

  if (empty) {
    return (
      <div className="md-card p-4 text-xs text-[var(--md-muted)]">
        Driver Desk non disponibile: nessuna serie in tabella (l&apos;ingest non è
        ancora stato eseguito su questo ambiente).
      </div>
    );
  }

  const fonti = coverage
    .filter((c) => c.source !== null)
    .map((c) => c.source as string);
  const fontiUniche = [...new Set(fonti.map((f) => f.split(" ")[0]))];
  const ultimoIngest = coverage
    .map((c) => c.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className="flex flex-col gap-3">
      <Callout
        label="Driver Desk — forza, contesto e relazioni"
        color="var(--md-info)"
        className="md-card p-4"
      >
        Per ciascuno strumento: quanto è forte rispetto ai suoi pari, in che
        contesto macro si trova, e quanto le relazioni con i suoi driver stanno
        effettivamente reggendo adesso. È una fotografia descrittiva, come il
        pannello di posizionamento: ogni numero è confrontato solo con la
        propria storia, paniere e driver restano separati, e non c&apos;è nessuna
        indicazione su dove andrà il prezzo.
      </Callout>

      {errors.map((e) => (
        <div
          key={e.id}
          className="flex items-start gap-2.5 rounded-[var(--md-r-md)] border px-3.5 py-2.5 text-xs leading-relaxed"
          style={{
            borderColor: "var(--md-border)",
            backgroundColor: "var(--md-surface)",
          }}
        >
          <AlertTriangle
            className="mt-0.5 size-3.5 shrink-0"
            style={{ color: "var(--md-warn)" }}
            aria-hidden
          />
          <span className="text-[var(--md-text-2)]">
            Scheda {e.id} non disponibile: {e.error}
          </span>
        </div>
      ))}

      <div className="grid gap-3 xl:grid-cols-3">
        {cards.map((card, i) => (
          <SchedaStrumento key={card.id} card={card} indice={i} />
        ))}
      </div>

      <p className="md-mono text-[11px] leading-relaxed text-[var(--md-muted)]">
        Fonti: {fontiUniche.join(", ")} — la fonte esatta di ogni serie è
        registrata e dichiarata; ogni posizione nel range è calcolata sulla
        storia comune della sua scheda (data dichiarata sulla scheda).
        {ultimoIngest
          ? ` Ultimo aggiornamento dati: ${ultimoIngest.slice(0, 10)}.`
          : ""}{" "}
        Le bande verbali usano le stesse soglie del pannello di posizionamento
        (10/30/70/90).
      </p>
    </div>
  );
}
