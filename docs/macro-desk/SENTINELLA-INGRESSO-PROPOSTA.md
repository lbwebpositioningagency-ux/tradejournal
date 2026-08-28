# La sentinella all'ingresso

**Data**: 28/08/2026 · **Stato**: **IMPLEMENTATA** il 28/08/2026 (era una proposta;
il documento resta perché il *perché* vale più del *cosa*).
Codice: `src/lib/macro-desk-contratto.ts` · test: `macro-desk-contratto.test.ts`
**Origine**: il report DAILY del 18/08/2026

## Il fatto da cui nasce

Il 18 agosto il generatore ha spedito un report con **11 notizie su 11 senza `title`**:
usava `t` e `note` invece di `title` e `impl`, e nella stessa spedizione `risk`/`concl`
invece di `risks`/`conclusion`. Il report è stato **accettato con 200**, salvato, e reso
in pagina come undici card mute, senza Radar rischi e senza Verdetto.

Nessuno lo ha saputo per **dieci giorni**. Non c'è stato un errore, un log, una riga
rossa: il payload è `z.unknown()` all'ingresso e il parser è difensivo per scelta, quindi
un campo che non si riconosce diventa `undefined` e la UI degrada «con eleganza». Che è
la cosa giusta da fare in pagina, ed è la cosa sbagliata da fare in silenzio.

Il difetto non era la tolleranza. Era che **la tolleranza non lasciasse traccia**.

## Il principio

La sentinella **non deve rifiutare**. Un 400 su questo endpoint non è recuperabile: il
desk genera e spedisce una volta, non c'è coda di rispedizione, e il report è l'unica
copia — è la stessa ragione per cui `applicaImpegno` accetta e congela invece di
respingere. Un report parzialmente illeggibile vale enormemente più di nessun report.

Deve invece **dire subito che qualcosa non torna**, nello stesso canale che il mittente
già legge, e lasciare il segno in un posto che qualcuno guarda.

## La proposta minima

Una funzione pura, `controllaContratto(payload): Rilievo[]`, in un modulo suo
(`src/lib/macro-desk-contratto.ts`), chiamata da `upsertMacroDeskReport` accanto a
`impegnoDellaSettimana`. Cinque controlli, non uno di più:

| # | Controllo | Rilievo |
|---|---|---|
| 1 | `news[]` senza `title` **o** senza `impl`, dopo gli alias | `news[3]: voce senza titolo leggibile` |
| 2 | `news[]` senza `src`, `url` o `when` | `news[3]: manca url` |
| 3 | Entità HTML (`&lt;` `&gt;` `&amp;` `&quot;`) nei campi testuali | `assets[gold].weekly.invalid: entità HTML nel testo` |
| 4 | `payload.assets[].weekly.confidence` ≠ `biasRecord.<asset>.confidence`, nello STESSO report | `gold: payload 44, biasRecord 48` |
| 5 | `synthesis` presente e nella forma a oggetto | `synthesis: è string, atteso {pills, risks, conclusion}` |

Il quarto somiglia a `confidenzaPayloadRifiutata` ma non è lo stesso controllo: quello
confronta report DIVERSI della stessa settimana, questo prende la contraddizione dentro
un singolo report, già alla partenza. Servono entrambi, e infatti il secondo ha trovato
qualcosa che il primo non poteva vedere (v. in fondo).

## Dove finiscono i rilievi

Nel canale che esiste già, senza inventarne uno nuovo:

1. **`console.error`** con una riga sola, come fa `riassuntoRifiuti`. È ciò che si vede
   nei log Vercel della funzione;
2. **la risposta HTTP**, che resta `200` ma con `status: "ok_con_rilievi"` e l'elenco.
   Il ponte che spedisce lo legge già per i rifiuti dell'impegno: **questo è il punto
   che avrebbe fatto la differenza il 18 agosto stesso**, perché il mittente vede la
   risposta nel momento in cui spedisce;
3. **la colonna `rilieviContratto`**, gemella di `impegnoRifiutato` e distinta da essa
   (sono due difetti diversi e confonderli renderebbe sbagliato il testo di entrambe le
   bande), così il rilievo sopravvive al log e si può interrogare a posteriori;
4. **una banda in testa al report** (`banda-rilievi.tsx`), gemella di quella
   dell'impegno ma in un posto diverso, e per una ragione: una modifica all'impegno
   falsa la MISURA e va vista nella Scorecard insieme ai numeri che falsa, mentre un
   rilievo di contratto rende illeggibile QUESTO report e va visto aprendolo — che è
   anche il momento in cui chi legge si sta chiedendo perché una card è vuota.

## Perché non di più

Nessun job di controllo, nessuna soglia, nessun avviso, nessuna dashboard. La lacuna del
18 agosto non era di sorveglianza: era che l'informazione **non venisse prodotta**. Una
volta prodotta e messa nella risposta HTTP, chi spedisce la vede lo stesso giorno — che
è esattamente quanto serviva, e dieci giorni prima di quando è successo.

Il costo è una funzione pura con i suoi test e una decina di righe nella route. Il
confine Zod resta com'è: continuare a validare la STRUTTURA e non il contenuto è la
scelta giusta per un generatore che evolve; questa sentinella non rifiuta niente, ma
smette di far finta che vada tutto bene.

## Non basta correggere il generatore

Vale la pena dirlo perché è controintuitivo: sistemare le istruzioni del task non
ripara il 18 agosto. Quel report è in Neon e **non si rigenera**. Per questo il parser
ha imparato gli alias `t`/`note` e `risk`/`concl` (test di regressione sulla fixture
reale in `src/lib/macro-desk-1808.fixture.ts`) — la sentinella serve per il prossimo
campo che nessuno ha ancora immaginato, non per questo.

## Che cosa ha trovato al primo giro, sui report veri

Rieseguita sui 23 report in archivio (che sono entrati prima che esistesse, quindi
hanno la colonna vuota), la sentinella non ha prodotto rumore ma nemmeno silenzio.
Sul report più recente, il **28/08**, tre rilievi tutti veri:

- `news` — 11 voci su 11 senza `url`;
- `testi` — entità HTML non decodificata in `synthesis.conclusion` (`&lt;81`);
- `assets[oil].weekly.confidence` — **payload 44, biasRecord 45**: la stessa
  confidenza dichiarata due volte con due valori, dentro lo stesso report.

L'ultimo è il controllo n. 4 e non lo aveva mai visto nessuno: il guardiano
dell'impegno confronta report DIVERSI della stessa settimana, e una contraddizione
interna a un singolo report gli passava sotto il naso.

## Una nota sul controllo n. 1

Sul report del 18/08 la sentinella **non** segnala più «news senza titolo», e va bene
così: guarda il payload dopo il parser, e da quando `t`/`note` sono alias riconosciuti
quei titoli ci sono davvero. Il rilievo sarebbe scattato il giorno in cui il report
arrivò — allora l'alias non esisteva — ed è quello il momento in cui serviva. Oggi quel
controllo sorveglia il prossimo nome di campo che nessuno ha ancora immaginato, che è
esattamente il suo mestiere.
