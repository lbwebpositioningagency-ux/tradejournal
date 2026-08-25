# Audit del Macro Desk

Stato di salute delle otto sezioni, misurato sui **dati reali di produzione**
(Neon, sola lettura, via Prisma) il **25/08/2026**, e verificato a schermo su
localhost con quegli stessi dati replicati in locale.

Metodo: mai il driver `pg` grezzo per leggere le date — con quello escono
sfalsate di un giorno. Solo Prisma.

## F0 — tabella di salute

| Sezione | Rende | Tabella sorgente | Ultimo dato | Aggiornata da | Dichiara la propria età? |
|---|---|---|---|---|---|
| Trends | sì | **nessuna** — FRED live via `fetchFredSeries` | oggi | fetch a ogni richiesta (`next.revalidate`) | sì, "valori pubblicati oggi da FRED" + data per osservazione |
| Scorecard | sì | `MacroDeskReport` | 21/08 (5 gg) | **solo script manuale** | **no → corretto in F1** |
| Stagionalità | sì | `Seasonality*` (9 164 stat) | 24/08 (2 gg) | cron `seasonality-sync`, 03:30 | sì, riga "ultimo calcolo" |
| AI Analyst | sì | nessuna propria: compone report + COT + Driver + Trends | eredita la più vecchia | eredita | sì, mostra il dato più vecchio usato |
| Volatilità | sì | **nessuna** — dentro `MacroDeskReport.payload` | 21/08 (5 gg) | **solo script manuale** | data sì, ritardo **no → corretto in F1** |
| Posizionamento | sì | `CotWeek` + `CotContestoBox` | 18/08 (8 gg, normale: COT è settimanale) | cron `cot-sync`, sabato 05:00 | parziale |
| Driver | sì | `DriverDeskBar` + `DriverDeskCoverage` | 24/08 (2 gg) | cron `seasonality-sync` (delta) | sì, "ultimo aggiornamento dati" nel fuso utente |
| Report | sì | `MacroDeskReport` | 21/08 (5 gg) | **solo script manuale** | sì, data in chiaro |

Nessuna sezione cade in error boundary. Nessuna è vuota.

### Il difetto peggiore trovato

**Tre sezioni su otto vivono di un report che nessun job produce.** Non c'è
un cron per il Macro Desk: `vercel.json` ne dichiara due, `cot-sync`
(settimanale) e `seasonality-sync` (giornaliero), e nessuno dei due genera
`MacroDeskReport`. Report, Scorecard e Volatilità restano ferme all'ultima
generazione manuale — il 21/08, cinque giorni prima di questa misura.

La sentinella di freschezza esisteva già ma **solo sull'indice**: chi entrava
in Scorecard o Volatilità da un link diretto vedeva numeri di cinque giorni
prima senza alcun avviso. Corretto in F1.

### F1-bis — i due buchi: causa accertata

**WTI e Brent fermi al 18/08 — è l'upstream, non noi.** Le due serie hanno
come fonte primaria FRED `DCOILWTICO` e `DCOILBRENTEU`, pubblicate dall'EIA.
Interrogato l'endpoint CSV pubblico di FRED il 25/08: l'ultima osservazione
reale è **2026-08-18** per entrambe, esattamente il valore che abbiamo in
tabella. Il job ha scritto tutto quello che c'era. Per confronto, sempre da
FRED lo stesso giorno: `T10YIE`, `GVZCLS`, `OVXCLS` e `VIXCLS` al 24/08,
`DGS10` e `DTWEXBGS` al 21/08.

**VDAX a 0 righe — è uno stato dichiarato.** `SEASONALITY_INSTRUMENTS` marca
VDAX con `unavailable`: il ticker Yahoo `V1X.DE` è fermo al 2016 e non esiste
un alias vivo. Lo strumento resta a catalogo di proposito ed è escluso da
`AVAILABLE_INSTRUMENTS`. Non è un buco, è un'assenza voluta e documentata.

### F1-bis — il punto cieco vero, e la sua chiusura

Nessuno dei due era un difetto di scrittura. Il difetto era **come i job
dichiaravano il proprio esito**:

- `runSeasonalityDailyJob` calcolava `ok = esiti.every((e) => e.esito !==
  "errore")`. Con tutte le serie in `gia_aggiornato` — cioè con **zero
  scritture** — il job restava verde. E il blocco M15 ingoiava le eccezioni
  in un `catch` che faceva `console.error` senza mai produrre un esito
  `errore`: un fallimento lì non abbassava mai `ok`.
