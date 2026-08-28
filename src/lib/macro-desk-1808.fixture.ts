/**
 * FIXTURE REALE — il payload del report DAILY del 18 agosto 2026, così come
 * sta in Neon: `news` in grafia `t`/`note` (tutte e 11) e `synthesis` con
 * `risk`/`concl`. Estratto il 28/08/2026, non ritoccato.
 *
 * Perché una fixture e non un oggetto inventato: quel report è arrivato,
 * è stato accettato, salvato e reso in pagina con undici card senza titolo,
 * senza Radar rischi e senza Verdetto — e nessuno se n'è accorto per dieci
 * giorni. Non si rigenera. Il test che lo usa serve a garantire che da qui in
 * avanti PARLI, e che continui a parlare.
 */
export const REPORT_1808 = {
  "news": [
    {
      "t": "Oro tiene 4.400 in attesa delle minute FOMC",
      "src": "Vantage/FXEmpire",
      "note": "XAU/USD verso 4.400 (chiusura 17 ago 4.397): dollaro più morbido e ritiro del rischio di rialzo FED sostengono, ma i reali elevati frenano prima delle minute (19 ago).",
      "tags": [
        "gold",
        "fed"
      ],
      "when": "Oggi"
    },
    {
      "t": "Odds di un rialzo FED a settembre azzerate",
      "src": "TradingKey/Tio",
      "note": "Il mercato prezza un TAGLIO (~65%), non un rialzo: i pezzi sul 'crollo delle odds di rialzo' descrivono il ritiro di un rischio di coda hawkish — netto positivo per l'oro.",
      "tags": [
        "gold",
        "fed"
      ],
      "when": "Ieri"
    },
    {
      "t": "Oro regge nonostante reali 10Y al 2,39%",
      "src": "H.15/desk",
      "note": "La tenuta a reali storicamente ostili è il segnale di domanda strutturale (banche centrali): il pavimento è più alto di quanto i tassi reali implicherebbero.",
      "tags": [
        "gold"
      ],
      "when": "2 giorni fa"
    },
    {
      "t": "WTI a massimo di 6 mesi su timori Hormuz",
      "src": "TradingEconomics",
      "note": "WTI +3,1% a 84,62 il 17 ago: la guerra Iran e la minaccia allo Stretto di Hormuz alimentano il premio d'offerta; spinta verso il ramo rialzista del record (>88).",
      "tags": [
        "oil"
      ],
      "when": "Oggi"
    },
    {
      "t": "Attacco a petroliera a Hormuz (16 ago)",
      "src": "desk/cronaca",
      "note": "L'attacco a una petroliera ha riacceso il premio d'offerta: è il catalizzatore dietro il balzo del WTI e lo stato STRESS del neutro settimanale.",
      "tags": [
        "oil"
      ],
      "when": "2 giorni fa"
    },
    {
      "t": "IEA rivede il 2026: deficit più ampio, produzione iraniana tagliata",
      "src": "IEA/OilPrice",
      "note": "Deficit stimato ~1,8 Mb/g nel trimestre (più del doppio della stima precedente) per il taglio di produzione legato alla guerra: motore strutturale del rally.",
      "tags": [
        "oil"
      ],
      "when": "Ieri"
    },
    {
      "t": "OPEC e IEA tagliano le stime di domanda 2026",
      "src": "OilPrice",
      "note": "Il lato domanda resta debole: è la ragione per cui il quarterly petrolio è NEUTRALE (non rialzista) nonostante lo shock d'offerta.",
      "tags": [
        "oil"
      ],
      "when": "2 giorni fa"
    },
    {
      "t": "Indici in lieve calo verso trimestrali retail",
      "src": "Yahoo/TheStreet",
      "note": "S&P -0,50% a ~7.747, Nasdaq -0,31%, Dow -0,51% il 17 ago: -0,33 EM dal P0 del record, drift verso il ramo ribassista (<7.641).",
      "tags": [
        "idx"
      ],
      "when": "Oggi"
    },
    {
      "t": "VIX al minimo del 2026",
      "src": "CNBC",
      "note": "Il 'fear gauge' a 15,19: compiacenza con indici ai massimi, ma nessun premio al rischio prima di un trittico di eventi — coerente con lo stato INDEBOLISCE.",
      "tags": [
        "idx"
      ],
      "when": "Oggi"
    },
    {
      "t": "Tassi lunghi USA ai massimi dal 2007",
      "src": "Yahoo",
      "note": "30Y ~5,3%, 10Y 4,68% in salita: bear-steepening da premio a termine/fiscale, freno alle valutazioni azionarie e sorvegliato speciale per l'oro (via MOVE).",
      "tags": [
        "idx",
        "macro"
      ],
      "when": "Oggi"
    },
    {
      "t": "Minute FOMC (19 ago) al centro della settimana",
      "src": "InteractiveCrypto",
      "note": "Le minute della riunione 28-29 lug chiariranno il sentiero dei tassi tra segnali misti; con esse Jackson Hole (fine ago) e le trimestrali retail.",
      "tags": [
        "fed",
        "macro"
      ],
      "when": "Oggi"
    }
  ],
  "synthesis": {
    "pills": [
      {
        "k": "Regime",
        "v": "Soft-landing + taglio FED in arrivo"
      },
      {
        "k": "Record settimana",
        "v": "WBR 16-21 ago vivo · monitoraggio giorno 2"
      },
      {
        "k": "Volatilità",
        "v": "VIX min 2026 · OVX fascia alta"
      },
      {
        "k": "Eventi settimana",
        "v": "Minute FOMC (19) · Jackson Hole · retail earnings"
      }
    ],
    "risk": "Rischio di mercato: WTI a massimo di 6 mesi su shock d'offerta Hormuz/Iran (attacco petroliera 16 ago) mentre le stime di domanda calano; tassi lunghi USA ai massimi dal 2007 (bear-steepening) con VIX ai minimi 2026 = azionario senza cuscinetto di premio al rischio prima di minute FOMC e trimestrali retail. Nota di sistema: il trigger-STATO del bootstrap è stantìo (9 ago); lo stato vivo è su Notion — continuità garantita dal merge, ma da sorvegliare.",
    "concl": "Monitoraggio del WBR 16-21 ago (giorno 2, prezzi = chiusure 17 ago). Oro NEUTRALE — CONFERMA (+0,22 EM, drift contenuto). Petrolio NEUTRALE — STRESS (+0,39 EM, WTI 84,62 verso il ramo rialzista >88 su Hormuz). Indici RIALZISTA — INDEBOLISCE (-0,33 EM, verso il ramo ribassista 7.641). Nessun ramo attivato, nessuna invalidazione scattata: le minute FOMC (19 ago) sono il fulcro delle prossime biforcazioni."
  }
} as const;
