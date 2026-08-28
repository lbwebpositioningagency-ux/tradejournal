# La sentinella all'ingresso — proposta, non implementata

**Data**: 28/08/2026 · **Stato**: PROPOSTA, nessuna riga di codice scritta
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
`impegnoDellaSettimana`. Quattro controlli, non uno di più:

| # | Controllo | Rilievo |
|---|---|---|
| 1 | `news[]` senza `title` **o** senza `impl`, dopo gli alias | `news[3]: voce senza titolo leggibile` |
| 2 | `news[]` senza `src`, `url` o `when` | `news[3]: manca url` |
| 3 | Entità HTML (`&lt;` `&gt;` `&amp;` `&quot;`) nei campi testuali | `assets[gold].weekly.invalid: entità HTML nel testo` |
| 4 | `payload.assets[].weekly.confidence` ≠ `biasRecord.<asset>.confidence` | `gold: payload 44, biasRecord 48` |

Il quarto è **già scritto** (`confidenzaPayloadRifiutata`) e passa dal canale che segue.

## Dove finiscono i rilievi

Nel canale che esiste già, senza inventarne uno nuovo:

1. **`console.error`** con una riga sola, come fa `riassuntoRifiuti`. È ciò che si vede
   nei log Vercel della funzione;
2. **la risposta HTTP**, che resta `200` ma con `status: "ok_con_rilievi"` e l'elenco.
   Il ponte che spedisce lo legge già per i rifiuti dell'impegno: **questo è il punto
   che avrebbe fatto la differenza il 18 agosto stesso**, perché il mittente vede la
   risposta nel momento in cui spedisce;
3. **la colonna `impegnoRifiutato`**, o una gemella `rilieviContratto`, così il rilievo
   sopravvive al log e si può interrogare a posteriori;
4. **la banda già in pagina** (`banda-impegno.tsx`) mostra quel che c'è in colonna: un
   report con rilievi si vede aprendo il report, senza nessuna schermata nuova.

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
