# Debito tecnico

Registro di quello che sappiamo essere storto e non abbiamo ancora
raddrizzato. Una riga per voce, con il riferimento al codice: serve a non
riscoprire due volte lo stesso problema, non a farne un piano.

Nulla di qui dentro è stato modificato quando la voce è stata scritta: sono
tutte cose **registrate, non risolte**.

## Convenzioni delle metriche (audit 22/08/2026)

- **A3 — Calmar con basi miste.** Il numeratore rapporta il rendimento al
  **saldo iniziale** (base fissa), il denominatore misura il drawdown sul
  **picco di equity** (base mobile): su un conto molto cresciuto il rapporto
  è strutturalmente più generoso di un Calmar a basi omogenee.
  → `src/lib/metrics/calmar.ts`
- **A5 — Rendimenti mensili su base mobile, Calmar su base fissa.** Le due
  viste del "rendimento %" nella stessa app non sono confrontabili fra loro.
  → `src/lib/metrics/monthly-returns.ts` vs `src/lib/metrics/calmar.ts`
- **A4 — Score radar che misura il rischio su due unità.** L'asse *Recovery
  factor* usa `netPnl / maxDrawdown` **in valuta**, l'asse *Max drawdown* usa
  la **frazione del picco**: un conto cresciuto ottiene punteggio alto su
  entrambi per lo stesso motivo, e il vantaggio viene contato due volte nella
  media a peso uguale.
  → `src/lib/metrics/score.ts` (`recoveryScore`, `ddScore`)
- **A6 — "Giornate" che sono giornate operative.** *Day Win Rate* e l'asse
  *Consistency* hanno per denominatore i soli giorni con almeno un trade
  chiuso, ma l'utente legge "giornate": chi opera 3 giorni su 5 risulta più
  costante di chi opera tutti i giorni.
  → `src/lib/metrics/day-stats.ts`, `src/lib/metrics/score.ts`
- **B4 — Nessun campo swap/overnight.** Lo schema ha solo `fees` per
  esecuzione: chi tiene posizioni multi-giorno deve infilarci dentro anche lo
  swap, o sparisce dal netto. Nessuna metrica può distinguerlo dalle
  commissioni.
  → `prisma/schema.prisma` (`Trade.fees`), `src/lib/trade-compute.ts`
- **B3 — Residuo Ulcer.** L'Ulcer Index ora consuma la serie giornaliera
  unica, ma resta sul periodo selezionato e non è normalizzato per durata: un
  periodo lungo con un vecchio drawdown profondo legge peggio di un periodo
  corto e recente, a parità di comportamento.
  → `src/lib/metrics/ulcer.ts`
