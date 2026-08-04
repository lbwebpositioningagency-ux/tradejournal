/**
 * Generazione della sintesi dell'AI Analyst.
 *
 * Il modello NON decide niente di sostanziale: carattere della giornata,
 * confidenza, pesi, date e fonti sono già stati calcolati dal dossier in modo
 * deterministico (spec §6). Al modello si chiede soltanto di scrivere la
 * prosa: le frasi di apertura, la riga «cosa dice oggi» di ogni fattore e le
 * eventuali voci aggiuntive di «cosa questa lettura non dice».
 *
 * Strada obbligata, in quest'ordine:
 *   1. dossier insufficiente → si va DIRETTI al fallback (niente da
 *      raccontare, e non si spende una chiamata per dire «non lo so»);
 *   2. JSON dal modello → ripulitura → validazione Zod;
 *   3. CANCELLO LESSICALE su tutto il testo che finirebbe a schermo;
 *   4. CANCELLO SEMANTICO (due domande, fail-closed) sullo stesso testo;
 *   5. un solo secondo tentativo, con istruzione rafforgata, per qualunque
 *      inciampo dei passi 2-4;
 *   6. se anche il secondo fallisce → FALLBACK deterministico.
 *
 * La sezione non va MAI in errore e non resta MAI vuota.
 */

import { z } from "zod";
import {
  cancelloSemanticoAnalyst,
  controlloLessicaleAnalyst,
} from "@/lib/ai-analyst/cancelli";
import { AI_ANALYST_DEFS } from "@/lib/ai-analyst/instruments";
import { rigaFattore, testiDeterministici } from "@/lib/ai-analyst/frasi";
import { costruisciPrompt, promptRafforzato } from "@/lib/ai-analyst/prompt";
import {
  type AiAnalystInstrument,
} from "@/lib/ai-analyst/instruments";
import type {
  Dossier,
  FattoreAssente,
  FattorePresente,
} from "@/lib/ai-analyst/types";

/* ── forma della risposta del modello ────────────────────────────────── */

/**
 * L'unica cosa che il modello può produrre. Nessun enum, nessun numero,
 * nessuna data: quelli sono nostri e non passano di qui.
 */
export const rispostaModelloSchema = z.object({
  apertura: z.array(z.string().trim().min(20).max(400)).min(2).max(4),
  fattori: z
    .array(
      z.object({
        id: z.string().regex(/^F\d{1,2}$/),
        oggi: z.string().trim().min(20).max(600),
      }),
    )
    .max(20),
  cosaNonSappiamo: z.array(z.string().trim().min(10).max(400)).max(6),
});

export type RispostaModello = z.infer<typeof rispostaModelloSchema>;

/**
 * Toglie l'eventuale recinto di backtick. `responseMimeType: application/json`
 * dovrebbe già evitarlo, ma «dovrebbe» non è una garanzia su cui costruire.
 */
export function ripulisciJson(grezzo: string): string {
  const senzaRecinto = grezzo
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const apertura = senzaRecinto.indexOf("{");
  const chiusura = senzaRecinto.lastIndexOf("}");
  if (apertura === -1 || chiusura === -1 || chiusura < apertura) {
    return senzaRecinto;
  }
  return senzaRecinto.slice(apertura, chiusura + 1);
}

export function analizzaRisposta(
  grezzo: string,
): { ok: true; dati: RispostaModello } | { ok: false; motivo: string } {
  let json: unknown;
  try {
    json = JSON.parse(ripulisciJson(grezzo));
  } catch {
    return { ok: false, motivo: "risposta non è JSON" };
  }
  const parsed = rispostaModelloSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      motivo: `risposta non conforme allo schema: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join("; ")}`,
    };
  }
  return { ok: true, dati: parsed.data };
}

/* ── sintesi finale ──────────────────────────────────────────────────── */

export type OrigineSintesi = "modello" | "fallback";

export interface FattoreReso {
  id: string;
  nome: string;
  classe: "a" | "b";
  oggi: string;
  peso: FattorePresente["peso"];
  dataDato: string;
  freschezza: FattorePresente["freschezza"];
}