- La route `seasonality-sync` rispondeva **sempre 200**, anche col Driver
  Desk fallito per intero (`.catch` che restituisce `{saltato: true}`).
- La route `cot-sync` rispondeva **sempre 200**, anche con tutti gli
  strumenti in `contratto_non_trovato` — che è il caso della rinomina CFTC,
  cioè proprio quello per cui quel job esiste — o in `errore_rete`.

Chiuso con `src/lib/job-esito.ts`: il confronto è fra le serie **attese dal
catalogo** e quelle di cui è arrivato un esito, così una serie che nessun ramo
ha nemmeno tentato non passa più inosservata. Le route rispondono **500**
quando il job non è riuscito, che è l'unico segnale che Vercel mostra rosso
senza doverlo cercare nei log. "Nessuna novità dall'upstream" resta un
successo: pretendere una scrittura ogni notte farebbe fallire il job per un
fatto del mondo.

E `src/lib/serie-in-ritardo.ts` rende visibile in pagina ciò che prima si
vedeva solo interrogando il database: Driver e Stagionalità dichiarano quando
una serie è più vecchia delle altre. Il confronto è **relativo alla più
fresca del gruppo**, non contro l'orologio, così non serve un calendario di
festività e la regola regge anche a mercati chiusi per una settimana. Soglia
5 giorni, tarata sui dati veri: con 3 la nota elencava cinque serie su
tredici, perché il lunedì una serie FRED con un giorno di lag è già a tre
giorni di calendario dal venerdì, e una nota che si accende sempre non viene
più letta.

### Dipendenza esterna, registrata e non risolta qui

`MacroDeskReport` non ha un cron perché il piano Vercel ne ammette due e sono
occupati da `cot-sync` e `seasonality-sync`; il report passa da un ponte
GitHub Actions esterno, oggi bloccato. Non è un difetto da correggere in
questo audit: la risposta corretta è la banda di freschezza, che ora c'è
sull'indice e sulle sezioni che dipendono dal report.

## Verifica di sicurezza sulla cache dell'AI Analyst

La cache in `src/lib/ai-analyst/sintesi.ts` è una `Map` di modulo chiavata
`giorno|strumento`, quindi **condivisa fra tutti gli utenti**: confermato.

**Non contiene nulla di specifico dell'utente, e non è una fuga di dati.**
Tre verifiche:

1. il tipo `Dossier` (`ai-analyst/types.ts`) non ha un solo campo utente —
   nessuna occorrenza di `userId`, `session`, `email`, `timezone` o
   `accountId` in `dossier.ts`, `types.ts`, `sintesi.ts`;
2. `buildDossier(strumento, giorno, letture)` riceve solo lo strumento, il
   giorno civile italiano e letture macro; le fonti (`caricaFontiCondivise`)
   sono `MacroDeskReport`, COT, Driver Desk e viste Trends, tutte globali;
3. la pagina `/macro-desk/ai-analyst` **non usa affatto quella cache**: è la
   versione deterministica, e `sintesiDelGiorno` è oggi chiamata solo dai
   propri test — c'è perfino un test che verifica che il sorgente della
   pagina non la menzioni.

La sessione, in quella pagina, serve solo al redirect verso il login.

## Sui timestamp: due dei tre casi segnalati non erano difetti

- `MacroDeskReport.reportDate` è una colonna DATE a mezzanotte UTC:
  formattarla in UTC è **corretto**, renderla nel fuso utente la farebbe
  slittare di un giorno. Il codice lo dichiara già in un commento.
- Trends "ultimo tentativo" usa `todayKeyInZone(user.timezone)`: la chiave
  giorno è **già** nel fuso dell'utente, e viene solo formattata da una
  stringa ancorata a mezzogiorno UTC. Corretto.
- Driver "Ultimo aggiornamento dati" usa `todayKeyInZone(timeZone, …)` col
  fuso dell'utente. Corretto.
- `generatedAt` è reso con `formatDateTime(…, user.timezone)` in
  `macro-desk/[id]`. Corretto.

Il difetto vero era un altro, ed è stato corretto: la Stagionalità rendeva
l'ora dell'ultimo calcolo — che è un **istante**, non una data-giorno — con
`timeZone: "Europe/Rome"` fisso nel markup.
