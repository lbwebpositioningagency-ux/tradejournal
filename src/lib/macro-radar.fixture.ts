/**
 * Il payload VERO del run di collaudo di «RADAR SETTORE» — giovedì 27/08/2026,
 * il primo run in assoluto — con le tre correzioni decise a valle del run:
 *
 *  1. `weekOf` era `2026-08-30`, la domenica del run SUCCESSIVO: sotto la
 *     regola attuale (mai una domenica futura) vale `2026-08-23`, altrimenti
 *     collide con il run automatico di domenica 30.
 *  2. `unverifiableAreas` non esisteva — il collaudo è avvenuto prima che la
 *     regola fosse scritta — e `emptyAreas` di conseguenza MENTIVA: elencava
 *     come vuote anche B, C ed F, che invece non è stato possibile verificare
 *     (le note del run lo dicono: «Fonti primarie non raggiungibili in modo
 *     utile: elenco notices CME …, elenco notices ICE …»). Vuote per davvero
 *     sono solo D e G, dove le fonti sono state enumerate e i contenuti
 *     trovati e scartati dal filtro.
 *  3. Gli apostrofi sostitutivi (`gia'`, `piu'`, `perche'`) sono lasciati
 *     COM'ERANO di proposito: sono la prova che serve a `normalizzaAccenti`.
 *     La precauzione non è codificata nello schema — i report futuri
 *     arriveranno con gli accenti veri e passeranno indenni.
 *
 * Nota che l'area B compare fra le voci di `items` ED è non verificabile: le
 * due cose convivono («ho trovato UNA cosa, ma non ho potuto guardare
 * l'elenco»), e schema e pagina devono reggerlo. Non è un'incoerenza.
 */