export interface SintesiAiAnalyst {
  schemaVersion: "1.0";
  strumento: AiAnalystInstrument;
  giorno: string;
  origine: OrigineSintesi;
  /** Perché è il fallback, quando lo è. */
  motivoFallback: string | null;
  apertura: string[];
  carattereAtteso: Dossier["carattereAtteso"];
  confidenza: Dossier["confidenza"];
  motivoConfidenza: string;
  fattori: FattoreReso[];
  fattoriAssenti: FattoreAssente[];
  cosaNonSappiamo: string[];
  fonti: Dossier["fonti"];
  datoPiuVecchio: string | null;
  datiInsufficienti: boolean;
  /** Tracciato dei cancelli scattati e dei tentativi: va nel log, non a schermo. */
  eventi: string[];
}

/* ── assemblaggio ────────────────────────────────────────────────────── */

function assembla(
  d: Dossier,
  origine: OrigineSintesi,
  motivoFallback: string | null,
  testi: { apertura: string[]; righe: Record<string, string>; cosaNonSappiamo: string[] },
  eventi: string[],
): SintesiAiAnalyst {
  const nome = AI_ANALYST_DEFS[d.strumento].label;
  return {
    schemaVersion: "1.0",
    strumento: d.strumento,
    giorno: d.giorno,
    origine,
    motivoFallback,
    apertura: testi.apertura,
    carattereAtteso: d.carattereAtteso,
    confidenza: d.confidenza,
    motivoConfidenza: d.motivoConfidenza,
    fattori: d.fattori.map((f) => ({
      id: f.id,
      nome: f.nome,
      classe: f.classe,
      // Se il modello ha saltato un fattore, la riga cade sul template: mai
      // una voce vuota, mai una voce inventata.
      oggi: testi.righe[f.id] ?? rigaFattore(f, nome),
      peso: f.peso,
      dataDato: f.dataDato,
      freschezza: f.freschezza,
    })),
    fattoriAssenti: d.assenti,
    cosaNonSappiamo: testi.cosaNonSappiamo,
    fonti: d.fonti,
    datoPiuVecchio: d.datoPiuVecchio,
    datiInsufficienti: d.datiInsufficienti,
    eventi,
  };
}

export function sintesiFallback(
  d: Dossier,
  motivo: string,
  eventi: string[] = [],
): SintesiAiAnalyst {
  return assembla(d, "fallback", motivo, testiDeterministici(d), eventi);
}

/**
 * Testi del modello, con le voci fisse SEMPRE reimposte in testa: il modello
 * può aggiungere limiti, non toglierne.
 */
function testiDaModello(
  d: Dossier,
  risposta: RispostaModello,
): { apertura: string[]; righe: Record<string, string>; cosaNonSappiamo: string[] } {
  const deterministici = testiDeterministici(d);
  const righe: Record<string, string> = { ...deterministici.righe };
  const validi = new Set(d.fattori.map((f) => f.id));
  for (const voce of risposta.fattori) {
    // Un id che non esiste nel dossier viene scartato: il modello non può
    // inventare un fattore che non gli abbiamo dato.
    if (validi.has(voce.id as FattorePresente["id"])) righe[voce.id] = voce.oggi;
  }
  const aggiunte = risposta.cosaNonSappiamo.filter(
    (v) => !deterministici.cosaNonSappiamo.includes(v),
  );
  return {
    apertura: risposta.apertura,
    righe,
    cosaNonSappiamo: [...deterministici.cosaNonSappiamo, ...aggiunte],
  };
}

/** Tutto il testo che finirebbe a schermo, in un blocco solo. */
export function testoDaControllare(testi: {
  apertura: string[];
  righe: Record<string, string>;
  cosaNonSappiamo: string[];
}): string {
  return [
    ...testi.apertura,
    ...Object.values(testi.righe),
    ...testi.cosaNonSappiamo,
  ].join("\n");
}

/* ── orchestratore ───────────────────────────────────────────────────── */

export interface DipendenzeSintesi {
  /** Chiede al modello il JSON della prosa. Può lanciare. */
  generaJson(prompt: string): Promise<string>;
  /** Pone una domanda del cancello semantico. Può lanciare. */
  cancelloSemantico(domanda: string, testo: string): Promise<string>;
}

/** Un solo secondo tentativo: oltre, si pubblica il fallback. */
export const MAX_TENTATIVI = 2;

