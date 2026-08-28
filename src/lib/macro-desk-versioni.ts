import { parseMacroPayload, type MacroAsset } from "@/lib/macro-desk-payload";

/**
 * QUANDO VALE LA PENA DIRE CHE UN REPORT È STATO RIFATTO — modulo PURO.
 *
 * Dal 28/08/2026 ogni arrivo lascia una riga nel journal delle versioni
 * (`MacroDeskReportVersione`). Il dato c'è per tutti gli arrivi; la domanda è
 * quali meritino una riga in pagina, e la risposta è la stessa che si applica
 * a ogni altro numero del desk: **si mostra solo ciò che dà un vantaggio
 * informativo, di contesto o operativo**.
 *
 * «Il desk ha rispedito lo stesso report» non ne dà nessuno. Chi legge non può
 * farci niente, e una riga che compare ogni volta smette di essere letta
 * proprio il giorno in cui direbbe qualcosa. Quindi la riga compare SOLO
 * quando la revisione ha cambiato **il bias o la confidenza** di un asset:
 * cioè quando quello che la pagina mostrava stamattina non è più vero.
 *
 * Il prezzo di questa parsimonia è che la riga è più difficile da spiegare —
 * appare a intermittenza, e chi la vede si chiede perché adesso sì. Per questo
 * la riga non si limita a contare le versioni: **dice da sola perché è lì**,
 * nominando l'asset e i due valori. «2ª versione di oggi» sarebbe un enigma;
 * «il bias di Petrolio è passato da NEUTRALE a RIBASSISTA» è un fatto.
 *
 * ── Il limite, dichiarato ───────────────────────────────────────────────
 * Si confrontano solo gli asset presenti in ENTRAMBE le versioni. Un asset
 * che compare o sparisce fra una versione e l'altra non produce la riga: non
 * è mai successo in 23 report, e i cambi di composizione hanno già due
 * sorveglianti sul lato `biasRecord` (`applicaImpegno` e la sentinella).
 */

/** Una versione archiviata, ridotta a ciò che serve al confronto. */
export interface VersioneArchiviata {
  arrivatoIl: Date;
  payload: unknown;
}

export interface RevisioneDaDire {
  /** Ordinale della versione corrente: 2 = seconda arrivata oggi. */
  numero: number;
  /** Quando è entrata: l'istante vero, non quello dichiarato dal desk. */
  arrivatoIl: Date;
  /** Le differenze, una per una e già in parole. Mai vuoto. */
  cambiamenti: string[];
  /** Le differenze unite per stare in una riga di sottotitolo. */
  frase: string;
}

/** Quante differenze si nominano prima di riassumere il resto. */
const MAX_IN_RIGA = 2;

/** Il nome che la card usa per l'asset: quello, non la chiave interna. */
function nomeAsset(asset: MacroAsset): string {
  return asset.name ?? asset.ticker ?? asset.id ?? "un asset";
}

/** Bias confrontabile: è testo libero del desk, quindi si normalizza. */
function biasDi(asset: MacroAsset): string | undefined {
  const b = asset.weekly?.biasLabel ?? asset.weekly?.bias;
  return b?.trim().toUpperCase();
}

/**
 * Le differenze fra due versioni, in parole. Array vuoto = niente da dire.
 *
 * Si guarda `payload.assets[].weekly`, cioè esattamente ciò che la card
 * mostra: la riga compare sulla pagina del dettaglio, e deve parlare di quello
 * che si vede lì.
 */
export function differenzeFraVersioni(
  precedente: unknown,
  corrente: unknown,
): string[] {
  const prima = new Map(
    parseMacroPayload(precedente).assets.flatMap((a) => (a.id ? [[a.id, a]] : [])),
  );
  const fuori: string[] = [];

  for (const dopo of parseMacroPayload(corrente).assets) {
    const primaAsset = dopo.id ? prima.get(dopo.id) : undefined;
    if (!primaAsset) continue; // non confrontabile: vedi il limite dichiarato

    const biasPrima = biasDi(primaAsset);
    const biasDopo = biasDi(dopo);
    if (biasPrima && biasDopo && biasPrima !== biasDopo) {
      fuori.push(`il bias di ${nomeAsset(dopo)} è passato da ${biasPrima} a ${biasDopo}`);
    }

    const confPrima = primaAsset.weekly?.confidence;
    const confDopo = dopo.weekly?.confidence;
    if (confPrima !== undefined && confDopo !== undefined && confPrima !== confDopo) {
      fuori.push(
        `la confidenza di ${nomeAsset(dopo)} è passata da ${confPrima} a ${confDopo}`,
      );
    }
  }
  return fuori;
}

/**
 * La riga da mettere in pagina, o `null` se non c'è niente da dire.
 *
 * `totale` è il numero di versioni archiviate per questo report; `precedente` e
 * `corrente` sono le ultime due, in ordine di arrivo. Con una sola versione
 * non c'è revisione, e senza differenze non c'è riga.
 */
export function revisioneDaDire(
  totale: number,
  precedente: VersioneArchiviata | undefined,
  corrente: VersioneArchiviata | undefined,
): RevisioneDaDire | null {
  if (totale < 2 || !precedente || !corrente) return null;

  const cambiamenti = differenzeFraVersioni(precedente.payload, corrente.payload);
  if (cambiamenti.length === 0) return null;

  const mostrati = cambiamenti.slice(0, MAX_IN_RIGA);
  const resto = cambiamenti.length - mostrati.length;
  return {
    numero: totale,
    arrivatoIl: corrente.arrivatoIl,
    cambiamenti,
    frase:
      mostrati.join(" · ") +
      (resto > 0 ? ` · e altri ${resto} cambiament${resto === 1 ? "o" : "i"}` : ""),
  };
}
