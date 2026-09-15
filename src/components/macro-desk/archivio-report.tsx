import { biasTone } from "@/lib/macro-desk-payload";
import {
  giornoBreve,
  TIPO_REPORT,
  type StatoReport,
  type VoceArchivio,
} from "@/lib/macro-desk-stato-report";
import { MenuArchivio, type BucoArchivio, type VoceMenu } from "./menu-archivio";

/**
 * L'ARCHIVIO IN TENDINA della pagina Report (15/09/2026 sera, tavola Claude
 * Design «Report MD - ricostruzione», riquadri 10–14).
 *
 * Nella pagina non c'è più alcun elenco d'archivio, in nessuna forma: prima
 * era la colonna «Storico» a destra, poi una riga sotto la striscia di stato.
 * Resta un solo comando in testata, «Report del 21/08 ▾», fra i pulsanti del
 * report precedente e del successivo; l'elenco si vede solo a tendina aperta.
 * La tendina è il `DropdownMenu` del sistema (`ui/dropdown-menu.tsx`).
 *
 * Contenuto identico alla riga: stessa finestra di 20, il report aperto in
 * coda dopo «…» se è più vecchio, il buco dell'ultimo giornaliero in ritardo,
 * solo il bias dichiarato. Qui, lato server, si prepara ciò che la tendina
 * mostra: date già scritte e toni già decisi, così nel bundle del client non
 * entra il parser del payload.
 */

const PAROLA = { up: "rialzo", down: "ribasso", flat: "neutro" } as const;

const ASSET = [
  { nome: "oro", chiave: "biasXau" },
  { nome: "petrolio", chiave: "biasWti" },
  { nome: "indici", chiave: "biasIdx" },
] as const;

function voceMenu(voce: VoceArchivio, sceltoId: string): VoceMenu {
  const toni = ASSET.map((a) => biasTone(voce[a.chiave]));
  const giorno = giornoBreve(voce.reportDate);
  const segni = ASSET.map((a, i) => `${a.nome} ${PAROLA[toni[i]]}`).join(", ");
  return {
    id: voce.id,
    giorno,
    settimanale: voce.type === "WEEKLY",
    tipo: TIPO_REPORT[voce.type],
    toni: [toni[0], toni[1], toni[2]],
    etichetta: `Report ${TIPO_REPORT[voce.type]} del ${giorno} · ${segni}`,
    scelta: voce.id === sceltoId,
  };
}

/** Le voci della tendina, pronte: finestra, report aperto fuori finestra, buco. */
export function vociArchivio({
  righe,
  fuoriFinestra,
  sceltoId,
  buco,
}: {
  righe: VoceArchivio[];
  fuoriFinestra: VoceArchivio | null;
  sceltoId: string;
  buco: StatoReport | null;
}): { voci: VoceMenu[]; fuori: VoceMenu | null; buco: BucoArchivio | null } {
  return {
    voci: righe.map((v) => voceMenu(v, sceltoId)),
    fuori: fuoriFinestra ? voceMenu(fuoriFinestra, sceltoId) : null,
    buco: buco?.tipo === "in_ritardo" ? { mancaDal: buco.mancaDal, giorni: buco.giorni } : null,
  };
}

export function ArchivioReport({
  righe,
  fuoriFinestra,
  sceltoId,
  buco,
  giorno,
}: {
  righe: VoceArchivio[];
  fuoriFinestra: VoceArchivio | null;
  sceltoId: string;
  /** Lo stato dell'ULTIMO giornaliero: se è in ritardo, il buco apre l'elenco. */
  buco: StatoReport | null;
  /** Il giorno del report aperto, scritto sul comando. */
  giorno: string;
}) {
  return <MenuArchivio giorno={giorno} {...vociArchivio({ righe, fuoriFinestra, sceltoId, buco })} />;
}