export async function generaSintesi(
  d: Dossier,
  deps: DipendenzeSintesi,
): Promise<SintesiAiAnalyst> {
  const eventi: string[] = [];

  // Dossier insufficiente: non c'è una lettura da raccontare, e chiedere al
  // modello di scrivere «non lo so» sarebbe una chiamata sprecata con un
  // rischio in più. Si va diretti al testo deterministico.
  if (d.datiInsufficienti) {
    eventi.push("dossier insufficiente: nessuna chiamata al modello");
    return sintesiFallback(d, "dati insufficienti per una lettura", eventi);
  }

  let ultimoMotivo = "";
  for (let tentativo = 1; tentativo <= MAX_TENTATIVI; tentativo += 1) {
    const prompt =
      tentativo === 1
        ? costruisciPrompt(d)
        : promptRafforzato(costruisciPrompt(d), ultimoMotivo);

    let grezzo: string;
    try {
      grezzo = await deps.generaJson(prompt);
    } catch (errore) {
      ultimoMotivo = `modello non raggiungibile: ${errore instanceof Error ? errore.message : String(errore)}`;
      eventi.push(`tentativo ${tentativo}: ${ultimoMotivo}`);
      // Una chiamata che non arriva non si ritenta in questa sede: il
      // fallback è già pronto e la pagina non deve restare appesa.
      return sintesiFallback(d, ultimoMotivo, eventi);
    }

    const analisi = analizzaRisposta(grezzo);
    if (!analisi.ok) {
      ultimoMotivo = analisi.motivo;
      eventi.push(`tentativo ${tentativo}: ${ultimoMotivo}`);
      continue;
    }

    const testi = testiDaModello(d, analisi.dati);
    const testo = testoDaControllare(testi);

    const violazioni = controlloLessicaleAnalyst(testo);
    if (violazioni.length > 0) {
      ultimoMotivo = `cancello lessicale: ${violazioni.join("; ")}`;
      eventi.push(`tentativo ${tentativo}: ${ultimoMotivo}`);
      console.error(`[ai-analyst] ${d.strumento} — ${ultimoMotivo}`);
      continue;
    }

    const semantico = await cancelloSemanticoAnalyst(
      deps.cancelloSemantico,
      testo,
    );
    if (semantico.bloccato) {
      ultimoMotivo = semantico.motivo ?? "cancello semantico";
      eventi.push(`tentativo ${tentativo}: ${ultimoMotivo}`);
      console.error(`[ai-analyst] ${d.strumento} — ${ultimoMotivo}`);
      continue;
    }

    eventi.push(`tentativo ${tentativo}: pubblicato`);
    return assembla(d, "modello", null, testi, eventi);
  }

  return sintesiFallback(
    d,
    `testo del modello non pubblicabile (${ultimoMotivo})`,
    eventi,
  );
}

/* ── cache in memoria ────────────────────────────────────────────────── */

/**
 * Cache a chiave (giorno, strumento), come da spec §9. Riaprire la pagina non
 * rigenera e non richiama il modello.
 *
 * Limite noto e accettato: si svuota a ogni riavvio della funzione
 * serverless, quindi in produzione la sintesi può rigenerarsi più volte al
 * giorno. Sui numeri del tier gratuito è irrilevante; è il primo motivo per
 * cui la persistenza diventerà una fase a sé.
 */
const CAPIENZA_CACHE = 32;
const cache = new Map<string, SintesiAiAnalyst>();

export function chiaveCache(giorno: string, strumento: string): string {
  return `${giorno}|${strumento}`;
}

export function leggiCache(
  giorno: string,
  strumento: AiAnalystInstrument,
): SintesiAiAnalyst | undefined {
  return cache.get(chiaveCache(giorno, strumento));
}

export function scriviCache(sintesi: SintesiAiAnalyst): void {
  // Il fallback per irraggiungibilità del modello NON si mette in cache: se la
  // rete torna fra dieci minuti, la pagina deve poter riprovare invece di
  // restare inchiodata alla versione senza modello per tutta la giornata.
  if (sintesi.origine === "fallback" && !sintesi.datiInsufficienti) return;
  if (cache.size >= CAPIENZA_CACHE) {
    const piuVecchia = cache.keys().next().value;
    if (piuVecchia !== undefined) cache.delete(piuVecchia);
  }
  cache.set(chiaveCache(sintesi.giorno, sintesi.strumento), sintesi);
}

export function svuotaCache(): void {
  cache.clear();
}

/** Genera passando dalla cache. È il punto d'ingresso della pagina. */
export async function sintesiDelGiorno(
  d: Dossier,
  deps: DipendenzeSintesi,
): Promise<SintesiAiAnalyst> {
  const gia = leggiCache(d.giorno, d.strumento);
  if (gia) return gia;
  const sintesi = await generaSintesi(d, deps);
  scriviCache(sintesi);
  return sintesi;
}