export const RADAR_COLLAUDO_2026_08_23 = {
  "type": "radar-settore",
  "weekOf": "2026-08-23",
  "generatedAt": "2026-08-27T15:30:49Z",
  "coverage": {
    "from": "2026-08-13",
    "to": "2026-08-27",
    "extended": true
  },
  "top": [
    {
      "title": "CME lancia gli E-nano su S&P 500, Nasdaq-100, Russell 2000 e Dow",
      "whatChanged": "Nuova famiglia di futures su indici azionari pari a 1/10 dei Micro E-mini, quotata su Globex con negoziazione 23 ore su 24; listing ufficiale con SER-9789 del 24 agosto 2026.",
      "action": "Verificare con il broker se NES/NNQ sono gia' negoziabili e a quale margine intraday prima di considerarli per il sizing.",
      "sourceUrl": "https://www.cmegroup.com/notices/ser/2026/08/ser-9789.html",
      "sourceName": "CME Group - Special Executive Report SER-9789"
    },
    {
      "title": "FTMO aggiunge TradingView tra le piattaforme ammesse",
      "whatChanged": "TradingView diventa opzione di piattaforma per FTMO Challenge, Verification e FTMO Account, con esecuzione ordini diretta dal grafico.",
      "action": "Se serve il cambio piattaforma su un account gia' attivo, va richiesto e decorre dalla fase successiva o dal ciclo di fatturazione successivo.",
      "sourceUrl": "https://ftmo.com/en/blog/tradingview-is-now-available-as-a-platform-option-at-ftmo/",
      "sourceName": "FTMO - Product News"
    }
  ],
  "items": [
    {
      "id": "cme-e-nano-equity-index-futures-launch",
      "area": "B",
      "title": "CME Group - listing dei futures E-nano su S&P 500, Nasdaq-100, Russell 2000 e Dow Jones",
      "whatChanged": "Introdotti quattro nuovi futures su indici azionari di dimensione pari a 1/10 dei Micro E-mini: E-nano S&P 500 (NES, 0,50 USD per punto), E-nano Nasdaq-100 (NNQ, 0,20 USD per punto), E-nano Russell 2000 (N2K, 0,50 USD per punto), E-nano Dow Jones Industrial Average (NDOW, 0,05 USD per punto). Negoziazione su Globex, 23 ore al giorno, accesso tramite broker/FCM come gli altri prodotti Equity. Il comunicato stampa e' del 3 agosto 2026; il Special Executive Report di initial listing e' datato 24 agosto 2026, data indicata anche come lancio.",
      "announcedOn": "2026-08-03",
      "effectiveFrom": "2026-08-24",
      "status": "attivo",
      "impact": "Nuovo scalino di size sotto i Micro sugli indici USA: consente esposizione e gestione del rischio con granularita' dieci volte piu' fine su ES/NQ. Tick size, valore del tick e margini non sono indicati nelle pagine pubbliche consultate e vanno verificati sul broker.",
      "sourceUrl": "https://www.cmegroup.com/notices/ser/2026/08/ser-9789.html",
      "sourceName": "CME Group - Special Executive Report SER-9789 (24 ago 2026)"
    },
    {
      "id": "ftmo-tradingview-platform-option",
      "area": "A",
      "title": "FTMO - TradingView disponibile come piattaforma per Challenge, Verification e FTMO Account",
      "whatChanged": "FTMO ha aggiunto ufficialmente TradingView come opzione di piattaforma per FTMO Challenge, Verification e FTMO Account, con invio ordini diretto dall'interfaccia TradingView, gestione visuale di stop loss e take profit sul grafico, layout fino a 8 grafici, volume profile, Pine Script e Bar Replay. Disponibile da subito sui nuovi account; per gli account esistenti il cambio piattaforma va richiesto e decorre dalla fase successiva o dal ciclo di fatturazione successivo. La comunicazione non indica costi aggiuntivi ne' limitazioni tecniche.",
      "announcedOn": "2026-08-26",
      "effectiveFrom": "2026-08-26",
      "status": "attivo",
      "impact": "Cambia la piattaforma utilizzabile su account FTMO: possibile operare dal medesimo ambiente grafico usato per l'analisi, senza passare da MT4/MT5/cTrader.",
      "sourceUrl": "https://ftmo.com/en/blog/tradingview-is-now-available-as-a-platform-option-at-ftmo/",
      "sourceName": "FTMO - Product News (26 ago 2026)"
    },
    {
      "id": "tradingview-rectangle-alerts-greater-less-than",
      "area": "E",
      "title": "TradingView - gli alert su rettangolo supportano le condizioni Greater than e Less than",
      "whatChanged": "Le condizioni Greater than e Less than sono state aggiunte agli alert impostati sui rettangoli disegnati sul grafico.",
      "announcedOn": "2026-08-21",
      "effectiveFrom": "2026-08-21",
      "status": "attivo",
      "impact": "Gli alert su zone/aree possono ora scattare al superamento o alla rottura del livello e non solo al tocco: cambia il modo di impostare le notifiche su livelli operativi.",
      "sourceUrl": "https://www.tradingview.com/blog/en/alerts-greater-than-and-less-than-60308/",
      "sourceName": "TradingView Blog - Alerts (21 ago 2026)"
    },
    {
      "id": "tradingview-script-publishing-rules-change",
      "area": "E",
      "title": "TradingView - cambiano le regole di pubblicazione di indicatori e strategie Pine Script",
      "whatChanged": "TradingView ha annunciato modifiche alle regole applicate alla pubblicazione di indicatori e strategie in Pine Script.",
      "announcedOn": "2026-08-14",
      "effectiveFrom": null,
      "status": "annunciato",
      "impact": "Riguarda le regole a cui e' soggetta la pubblicazione di script propri sulla piattaforma. La data di efficacia non e' stata rilevata dal materiale consultato.",
      "sourceUrl": "https://www.tradingview.com/blog/en/updated-script-publishing-60116/",
      "sourceName": "TradingView Blog - Social (14 ago 2026)"
    }
  ],
  "watchlist": [],
  "emptyAreas": [
    "D",
    "G"
  ],
  "unverifiableAreas": [
    {
      "area": "B",
      "reason": "pagina indice notices CME e ICE risponde 200 ma non espone l'elenco; documento raggiunto solo via ricerca mirata"
    },
    {
      "area": "C",
      "reason": "nessun canale di annunci ufficiale enumerabile individuato"
    },
    {
      "area": "F",
      "reason": "nessun canale di annunci ufficiale enumerabile individuato"
    }
  ],
  "discarded": 31,
  "notes": "Primo run in assoluto: la pagina Notion di stato esisteva ed era leggibile ma riportava 'mai eseguito', quindi non c'era alcuna finestra precedente da cui calcolare il buco. Finestra impostata a 14 giorni (13-27 ago 2026, extended: true) applicando il massimo previsto dal PASSO 0; nessuna deduplica possibile perche' la tabella delle voci gia' riportate era vuota. Run eseguito manualmente giovedi' 27 agosto 2026 come collaudo presidiato: il campo weekOf e' valorizzato con la domenica del prossimo run programmato (2026-08-30) perche' il run non cade di domenica. Aree C (broker e costi) e F (dati e API): nessun annuncio ufficiale da fonte primaria rilevato nella finestra. Area D: nella finestra sono usciti sei comunicati CFTC (consultazioni, enforcement, comitato consultivo) e due comunicati ESMA, tra cui la conferma del go-live al 3 settembre 2026 del reporting settimanale delle posizioni sui derivati su commodity; nessuno supera il filtro del PASSO 2 perche' non modifica come, con quali strumenti, a che costo o sotto quali regole opera un trader retail o prop. Area G: nella finestra sono stati pubblicati paper q-fin.TR pertinenti (arXiv:2608.18195 del 18 ago, market making multi-livello con reinforcement learning; arXiv:2608.19389 del 19 ago, provision di liquidita' concentrata con reinforcement learning) ma nessuno supera il filtro operativo del PASSO 2, che per costruzione esclude la ricerca accademica. Fonti primarie non raggiungibili in modo utile: elenco notices CME (la pagina indice non espone la lista, i singoli SER sono stati raggiunti solo via ricerca), archivio Special Executive Report CME, elenco notices ICE Futures U.S., pagina https://ftmo.com/en/news/ (404, sostituita da https://ftmo.com/en/blog/), listing arXiv q-fin.TR senza date di submission (date recuperate dalle pagine abstract dei singoli paper)."
} as const;