- **Confine del giorno mai dichiarato in UI.** Il P&L si realizza il giorno di
  **chiusura** nel fuso dell'utente (`(closedAt AT TIME ZONE 'UTC') AT TIME
  ZONE user.timezone`), non sulla sessione di mercato: un trade chiuso alle
  23:50 di Roma e uno alle 00:10 finiscono in due giornate diverse pur essendo
  la stessa sessione. La convenzione è uniforme in tutto il codice, ma non è
  scritta da nessuna parte che l'utente possa leggere.
  → `src/lib/queries/stats.ts`, `analytics.ts`, `reports.ts`, `sessions.ts`

## Dati di prova

- **Il seed genera serie troppo regolari.** `prisma/seed.ts` produce conti con
  il 23-34% di giornate negative, contro il 47% di SIM1: con Sortino e Sharpe
  annualizzati i conti demo mostrano valori assurdi (Sortino ~25 e ~41 su una
  scala che si ferma a 2). Non è un difetto dell'app — è il generatore — ma
  rende i conti demo inutilizzabili per tarare a occhio le soglie. Da
  rigenerare **da solo**, in un intervento separato da quello sulle metriche:
  cambiare dataset e formule insieme rende impossibile attribuire i delta.
  → `prisma/seed.ts`
- **Il seed chiude i trade a mercato chiuso.** Nella stessa rigenerazione: il
  generatore deve chiudere le posizioni SOLO in sedute valide. Oggi apre nei
  giorni feriali (`weekdaysBetween`) ma lascia la durata libera fino allo
  swing multi-giorno, quindi un trade aperto venerdì chiude di sabato; e
  `closedAt` è UTC mentre il bucketing è in `Europe/Rome`, così un venerdì
  sera scivola al sabato. Da lì nascono i **41 trade e 37 sedute fantasma** di
  SIM1 (23 sabati + 14 domeniche), su CL/ES/GC/NQ — futures, con sabato e
  domenica chiusi. Sono anche il motivo per cui la serie di SIM1 vale ~285
  osservazioni/anno invece di 252.
  → `src/lib/demo/sim1-dataset.ts` (`weekdaysBetween`, `holdMinutes`, `closedAt`)

## Limiti dichiarati dei controlli di qualità dati

- **Il rilevatore di chiusure fuori sessione vede solo il weekend.** Segnala
  le chiusure fra sabato 00:00 UTC e domenica 20:59 UTC (esclusa `CRYPTO`):
  è la sola finestra in cui *nessun* mercato tradizionale è aperto, e sta in
  piedi senza calendari. Resta fuori, e va saputo:
  - le **festività di borsa** — un trade chiuso il 25 dicembre o a
    Thanksgiving passa liscio;
  - le **pause infragiornaliere** — i futures CME chiudono un'ora al giorno
    (22:00-23:00 UTC) e quella finestra non è controllata;
  - gli **scarti di fuso di poche ore** che non portano nessuna chiusura
    oltre il confine del weekend: su storici corti possono non emergere
    affatto.
  È un rilevatore di LOTTO ("questo import ha un problema sistematico?"), non
  di singolo trade ("questo trade è valido?"), ed è per questo che scatta su
  soglia e non sulla prima occorrenza.
  Coprire festività e orari veri richiederebbe una mappatura
  `simbolo → exchange` (oggi non c'è: `Trade.symbol` è testo libero e
  `assetClass` è troppo grossolana) più un calendario di sedute per exchange
  da aggiornare ogni anno. Scartato consapevolmente: costo di manutenzione
  ricorrente sproporzionato al guadagno.
  → `src/lib/out-of-session.ts`

## Da rivedere se cambia il perimetro

- **Conti su strumenti 24/7 (crypto): l'annualizzazione ×√252 non regge.**
  Oggi Sortino e Sharpe annualizzano su 252 sedute e la serie giornaliera
  riempie a zero i soli giorni feriali, tenendo però i non-feriali con trade
  (`dailyReturns`, deliberato: un weekend con P&L reale è un fatto). Con
  strumenti che scambiano sette giorni su sette le sedute sono ~365 l'anno e
  i weekend sono osservazioni **legittime**, non rumore: il fattore fisso
  sottostimerebbe i rapporti.
  La strada in quel caso è l'**opzione C — annualizzare sul conteggio reale**
  di osservazioni per anno (`√(osservazioni ÷ anni coperti)`) invece che su
  √252. Impatto già misurato su SIM1, che con 285,2 osservazioni/anno è il
  caso peggiore disponibile: Sortino 5,8687 → 6,2437 e Sharpe 2,9672 →
  3,1568, cioè **+6,4%** su entrambi; sui conti demo forex/futures (260,9
  oss./anno) sarebbe +1,7%.
  Attenzione al costo nascosto: un fattore che dipende dai dati rende le
  soglie fisse 1/2 non più direttamente confrontabili fra conti, ed è
  esattamente il motivo per cui le soglie derivate erano state tolte. Da
  affrontare solo quando un conto crypto esiste davvero, non prima.
  → `src/lib/metrics/daily-series.ts`, `sortino.ts`, `sharpe.ts`

## Macro Desk — scelto di non fare (audit 25/08/2026)

- **Legenda del gergo del Report.** "STRESS +0,76 EM", "ramo b2", "k_break",
  "MFE", "WBR" arrivano a schermo senza glossario. E il contenuto grezzo del
  desk: riscriverlo non spetta all'app, ma una legenda a scomparsa varrebbe.
  -> `src/app/(app)/macro-desk/report/page.tsx`
- **La confidenza non dichiara la propria scala.** "Confidenza 44%" non dice
  44% di cosa ne come e calcolata.
- **VDAX visibile a catalogo senza fonte.** Scelta corretta (il giorno che una
  fonte compare basta collegarla), ma va deciso se la voce debba restare a
  schermo. -> `src/lib/seasonality/instruments.ts`
- **L'harness CDP fotografa i grafici Recharts vuoti** in
  `captureBeyondViewport`. Verificato via DOM che il rendering e corretto: chi
  fa verifiche visive deve saperlo, o segnalera difetti inesistenti.

Fuori perimetro e non registrato come debito: `MacroDeskReport` non ha un cron
(i due slot Vercel sono occupati da cot-sync e seasonality-sync) e passa da un
ponte GitHub Actions oggi bloccato. La risposta corretta lato app e la banda
di freschezza, che ora c'e su indice, Report, Scorecard e Volatilita.

## Termometro di volatilita: la soglia e scaduta (misurato 25/08/2026)

**Lavoro di ricerca aperto, non un difetto da correggere in app.**

La soglia che separa ESPANSA da COMPRESSA e assoluta e congelata: vive in
`src/data/termometro-volatilita.json`, generato il **29/07/2026** dal progetto
esterno `regime_detection` (`scripts_termometro/33_passo3_produzione.py`), con
ricalcolo atteso il 29/01/2027. Coincide esattamente con la mediana della
storia intera di riferimento: 17,40 per GVZ (oro, rif. 2008-2026) e 35,42 per
OVX (WTI, rif. 2007-2026).

Nel frattempo GVZ e OVX si sono spostati su un livello piu alto, e la
classificazione e degenerata. Misurato sui dati reali di produzione:

| | ESPANSA/COMPRESSA ultime 120 sedute | degenere dal | ultima COMPRESSA |
|---|---|---|---|
| Oro (GVZ) | 120 / 0 | 17/02/2026 | 19/09/2025 |
| WTI (OVX) | 120 / 0 | 17/06/2026 | 07/01/2026 |
| S&P 500 (VIX) | 61 / 59 | mai | corrente |

Quota ESPANSA per anno solare, oro: 2023 16%, 2024 28%, 2025 60%, **2026
100%**. Su WTI: 2024 29%, 2025 44%, **2026 98%**.

Effetto sulla separazione, con proxy close-to-close sull'ultimo anno:
su WTI **da 44,2 pp dichiarati a 15,0 pp misurati**; sull'oro non calcolabile,
perche il gruppo di confronto non esiste piu.

**Perche non si corregge qui.** Passare a una soglia mobile o ricalibrare
quella statica significa cambiare la regola di classificazione dopo la
validazione, cioe spedire un sistema mai validato al posto di uno scaduto. Il
JSON stesso lo dice e rimanda la scelta a un ciclo futuro, quantificando il
costo della soglia statica in ~8-9 punti percentuali di precisione su WTI e
GER40. In piu la rivalidazione richiede l'**OHLC** degli strumenti, che in
questo repo **non esiste**: `SeasonalityDailyBar` conserva solo `close`, e la
definizione di giornata ampia del termometro e `(High-Low)/Close`.

**Cosa e stato fatto invece**, che non richiede rivalidazione: la statistica
condizionale sparisce quando il gruppo di confronto non c'e piu, la pagina
dichiara l'eta della taratura, e un rilevatore accende l'allarme da solo
(`src/lib/classificatore-degenere.ts`, `src/lib/queries/termometro-degrado.ts`).

Quando il JSON verra rigenerato, il rilevatore continuera a valere: e tarato
sulla forma del problema, non sui numeri di oggi.

## Il metro del terminale: cosa NON e stato fatto (25/08/2026)

Contesto: la sezione Volatilita e passata da verdetto a fatti, e il verdetto
binario e stato messo dietro un cancello (`src/lib/termometro-cancello.ts`).
Quello che segue e cio che si e scelto di **non** fare, e perche.

### Il termometro a finestra mobile non e stato importato

Esiste, fuori da questo repo, una variante del termometro con soglia a
finestra mobile che ha superato una prova pre-registrata su **WTI (+30,5 pp)**
e su **S&P 500 (+47,1 pp)**, ma non sull'oro (+23,5 contro una soglia di 25).
Non e stata portata qui, e non e una dimenticanza:

- la tabella che serve non esiste in questo repo. `src/data/termometro-volatilita.json`
  contiene la variante a **soglia statica**, con numeri fuori campione diversi
  (oro +5,3 pp su ESPANSA, WTI +14,1 pp). Importare la variante mobile
  significa rigenerarla dal progetto `regime_detection` e sostituire il file
  per intero, non modificarlo;
- il JSON attuale registra da se che il confronto statica-contro-mobile
  **non va riaperto adesso** (`candidato_per_un_ciclo_futuro`), perche
  cambiare la regola di classificazione dopo la validazione significa
  spedire un sistema mai validato al posto di uno scaduto.

Quando quella tabella arrivera, il cancello la accogliera senza modifiche:
legge `validazione_out_of_sample` per stato e la confronta con la soglia che
la tabella stessa dichiara nei propri criteri (15 pp). Se la variante mobile
supera quella soglia su WTI e S&P, i due verdetti ricompaiono da soli.

### L'escursione vera della giornata resta non misurabile qui

La sezione Volatilita mostra il movimento **chiusura-chiusura**, non
`(High-Low)/Close`. Sottostima l'ampiezza reale della giornata e la pagina lo
dichiara, ma resta una misura piu povera di quella giusta.

Causa: `SeasonalityDailyBar` conserva **solo `close`**. Aggiungere OHLC
significa una migrazione, un ingest che riempia lo storico su quattro
strumenti e la verifica che le fonti (Dukascopy, Yahoo, FRED) diano OHLC
coerente. E lo stesso ostacolo che rende il termometro non rivalidabile in
questo repo, ed e il prerequisito della strada B in
`docs/macro-desk/EXPECTED-MOVE-PROPOSTA.md`.

### La scorecard non e stata toccata

Le hit-rate della Scorecard sono percentuali, ma sono la **misura retrospettiva
di quello che il desk ha gia dichiarato**, con denominatori separati per tipo
di bias, esclusioni dichiarate e soppressione sotto il campione minimo. Non
affermano nulla sul futuro: sono il registro di responsabilita del desk, ed e
esattamente cio che un terminale mostra. Restano come sono.

Quello che resta aperto la dentro non e la percentuale, e il **campione**: il
campo `resolved` dei report e valorizzato in 1 report su 21, quindi il track
record e quasi vuoto. E una dipendenza dal ponte esterno, non un difetto di
questa pagina.

### La confidenza del report non e stata ricalibrata

Ora dichiara la propria scala (`44/100`, non `44%`) e dice cosa non e (non una
probabilita). **Non** e stata resa una probabilita calibrata: per farlo
servirebbe una calibrazione sul track record, e il track record ha un campione
troppo piccolo (sopra). La correlazione fra confidenza dichiarata ed esito
resta misurata nella Scorecard, che e il posto giusto.

### Il ritardo del report resta una dipendenza esterna

Tre sezioni su otto leggono da `MacroDeskReport`, che nessun cron produce (i
due slot Vercel sono occupati). Dopo questo intervento la Volatilita **non e
piu** fra quelle tre per la parte di contesto: livello, rango, variazione e
movimento arrivano da `SeasonalityDailyBar`, aggiornata ogni notte. Restano
dal report gli indici che solo lui porta (VVIX, SKEW, put/call, MOVE) e il
commento del giorno, entrambi etichettati come tali con la data del report.

## OHLC giornaliero: cosa copre e cosa no (26/08/2026)

Le colonne `open/high/low` esistono su `SeasonalityDailyBar` e il desk mostra
l'escursione vera `(high-low)/close`. Quello che segue e cio che NON copre.

### Il WTI resta senza escursione vera

La catena del WTI e FRED `DCOILWTICO` (primaria) e Dukascopy `lightcmdusd`
(riserva). FRED risponde, quindi la riserva non viene mai raggiunta, e FRED
pubblica una serie a VALORE SINGOLO: la chiusura spot di Cushing, senza
massimo e minimo. Su WTI la pagina dichiara «dato non disponibile» col motivo.

Le due strade per chiuderlo sono entrambe decisioni, non lavoro:

- **passare al front future** (Yahoo `CL=F`, OHLC completo e otto giorni piu
  fresco dello spot). Ma **cambia la serie**: la stagionalita calcolata sul
  future non e quella calcolata sullo spot, e i numeri storici si muovono. E
  una migrazione, non un aggiornamento — v. voce (b)7 di
  `docs/macro-desk/ANALISI-TERMINALE-PRO.md`;
- **prendere high/low da Dukascopy tenendo la chiusura FRED**: da scartare.
  Mescolerebbe in una riga sola il massimo di un CFD col la chiusura di un
  altro strumento, ed e esattamente il genere di silenzio che questo desk
  toglie.

### Gli indici di volatilita non hanno OHLC da FRED, ma ce l'hanno da CBOE

VIX, GVZ e OVX arrivano da FRED a valore singolo. Il CDN di CBOE pubblica gli
stessi indici con OHLC completo e un giorno piu fresco (verificato il
26/08/2026: `VIX_History.csv` ha `DATE,OPEN,HIGH,LOW,CLOSE`). E la voce (a)3-4
del piano terminale, non di questo passo.

### DIFETTO NOTO DELLA FONTE STORICA: 122 barre dell'oro con la chiusura fuori dal range

**Strumento**: XAUUSD · **fonte**: Dukascopy `xauusd`, candele `d1` bid
**Intervallo**: dal **15/06/1999** al **01/10/2002**
**Numero**: **122 sedute** su 8.256 (1,5% della serie)

| Anno | Sedute |
|---|---|
| 1999 | 28 |
| 2000 | 52 |
| 2001 | 20 |
| 2002 | 22 |
| **totale** | **122** |

**In cosa consiste.** La chiusura cade di qualche centesimo SOTTO il minimo
della stessa barra, cioe la candela viola il proprio vincolo interno
`low <= min(open, close)`. Esempi presi dalla fonte:

```
02/07/2002  O=314,65  H=315,90  L=312,80  C=312,70
08/08/2002  O=313,80  H=314,70  L=310,60  C=310,40
25/09/2002  O=325,90  H=326,30  L=322,50  C=322,00
```

L'origine e a monte: su quei dati la chiusura giornaliera e presa da un
insieme di tick diverso da quello su cui sono aggregati massimo e minimo.
Riguarda **solo** l'oro e **solo** i primi anni della serie: dal 2003 in poi
non se ne presenta piu nessuna.

**Cosa fa il codice.** `normalizeBars` rifiuta l'OHLC di quelle barre e tiene
la sola chiusura: nessuna riparazione, nessuna sostituzione del minimo con la
chiusura. Su una barra corrotta si preferisce non avere l'escursione piuttosto
che averne una sbagliata — ed e la stessa guardia che protegge dal bug del
punto decimale gia visto in produzione su DV1X.

**Perche non si corregge.** Sarebbe riscrivere dati della fonte su
un'inferenza nostra, per l'1,5% di una serie e su sedute di oltre vent'anni
fa. Il numero non e nascosto: la pagina dichiara «calcolata sulle 8.134 sedute
su 8.256» e il job lo riporta a ogni esecuzione
(`ContoOhlc.scartatePerIncoerenza`). Se un giorno diventassero migliaia, la
causa sarebbe un'altra e quel conteggio e l'unico modo per accorgersene.

### La serie giornaliera dell'oro contiene barre della DOMENICA

1.206 sedute su 8.256, circa una per settimana, presenti da sempre (1.154
c'erano gia prima di questo intervento: non e una novita introdotta qui).
Sono le poche ore di apertura domenicale del CFD. Non entrano nelle
statistiche per giorno della settimana (lun-ven), ma entrano nei rendimenti
giornalieri e quindi nelle serie mensili e settimanali. Il modello expected
move del progetto esterno le fonde nel lunedi o le scarta; qui non lo
facciamo. Da valutare a se: cambiarlo sposterebbe numeri storici gia
pubblicati.

## Calendario macro: la lacuna che resta, e cosa e stato provato (26/08/2026)

Il desk mostra ora un calendario di eventi programmati, ma **senza consenso di
mercato e senza valore precedente**. Non e una scelta: nessuna fonte gratuita,
verificabile e automaticamente aggiornata li pubblica. Provate tutte, con la
chiamata vera:

| Fonte | Esito misurato |
|---|---|
| Trading Economics `api.tradingeconomics.com/calendar?c=guest:guest` | **410 Gone** — «the guest account has been discontinued» |
| Finnhub `/calendar/economic` | **401** senza chiave. Lo swagger ufficiale (`finnhub.io/static/swagger.json`, 200, 588 KB) CONFERMA che l'endpoint esiste e ha i campi giusti (`actual`, `prev`, `estimate`, `impact`, `time`) e dice solo che «historical events and surprises are available for Enterprise clients». **Quale piano copra gli eventi FUTURI non e verificabile senza registrare un account**, e registrare account non e una cosa che faccio |
| Financial Modeling Prep `/economic_calendar` | **401 Invalid API KEY** |
| Nasdaq Data Link `data.nasdaq.com/api/v3/...` | **403**, muro anti-bot |
| BLS `bls.gov/schedule/...` e `bls.gov/schedule/news_release/bls.ics` | **403** a qualunque chiamata non da browser, anche con user agent. Il calendario dei rilasci di NFP e CPI e pubblicato ma non leggibile da un server |
| BLS API v1 `api.bls.gov/publicAPI/v1/timeseries/data/` | **200, 85 ms, keyless** — ma restituisce i DATI pubblicati, non il calendario dei rilasci. Utile per altro, inutile qui |
| FRED `fred/releases/dates` | richiede una chiave gratuita, non configurata in questo ambiente e non richiedibile da me |
| ECB calendario in formato macchina | **nessuno**: la pagina ufficiale e HTML (200), gli unici ICS sono di terze parti (`luispfonseca.com`, `centralbank.watch`, `smartcalendars.ai`) e la provenienza incerta li esclude |

**Cosa c'e al posto**, e perche vale: FOMC, BCE, EIA e COT pubblicano i propri
orari IN ANTICIPO, e sono una categoria diversa da un dato di mercato — le date
del FOMC del 2027 sono gia note oggi. EIA (mercoledi 10:30 ET) e COT (venerdi
15:30 ET) sono generati dalla loro cadenza fissa, quindi non si trascrive
nulla. FOMC e BCE sono trascritti dalle pagine ufficiali il 26/08/2026 con
l'URL accanto, e la tabella dichiara `VALIDO_FINO_AL`: passata quella data i
due spariscono dal calendario e la pagina lo dice, invece di mostrare un
calendario vuoto senza spiegazione.

**Cosa manca ancora, esplicitamente**: NFP e CPI. Le loro date sono pubblicate
dal BLS ma bls.gov risponde 403 a chiamate non da browser, e trascriverle a
memoria significherebbe inventarle. Restano fuori finche non esiste una fonte
leggibile.

## Dukascopy restituisce un numero di barre DIVERSO fra una chiamata e l'altra

Misurato il 26/08/2026 sull'oro, a poche ore di distanza e con gli stessi
parametri: **8.256 barre** in una esecuzione, **7.944** in un'altra. La
differenza e l'intero anno **2021**, che compare e sparisce.

Non e un difetto del nostro codice — la vecchia normalizzazione applicata alla
stessa risposta produce lo stesso insieme di righe — ma e un rischio reale: il
job riscrive l'intera serie a ogni esecuzione, quindi una notte in cui
l'archivio pubblico risponde corto lascia un buco nello storico, e le
statistiche stagionali si spostano senza che nessuno lo abbia chiesto.

Non e stato corretto qui perche la correzione giusta non e banale: servirebbe
o un confronto con la lunghezza precedente che rifiuti una serie
improvvisamente piu corta, o un merge invece di una sostituzione. Entrambe
cambiano la semantica della scrittura e vanno decise, non improvvisate.

## WTI: due serie affiancate, non una sostituita (26/08/2026)

Il WTI era l'unico dei tre strumenti senza massimo e minimo, perche FRED
`DCOILWTICO` pubblica lo spot Cushing come valore singolo e con otto giorni di
ritardo. La tentazione era sostituirlo col future front-month (Yahoo `CL=F`,
OHLC completo, aggiornato in giornata). **Misurato prima di decidere**, sulle
6.506 sedute sovrapposte (2000-08-23 → 2026-08-18):

| Misura | Valore |
|---|---|
| scarto di LIVELLO mediano | 0,07 $ (0,07%) |
| scarto di livello p95 | 1,24 $ |
| scarto di livello massimo | 8,81 $ (42,5%, aprile 2020) |
| **correlazione dei RENDIMENTI** | **0,9376** |
| deviazione standard dei rendimenti | future 2,730% · spot 2,897% |
| sedute con scarto di rendimento > 3 pp | 84 su 6.505 |

**Conclusione: affiancare, non sostituire.** Con una correlazione di 0,94 —
non 0,99 — le due serie sono strumenti diversi: sostituire avrebbe spostato
OGNI statistica stagionale gia pubblicata, e perso 14 anni di storia (lo spot
parte dal 1986, il future dal 2000).

Da qui la divisione, dichiarata in entrambe le pagine:

- **Stagionalita** usa lo spot Cushing: nessun artefatto di cambio contratto,
  storia dal 1986, ed e la base di tutte le statistiche gia pubblicate;
- **Volatilita** usa il future: ha massimo e minimo, quindi il WTI ha
  finalmente l'escursione vera, ed e aggiornato in giornata.

I numeri delle due sezioni NON sono confrontabili riga per riga, e la pagina
lo scrive.

## Struttura a termine del WTI: nessun rango storico, e perche

Il livello (front meno secondo contratto) c'e; il rango storico no. L'unica
serie gratuita del SECONDO contratto e `RCLC2` dell'EIA, e **si e fermata al
05/04/2024** — verificato il 26/08/2026 con la chiave API: 200, 20.173 righe,
ultimo periodo aprile 2024. Costruirci un rango darebbe un percentile su dati
vecchi di due anni, cioe il difetto che questo desk ha gia avuto.

Il rollover NON e mantenuto a mano: Yahoo dichiara il contratto dietro a
`CL=F` nel campo `shortName` («Crude Oil Oct 26»), e da li si ricava il mese
successivo. Se il codice dedotto fosse sbagliato, il prezzo che torna sarebbe
di un'altra scadenza: la guardia rifiuta uno scarto oltre il 25% fra contratti
adiacenti e non pubblica nulla, invece di mostrare un numero plausibile e
falso.

## Il ciclo economico non si assegna senza un trend dimostrato (26/08/2026)

La pagina Trends assegna a ogni serie un quadrante — espansione,
rallentamento, contrazione, ripresa — incrociando il LIVELLO (z-score sul
decennio) con la DIREZIONE (segno della pendenza sulle ultime sei
osservazioni). Il livello e un fatto; la direzione, quando il test del trend
dichiara «laterale», e per costruzione indistinguibile da zero.

Fino al 26/08/2026 il quadrante usava lo stesso il segno di quella pendenza.
Misurato su 10 serie FRED e 1.800 istantanee mensili:

| Condizione | Il quadrante cambia da un'osservazione all'altra |
|---|---|
| trend laterale | **357 volte su 1.462 — 24,4%** |
| trend significativo | 4 volte su 206 — 1,9% |

Un'etichetta di ciclo che salta un mese su quattro non e una lettura di
regime. Quelle etichette votavano anche nelle pillole di sezione e nel badge
«ciclo generale» in cima alla pagina, quindi il rumore arrivava al titolo.

**Deciso:** senza direzione dimostrata, nessuna etichetta
(`computeSeriesMetrics` in `src/lib/macro-trends-metrics.ts`). `levelZ` resta,
perche e un fatto che non dipende dalla pendenza.

**Conseguenza dichiarata, non nascosta:** sulle serie macro il trend e
laterale nell'85% delle osservazioni (1.532 su 1.800), quindi il chip del
ciclo sara assente il piu delle volte e le pillole diranno spesso «N/D». E il
prezzo giusto: prima l'etichetta c'era sempre ed era un lancio di moneta un
quarto delle volte. La pagina lo spiega in fondo, coi numeri.

## Lacuna aperta: al desk manca il «perche» di un movimento (26/08/2026)

Il 26/08/2026 e stato rimosso il box «Contesto della settimana» del pannello
COT: 2-3 titoli per strumento presi ogni sabato da Google News RSS per parola
chiave, con due cancelli automatici sul linguaggio.

Motivo della rimozione, in ordine di peso:

1. **La selezione filtrava la direzione, non l'irrilevanza.** Accanto al
   posizionamento dei fondi sull'oro sono usciti il prezzo degli anelli d'oro
   in Vietnam (Vietnam.vn) e un «oro giu dello 0,63% sul Comex» di due giorni
   prima. Un titolo senza un numero non e un fatto.
2. **La fonte non e qualificabile.** Un aggregatore che restituisce testate
   arbitrarie non ha un codice di risposta proprio della singola notizia, non
   ha una data di riferimento sua, e non ha licenza per la ripubblicazione dei
   titoli. E il tipo di provenienza che la revisione del 26/08/2026 non
   ammette.

Effetto collaterale voluto: l'implicazione meccanica (tabella statica metrica
x banda) era annidata dentro quel box e spariva con lui quando il job non
produceva nulla. Adesso e incondizionata.

**Cosa resta scoperto:** il desk dice cosa e successo e quanto e raro, ma non
perche. Il sostituto corretto e un wire con licenza (Reuters, Dow Jones) o un
feed ufficiale per strumento; nessuno dei due e gratuito, quindi la lacuna
resta aperta finche non si decide di pagarlo. Il calendario macro aggiunto
nella stessa revisione copre la meta programmata della domanda: cosa succede,
e quando.

**Codice rimosso:** `src/lib/cot-contesto-job.ts`, `fetchRssReale` e la meta
di `src/lib/cot-contesto.ts` che costruiva le query, leggeva l'RSS e
selezionava i titoli; `scripts/cot-contesto-once.ts`; la chiamata nel cron
`api/cot-sync`. Restano — perche li usa anche la Sintesi — i due cancelli sul
linguaggio e la tabella delle implicazioni meccaniche.

**Tabella orfana:** `CotContestoBox` non e piu scritta ne letta da nessuno.
Non e stata droppata: cancellare dati e una decisione di chi possiede il
database, non di una revisione della UI. Il drop e da fare in una migrazione a
se, quando si decide che lo storico dei box non serve piu.

## Due misure dello stesso indice, una accanto all'altra (26/08/2026)

Nella Sintesi i fattori F1 e F4 misurano lo STESSO indice di volatilita
implicita da due fonti diverse: F1 il rango sull'intera storia dell'archivio,
F4 le finestre a 1/3/5 anni dal report giornaliero. La discordanza fra i due
ranghi e informazione vera (`rilevaDiscordanza`) e va mostrata.

Quello che non andava e che uscivano uno sotto l'altro con due LIVELLI e due
DATE senza dirlo: «GVZ 27,69» (25/08) e due riquadri piu sotto «Il GVZ sta a
28,28» (24/08). Due numeri per la stessa cosa, e nessun modo per il lettore di
capire quale valesse. Adesso F4 dichiara di essere la stessa misura letta dal
report, a un'altra data.

Nella stessa passata le due righe di stagionalita (mese e giorno della
settimana) hanno preso l'orizzonte scritto accanto: la loro ampiezza
differiva di un ordine di grandezza — 6,15 punti ad agosto contro 0,19 punti
di mercoledi — solo perche una somma ventuno sedute e l'altra una.

## Gli indici di volatilita passano alle fonti automatiche (26/08/2026)

Cinque dei sei indici che il report giornaliero portava a mano — VIX, VVIX,
SKEW, GVZ, OVX — arrivano ora dal CDN del CBOE con il resto dell'archivio.
GVZ, OVX e VIX c'erano gia; VVIX e SKEW sono entrati in questa passata.

Il motivo non e di eleganza. Il 26/08/2026 la sezione Volatilita mostrava
sulla STESSA PAGINA:

| | Livello | Data | Lettura |
|---|---|---|---|
| GVZ dal report | 23,92 | vintage 14-18/08 (Investing.com) | «IV oro bassa in assoluto» |
| GVZ dall'archivio | 27,69 | 25/08 (CBOE) | 92° percentile dal 2008, +15,5% in 5 sedute |

Due valori della stessa misura, due letture opposte, e nessun modo per chi
legge di sapere quale valesse. Verificato dopo la modifica: la stringa
«23,92» non compare piu in pagina.

**Chiamate di verifica, 26/08/2026:**

| Serie | Esito |
|---|---|
| CBOE `VVIX_History.csv` | **200**, 566 ms, 5.090 sedute dal 03/06/2006 |
| CBOE `SKEW_History.csv` | **200**, 527 ms, 9.213 sedute dal 02/01/1990 |
| FRED `VVIXCLS` / `SKEWCLS` | **404** entrambe: nessuna riserva possibile |

**Nessuna riserva, ed e dichiarato in pagina.** A differenza di GVZ e OVX, che
hanno FRED come seconda strada, VVIX e SKEW dipendono dal solo CBOE: se quel
CDN non risponde restano fermi e la verifica di esito del job lo dice.

**Cosa resta al report, e solo quello:**

- **MOVE** — indice proprietario ICE, FRED risponde 404. Arriva dal report col
  vintage dichiarato, oppure non arriva.
- **put/call** — il CBOE lo pubblica solo in una pagina generata da
  JavaScript; i due percorsi CSV del CDN rispondono **403**. La pagina lo
  dichiara come lacuna con il motivo, invece di lasciarlo sparire.

Entrambe si mostrano SEMPRE, anche quando il report non le manda: una lacuna
detta e un'informazione, una lacuna taciuta e un buco che nessuno colma.

## Il termometro beve dall'archivio, e si data da solo (26/08/2026)

Era l'ultima percentuale condizionale del desk e poggiava sul dato piu vecchio
disponibile: il 26/08 classificava l'S&P `COMPRESSA` sul VIX del 20/08 (15,98,
copiato a mano nel report) mentre sei righe piu in su la stessa pagina
mostrava il VIX del 25/08 dal CBOE (15,45).

Adesso gli ingressi vengono dalle stesse righe di contesto che la pagina rende
(`ingressiTermometro` in `lib/volatilita-report.ts`, puro e testato), e la
data dell'osservazione viaggia col valore: ogni carta dichiara «calcolata
sulla chiusura VIX del 25/08/2026». Un verdetto senza la data del dato su cui
poggia non si puo verificare.

**Il cancello regge dopo il passaggio.** Con VIX 15,45 invece di 15,98 l'S&P
resta `COMPRESSA` al 34° percentile e supera ancora la prova fuori campione
(18,6 punti percentuali di separazione contro i 15 richiesti, n=150). Se non
l'avesse superata sarebbe stato spento come oro e WTI.

Sono spariti con questa modifica `estraiIvDaVolPanel`,
`estraiChiusureDaBiasRecord` e `componiIngressi`: esistevano solo per leggere
il report. Il `biasRecord` non serve piu al termometro — la chiusura per la
cifra in valuta viene dall'archivio.

## La Sintesi dichiara il ritardo del report (26/08/2026)

Era l'unica delle cinque pagine dipendenti dal report a non avere la banda di
freschezza. Adesso ce l'ha. Nella stessa passata e stata corretta
l'attribuzione del fattore F4, che diceva «il GVZ rilevato dal report»: quel
valore viene da FRED via Trends (`fonti.trends`, `sezione: "Trends —
Volatilita"`), non dal report. L'osservazione era giusta — due letture della
stessa misura, due date — l'attribuzione no.
