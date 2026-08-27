/**
 * Implicazioni meccaniche del pannello COT e cancelli sul linguaggio.
 *
 * COSA C'ERA QUI FINO AL 26/08/2026. Un secondo percorso, chiamato
 * «contesto della settimana», che ogni sabato scaricava da Google News RSS
 * 2-3 titoli per strumento, li filtrava per parola chiave e li pubblicava
 * accanto al posizionamento. È stato rimosso per intero: la selezione
 * respingeva le direzioni di prezzo ma non l'irrilevanza (fra i titoli
 * sull'oro finiva il prezzo degli anelli d'oro in Vietnam), e un
 * aggregatore di testate arbitrarie non è una fonte qualificabile —
 * nessun codice di risposta proprio della singola notizia, nessuna data di
 * riferimento sua, nessuna licenza di ripubblicazione. Il motivo esteso sta
 * in `components/macro-desk/cot-panel.tsx`; la lacuna — «al desk manca il
 * perché di un movimento» — resta aperta in `docs/DEBITO-TECNICO.md`.
 *
 * COSA RESTA: solo IMPLICAZIONI_MECCANICHE, la tabella statica metrica ×
 * banda che il pannello legge a render-time.
 *
 * I DUE CANCELLI SUL LINGUAGGIO (lessicale e semantico) sono usciti il
 * 27/08/2026 con il blocco discorsivo della Sintesi, che era il loro ultimo
 * consumatore vivo: erano nati per filtrare i titoli di Google News, e da
 * quando quel percorso è stato rimosso (26/08) restavano in piedi solo per il
 * testo generato dell'AI Analyst. Senza testo da controllare, un cancello è
 * codice che nessuno attraversa.
 */

import type { BandaCot } from "@/lib/cot-metrics";
import type { MetricaCot } from "@/lib/cot-panel";

/**
 * Una frase per combinazione, vera — nelle intenzioni — per come è DEFINITO
 * il numero.
 *
 * ATTENZIONE, misurato il 27/08/2026: QUATTRO delle sei famiglie NON
 * discendono dalla definizione, e due sono false su casi ordinari. Analisi
 * completa con i numeri e le query in `docs/macro-desk/VERDETTO-POSIZIONAMENTO.md`.
 */
export const IMPLICAZIONI_MECCANICHE: Record<MetricaCot, Record<BandaCot, string>> = {
  open_interest: {
    "MOLTO BASSO":
      "Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.",
    BASSO:
      "Partecipazione sotto la norma: meno contratti aperti significa meno controparti in campo, e oscillazioni che a parità di flusso di ordini possono ampliarsi.",
    "NELLA NORMA":
      "Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.",
    ALTO:
      "Partecipazione sopra la norma: più contratti aperti significa un mercato più spesso, dove serve un flusso di ordini più grande per spostare i prezzi della stessa misura.",
    "MOLTO ALTO":
      "Partecipazione ai massimi della propria storia: mercato insolitamente affollato, con molte posizioni in essere la cui ordinaria gestione (chiusure e rinnovi) genera di per sé flussi sul mercato.",
  },
  mm_net: {
    "MOLTO BASSO":
      "Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti.",
    BASSO:
      "Esposizione netta dei fondi sotto la norma: poche scommesse lunghe in essere rispetto alla storia, quindi meno posizioni lunghe da liquidare di quante questo mercato ne abbia di solito.",
    "NELLA NORMA":
      "Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere.",
    ALTO:
      "Esposizione netta dei fondi sopra la norma: molte scommesse lunghe in essere, e le eventuali chiusure di quelle posizioni passano per vendite.",
    "MOLTO ALTO":
      "Esposizione netta dei fondi ai massimi della propria storia: lo sbilancio delle posizioni in essere è tutto dal lato lungo — per definizione, su quel lato c'è più da liquidare che da aggiungere.",
  },
};
