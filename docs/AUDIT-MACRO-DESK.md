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

### Buchi nei dati, rilevati e non ancora spiegati

- `season:VDAX/LEVEL` ha **0 righe** e nessuna data: la serie è dichiarata
  ma non è mai stata caricata.
- `driver:WTI` e `driver:BRENT` sono fermi al **18/08** mentre tutte le altre
  dodici serie arrivano al 24/08, pur avendo lo stesso `updatedAt` del cron.
  Stessa cosa per `season:WTI`. Va capito se è la fonte a pubblicare in
  ritardo o se l'ingest di quelle serie fallisce in silenzio.

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
