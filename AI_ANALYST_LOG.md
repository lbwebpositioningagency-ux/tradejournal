> ## ⚠️ LA FUNZIONE È STATA RIMOSSA IL 27/08/2026
>
> Questo diario resta perché contiene una **misura**, non una descrizione: due
> giri reali con la chiave vera hanno stabilito che il modello linguistico non
> aggiungeva valore — col prompt che gli dava la formulazione di riferimento la
> ricopiava (5 righe di differenza su 210), e togliendogliela non ha prodotto un
> solo collegamento genuino fra fattori su 29 generazioni. È il tipo di
> risultato che non va riscoperto due volte.
>
> Il blocco discorsivo che ne è nato è stato poi rimosso per una ragione
> diversa e successiva: ripeteva in prosa i numeri che le schede per strumento
> mostrano già in tabella. Specifica congelata (storica) in
> `docs/ai-analyst/SPEC_ai_analyst_v1.0.md`.

---

# RELEASE v1.0 — AI Analyst in produzione (deterministica)

> 9 agosto 2026. **Deployata.** `origin/main` è a `7bcf511`, deployment Vercel
> di produzione in stato **success**. Le sezioni precedenti stanno più sotto,
> intatte.

> **Dove sta il resto della storia.** Su questo branch il diario arriva fino al
> primo giro reale con Gemini. Il quarto giro — l'esperimento «collegamento» e
> la valutazione delle 29 generazioni che ha portato a scegliere la versione
> deterministica — vive solo su `experiment/ai-analyst-linking`, che come da
> istruzione non entra in questo merge: è la sezione in cima al log di quel
> branch.

## 1. Stato delle fasi

| Fase | Esito | Commit |
|---|---|---|
| 1 — pagina resa deterministica | fatta | `38947d0` |
| 2 — push del branch + allineamento con main | fatta, merge no-op | — |
| 3 — merge su main e deploy | fatta | `7bcf511` (merge --no-ff) |
| 4 — verifica tecnica in produzione | fatta, **con un limite dichiarato** (§6) | — |

Gate eseguito tre volte — dopo la fase 1, dopo l'allineamento, e sul commit di
merge: **1679 test verdi** (+1 saltato, il giro reale contro Gemini), typecheck,
lint, build, sempre con la rotta `/macro-desk/ai-analyst` registrata.

## 2. GEMINI_API_KEY non è invocata da questa release — confermato

Tre prove indipendenti, in ordine di forza.

**Prova strutturale.** La pagina non importa più nessun client di modello. Le
tre righe di import sono sparite e la chiamata è diventata una:

```ts
const sintesi = sintesiFallback(dossier, MOTIVO_DETERMINISTICO);
```

**Prova automatica.** `src/lib/ai-analyst/pagina-deterministica.test.ts` legge
il **sorgente della pagina** e fallisce se qualcuno riaccende il percorso senza
volerlo: niente `ai-analyst/gemini`, niente `cot-contesto-gemini`, niente
`sintesiDelGiorno`, niente `generaSintesi`, e la stringa `GEMINI_API_KEY` non
compare nemmeno in un commento. È un test insolito — guarda un file invece che
un comportamento — ma è l'unico che misura davvero l'invariante che ci
interessa fra sei mesi.

**Prova empirica.** Ho generato le quattro sintesi sui dati locali tre volte, in
tre condizioni d'ambiente diverse, e confrontato l'impronta SHA-256:

```
chiave presente          impronta abf22bf45ecc2a74
chiave rimossa           impronta abf22bf45ecc2a74
chiave palesemente falsa impronta abf22bf45ecc2a74
```

Identiche. Se la chiave sparisse dalle variabili d'ambiente di Vercel domani,
questa pagina non se ne accorgerebbe.

Il percorso col modello **non è stato cancellato**: orchestratore, doppio
cancello e i loro test restano nel codice con la loro copertura. Riaccenderlo
è passare delle dipendenze vere in quella riga, e nient'altro.

## 3. Una decisione presa al posto tuo — la nota di provenienza

La pagina dichiara sempre in fondo da dove viene il testo. Prima aveva due casi
(«scritto dal modello» / «senza modello, direttamente dai dati *(motivo)*») e in
questa release avrebbe stampato «Testo generato senza modello linguistico
(modello non raggiungibile: …)». **Sarebbe stata una bugia**: il modello non è
irraggiungibile, l'abbiamo spento noi.

Ho quindi aggiunto un terzo caso, con la costante `MOTIVO_DETERMINISTICO`. In
produzione si legge:

> «Testo composto direttamente dai dati, senza modelli linguistici: a parità di
> numeri la pagina dice sempre le stesse parole.»

Il caso «modello non raggiungibile» resta, per il giorno in cui il percorso col
modello venisse riacceso.

## 4. Fase 2 — allineamento: non c'era niente da allineare

`origin/main` era ancora a `930d396`, cioè esattamente il commit da cui era nato
il branch. `git merge origin/main` ha risposto **«Already up to date»**: nessun
conflitto, **nessun conflitto sul lockfile**, quindi nessuna reinstallazione da
zero e nessuna nuova CVE da valutare.

Il confronto delle dipendenze lo conferma: `git diff origin/main..HEAD --
package.json package-lock.json` è **vuoto**. `npm audit` riporta 10
vulnerabilità (3 moderate, 7 alte, il gruppo `undici` già noto): sono
**esattamente quelle di main**, non ne introduciamo nessuna. Non ho eseguito
`npm audit fix` in nessuna forma.

## 5. Fase 3 — come ho fatto il merge, e perché non alla lettera

Il piano diceva `git checkout main`. **Non si poteva**, e mi sembra giusto
dirlo invece di far finta:

```
fatal: 'main' is already used by worktree at 'C:/Users/chenn/progetti/tradezella 2.0'
```

`main` è in checkout nella working copy principale — quella con le modifiche
non mie a `src/lib/validations/macro-desk.ts` che ho solo guardato nei giri
precedenti. Fare il checkout lì avrebbe significato metterci le mani.

Ho scelto la strada più conservativa: **merge `--no-ff` in HEAD staccato** su
`origin/main`, esattamente lo stesso comando e lo stesso risultato, senza
toccare quella copia:

```
git checkout --detach origin/main
git merge --no-ff feature/ai-analyst
git push origin HEAD:main
```

Verificato prima del push che l'albero del commit di merge coincidesse byte per
byte con quello del branch (nessuna sorpresa nascosta nel merge).

**Conseguenza da sapere:** il ref locale `main` nella working copy principale è
rimasto a `930d396`, quindi lì `git status` dirà «behind by 8 commits». È
normale e si risolve con un `git pull` quando quella copia sarà libera. Non
l'ho fatto io perché avrebbe toccato la copia condivisa.

### Schema Neon: nessuna modifica, verificato

```
git diff --stat 930d396..HEAD -- prisma/     → (vuoto)
migrazioni su origin/main: 22
migrazioni su questo branch: 22
prisma/schema.prisma: invariato
```

Nessuna migrazione, nemmeno additiva. Il `prisma migrate deploy` del build è un
no-op contro Neon. È anche il motivo per cui il preview deploy generato dal
push del branch (`38947d0`) non ha potuto fare danni: non aveva niente da
applicare.

## 6. Fase 4 — verifica tecnica in produzione

### Il deploy è andato

```
deployment 5818959547 · Production · sha 7bcf511 · 2026-08-09T13:06:03Z · success
stato del commit su GitHub: Vercel → success
```

E la produzione **serve davvero questo commit**: degli 12 chunk JavaScript che
`/login` carica in produzione, **11 hanno lo stesso nome del mio build locale
di `7bcf511`**. I nomi dei chunk Turbopack derivano dal contenuto, quindi la
coincidenza non è casuale.

### La rotta risponde, e risponde come le sorelle

```
/macro-desk                307 → /login
/macro-desk/trends         307 → /login
/macro-desk/scorecard      307 → /login
/macro-desk/stagionalita   307 → /login
/macro-desk/ai-analyst     307 → /login     ← la nuova
/percorso-inesistente-xyz  404
```

Nessun 5xx da nessuna parte. Tempi di risposta della rotta su cinque richieste:
**0,29 – 0,38 s**. Il 307 dimostra che il modulo della pagina si carica e che
`auth()` gira: un errore a livello di modulo darebbe 500.

### Il limite, dichiarato

**Non ho potuto vedere la pagina renderizzata in produzione.** Sta dietro
l'autenticazione e in questa sessione non inserisco credenziali. Quindi:

- la verifica del punto 10 arriva fino a «la rotta risponde senza errori»,
  non fino a «il corpo della pagina si compone senza errori»: per un utente non
  autenticato il codice che legge i dati **non viene mai eseguito**;
- il punto 11 — «la data del dato più vecchio dichiarata a schermo» — **non l'ho
  potuto leggere**. Sotto c'è cosa mi aspetto e su quali prove, ma è
  un'inferenza, non una lettura.
- i log applicativi runtime di Vercel richiedono la CLI o la dashboard: la CLI
  non è installata su questa macchina.

## 7. Cosa mi aspetto che veda tu, e su quali prove

Ho letto — in sola lettura — l'ultimo report che il ponte ha inoltrato alla
produzione, `macro-desk-bridge/reports/latest.json`:

```
type: DAILY · reportDate: 2026-08-03 · generatedAt: 2026-08-03T05:26:23Z
volPanel: 7 voci → VIX, VVIX, SKEW, Put/Call, GVZ, OVX, MOVE
biasRecord: assente
```

Da qui, con le soglie della spec:

- **il report ha 6 giorni.** Soglia di avviso 3, soglia di scarto 10: il
  termometro sarà **presente ma marcato «non è dell'ultima seduta»**, con il
  peso che scende da ALTO a MEDIO;
- di conseguenza **la fiducia non potrà essere «buona»**: al massimo «media».
  Un solo dato invecchiato lo impedisce, per regola;
- **oro, petrolio e S&P 500 avranno il termometro** (GVZ, OVX e VIX ci sono nel
  pannello); **il DAX no**, perché DV1X non è pubblicato lì — è la lacuna
  strutturale già dichiarata in pagina;
- `biasRecord` assente ⇒ **l'ampiezza in valuta non comparirà**, e la pagina
  scriverà «manca la chiusura di riferimento». È il comportamento giusto, non
  un bug;
- **la «data del dato più vecchio» sarà quella del COT**, non del report: il
  COT è settimanale e il suo cron gira il sabato. Se il sync di ieri è andato,
  dovrebbe essere attorno al **04/08/2026**.

Non mi aspetto **«dati insufficienti»** su nessuno dei quattro strumenti.

## 8. Il segnale da non rincorrere — e sì, lo osservo

Me l'avevi chiesto di segnalarlo, e c'è.

**L'ultimo report inoltrato alla produzione è del 3 agosto. Oggi è il 9.** Sei
giorni senza un report giornaliero nuovo. La storia dei commit del ponte
racconta il resto:

```
bfbdc59 Ripristina DAILY 2026-08-03 come report corrente
5a5716a Reinvio WEEKLY 2026-08-02 (consegna recuperata)
d58a90e Normalizza generatedAt in ISO UTC prima dell'inoltro
```

«Consegna recuperata», «normalizza generatedAt»: è esattamente la catena dei
400 di cui parlava il commento nel test non committato della working copy
principale — *cinque run su quindici morte*.

**Quindi: se la sezione ti appare con fiducia «media» invece che «buona», o con
il termometro segnato come non dell'ultima seduta, la causa è il ponte, non
questa sezione.** La riprova è a portata di mano: appena arriva un report
giornaliero fresco, la fiducia sale da sola, senza toccare una riga di codice.

Una precisazione per onestà: sto leggendo il *repository* del ponte. Se
qualcuno avesse consegnato un report direttamente via `curl` — la via
preferenziale descritta nel suo README — quel file non lo saprebbe. È l'unica
prova che ho senza toccare Neon.

## 9. La tua QA visiva — checklist breve

Apri `/macro-desk/ai-analyst` da loggato e guarda queste otto cose:

1. **Il quarto pulsante** nella riga del Macro Desk, accanto a Stagionalità:
   stessa forma e stesso peso visivo degli altri tre.
2. **I font**: Inter per il testo, JetBrains Mono per numeri, sigle e date. Se
   vedi un serif, la variabile del font non è arrivata (nelle mie anteprime
   fuori dall'app succedeva, nella pagina vera non dovrebbe).
3. **I quattro chip degli strumenti** (XAU/USD, WTI, GER40, SPX): che cambino
   davvero strumento e che quello attivo si veda.
4. **Il blocco «Cosa questa lettura non dice»**: c'è sempre, non è mai vuoto.
5. **La riga in fondo**: deve dire «Testo composto direttamente dai dati, senza
   modelli linguistici». Se dice «modello non raggiungibile», qualcosa è andato
   storto nella release.
6. **La data del dato più vecchio** in fondo, e le sezioni lette: confrontale
   col §7 qui sopra.
7. **Su mobile** (o finestra stretta): i chip devono andare a capo e non ci
   deve essere scorrimento orizzontale.
8. **Nessuna freccia su/giù e nessun verde/rosso** come giudizio. L'unico
   ambra ammesso è sugli avvisi di qualità del dato.

Sul **DAX** aspettati un blocco «Cosa non c'era» lungo: cinque misure dichiarate
«non esiste per questo strumento». È corretto, non è un errore di caricamento.

## 10. Cosa NON ho fatto, come da istruzioni

Nessun `npm audit fix` in nessuna forma · nessuna credenziale o ruolo Neon
toccato · nessun `db:seed` · nessun force-push · nessuna riattivazione del
modello · `experiment/ai-analyst-linking` non toccato, resta a `3ddb483`.

---

# Giro reale con Gemini — FATTO

> 9 agosto 2026, terzo giro. Branch `feature/ai-analyst`, worktree
> `C:\wt\ai-analyst`. Nessun push, nessun deploy, Neon mai toccato.
> Le sezioni precedenti stanno più sotto, intatte.

## 0. La chiave c'era

Hai messo `C:\wt\ai-analyst\.env.local`. Verificata contro l'API prima di
usarla: **HTTP 200 in 837 ms**. Formato diverso da quello che mi aspettavo
(comincia per `AQ.` invece che per `AIza`, 53 caratteri): è un formato valido,
me lo sono fatto dire dall'API invece che dall'occhio.

Una cosa che avevo sbagliato nel giro precedente e che ho dovuto sistemare:
avevo scritto che «gli script sono già pronti», e non era vero.
`import "dotenv/config"` legge **solo `.env`**, non `.env.local`. Ho aggiunto
`scripts/ai-analyst-env.ts`, che replica la precedenza di Next (`.env`, poi
`.env.local` che vince), e l'ho messo in testa ai tre script.

**Tutto quello che leggi da qui in giù è testo scritto davvero da Gemini.**

---

## 1. La risposta alla domanda che conta

Me l'hai chiesto in fondo, ma è la cosa che devi sapere per prima.

> **La prosa non giustifica il modello. Non ancora, e non per come è oggi.**

Non è un'impressione: è misurabile. Ho confrontato riga per riga l'output col
modello e l'output del fallback deterministico, sugli **stessi identici dati**,
quattro strumenti. Su 210 righe di output, le differenze di contenuto sono
**cinque**:

```
> • Alcuni dati sui fattori F5 e F6 risultano invecchiati essendo stati rilevati il 2026-07-21.
> • Il dato sulla partecipazione al mercato e il posizionamento speculativo risalgono al 2026-07-21 e sono considerati invecchiati.
> • La dispersione storica del mese e la stabilità delle relazioni risalgono al 2026-07-27 e sono invecchiate.
> • Il dato sull'indice di volatilità in questo mese risulta invecchiato rispetto alla data odierna.
> • Il livello abituale dell'indice di volatilità in questo mese si basa su un dato invecchiato.
```

Tutto qui. **Le frasi di apertura e tutte le righe dei fattori tornano indietro
identiche alla formulazione di riferimento che gli abbiamo dato.** Il modello
non riscrive: ricopia. E le cinque aggiunte sono tutte la stessa cosa —
ripetizioni della freschezza, che la riga immediatamente sopra già dice meglio
(«4 misure non sono dell'ultima seduta: il dato più vecchio usato è del
21/07/2026»). Una di esse ha pure sputato fuori gli identificatori interni
(§4).

Quando invece il modello *cambia* qualcosa di sua iniziativa, peggiora. Sulle
17 generazioni ripetute (§5) la terza frase di apertura ogni tanto diventa così:

- «Il quadro indica condizioni di espansione con una fiducia media, basata su
  11 fattori concordi.» — ridice il verdetto che è già scritto due centimetri
  sopra, in grande;
- «…basata su 11 fattori su 11 in cui 4 dati non sono dell'ultima seduta.» —
  sgrammaticato;
- e soprattutto: **in quei casi sparisce la frase del template «Resta una
  descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe
  il prezzo.»** Il disclaimer resta nel blocco dei limiti, quindi non è un buco
  di sicurezza — ma è una regressione di qualità, decisa dal modello.

Quello che speravo di vedere e **non ho visto nemmeno una volta**: il legame
fra due fattori. Mai una frase tipo «la volatilità implicita è in alto *e nello
stesso tempo* i contratti aperti sono ai minimi della loro storia: due cose che
spingono nella stessa direzione sull'ampiezza». È esattamente il valore aggiunto
che avrebbe giustificato la chiamata, ed è l'unica cosa che il fallback non sa
fare (lui elenca). Il modello, messo davanti a una formulazione già approvata,
sceglie la strada sicura e la ricopia.

**Cosa ne farei io.** Tre strade, in ordine di quanto ci credo:

1. **Spegnere il modello e tenere la sezione tutta deterministica.** Oggi è la
   scelta a rapporto qualità/rischio migliore: stesso output a meno di cinque
   righe di rumore, zero chiamate, zero cancelli da sorvegliare, zero varianza.
   Basta non passare le `deps` reali nella pagina.
2. **Cambiargli mestiere**: smettere di chiedergli di riscrivere le righe (che
   ricopia) e chiedergli SOLO la sintesi d'insieme — due o tre frasi che mettano
   in relazione i fattori fra loro — togliendogli del tutto la formulazione di
   riferimento per quella parte, così non ha niente da ricopiare. È un
   esperimento vero, non un ritocco al prompt, e volevo il tuo assenso prima di
   provarlo: me l'hai detto tu di non fare prompt engineering improvvisato.
3. Lasciare com'è. Non la consiglio: paghi tre chiamate per riavere indietro il
   tuo stesso testo.

---

## 2. Output reale, dati come stanno (`npx tsx scripts/ai-analyst-sintesi.ts`)

Contesto: il report Macro Desk in archivio è del **22/07/2026**, oltre la
soglia di scarto → il termometro viene scartato su oro, petrolio e S&P.
Oggi è **domenica** → il bucket «giorno della settimana» non esiste.

```text
[modello: Gemini flash-lite, chiave presente]

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (8 fattori su 11).

  Le misure di volatilità implicita su Oro stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  La lettura poggia su 8 misure su 11: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il GVZ sta a 24,86. È più in basso che nel 51% delle sedute dell'ultimo anno; più in alto che nel 82% di quelle di tre anni; più in alto che nel 89% di quelle di cinque. Variazione: 0,38 punti in una settimana, −1,35 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017 (499 settimane di storia). Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in alto che nel 64% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 4,62 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il GVZ ha avuto un livello medio di 18,14, su 18 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Oro si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 65% delle sedute dal 2006 (4 confronti, 4616 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 11: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • 4 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.
  • Alcuni dati sui fattori F5 e F6 risultano invecchiati essendo stati rilevati il 2026-07-21.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 3.8 s]

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (8 fattori su 11).

  Le misure di volatilità implicita su Petrolio WTI stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  La lettura poggia su 8 misure su 11: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      L'OVX sta a 57,34. È più in alto che nel 65% delle sedute dell'ultimo anno; più in alto che nel 88% di quelle di tre anni; più in alto che nel 90% di quelle di cinque. Variazione: −6,10 punti in una settimana, 9,75 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 70% delle settimane dal 2017 (499 settimane di storia). Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in basso che nel 93% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 9,29 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 6,18 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il OVX ha avuto un livello medio di 35,11, su 19 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Petrolio WTI si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 70% delle sedute dal 2006 (4 confronti, 5049 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 11: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • 5 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.
  • Il dato sulla partecipazione al mercato e il posizionamento speculativo risalgono al 2026-07-21 e sono considerati invecchiati.
  • La dispersione storica del mese e la stabilità delle relazioni risalgono al 2026-07-27 e sono invecchiate.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 4.0 s]

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 6).

  Le misure di volatilità implicita su DAX stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese. Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 5,37 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 5,78 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX (indice sostitutivo dichiarato) ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane DAX si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 69% delle sedute dal 2007 (3 confronti, 4677 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — non esiste per questo strumento
  • Ampiezza abituale della giornata — non esiste per questo strumento
  • Comportamento storico del termometro — non esiste per questo strumento
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 2 misure non sono dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.
  • Il dato sull'indice di volatilità in questo mese risulta invecchiato rispetto alla data odierna.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 2.8 s]

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (5 fattori su 8).

  Le misure di volatilità implicita su S&P 500 stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  La lettura poggia su 5 misure su 8: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 4,58 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 3,57 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento
  • Stabilità della relazione con pari e driver — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 8: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Il livello abituale dell'indice di volatilità in questo mese si basa su un dato invecchiato.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 3.1 s]

── CHIAMATE REALI AL MODELLO ──
  generazione: 4 chiamate · media 2.29 s · min 1.83 s · max 2.82 s
  cancello: 8 chiamate · media 0.55 s · min 0.45 s · max 0.66 s
  TOTALE: 12 chiamate in questa esecuzione
```

## 3. Output reale, report datato a oggi (SIMULAZIONE)

Qui il termometro c'è. **Questa esecuzione è successiva alla correzione del §4**,
quindi è anche la prova che gli identificatori interni non passano più.

```text
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  SIMULAZIONE: il report in archivio è del 2026-07-22, qui viene DATATO 2026-08-09.
  I valori sono quelli veri di quel report.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

[modello: Gemini flash-lite, chiave presente]

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: media — Fonti concordi ma 4 dati non sono dell'ultima seduta (11 fattori su 11).

  Le misure di volatilità implicita su Oro stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  Il quadro indica condizioni di espansione per la seduta.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      Il GVZ, che misura quanto costa coprirsi su Oro, sta a 25,37: più in alto che nel 88% delle sedute del periodo 2008-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, Oro ha percorso dal minimo al massimo circa l'1,61% del proprio valore (metà delle volte fra l'1,21% e il 2,25%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 55% di una giornata qualsiasi: 19,7 punti di differenza, misurati su 570 giornate fra il 01/07/2021 e il 27/07/2026. Lo stato è rimasto lo stesso nel 95% dei giorni, in media per 18,8 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      Il GVZ sta a 24,86. È più in basso che nel 51% delle sedute dell'ultimo anno; più in alto che nel 82% di quelle di tre anni; più in alto che nel 89% di quelle di cinque. Variazione: 0,38 punti in una settimana, −1,35 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017 (499 settimane di storia). Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in alto che nel 64% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 4,62 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il GVZ ha avuto un livello medio di 18,14, su 18 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Oro si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 65% delle sedute dal 2006 (4 confronti, 4616 sedute di storia comune).
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 4 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.
  • La dispersione storica del giorno della settimana non esiste per questo strumento.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-09
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 4.3 s]

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: media — Fonti concordi ma 5 dati non sono dell'ultima seduta (11 fattori su 11).

  Le misure di volatilità implicita su Petrolio WTI stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      L'OVX, che misura quanto costa coprirsi su Petrolio WTI, sta a 62,07: più in alto che nel 93% delle sedute del periodo 2007-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, Petrolio WTI ha percorso dal minimo al massimo circa il 3,63% del proprio valore (metà delle volte fra il 2,66% e il 4,98%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 64% dei casi, contro il 48% di una giornata qualsiasi: 16,5 punti di differenza, misurati su 748 giornate fra il 08/12/2021 e il 27/07/2026. Lo stato è rimasto lo stesso nel 91% dei giorni, in media per 11,5 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      L'OVX sta a 57,34. È più in alto che nel 65% delle sedute dell'ultimo anno; più in alto che nel 88% di quelle di tre anni; più in alto che nel 90% di quelle di cinque. Variazione: −6,10 punti in una settimana, 9,75 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 70% delle settimane dal 2017 (499 settimane di storia). Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in basso che nel 93% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 9,29 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 6,18 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il OVX ha avuto un livello medio di 35,11, su 19 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Petrolio WTI si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 70% delle sedute dal 2006 (4 confronti, 5049 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 5 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.
  • Non esiste una dispersione storica specifica per il giorno della settimana per questo strumento.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-09
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 3.7 s]

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 6).

  Le misure di volatilità implicita su DAX stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  La fiducia in questa lettura è bassa perché manca la lettura del termometro, l'unica misura verificata fuori campione su 6 fattori su 6.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese. Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 5,37 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 5,78 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX (indice sostitutivo dichiarato) ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane DAX si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 69% delle sedute dal 2007 (3 confronti, 4677 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — non esiste per questo strumento
  • Ampiezza abituale della giornata — non esiste per questo strumento
  • Comportamento storico del termometro — non esiste per questo strumento
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 2 misure non sono dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 3.0 s]

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: MODELLO
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Le due letture della volatilità implicita non concordano: una dice compressione, l'altra il contrario.

  Le misure di volatilità implicita su S&P 500 stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  Le due letture della volatilità implicita non concordano fra loro, e la confidenza ne tiene conto.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      Il VIX, che misura quanto costa coprirsi su S&P 500, sta a 18,65: più in alto che nel 55% delle sedute del periodo 2000-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, S&P 500 ha percorso dal minimo al massimo circa l'1,29% del proprio valore (metà delle volte fra il 0,93% e l'1,86%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 52% di una giornata qualsiasi: 22,9 punti di differenza, misurati su 1013 giornate fra il 31/12/2018 e il 29/07/2026. Lo stato è rimasto lo stesso nel 94% dei giorni, in media per 17,7 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 4,58 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 3,57 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento
  • Stabilità della relazione con pari e driver — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Le due letture della volatilità implicita si contraddicono: non sappiamo quale delle due stia descrivendo meglio la giornata.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-09
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: pubblicato]
  [tempo totale della sintesi: 3.6 s]

── CHIAMATE REALI AL MODELLO ──
  generazione: 4 chiamate · media 2.62 s · min 2.07 s · max 3.10 s
  cancello: 8 chiamate · media 0.52 s · min 0.43 s · max 0.60 s
  TOTALE: 12 chiamate in questa esecuzione
```

---

## 4. Buco trovato nei cancelli — id interni che trapelano (red → green)

**Il buco.** Il modello riceve i fattori con i loro identificatori (`F1`…`F12`)
e li ha citati dentro il testo destinato allo schermo. Due occorrenze in due
esecuzioni diverse, quindi non un caso isolato:

```
• Alcuni dati sui fattori F5 e F6 risultano invecchiati essendo stati rilevati il 2026-07-21.
• Il dato sulla volatilità implicita di F4 e F9 fa riferimento a un indice di un altro mercato.
```

Non è linguaggio direzionale — nessuna delle regole esistenti aveva motivo di
prenderlo — ma è la nostra impalcatura che finisce in faccia a chi legge: quegli
id non vogliono dire niente per l'utente e fanno sembrare la sezione un pannello
di debug.

**RED.** Ho aggiunto quattro esche in `cancelli.test.ts`, in un blocco a parte
intitolato «esche raccolte dalla prosa vera del modello», con le due frasi
**copiate verbatim** dall'output più due varianti (id singolo, id a due cifre),
più un test di falsi positivi. Prima della correzione:

```
× ferma: id interni dei fattori (F5 e F6) — osservata il 09/08/2026
× ferma: id interni dei fattori (F4 e F9) — osservata il 09/08/2026
× ferma: id interno singolo
× ferma: id interno a due cifre
AssertionError: expected 0 to be greater than 0
Tests  4 failed | 1 passed
```

Il quinto (quello dei falsi positivi) passava già: serviva a fissare che «Il GVZ
sta a 24,86», «dal 2006 al 2025», «da F a G nella scala della fonte» e «Nel 2026»
**non** devono essere presi.

**GREEN.** Regola nuova in `cancelli.ts`, limitata di proposito all'intervallo
`F1`–`F12` (gli id che esistono davvero) e con confini che escludono lettere e
cifre attorno, per non catturare sigle altrui:

```ts
{
  etichetta: "identificatore interno di fattore (F1…F12) nel testo",
  regex: /(?<![A-Za-z])F(?:[1-9]|1[0-2])(?![0-9A-Za-z])/,
}
```

Dopo: `Tests 66 passed`, e la suite dell'AI Analyst intera `218 passed`.

**Verifica sul campo:** rieseguita la generazione reale sulla variante che aveva
prodotto il leak (§3), la ricerca degli id nel testo dà «NESSUNO».

### Cosa NON ho trovato

Ho riletto tutte le 25 sintesi generate cercando quello che mi hai chiesto:
direzione implicita, «potrebbe favorire un movimento verso…», «opportunità»,
«livelli da tenere d'occhio in ottica di ingresso», qualunque frase che un
trader leggerebbe come un suggerimento. **Non ce n'è una.** Il modello, tenuto
sui binari del dossier numerico e della formulazione di riferimento, non prova
mai a fare l'analista. Il che è coerente col §1: non prova a fare niente.

## 5. Il cancello è scattato per davvero — due volte, ed è un falso positivo

Su 21 generazioni sull'oro, il cancello lessicale ha bloccato **2 volte** (~10%).
La prima volta il tracciato diceva solo quale regola era scattata, non su cosa:
non bastava per capire se il blocco fosse giusto. Ho quindi fatto registrare
anche **la frase incriminata** (`rigaIncriminata` in `sintesi.ts`), e alla
seconda occorrenza è venuta fuori:

```
tentativo 1: cancello lessicale: aspettativa direzionale: livelli tecnici
(supporto/resistenza/tenuta di quota) — nella frase «Alcuni dati di supporto
non sono aggiornati all'ultima seduta disponibile.» | tentativo 2: pubblicato
```

**È un falso positivo.** «Dati di supporto» vuol dire dati accessori, non un
supporto di analisi tecnica. La regola arriva dalla lista del pannello COT
(`/\b(supporto|resistenz\w+|livello chiave|tenuta d(?:ei|el|elle)|quota \d)/i`)
e cattura la parola ovunque compaia.

**Non l'ho toccata, di proposito.** È codice condiviso e pre-registrato del box
COT, in produzione: allargarne le maglie per un fastidio della mia sezione
sarebbe un cambio di rischio deciso da me su un componente che non è mio. E il
comportamento è comunque quello giusto in senso fail-safe: blocca, rigenera, e
al secondo tentativo pubblica. Il costo è una generazione sprecata su dieci.
**Decisione tua**, due opzioni pulite: restringere la regola a `supporto` solo
quando accanto c'è un numero o la parola «livello», oppure lasciar perdere
perché il retry già copre.

## 6. Determinismo — 17 generazioni, verdetto identico

Prova su tre lotti, tutti sullo stesso identico dossier (stesso strumento,
stessa data, stesso file di partenza).

| Lotto | Giri | Carattere | Confidenza | Motivo |
|---|---:|---|---|---|
| ORO, report datato a oggi | 5 | `CONDIZIONI_DI_ESPANSIONE` **identico** | `MEDIA` **identica** | **identico** |
| WTI, report datato a oggi | 6 | `CONDIZIONI_DI_ESPANSIONE` **identico** | `MEDIA` **identica** | **identico** |
| ORO, secondo lotto | 6 | `CONDIZIONI_DI_ESPANSIONE` **identico** | `MEDIA` **identica** | **identico** |

**L'invariante regge: 17 su 17.** Era il punto della decisione D-04 (il verdetto
lo calcola il nostro codice, non il modello) e adesso è verificato dal vivo, non
solo nei test col client finto.

Sulla prosa, misurata come parole in comune fra il primo giro e gli altri:

| Lotto | Somiglianza | Aperture diverse fra loro | Righe-fattore diverse |
|---|---|---:|---:|
| ORO (5 giri) | 92,1 – 97,1% | 4 su 5 | 2 su 5 |
| WTI (6 giri) | 97,7 – 98,5% | 1 su 6 | 1 su 6 |
| ORO (6 giri) | — | 3 su 6 | — |

**Nessuna coppia di generazioni racconta storie diverse dagli stessi numeri**:
le differenze sono tutte nella terza frase di apertura e nelle voci aggiuntive
dei limiti, mai nei numeri e mai nel senso. Non c'è quindi il problema che
temevi. C'è il problema opposto, ed è il §1: la variazione è così bassa perché
il modello sta ricopiando.

Lo script della prova è nuovo e resta nel repo:
`scripts/ai-analyst-ripetibilita.ts`.

## 7. Tempi di risposta

Misurati sulle chiamate vere, non stimati.

| | Chiamate | Media | Min | Max |
|---|---:|---:|---:|---:|
| Generazione della prosa | 8 | **2,45 s** | 1,83 s | 3,09 s |
| Domanda del cancello semantico | 16 | **0,57 s** | 0,45 s | 0,77 s |

**Una sintesi completa costa 2,8 – 4,6 secondi** (una generazione + due domande
del cancello, in sequenza). Con un blocco del cancello e la rigenerazione si
arriva a **6,7 – 6,9 s**.

Sono **sopra la soglia di 3-4 secondi** che avevi indicato. Non è bloccante,
ma la pagina **ha bisogno di uno stato di caricamento vero**: `loading.tsx` c'è
già ed è uno scheletro, però l'utente resta lì a guardarlo per quattro secondi
buoni, e nel caso peggiore sette. Due note per quando ci metteremo mano: la
parte deterministica (dossier e verdetto) è pronta in millisecondi e si potrebbe
mostrare subito, facendo arrivare la sola prosa dopo; e se si sceglie la strada 1
del §1 (niente modello) il problema sparisce del tutto.

## 8. Quota consumata

**78 chiamate in tutta la sessione di test**, così ripartite:

| Voce | Sintesi | Chiamate |
|---|---:|---:|
| Verifica iniziale della chiave | — | 1 |
| Generazione reale, dati come stanno | 4 | 12 |
| Generazione reale, report datato a oggi | 4 | 12 |
| Ripetibilità ORO (5 giri, 1 blocco) | 5 | 16 |
| Ripetibilità WTI (6 giri) | 6 | 18 |
| Ripetibilità ORO (6 giri, 1 blocco) | 6 | 19 |
| Rigenerazione dopo la correzione del §4 | 4 | 12 |
| **Totale** | **29** | **78** |

Ogni sintesi pubblicata costa **3 chiamate** (una generazione + due domande del
cancello semantico); ogni blocco del cancello ne aggiunge una.

In esercizio normale la sezione ne farebbe **3 per strumento al giorno**, cioè
**12 al giorno** con tutti e quattro, e solo se qualcuno apre le quattro pagine
(la cache in memoria a chiave giorno+strumento evita il resto). È un'inezia. Il
limite giornaliero esatto del tier gratuito per `flash-lite` non l'ho verificato
sulla console — cambia nel tempo e non volevo scriverlo a memoria — ma l'ordine
di grandezza in gioco (decine contro migliaia) non lascia dubbi.

Negli script ho messo una pausa di 12-13 secondi fra uno strumento e l'altro:
**serve solo ai test**, dove si generano quattro o sei sintesi di fila. Il
limite del tier gratuito è al MINUTO, e senza pausa un 429 sarebbe stato
scambiato per «modello non raggiungibile», falsando proprio la misura. L'app non
ne ha bisogno: genera uno strumento alla volta, su richiesta.

## 9. Punto 7 — il file estraneo, ricontrollato oggi

Ricontrollato in sola lettura (`git --no-optional-locks`, nessuna modifica,
nessun commit). **Situazione invariata rispetto al giro precedente**: stesso
diffstat (`macro-desk.ts` +83 −2, `macro-desk.test.ts` +80 −0), stessi timestamp
(09/08 alle 11:52:36 e 11:53:27), ancora non committate. Il repo gitignorato
`macro-desk-bridge/` è fermo alle 11:55:48. Da allora nessuno le ha toccate.

Il resto della ricostruzione sta nella sezione precedente di questo log e non
cambia. In sintesi: rendono tollerante il confine di ingresso del report
(`generatedAt` con offset esplicito normalizzato in UTC, `summary` accettato
anche come array di righe e troncato invece che rifiutato), sono lavoro di chi
si occupa del ponte `macro-desk-bridge`, e **non toccano niente che l'AI Analyst
legga** — la sezione usa `reportDate`, `payload.volPanel` e `biasRecord`, mai
`generatedAt` né `summary`. Nessun conflitto col branch.

Vale la pena ripetere il legame indiretto, perché questo giro l'ha reso più
concreto: quei 400 fanno perdere il report del giorno, e senza report fresco
salta il termometro. Nell'esecuzione del §2 si vede il risultato — oro, petrolio
e S&P girano tutti senza la loro misura migliore.

## 10. Cos'è cambiato nel codice

- `scripts/ai-analyst-env.ts` — carica `.env.local` con precedenza su `.env`,
  come fa Next. Senza, gli script non vedevano la chiave.
- `src/lib/ai-analyst/cancelli.ts` — regola nuova contro gli identificatori
  interni (§4).
- `src/lib/ai-analyst/sintesi.ts` — `rigaIncriminata`: il tracciato registra
  anche la frase che ha fatto scattare il cancello, non solo la regola (§5).
- `src/lib/ai-analyst/cancelli.test.ts` — cinque test nuovi: le esche raccolte
  dal vero e la guardia contro i falsi positivi.
- `scripts/ai-analyst-ripetibilita.ts` — la prova del §6.
- `scripts/ai-analyst-sintesi.ts` — cronometro, contatore delle chiamate e
  pausa fra strumenti (§7, §8).

**Gate: 1670 test verdi** (+1 saltato, il giro reale che ora si può lanciare a
mano) · typecheck · lint · build tutti verdi.

---

# Secondo giro — fermato al punto 0 (chiave assente)

> 9 agosto 2026, secondo giro. Branch `feature/ai-analyst`, worktree
> `C:\wt\ai-analyst`. Nessun push, nessun deploy, Neon mai toccato.
> Il resoconto del giro precedente e il diario cronologico stanno più sotto,
> intatti.

## Esito in una riga

**Il test reale col modello non si è potuto fare: non esiste una chiave Gemini
utilizzabile su questa macchina.** Punti 1-6 saltati come da istruzione. Il
punto 7 (file estraneo) è stato fatto ed è nella §3.

---

## 1. Punto 0 — dove ho cercato la chiave, e cosa ho trovato

Ho controllato ogni posto plausibile, senza mai stampare un valore:

| Dove | Esito |
|---|---|
| `$GEMINI_API_KEY` già esportata nella shell | assente |
| `$GOOGLE_API_KEY` nella shell | assente |
| Variabili d'ambiente Windows, scope **User** e **Machine** (`GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GOOGLE_GENAI_API_KEY`, `GEMINI_KEY`) | nessuna impostata |
| `.env.local` — worktree, working copy principale, home, altri worktree | **non esiste da nessuna parte** |
| `.env` del worktree e della working copy | non contengono la chiave |
| Altri progetti in `C:\Users\chenn\progetti` (`template-sito-locale`, `tz-score-wt`) | nessun `.env`, nessun riferimento a Gemini |
| Progetto `regime_detection` (citato nei commenti del termometro) | non presente su questa macchina |
| `.env.production.local` | **c'è, ma è redatta** |

Sulla riga di `.env.production.local` ho fatto una verifica programmatica invece
di fidarmi dell'occhio:

```
lunghezza: 11 | è la stringa "[SENSITIVE]": true | forma AIza…: false
```

Undici caratteri, il valore letterale `[SENSITIVE]`. È il comportamento noto di
`vercel env pull`, che redige le variabili marcate come sensibili. Nel giro
precedente la stessa stringa era già stata provata contro l'API e aveva
risposto `400 API_KEY_INVALID`.

Non ho tentato di rigenerare la chiave né di toccare la configurazione Vercel,
come da istruzione — e comunque il CLI di Vercel non è installato su questa
macchina.

## 2. COSA MI SERVE DA TE — richiesta esatta

Incolla la chiave vera in un file **nuovo** nel worktree:

```
C:\wt\ai-analyst\.env.local
```

con dentro una sola riga:

```
GEMINI_API_KEY=AIza…
```

Dettagli che contano:

- **`.env.local`, non `.env`.** Il `.env` del worktree lo riscrivo io fra un
  giro e l'altro; `.env.local` no, e resta comunque fuori da git
  (`.gitignore` copre `.env*`). È anche il posto dove il progetto ha già
  cercato la chiave in passato: lo dice il commento in
  `scripts/cot-contesto-once.ts`.
- **Il valore vero comincia con `AIza`** ed è lungo ~39 caratteri. Se incolli
  di nuovo `[SENSITIVE]` non cambia niente.
- **Niente virgolette** attorno al valore, e nessuno spazio prima o dopo l'`=`.
- La stessa chiave che usa il job del box COT in produzione va benissimo: è la
  stessa API, stesso modello, stesso tier gratuito.

In alternativa, se preferisci non lasciarla su disco, esportala nella shell da
cui lanci la sessione:

```bash
export GEMINI_API_KEY=AIza…
```

Appena c'è, i punti 1-6 di questo prompt si eseguono così come sono scritti:
niente da cambiare nel codice, gli script sono già pronti
(`scripts/ai-analyst-sintesi.ts`, `scripts/ai-analyst-preview.ts`, e il test
reale `AI_ANALYST_LIVE=1 npx vitest run src/lib/ai-analyst/sintesi.live.test.ts`).

## 3. Punto 7 — le modifiche estranee nella working copy principale

**Fatto solo in lettura.** Ho usato `git --no-optional-locks` per non prendere
nemmeno il lock dell'indice, visto che su quella copia lavora un'altra sessione.
Non ho modificato, committato o messo in stash niente.

### Cosa sono

Due file modificati e non committati, su `main`:

```
 M src/lib/validations/macro-desk.ts        +83 −2
 M src/lib/validations/macro-desk.test.ts   +80 −0
```

Rendono **tollerante il confine di ingresso** del report Macro Desk
(`macroDeskReportSchema`, cioè `POST /api/macro-desk`):

1. **`generatedAt` con offset esplicito** viene normalizzato in ISO UTC
   (`2026-08-02T09:00:00+02:00` → `2026-08-02T07:00:00.000Z`), incluse le forme
   `+0200` senza due punti. Un istante **senza** fuso resta rifiutato di
   proposito: sarebbe ambiguo e sbaglierebbe il bucket giornaliero. La validità
   di calendario è controllata **prima** della conversione, per non farsi
   ingannare dal rollover silenzioso di `new Date` (31/02 → 03/03).
2. **`summary` accettato anche come array di righe**, unite con ` · `; vuoto o
   di sole righe vuote diventa assente; troppo lungo viene **troncato a 2000
   con `…`** invece di far fallire il report. Un summary che non è testo resta
   rifiutato.

Gli 80 righi di test coprono tutti e sette i casi, compresi quelli negativi.

### Chi le ha prodotte, e se sono vive

Non sono ricostruibili dalla history di git — non sono committate: gli ultimi
due commit su quel file sono `67493ae` (Scorecard EM) e `dab8c76` (endpoint
originale), entrambi vecchi. La provenienza si ricostruisce da altro:

- **timestamp su disco: 09/08/2026 11:52:36 e 11:53:27**, cioè dentro la
  finestra in cui io stavo facendo gli screenshot di P3 nel worktree;
- i commenti citano per nome **`macro-desk-bridge`**, che esiste in quella
  working copy come **repository git separato e gitignorato**
  (`.gitignore:51`), con `README.md` e `scripts/` modificati alle **11:55-11:56**,
  cioè subito dopo.

Quindi: **lavoro in corso di una sessione parallela**, non roba abbandonata —
l'ordine dei timestamp (prima il confine nell'app, poi il ponte) descrive
qualcuno che stava sistemando entrambi i lati della stessa catena mentre io
lavoravo. Il commento nel test dà anche il movente, con un numero:

> «Cinque run su quindici del ponte `macro-desk-bridge` sono morte con HTTP 400
> su forme che il desk emette legittimamente, e un 400 qui equivale a perdere il
> report del giorno: non c'è retry a valle.»

Dal README del ponte: inoltra i report a
`https://tradejournal-red-zeta.vercel.app/api/macro-desk` via GitHub Actions,
per aggirare il limite di 2 cron del piano Hobby.

### Toccano qualcosa che l'AI Analyst legge?

**Direttamente no.** L'AI Analyst legge dal report soltanto `reportDate` (per
la freschezza), `payload.volPanel.items` (le chiusure degli indici di
volatilità implicita, che alimentano il termometro) e `biasRecord` (le chiusure
di prezzo, per convertire l'ampiezza in valuta). Le due modifiche riguardano
`generatedAt` e `summary`, che l'AI Analyst **non usa affatto** — e per scelta:
`summary` è la sintesi direzionale del desk esterno, classificata **(c)
vietata** nella spec.

**Indirettamente sì, e parecchio.** Quel «cinque run su quindici morte con 400»
è esattamente il meccanismo che lascia il desk senza report: e senza report
fresco il termometro di volatilità — l'unica misura dell'AI Analyst validata
fuori campione — viene scartato, il carattere della giornata si decide sul solo
indice di Trends e la fiducia scende a «bassa». È lo stato che si vede negli
output del giro precedente. Una precisazione per non attribuire colpe sbagliate:
il ponte fa POST verso **la produzione**, non verso il database locale, quindi
la staleness dell'archivio locale (22/07) è una cosa a sé; ma il meccanismo di
perdita è lo stesso e in produzione morde davvero.

**Se quelle modifiche entrano, per me non cambia niente:** nessun conflitto col
mio branch (`feature/ai-analyst` non tocca `src/lib/validations/`, verificato),
e `generatedAt` normalizzato non influenza né il bucketing né la freschezza,
che passano da `reportDate`.

**Cosa NON ho verificato:** che quelle modifiche compilino e che i loro test
passino. Avrei dovuto lanciare `typecheck`/`vitest` in quella working copy, e
il mandato era lettura e basta. Se la sessione parallela è ancora aperta, lo sa
già lei.

## 4. Gate

Niente da committare sul codice in questo giro: nessuna riga di codice
applicativo è cambiata. Ho comunque rilanciato il gate per certificare che il
branch è rimasto verde: **test 1665 + 1 saltato · typecheck · lint · build**,
tutti verdi.

## 5. La domanda che mi hai fatto — «la prosa è abbastanza buona?»

**Non posso rispondere, e non voglio inventare una risposta.** La prosa vera di
Gemini non l'ho mai vista: tutto ciò che c'è nel log è del fallback
deterministico. Rispondere adesso significherebbe giudicare il modello sulla
base di un testo che ha scritto il mio codice.

Quello che posso dire, e che vale la pena tenere a mente quando la vedremo:

- **la parte deterministica è già leggibile e specifica.** Le righe dei fattori
  dicono numeri, campioni e periodi («ampia nel 75% dei casi, contro il 55% di
  una giornata qualsiasi: 19,7 punti di differenza, su 570 giornate»). Non è
  prosa elegante, ma non è nemmeno vaga;
- **il rischio vero non è che il modello scriva male: è che scriva di più.** Il
  prompt gli dà il verdetto già deciso e la formulazione di riferimento già
  approvata, e gli chiede di renderla scorrevole. Se il valore aggiunto si
  riduce a sinonimi, la domanda «serve il modello?» diventa legittima — e la
  risposta potrebbe essere no, con la sezione che resta tutta deterministica e
  gratuita;
- **l'aggiunta che giustificherebbe il modello** è il collegamento fra fattori:
  «la volatilità implicita è alta *e nello stesso tempo* i contratti aperti sono
  ai minimi, due cose che spingono nella stessa direzione sull'ampiezza». Il
  fallback questo non lo fa: elenca. È lì che guarderò per primo.

Rispondo per davvero appena la chiave c'è.

---

# Resoconto del primo giro (P0-P3)

> Scritto il **9 agosto 2026**. Tutto è sul branch locale `feature/ai-analyst`
> nel worktree `C:\wt\ai-analyst`. **Niente push, niente deploy, Neon mai toccato.**
> Il diario cronologico con tutte le decisioni sta più sotto.

## 1. Stato delle fasi

| Fase | Esito | Commit |
|---|---|---|
| P0 — inventario del Macro Desk + spec congelata | fatta | `3a25d12` |
| P1 — motore di raccolta deterministico | fatta | `ff32dcd` |
| P2 — sintesi col modello, doppio cancello, fallback | fatta **tranne il giro reale col modello** | `b0fc10f` |
| P3 — interfaccia dentro il Macro Desk | fatta | `84cec35` |

Gate finale: **1665 test verdi** (+1 saltato di proposito: il giro reale contro
Gemini) · `typecheck` pulito · `lint` pulito · `build` verde, con la rotta
`/macro-desk/ai-analyst` registrata.

## 2. LA COSA DA SAPERE PRIMA DI TUTTO

**Non ho potuto far scrivere niente al modello.** La `GEMINI_API_KEY` non è
disponibile in locale: `.env.production.local` (generato da `vercel env pull`)
la contiene come la stringa letterale `"[SENSITIVE]"` — Vercel redige i valori
sensibili — e la chiamata torna `400 API_KEY_INVALID`. Stessa cosa per
`FRED_API_KEY` (lì però non cambia nulla: il client ricade sul CSV pubblico
senza chiave, ed è da lì che vengono i numeri qui sotto).

Quindi:

- tutti gli output reali che leggi in questo documento sono prodotti dal
  **fallback deterministico**, e questo è il modo migliore per scoprire che il
  fallback funziona davvero: la sezione produce una lettura completa, corretta e
  onesta **senza alcun modello**, dichiarandolo;
- i due cancelli sono provati con un client finto e una batteria di esche
  difficili, **non su testo generato davvero**. È la prima cosa da rifare quando
  la chiave c'è (§8).

## 3. L'OUTPUT REALE, per ogni strumento

Contesto dei dati locali di oggi: il report Macro Desk in archivio è del
**22/07/2026** (18 giorni), quindi oltre la soglia di scarto di 10 giorni: il
**termometro di volatilità viene scartato** e il carattere si decide sul solo
indice di volatilità implicita di Trends, con fiducia bassa. È il comportamento
corretto ed è esattamente lo scenario «dato stantio» previsto dalla spec.
Oggi è **domenica**, quindi il bucket «giorno della settimana» non esiste e non
conta come misura mancante.

```text
[modello: nessuna chiave, si userà il fallback]

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (8 fattori su 11).

  Le misure di volatilità implicita su Oro stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  La lettura poggia su 8 misure su 11: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il GVZ sta a 24,86. È più in basso che nel 51% delle sedute dell'ultimo anno; più in alto che nel 82% di quelle di tre anni; più in alto che nel 89% di quelle di cinque. Variazione: 0,38 punti in una settimana, −1,35 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017 (499 settimane di storia). Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in alto che nel 64% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 4,62 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il GVZ ha avuto un livello medio di 18,14, su 18 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Oro si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 65% delle sedute dal 2006 (4 confronti, 4616 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 11: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • 4 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (8 fattori su 11).

  Le misure di volatilità implicita su Petrolio WTI stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  La lettura poggia su 8 misure su 11: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      L'OVX sta a 57,34. È più in alto che nel 65% delle sedute dell'ultimo anno; più in alto che nel 88% di quelle di tre anni; più in alto che nel 90% di quelle di cinque. Variazione: −6,10 punti in una settimana, 9,75 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 70% delle settimane dal 2017 (499 settimane di storia). Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in basso che nel 93% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 9,29 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 6,18 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il OVX ha avuto un livello medio di 35,11, su 19 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Petrolio WTI si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 70% delle sedute dal 2006 (4 confronti, 5049 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 11: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • 5 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 6).

  Le misure di volatilità implicita su DAX stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese. Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 5,37 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 5,78 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX (indice sostitutivo dichiarato) ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane DAX si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 69% delle sedute dal 2007 (3 confronti, 4677 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — non esiste per questo strumento
  • Ampiezza abituale della giornata — non esiste per questo strumento
  • Comportamento storico del termometro — non esiste per questo strumento
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 2 misure non sono dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (5 fattori su 8).

  Le misure di volatilità implicita su S&P 500 stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  La lettura poggia su 5 misure su 8: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 4,58 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 3,57 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento
  • Stabilità della relazione con pari e driver — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 8: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]
```

### Lo stesso, con il report datato a oggi (SIMULAZIONE dichiarata)

Stesso report in archivio, stessi valori, data forzata a oggi: serve solo a far
vedere che aspetto ha la sezione in produzione, dove il report arriva ogni
giorno e il termometro c'è.

```text
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  SIMULAZIONE: il report in archivio è del 2026-07-22, qui viene DATATO 2026-08-09.
  I valori sono quelli veri di quel report.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

[modello: nessuna chiave, si userà il fallback]

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: media — Fonti concordi ma 4 dati non sono dell'ultima seduta (11 fattori su 11).

  Le misure di volatilità implicita su Oro stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      Il GVZ, che misura quanto costa coprirsi su Oro, sta a 25,37: più in alto che nel 88% delle sedute del periodo 2008-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, Oro ha percorso dal minimo al massimo circa l'1,61% del proprio valore (metà delle volte fra l'1,21% e il 2,25%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 55% di una giornata qualsiasi: 19,7 punti di differenza, misurati su 570 giornate fra il 01/07/2021 e il 27/07/2026. Lo stato è rimasto lo stesso nel 95% dei giorni, in media per 18,8 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      Il GVZ sta a 24,86. È più in basso che nel 51% delle sedute dell'ultimo anno; più in alto che nel 82% di quelle di tre anni; più in alto che nel 89% di quelle di cinque. Variazione: 0,38 punti in una settimana, −1,35 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017 (499 settimane di storia). Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in alto che nel 64% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 4,62 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il GVZ ha avuto un livello medio di 18,14, su 18 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Oro si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 65% delle sedute dal 2006 (4 confronti, 4616 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 4 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-09
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: media — Fonti concordi ma 5 dati non sono dell'ultima seduta (11 fattori su 11).

  Le misure di volatilità implicita su Petrolio WTI stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      L'OVX, che misura quanto costa coprirsi su Petrolio WTI, sta a 62,07: più in alto che nel 93% delle sedute del periodo 2007-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, Petrolio WTI ha percorso dal minimo al massimo circa il 3,63% del proprio valore (metà delle volte fra il 2,66% e il 4,98%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 64% dei casi, contro il 48% di una giornata qualsiasi: 16,5 punti di differenza, misurati su 748 giornate fra il 08/12/2021 e il 27/07/2026. Lo stato è rimasto lo stesso nel 91% dei giorni, in media per 11,5 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      L'OVX sta a 57,34. È più in alto che nel 65% delle sedute dell'ultimo anno; più in alto che nel 88% di quelle di tre anni; più in alto che nel 90% di quelle di cinque. Variazione: −6,10 punti in una settimana, 9,75 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 70% delle settimane dal 2017 (499 settimane di storia). Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in basso che nel 93% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 9,29 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 6,18 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il OVX ha avuto un livello medio di 35,11, su 19 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Petrolio WTI si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 70% delle sedute dal 2006 (4 confronti, 5049 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 5 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-09
  · Trends — Volatilità — dato al 2026-08-06
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 6).

  Le misure di volatilità implicita su DAX stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese. Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 5,37 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 5,78 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX (indice sostitutivo dichiarato) ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane DAX si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 69% delle sedute dal 2007 (3 confronti, 4677 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — non esiste per questo strumento
  • Ampiezza abituale della giornata — non esiste per questo strumento
  • Comportamento storico del termometro — non esiste per questo strumento
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 2 misure non sono dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  2026-08-09
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Le due letture della volatilità implicita non concordano: una dice compressione, l'altra il contrario.

  Le misure di volatilità implicita su S&P 500 stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  Le due letture della volatilità implicita non concordano fra loro, e la confidenza ne tiene conto.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      Il VIX, che misura quanto costa coprirsi su S&P 500, sta a 18,65: più in alto che nel 55% delle sedute del periodo 2000-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, S&P 500 ha percorso dal minimo al massimo circa l'1,29% del proprio valore (metà delle volte fra il 0,93% e l'1,86%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 52% di una giornata qualsiasi: 22,9 punti di differenza, misurati su 1013 giornate fra il 31/12/2018 e il 29/07/2026. Lo stato è rimasto lo stesso nel 94% dei giorni, in media per 17,7 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,15. È più in basso che nel 88% delle sedute dell'ultimo anno; più in basso che nel 68% di quelle di tre anni; più in basso che nel 77% di quelle di cinque. Variazione: −1,94 punti in una settimana, −0,98 punti in un mese.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 4,58 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 3,57 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto il VIX ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Condizioni finanziarie complessive [peso BASSO]
      Condizioni finanziarie (NFCI): −0,53, più in basso che nel 63% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,71%, più in basso che nel 90% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Dispersione storica del giorno della settimana — non esiste per questo strumento
  • Stabilità della relazione con pari e driver — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 31/07/2026.
  • Le due letture della volatilità implicita si contraddicono: non sappiamo quale delle due stia descrivendo meglio la giornata.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-09
  · Trends — Volatilità — dato al 2026-08-06
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-31
  Dato più vecchio usato: 2026-07-31

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]
```

## 4. Quante volte sono scattati i cancelli, e su cosa

**In esecuzione reale: mai** — perché nessun testo è stato generato (§2). Il
tracciato di ogni sintesi riporta `tentativo 1: modello non raggiungibile`.

**Nei test, dove sono stati messi alla prova sul serio:**

| Cancello | Casi provati | Esito |
|---|---:|---|
| Lessicale — esche che deve fermare | 43 | tutte fermate |
| Lessicale — testi legittimi che deve lasciar passare | 8 | tutti passati |
| Lessicale — sui NOSTRI template, su una matrice di dossier | 14 | tutti puliti |
| Lessicale — sul markup RESO | 10 | tutti puliti |
| Semantico — fail-closed (sì, ambiguo, vuoto, errore, «Yes», «1») | 6 | tutti bloccati |
| Semantico — «no» con punteggiatura e virgolette | 5 | tutti passati |

Le 43 esche non sono facili: inglese (`bullish`, `outlook`, `price target`),
gergo tecnico al posto della direzione (`z-score`, `expected move`,
`correlazione`), cronaca di prezzo («l'oro crolla», «il petrolio sale del 3%»),
livelli tecnici («la tenuta dei 3.900»), probabilità inventate, giudizi di
merito («giornata favorevole», «quadro molto negativo»).

**Il cancello ha fermato anche testo NOSTRO, due volte,** ed è servito:

1. «presenti N fattori su M **attesi**» — `attesi` è la radice di «aspettativa»,
   vietata dalla lista del COT. Riscritta in «sono arrivate N misure su M».
2. I limiti fissi dicevano «non dice se il prezzo **salirà o scenderà**» —
   futuro sul prezzo, vietato. Riscritti in «non indica una direzione di prezzo».

**Il limite del primo cancello è dichiarato, non nascosto.** Cinque esche
insinuanti — «il metallo ha più spazio sopra di sé che sotto», «chi è entrato la
settimana scorsa ha ancora margine» — **passano** il controllo lessicale: non
contengono nessuna parola vietata. C'è un test che lo fissa esplicitamente, e un
altro che verifica che il percorso completo le fermi col cancello semantico. È
il motivo per cui i cancelli sono due.

## 5. Cos'è stato costruito, in breve

- `docs/ai-analyst/SPEC_ai_analyst_v1.0.md` — inventario di tutte le
  sottosezioni del Macro Desk con, per ogni grandezza, dove vive, con che
  frequenza si aggiorna, il suo significato validato e la classificazione
  **(a) carattere / (b) contesto / (c) vietata**. Congelata prima del codice.
- `src/lib/ai-analyst/` — catalogo dei 4 strumenti, tipi del dossier, mapper
  puri, costruttore del dossier con le soglie pre-registrate, i due cancelli, i
  template deterministici, il prompt, il client Gemini, l'orchestratore.
- `src/lib/queries/ai-analyst.ts` — l'unico pezzo con I/O.
- `src/components/macro-desk/ai-analyst-view.tsx` + la rotta
  `/macro-desk/ai-analyst`.
- Tre script: anteprima del dossier, sintesi reale, anteprima HTML fotografabile.

**I 12 fattori.** Classe (a) = carattere; (b) = contesto di fondo.
F1-F3 termometro di volatilità (stato, ampiezza abituale, comportamento storico)
· F4 indice di volatilità implicita da Trends · F5 partecipazione al mercato
(COT) · F6 posizionamento speculativo (COT) · F7-F8 dispersione stagionale di
mese e giorno · F9 livello abituale dell'indice di volatilità nel mese · F10
stabilità della relazione con pari e driver · F11 condizioni finanziarie · F12
tensione sul credito.

## 6. Le decisioni che ho preso al posto tuo

Le trovi tutte per esteso nel diario (D-01 … D-16). Le cinque che cambiano
davvero la forma della cosa:

1. **D-03 — nel dossier entrano solo numeri ed enum nostri, mai testo di terzi.**
   Niente note di lettura di Trends («reali su = oro giù»), niente narrativa del
   report esterno, niente frasi già composte del Driver Desk. Quei testi sono
   direzionali per progetto: escluderli alla fonte elimina un'intera classe di
   fughe. Prezzo pagato: la mappa eventi resta fuori dalla v1.0.
2. **D-04 — il carattere della giornata e la fiducia li calcoliamo noi, non il
   modello.** Al modello resta solo la prosa. Così il fallback dà lo stesso
   identico verdetto, e i test lo verificano senza rete.
3. **D-02 — quattro strumenti: ORO, WTI, DAX, S&P 500.** Nessuno ha copertura
   piena, e la sezione lo dichiara invece di nasconderlo.
4. **D-09 — della Stagionalità si prende solo la dispersione.** Media, mediana e
   quota di anni positivi sono direzionali e restano fuori.
5. **D-13 — il fallback per modello irraggiungibile non va in cache.** Se la
   rete torna fra dieci minuti la pagina deve poter riprovare.

## 7. Cosa mi ha lasciato dubbi

- **Il termometro dipende dal report giornaliero.** L'unica misura validata
  fuori campione arriva dal pannello volatilità del report esterno: se il report
  salta un giorno, il pezzo migliore della sezione sparisce. In locale è proprio
  quello che si vede. Forse vale la pena prendere la volatilità implicita
  direttamente da FRED anche per il termometro.
- **Il DAX è lo strumento debole.** Niente COT, niente indice di volatilità
  proprio (usa il VIX, dichiarato come sostituto): resta con 7 misure su 12.
  Tenerlo o toglierlo è una tua decisione.
- **La finestra stagionale a 20 anni** mescola regimi diversi. L'ho tenuta
  perché è il default della pagina Stagionalità: cambiarla per strumento sarebbe
  stato tuning a posteriori.
- **Le soglie di freschezza le ho scelte io** (§3.1 della spec), pre-registrate
  prima di guardare qualunque risultato. Sono ragionevoli, non validate.
- **Non ho potuto fotografare la pagina VERA**, solo il componente (§8).

## 8. Verifica visiva — cosa ho controllato e cosa no

**Controllato.** Ho reso il componente con lo STESSO CSS compilato dal build, in
un file HTML autonomo, e l'ho fotografato con Chrome headless a 1280 e 390 px,
tema chiaro e scuro. Le immagini sono in `docs/ai-analyst/`:

| File | Cosa mostra |
|---|---|
| `ai-analyst__{1280,390}__{dark,light}.png` | lo stato REALE di oggi (termometro scartato) |
| `ai-analyst-report-fresco__{1280,390}__{dark,light}.png` | con il report datato a oggi |
| `ai-analyst-fonte-giu__*.png` | **il database locale spento** |

Le ho ispezionate una per una. Impaginazione corretta, testo leggibile, chip che
vanno a capo su mobile, nessuno scorrimento orizzontale, avvisi in ambra solo
dove riguardano la qualità del dato. Il blocco resta scuro anche in tema chiaro:
è voluto — `.macro-report` ha identità dark fissa, come tutto il Macro Desk.

**NON controllato, e devi guardarlo tu:** la pagina vera, dentro il layout
dell'app, con sidebar e intestazione, e i font veri (Inter e JetBrains Mono
arrivano da `next/font` e nell'anteprima autonoma non ci sono — ho messo dei
sostituti di sistema perché non venisse fotografata in serif). La pagina sta
dietro l'autenticazione e in questa sessione non posso inserire credenziali.

**Bonus non pianificato.** A metà lavoro Docker Desktop si è spento da solo e il
Postgres locale è caduto. La sezione ha degradato esattamente come doveva:
«Dati insufficienti», ogni misura mancante elencata con il motivo «fonte non
raggiungibile», nessun errore, nessuna pagina vuota. Ho tenuto quegli screenshot
(`ai-analyst-fonte-giu__*`): è la prova migliore che ho del comportamento con le
fonti giù, ed è capitata da sola.

**Un bug trovato proprio guardando le immagini.** L'intestazione diceva «11
misure su 12: una manca» di domenica, quando il bucket «giorno della settimana»
semplicemente non esiste. Il flag di applicabilità veniva dallo slot dello
strumento e ignorava un `non_applicabile` dichiarato dalla lettura per il
GIORNO. Corretto, con un test che lo fissa. Senza la verifica visiva sarebbe
passato: due giorni su sette con la copertura falsata.

## 9. Cosa devi decidere tu prima di pensare al deploy

1. **La chiave Gemini.** Mettila a disposizione in locale (un `.env.local` con
   `GEMINI_API_KEY=…`) e fai girare
   `npx tsx scripts/ai-analyst-sintesi.ts --report-fresco`. Finché non lo
   facciamo, **non sappiamo che testo scrive il modello** né quante volte i
   cancelli scattano davvero. Per me è il passo numero uno.
2. **Ti piace il risultato?** Leggi la §3. Se la risposta è no, si butta poco:
   la spec e il motore di raccolta restano buoni anche per un'altra forma.
3. **Persistenza sì o no.** Oggi la cache è in memoria e si svuota a ogni
   riavvio della funzione: in produzione la sintesi può rigenerarsi più volte al
   giorno (irrilevante sul tier gratuito). Una tabella servirebbe soprattutto per
   lo storico — e per una versione B falsificabile.
4. **Il DAX resta o esce** (§7).
5. **Chi paga la chiamata al modello.** Oggi la sezione chiama Gemini
   all'apertura della pagina. Se preferisci una generazione una volta al giorno,
   serve un terzo cron — e i due di Vercel sono saturi.
6. **Le soglie** di freschezza, sufficienza e carattere (§3.1, §3.2, §6 della
   spec): sono mie, pre-registrate, mai validate. Guardale.
7. **La mappa eventi** (`eventMap`): oggi esclusa perché è testo libero non
   parsabile. Se il desk la pubblicasse strutturata sarebbe il primo fattore
   nuovo da aggiungere — «volatilità bassa + evento binario in agenda» è
   esattamente il tipo di cosa che questa sezione dovrebbe saper dire.

---

# Diario di sessione (ordine cronologico)

Branch: `feature/ai-analyst` · worktree dedicato: `C:\wt\ai-analyst` (percorso corto:
Turbopack ha già dato problemi con path lunghi) · **niente push, niente deploy, niente Neon**.

---

## 2026-08-04 14:20 — Setup della sessione

- `origin/main` = `main` = `930d396`. Worktree creato da `origin/main` con
  `git worktree add -b feature/ai-analyst /c/wt/ai-analyst origin/main`.
  Motivo del worktree separato: nelle ultime ore altre sessioni parallele hanno
  corrotto `.git` lavorando sulla stessa working copy.
- `.env` copiato dalla working copy principale (punta al **Postgres locale in
  Docker**, `localhost:5432/tradejournal` — verificato: non è Neon). Aggiunte le
  sole chiavi `FRED_API_KEY` e `GEMINI_API_KEY` prese da `.env.production.local`.
  **NON** è stato copiato `DATABASE_URL` di produzione: la riga di `.env.production.local`
  non è stata toccata.
- Verificato lo stato del database **locale** (docker `tradejournal-db`, up e healthy):

  | tabella | righe | dato più recente |
  |---|---:|---|
  | `MacroDeskReport` | 68 | DAILY 2026-07-22 · WEEKLY 2026-07-20 |
  | `CotWeek` | 998 | 2026-07-21 |
  | `CotContestoBox` | 1 | — |
  | `DriverDeskBar` | 105 346 | 2026-08-04 |
  | `DriverDeskCoverage` | 13 | — |
  | `SeasonalityStat` | 9 164 | run 2026-08-03 19:38 |
  | `SeasonalityDailyBar` | 61 122 | 2026-08-03 |
  | `SeasonalityCoverage` | 8 (7 popolati, VDAX vuoto) | — |

  **Il locale è popolato quasi come la produzione.** L'unica cosa vecchia è il
  report Macro Desk (13 giorni): è un caso di prova utile, non un problema —
  è esattamente lo scenario "dato stantio" che la spec deve gestire.

### Decisione D-01 — dove lavoro
Worktree dedicato in `C:\wt\ai-analyst`, non nella cartella condivisa. Nessun
`git push`. Nessun comando che tocchi Neon, nessun `db:seed`, nessun cron.

---

## 2026-08-04 14:47 — P0 · Inventario del Macro Desk

Esplorato tutto il codice del Macro Desk e delle sottosezioni. L'inventario
completo, con la classificazione (a)/(b)/(c) grandezza per grandezza, sta in
**`docs/ai-analyst/SPEC_ai_analyst_v1.0.md`** — qui registro solo le decisioni.

### Decisione D-02 — quali strumenti
Quattro: **ORO, WTI, DAX, S&P 500**. È l'unione di ciò che le sottosezioni
coprono davvero (il Macro Desk parla di xau/wti/idx dove idx = S&P 500; il
Driver Desk ha schede ORO/WTI/DAX; il termometro ha XAUUSD/WTICOUSD/GER40/SP500;
la Stagionalità ha XAUUSD/WTI/GER40/SPX). Nessuno dei quattro ha copertura
piena su tutte le fonti, e va bene: il dossier dichiara cosa manca invece di
nasconderlo (COT esiste solo per oro e petrolio, il DAX non ha indice di
volatilità implicita nella pipeline).

### Decisione D-03 — nel dossier entrano SOLO numeri ed enum nostri, mai testo altrui
Regola dura, adottata come proprietà di sicurezza principale:

> Nel dossier che va al modello non entra **nessuna stringa di testo libero
> prodotta da terzi**. Niente `reading`/`feeds` del registry Trends, niente
> `narrative`/`edge`/`invalid`/`risks`/`conclusion`/`watch`/`news`/`eventMap`
> del report esterno, niente `sentence`/`signSentence` del Driver Desk.
> Solo valori numerici, etichette da enum chiusi e date, prodotti dai nostri
> moduli puri.

Perché: quei testi sono *esplicitamente* direzionali per progetto — il registry
Trends contiene frasi come «reali su = oro giù» e il report esterno dichiara un
bias rialzista/ribassista. Passarli al modello significherebbe chiedergli di non
usare l'unica cosa interessante che gli abbiamo dato. Escluderli alla fonte
elimina un'intera classe di fughe, e rende il fallback deterministico
equivalente al percorso col modello (stessa informazione in ingresso).

Conseguenza accettata: la mappa eventi (`eventMap`) resta **fuori** dalla v1.0,
pur essendo un fattore di ampiezza legittimo («vol bassa + evento binario in
agenda = fragilità»). È testo libero di origine esterna, con `when` in formato
non parsabile in modo affidabile. Candidata alla v1.1 se e quando il desk la
pubblicherà in forma strutturata.

### Decisione D-04 — l'enum del carattere lo calcoliamo NOI, non il modello
Modifica alla struttura di partenza proposta nel piano (che la invitava
esplicitamente, «miglioralo se hai una proposta migliore»).

Il piano prevedeva che il modello scegliesse `carattere atteso` e `confidenza`
da enum chiusi. Li calcolo invece **in modo deterministico dal dossier**, prima
di chiamare il modello, con soglie pre-registrate (§6 della spec). Al modello
resta soltanto la prosa: le 2-4 frasi di apertura, la riga «cosa dice oggi» di
ogni fattore, e le voci aggiuntive di «cosa non sappiamo».

Tre motivi:
1. il carattere atteso è l'unico campo con significato operativo: farlo scegliere
   a un modello probabilistico introduce varianza su una cosa che i dati
   determinano già;
2. così il fallback deterministico produce **lo stesso identico verdetto** del
   percorso col modello — cambia solo la prosa, non il giudizio;
3. i test possono verificare il verdetto su dossier finti senza toccare la rete.

### Decisione D-05 — niente migrazioni, niente nuove tabelle (dal piano)
Confermata come da istruzioni. La sintesi si genera on-demand e vive in una
cache in memoria con chiave `(giorno, strumento)`. Nessuna riga di database
nuova, nessun cron nuovo.

### Decisione D-06 — soglie pre-registrate PRIMA di guardare i risultati
Tutte le soglie (freschezza, sufficienza, carattere, confidenza) sono state
scritte nella spec e committate **prima** di eseguire il primo dossier reale.
Il commit della spec è la marca temporale: qualunque modifica successiva a una
soglia dovrà comparire in questo log con la sua motivazione.


---

## 2026-08-04 15:10 — P1 · Motore di raccolta

File nuovi:
- `src/lib/ai-analyst/instruments.ts` — catalogo dei 4 strumenti e di cosa
  esiste per ognuno (`null`/`false` = non applicabile PER COSTRUZIONE);
- `src/lib/ai-analyst/types.ts` — tipi del dossier, `Lettura<V>` con motivo di
  assenza, valori dei fattori (solo numeri ed enum, mai testo di terzi);
- `src/lib/ai-analyst/letture.ts` — mapper PURI da «pezzo del Macro Desk» a
  `Lettura<…>`;
- `src/lib/ai-analyst/dossier.ts` — costruttore PURO: freschezza, copertura,
  sufficienza, verdetto. Tutte le soglie pre-registrate vivono qui;
- `src/lib/queries/ai-analyst.ts` — l'unico pezzo con I/O;
- `scripts/ai-analyst-preview.ts` — anteprima a terminale.

Test: `dossier.test.ts` (33) + `letture.test.ts` (37) = **70 nuovi test**.
Coprono caso pieno, con buchi, stantio, vuoto, non applicabile, discordanza,
soglie di freschezza sui bordi esatti (warn, warn+1, drop, drop+1), data nel
futuro, data non parsabile.

### Decisione D-07 — separare i mapper puri dal layer di I/O
Il piano chiedeva «una funzione pura che raccoglie … e restituisce il dossier».
La raccolta però deve interrogare database e rete. Ho separato: i mapper
(`letture.ts`) e il costruttore (`dossier.ts`) sono puri e testati con dati
finti; `queries/ai-analyst.ts` fa solo query e chiama i mapper. È l'unico modo
per avere davvero la copertura completa richiesta senza database nei test.

### Decisione D-08 — la «data del dato» della Stagionalità è quella dell'archivio
Il bucket di agosto finisce ad agosto dell'anno SCORSO per costruzione (l'anno
in corso è escluso dalle medie). Usare `lastDate` del bucket come data del dato
avrebbe fatto scartare la Stagionalità ogni singolo giorno dell'anno. La
freschezza che conta è quella dell'ARCHIVIO su cui il precalcolo ha lavorato
(`SeasonalityCoverage.dailyLast`); la finestra del campione viaggia comunque
dentro il valore (`primoAnno`/`ultimoAnno`). C'è un test che lo fissa.

### Decisione D-09 — della Stagionalità si prende solo la dispersione
Media, mediana e quota di anni positivi sono direzionali e restano fuori (un
test verifica che il valore serializzato non le contenga). Della fascia 25°–75°
si prende solo la LARGHEZZA, non i due estremi: una larghezza non ha verso.

### Decisione D-10 — finestra stagionale fissa a 20 anni
La stessa che la pagina Stagionalità propone di default, uguale per tutti gli
strumenti. Sceglierla strumento per strumento sarebbe tuning a posteriori.

### Verifica indipendente dei numeri (richiesta del piano)
In `letture.test.ts` ogni grandezza numerica è confrontata con una
ricostruzione indipendente: la dispersione ×100 contro la costante 4,23
calcolata a mano; la fascia 25°–75° ricalcolata con `exp(x) − 1` invece di
`expm1(x)` E contro la costante 5,617559185819; la mediana dei confronti del
Driver Desk contro l'ordinamento fatto a mano; il giorno della settimana contro
`Date.getUTCDay()`; il guadagno in punti contro `(0,71 − 0,50) × 100`.

### Gate
`npm test` 1522/1522 · `npm run typecheck` pulito · `npm run lint` pulito ·
`npm run build` verde.

### Anteprima REALE sui dati locali (2026-08-04)

Il report Macro Desk locale è del **2026-07-22**, cioè 13 giorni: oltre la
soglia di scarto di 10 giorni. Il termometro viene quindi **scartato** su tutti
e tre gli strumenti che lo avrebbero, e il carattere si decide sul solo indice
di volatilità implicita di Trends, con confidenza BASSA. **È il comportamento
corretto**, ed è esattamente lo scenario «dato stantio» che la spec descrive.

```text
══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Nella norma   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (9 fattori su 12).
  copertura: 9/12 (75%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        GVZ a 23,31
        posizione nella propria storia: 1A 31 · 3A 75 · 5A 84 su 100
        variazione: 1 settimana -1,02 · 1 mese -3,81
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda MOLTO BASSO · 3,2 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 31201
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda NELLA NORMA · 64,1 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 9436
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        mese «Agosto» · dispersione 4,62 punti · fascia 25°–75° larga 6,15 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,18 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        GVZ in Agosto: livello medio 18,14 su 18 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 65 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 4616 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → dato troppo vecchio per essere usato
  [F2] Ampiezza abituale della giornata → dato troppo vecchio per essere usato
  [F3] Comportamento storico del termometro → dato troppo vecchio per essere usato

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di espansione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (9 fattori su 12).
  copertura: 9/12 (75%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        OVX a 63,04
        posizione nella propria storia: 1A 73 · 3A 91 · 5A 93 su 100
        variazione: 1 settimana -4,96 · 1 mese 22,28
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda NELLA NORMA · 30,3 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -47390
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda MOLTO BASSO · 6,8 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -18893
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        mese «Agosto» · dispersione 6,18 punti · fascia 25°–75° larga 9,29 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        giorno «Martedì» · dispersione 0,38 punti · fascia 25°–75° larga 0,40 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        OVX in Agosto: livello medio 35,11 su 19 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        legame con pari e driver: 70 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 5049 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → dato troppo vecchio per essere usato
  [F2] Ampiezza abituale della giornata → dato troppo vecchio per essere usato
  [F3] Comportamento storico del termometro → dato troppo vecchio per essere usato

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di compressione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (7 fattori su 7).
  copertura: 7/7 (100%)
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX (sostituto dichiarato) a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 5,78 punti · fascia 25°–75° larga 5,37 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,20 punti · fascia 25°–75° larga 0,17 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX (sostituto) in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 69 su 100 (banda NELLA NORMA) su 3 confronti · dal 2007, 4677 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → non esiste per questo strumento  (fuori dal conteggio)
  [F2] Ampiezza abituale della giornata → non esiste per questo strumento  (fuori dal conteggio)
  [F3] Comportamento storico del termometro → non esiste per questo strumento  (fuori dal conteggio)
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di compressione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 9).
  copertura: 6/9 (67%)
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 3,57 punti · fascia 25°–75° larga 4,58 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,11 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → dato troppo vecchio per essere usato
  [F2] Ampiezza abituale della giornata → dato troppo vecchio per essere usato
  [F3] Comportamento storico del termometro → dato troppo vecchio per essere usato
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)
  [F10] Stabilità della relazione con pari e driver → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
```

### Anteprima con report datato a oggi (SIMULAZIONE)

Stesso report, stessi valori, data forzata a oggi: serve solo a far vedere che
aspetto ha il dossier in produzione, dove il report arriva ogni giorno.

```text
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  SIMULAZIONE: il report in archivio è del 2026-07-22, qui viene DATATO 2026-08-04.
  Serve solo a mostrare l'aspetto del dossier con un report giornaliero
  fresco. I valori sono quelli veri di quel report.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di espansione   ·   CONFIDENZA: MEDIA
  Fonti concordi ma 3 dati non sono dell'ultima seduta (12 fattori su 12).
  copertura: 12/12 (100%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F1] Stato della volatilità implicita  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        GVZ a 25,37 · stato ESPANSA
        posizione nella propria storia: 87,5 su 100 (rif. 2008-2026)
  [F2] Ampiezza abituale della giornata  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        escursione abituale: mediana 1,61% · fascia 1,21%–2,25%
        in valuta: non disponibile (chiusura_assente)
  [F3] Comportamento storico del termometro  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        esito "ampia" nel 75% dei casi · senza il termometro 55% · differenza 19,7 punti · n=570 (2021-07-01 → 2026-07-27)
        lo stato resta invariato nel 95% dei giorni · durata media 18,8 giorni
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        GVZ a 23,31
        posizione nella propria storia: 1A 31 · 3A 75 · 5A 84 su 100
        variazione: 1 settimana -1,02 · 1 mese -3,81
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda MOLTO BASSO · 3,2 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 31201
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda NELLA NORMA · 64,1 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: 9436
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        mese «Agosto» · dispersione 4,62 punti · fascia 25°–75° larga 6,15 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-02, 2gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,18 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        GVZ in Agosto: livello medio 18,14 su 18 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 65 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 4616 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
    (nessuno)

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di espansione   ·   CONFIDENZA: MEDIA
  Fonti concordi ma 6 dati non sono dell'ultima seduta (12 fattori su 12).
  copertura: 12/12 (100%)
  dato più vecchio usato: 2026-07-21

  ── FATTORI PRESENTI ──
  [F1] Stato della volatilità implicita  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        OVX a 62,07 · stato ESPANSA
        posizione nella propria storia: 93,3 su 100 (rif. 2007-2026)
  [F2] Ampiezza abituale della giornata  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        escursione abituale: mediana 3,63% · fascia 2,66%–4,98%
        in valuta: non disponibile (chiusura_assente)
  [F3] Comportamento storico del termometro  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        esito "ampia" nel 64% dei casi · senza il termometro 48% · differenza 16,5 punti · n=748 (2021-12-08 → 2026-07-27)
        lo stato resta invariato nel 91% dei giorni · durata media 11,5 giorni
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        OVX a 63,04
        posizione nella propria storia: 1A 73 · 3A 91 · 5A 93 su 100
        variazione: 1 settimana -4,96 · 1 mese 22,28
  [F5] Partecipazione al mercato  (classe a · peso BASSO · 2026-07-21, 14gg, invecchiato)
        partecipazione: banda NELLA NORMA · 30,3 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -47390
  [F6] Posizionamento speculativo  (classe b · peso BASSO · 2026-07-21, 14gg, invecchiato)
        posizionamento netto dei fondi: banda MOLTO BASSO · 6,8 su 100 (dal 2017, 499 settimane)
        variazione nelle ultime 4 settimane: -18893
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        mese «Agosto» · dispersione 6,18 punti · fascia 25°–75° larga 9,29 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        giorno «Martedì» · dispersione 0,38 punti · fascia 25°–75° larga 0,40 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        OVX in Agosto: livello medio 35,11 su 19 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-27, 8gg, invecchiato)
        legame con pari e driver: 70 su 100 (banda NELLA NORMA) su 4 confronti · dal 2006, 5049 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
    (nessuno)

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Condizioni di compressione   ·   CONFIDENZA: BASSA
  Manca la lettura del termometro, l'unica misura verificata fuori campione (7 fattori su 7).
  copertura: 7/7 (100%)
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX (sostituto dichiarato) a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 5,78 punti · fascia 25°–75° larga 5,37 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,20 punti · fascia 25°–75° larga 0,17 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX (sostituto) in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F10] Stabilità della relazione con pari e driver  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        legame con pari e driver: 69 su 100 (banda NELLA NORMA) su 3 confronti · dal 2007, 4677 sedute
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F1] Stato della volatilità implicita → non esiste per questo strumento  (fuori dal conteggio)
  [F2] Ampiezza abituale della giornata → non esiste per questo strumento  (fuori dal conteggio)
  [F3] Comportamento storico del termometro → non esiste per questo strumento  (fuori dal conteggio)
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  giorno 2026-08-04
══════════════════════════════════════════════════════════════════════════════
  CARATTERE: Nella norma   ·   CONFIDENZA: BASSA
  Le due letture della volatilità implicita non concordano: una dice compressione, l'altra il contrario.
  copertura: 9/9 (100%) · LETTURE DISCORDI
  dato più vecchio usato: 2026-07-24

  ── FATTORI PRESENTI ──
  [F1] Stato della volatilità implicita  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        VIX a 18,65 · stato ESPANSA
        posizione nella propria storia: 55,1 su 100 (rif. 2000-2026)
  [F2] Ampiezza abituale della giornata  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        escursione abituale: mediana 1,29% · fascia 0,93%–1,86%
        in valuta: non disponibile (chiusura_assente)
  [F3] Comportamento storico del termometro  (classe a · peso ALTO · 2026-08-04, 0gg, fresco)
        esito "ampia" nel 75% dei casi · senza il termometro 52% · differenza 22,9 punti · n=1013 (2018-12-31 → 2026-07-29)
        lo stato resta invariato nel 94% dei giorni · durata media 17,7 giorni
  [F4] Indice di volatilità implicita  (classe a · peso MEDIO · 2026-07-31, 4gg, fresco)
        VIX a 15,99
        posizione nella propria storia: 1A 24 · 3A 43 · 5A 30 su 100
        variazione: 1 settimana -2,59 · 1 mese -0,60
  [F7] Dispersione storica del mese  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        mese «Agosto» · dispersione 3,57 punti · fascia 25°–75° larga 4,58 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F8] Dispersione storica del giorno della settimana  (classe b · peso BASSO · 2026-08-03, 1gg, fresco)
        giorno «Martedì» · dispersione 0,13 punti · fascia 25°–75° larga 0,11 punti
        campione: 20 anni (2006–2025, finestra 20a) · qualità ok
  [F9] Livello abituale dell'indice di volatilità in questo mese  (classe b · peso BASSO · 2026-07-31, 4gg, fresco)
        VIX in Agosto: livello medio 18,82 su 20 anni (finestra 20a, qualità ok)
  [F11] Condizioni finanziarie complessive  (classe b · peso BASSO · 2026-07-24, 11gg, invecchiato)
        Condizioni finanziarie (NFCI): -0,55 · posizione storica 30 su 100 · 1 settimana -0,01
  [F12] Tensione sul credito  (classe b · peso BASSO · 2026-07-30, 5gg, fresco)
        Spread HY (OAS): 2,84% · posizione storica 27 su 100 · 1 settimana 0,07

  ── FATTORI ASSENTI ──
  [F5] Partecipazione al mercato → non esiste per questo strumento  (fuori dal conteggio)
  [F6] Posizionamento speculativo → non esiste per questo strumento  (fuori dal conteggio)
  [F10] Stabilità della relazione con pari e driver → non esiste per questo strumento  (fuori dal conteggio)

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
```


---

## 2026-08-04 15:30 — P2 · Sintesi, doppio cancello, fallback

File nuovi:
- `src/lib/ai-analyst/cancelli.ts` — i due cancelli. Il lessicale eredita
  INTEGRALMENTE le liste del box COT (`controlloLessicale`) e aggiunge le
  regole di questa sezione; il semantico pone DUE domande, entrambe
  fail-closed.
- `src/lib/ai-analyst/frasi.ts` — i template deterministici (fallback + rete di
  sicurezza del percorso col modello).
- `src/lib/ai-analyst/prompt.ts` — costruzione del prompt e sua versione
  rafforzata per il secondo tentativo.
- `src/lib/ai-analyst/gemini.ts` — client, ricalcato su `cot-contesto-gemini.ts`.
- `src/lib/ai-analyst/sintesi.ts` — orchestratore, schema Zod della risposta,
  fallback, cache in memoria.
- `src/lib/ai-analyst/fixtures.ts` — fixture condivise dai test.
- `scripts/ai-analyst-sintesi.ts` — sintesi reale a terminale.

Test nuovi: `cancelli.test.ts` (61), `frasi.test.ts` (28), `sintesi.test.ts`
(26) più il giro reale `sintesi.live.test.ts` **saltato di default**.

### ⚠ FATTO IMPORTANTE — la chiave Gemini NON è disponibile in locale
`.env.production.local` (generato da `vercel env pull`) contiene
`GEMINI_API_KEY="[SENSITIVE]"`: **Vercel redige i valori sensibili**, e lo
stesso vale per `FRED_API_KEY`. Provata dal vivo: la chiamata torna
`400 API_KEY_INVALID`.

Conseguenze, tutte verificate dal vivo:
1. **il fallback deterministico funziona davvero** — l'ho visto girare sul
  percorso reale, non solo nei test: la sezione produce una sintesi completa e
  corretta senza modello, dichiarando `ORIGINE: FALLBACK`;
2. FRED continua a funzionare lo stesso: il client ricade sul CSV pubblico
  keyless (i numeri dell'anteprima vengono da lì);
3. **non ho potuto fare un giro reale contro Gemini.** I cancelli sono provati
  con un client finto, con una batteria di esche difficili — non con testo
  generato davvero. È la cosa numero uno da rifare quando la chiave c'è.

Ho tolto dal `.env` del worktree le due chiavi redatte: lasciarle produceva un
400 a ogni chiamata invece del più onesto «chiave assente → fallback».

### Decisione D-11 — con dossier insufficiente non si chiama il modello
Non c'è una lettura da raccontare, e spendere una chiamata per far scrivere
«non lo so» aggiunge solo un rischio. Si va diretti al testo deterministico.

### Decisione D-12 — il modello riceve anche la formulazione di riferimento
Oltre al dossier numerico, il prompt include la frase deterministica già
approvata di ogni fattore. Il compito diventa «rendi questo più scorrevole»
invece di «inventa una frase su questi numeri»: meno spazio per scivolare, e il
confronto fra percorso col modello e fallback resta uno a uno.

### Decisione D-13 — il fallback per modello irraggiungibile NON va in cache
Se la rete torna dopo dieci minuti la pagina deve poter riprovare, non restare
inchiodata alla versione senza modello per tutta la giornata. Il fallback per
DATI INSUFFICIENTI invece si mette in cache: lì non cambia nulla fino a domani.

### Decisione D-14 — riscritte due frasi che il nostro stesso cancello bloccava
Il cancello lessicale ha fermato testo NOSTRO, ed è servito:
1. «presenti N fattori su M **attesi**» → «sono arrivate N misure su M»
  (`attesi` è la radice di «aspettativa», vietata dalla lista del COT);
2. i limiti fissi di «cosa non sappiamo» dicevano «non dice se il prezzo
  **salirà o scenderà**» — futuro sul prezzo, vietato. Riscritti in «non indica
  una direzione di prezzo».
Un test fa passare TUTTI i template attraverso il cancello su una matrice di
14 dossier diversi, così una frase nostra non può degradare in silenzio.

### Decisione D-15 — i sostantivi «acquisti»/«vendite» restano ammessi
La mia prima stesura del cancello vietava anche i sostantivi, e avrebbe
bloccato le implicazioni meccaniche del COT già approvate a monte («le
eventuali chiusure di quelle posizioni passano per vendite»). Vietati restano i
VERBI operativi, che la lista del COT già copre.

### Il limite del primo cancello, dichiarato invece che nascosto
Cinque esche insinuanti («il metallo ha più spazio sopra di sé che sotto»,
«chi è entrato la settimana scorsa ha ancora margine») **passano** il cancello
lessicale: non contengono nessuna parola vietata. C'è un test che lo fissa
esplicitamente, e un altro che verifica che il percorso completo le fermi con
il secondo cancello. Non è un difetto nascosto: è il motivo per cui i cancelli
sono due.

### Gate
`npm test` 1638 passati + 1 saltato (il giro reale) · typecheck · lint · build
tutti verdi.

### Sintesi REALE sui dati locali

```text
[modello: nessuna chiave, si userà il fallback]

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (9 fattori su 12).

  Le misure di volatilità implicita su Oro stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  La lettura poggia su 9 misure su 12: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il GVZ sta a 23,31. È più in basso che nel 69% delle sedute dell'ultimo anno; più in alto che nel 75% di quelle di tre anni; più in alto che nel 84% di quelle di cinque. Variazione: −1,02 punti in una settimana, −3,81 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017 (499 settimane di storia). Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in alto che nel 64% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 4,62 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO]
      Di martedì, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 0,18 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,13 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il GVZ ha avuto un livello medio di 18,14, su 18 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO]
      Nelle ultime settimane Oro si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 65% delle sedute dal 2006 (4 confronti, 4616 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 12: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • 3 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (9 fattori su 12).

  Le misure di volatilità implicita su Petrolio WTI stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  La lettura poggia su 9 misure su 12: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      L'OVX sta a 63,04. È più in alto che nel 73% delle sedute dell'ultimo anno; più in alto che nel 91% di quelle di tre anni; più in alto che nel 93% di quelle di cinque. Variazione: −4,96 punti in una settimana, 22,28 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 70% delle settimane dal 2017 (499 settimane di storia). Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in basso che nel 93% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 9,29 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 6,18 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO, dato non dell'ultima seduta]
      Di martedì, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 0,40 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,38 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il OVX ha avuto un livello medio di 35,11, su 19 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Petrolio WTI si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 70% delle sedute dal 2006 (4 confronti, 5049 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 12: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • 6 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (7 fattori su 7).

  Le misure di volatilità implicita su DAX stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,99. È più in basso che nel 76% delle sedute dell'ultimo anno; più in basso che nel 57% di quelle di tre anni; più in basso che nel 70% di quelle di cinque. Variazione: −2,59 punti in una settimana, −0,60 punti in un mese. Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 5,37 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 5,78 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO]
      Di martedì, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 0,17 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,20 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il VIX (indice sostitutivo dichiarato) ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO]
      Nelle ultime settimane DAX si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 69% delle sedute dal 2007 (3 confronti, 4677 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — non esiste per questo strumento
  • Ampiezza abituale della giornata — non esiste per questo strumento
  • Comportamento storico del termometro — non esiste per questo strumento
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 24/07/2026.
  • Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-24

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (6 fattori su 9).

  Le misure di volatilità implicita su S&P 500 stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  La lettura poggia su 6 misure su 9: 3 mancano, ed è elencato più sotto quale e perché.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,99. È più in basso che nel 76% delle sedute dell'ultimo anno; più in basso che nel 57% di quelle di tre anni; più in basso che nel 70% di quelle di cinque. Variazione: −2,59 punti in una settimana, −0,60 punti in un mese.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 4,58 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 3,57 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO]
      Di martedì, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 0,11 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,13 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il VIX ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — dato troppo vecchio per essere usato
  • Ampiezza abituale della giornata — dato troppo vecchio per essere usato
  • Comportamento storico del termometro — dato troppo vecchio per essere usato
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Stabilità della relazione con pari e driver — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Mancano 3 misure su 9: stato della volatilità implicita (dato troppo vecchio per essere usato); ampiezza abituale della giornata (dato troppo vecchio per essere usato); comportamento storico del termometro (dato troppo vecchio per essere usato).
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 24/07/2026.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-24

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]
```

### Sintesi con report datato a oggi (SIMULAZIONE)

```text
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  SIMULAZIONE: il report in archivio è del 2026-07-22, qui viene DATATO 2026-08-04.
  I valori sono quelli veri di quel report.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

[modello: nessuna chiave, si userà il fallback]

══════════════════════════════════════════════════════════════════════════════
  Oro (XAU/USD)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: media — Fonti concordi ma 3 dati non sono dell'ultima seduta (12 fattori su 12).

  Le misure di volatilità implicita su Oro stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      Il GVZ, che misura quanto costa coprirsi su Oro, sta a 25,37: più in alto che nel 88% delle sedute del periodo 2008-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, Oro ha percorso dal minimo al massimo circa l'1,61% del proprio valore (metà delle volte fra l'1,21% e il 2,25%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 55% di una giornata qualsiasi: 19,7 punti di differenza, misurati su 570 giornate fra il 01/07/2021 e il 27/07/2026. Lo stato è rimasto lo stesso nel 95% dei giorni, in media per 18,8 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      Il GVZ sta a 23,31. È più in basso che nel 69% delle sedute dell'ultimo anno; più in alto che nel 75% di quelle di tre anni; più in alto che nel 84% di quelle di cinque. Variazione: −1,02 punti in una settimana, −3,81 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 97% delle settimane dal 2017 (499 settimane di storia). Partecipazione ai minimi della propria storia: mercato strutturalmente più sottile, dove lo stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in un mercato affollato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in alto che nel 64% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi in linea con la storia: nessuno sbilancio strutturale nelle posizioni speculative in essere. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 6,15 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 4,62 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO]
      Di martedì, negli ultimi 20 anni, i rendimenti di Oro stanno in una fascia larga circa 0,18 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,13 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il GVZ ha avuto un livello medio di 18,14, su 18 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO]
      Nelle ultime settimane Oro si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 65% delle sedute dal 2006 (4 confronti, 4616 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 3 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-08-02
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  Petrolio WTI (WTI)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di espansione
  FIDUCIA NELLA LETTURA: media — Fonti concordi ma 6 dati non sono dell'ultima seduta (12 fattori su 12).

  Le misure di volatilità implicita su Petrolio WTI stanno nella parte alta della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più ampia dell'abitudine dello strumento.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      L'OVX, che misura quanto costa coprirsi su Petrolio WTI, sta a 62,07: più in alto che nel 93% delle sedute del periodo 2007-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, Petrolio WTI ha percorso dal minimo al massimo circa il 3,63% del proprio valore (metà delle volte fra il 2,66% e il 4,98%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 64% dei casi, contro il 48% di una giornata qualsiasi: 16,5 punti di differenza, misurati su 748 giornate fra il 08/12/2021 e il 27/07/2026. Lo stato è rimasto lo stesso nel 91% dei giorni, in media per 11,5 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      L'OVX sta a 63,04. È più in alto che nel 73% delle sedute dell'ultimo anno; più in alto che nel 91% di quelle di tre anni; più in alto che nel 93% di quelle di cinque. Variazione: −4,96 punti in una settimana, 22,28 punti in un mese.
  • Partecipazione al mercato [peso BASSO, dato non dell'ultima seduta]
      I contratti aperti sul future sono più in basso che nel 70% delle settimane dal 2017 (499 settimane di storia). Partecipazione in linea con la storia: lo spessore del mercato è quello a cui questo future è abituato.
  • Posizionamento speculativo [peso BASSO, dato non dell'ultima seduta]
      L'esposizione netta dei fondi speculativi è più in basso che nel 93% delle settimane dal 2017 (499 settimane di storia). Esposizione netta dei fondi speculativi ai minimi della propria storia: la struttura delle posizioni in essere pende dal lato corto, e le eventuali chiusure di quelle posizioni passano per acquisti. Descrive le posizioni in essere, non l'esito della giornata.
  • Dispersione storica del mese [peso BASSO, dato non dell'ultima seduta]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 9,29 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 6,18 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO, dato non dell'ultima seduta]
      Di martedì, negli ultimi 20 anni, i rendimenti di Petrolio WTI stanno in una fascia larga circa 0,40 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,38 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il OVX ha avuto un livello medio di 35,11, su 19 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO, dato non dell'ultima seduta]
      Nelle ultime settimane Petrolio WTI si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 70% delle sedute dal 2006 (4 confronti, 5049 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • 6 misure non sono dell'ultima seduta: il dato più vecchio usato è del 21/07/2026.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Posizionamento (CFTC) — dato al 2026-07-21
  · Stagionalità — dato al 2026-07-27
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-27
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-21

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  DAX (GER40)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Condizioni di compressione
  FIDUCIA NELLA LETTURA: bassa — Manca la lettura del termometro, l'unica misura verificata fuori campione (7 fattori su 7).

  Le misure di volatilità implicita su DAX stanno nella parte bassa della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente più contenuta, con i prezzi che hanno passato più tempo vicino ai valori centrali.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,99. È più in basso che nel 76% delle sedute dell'ultimo anno; più in basso che nel 57% di quelle di tre anni; più in basso che nel 70% di quelle di cinque. Variazione: −2,59 punti in una settimana, −0,60 punti in un mese. Attenzione: è l'indice di un altro mercato, usato qui come sostituto dichiarato — questo strumento non ha una misura propria pubblicata.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 5,37 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 5,78 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO]
      Di martedì, negli ultimi 20 anni, i rendimenti di DAX stanno in una fascia larga circa 0,17 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,20 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il VIX (indice sostitutivo dichiarato) ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Stabilità della relazione con pari e driver [peso BASSO]
      Nelle ultime settimane DAX si è mosso insieme ai propri pari e ai propri riferimenti in modo più stretto che nel 69% delle sedute dal 2007 (3 confronti, 4677 sedute di storia comune). Un legame largo significa che il movimento dello strumento è spiegato meno da ciò che gli sta attorno.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Stato della volatilità implicita — non esiste per questo strumento
  • Ampiezza abituale della giornata — non esiste per questo strumento
  • Comportamento storico del termometro — non esiste per questo strumento
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 24/07/2026.
  • Per questo strumento non esiste una misura di volatilità implicita propria e accessibile: quella usata è di un altro mercato, dichiarata come sostituto.

  ── SEZIONI LETTE ──
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Driver Desk — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-24

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]

══════════════════════════════════════════════════════════════════════════════
  S&P 500 (SPX)  ·  2026-08-04
══════════════════════════════════════════════════════════════════════════════
  ORIGINE: FALLBACK (modello non raggiungibile: GEMINI_API_KEY non configurata)
  CARATTERE DELLA GIORNATA: Nella norma
  FIDUCIA NELLA LETTURA: bassa — Le due letture della volatilità implicita non concordano: una dice compressione, l'altra il contrario.

  Le misure di volatilità implicita su S&P 500 stanno nella parte centrale della loro storia.
  In condizioni come questa l'escursione della giornata è stata storicamente in linea con l'abitudine dello strumento.
  Le due letture della volatilità implicita non concordano fra loro, e la confidenza ne tiene conto.
  Resta una descrizione del contesto e dell'ampiezza abituale: non indica dove andrebbe il prezzo.

  ── COSA HA PESATO ──
  • Stato della volatilità implicita [peso ALTO]
      Il VIX, che misura quanto costa coprirsi su S&P 500, sta a 18,65: più in alto che nel 55% delle sedute del periodo 2000-2026. Il termometro classifica la condizione come espansa.
  • Ampiezza abituale della giornata [peso ALTO]
      Nelle giornate con questa condizione, S&P 500 ha percorso dal minimo al massimo circa l'1,29% del proprio valore (metà delle volte fra il 0,93% e l'1,86%). La cifra in valuta non compare: manca la chiusura di riferimento.
  • Comportamento storico del termometro [peso ALTO]
      Nelle giornate classificate così, l'escursione è poi risultata ampia nel 75% dei casi, contro il 52% di una giornata qualsiasi: 22,9 punti di differenza, misurati su 1013 giornate fra il 31/12/2018 e il 29/07/2026. Lo stato è rimasto lo stesso nel 94% dei giorni, in media per 17,7 giorni di fila.
  • Indice di volatilità implicita [peso MEDIO]
      Il VIX sta a 15,99. È più in basso che nel 76% delle sedute dell'ultimo anno; più in basso che nel 57% di quelle di tre anni; più in basso che nel 70% di quelle di cinque. Variazione: −2,59 punti in una settimana, −0,60 punti in un mese.
  • Dispersione storica del mese [peso BASSO]
      Nel mese di agosto, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 4,58 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 3,57 punti. Campione: 20 anni, dal 2006 al 2025.
  • Dispersione storica del giorno della settimana [peso BASSO]
      Di martedì, negli ultimi 20 anni, i rendimenti di S&P 500 stanno in una fascia larga circa 0,11 punti fra il quarto più basso e il quarto più alto. I singoli anni si sono distanziati dalla media di circa 0,13 punti. Campione: 20 anni, dal 2006 al 2025.
  • Livello abituale dell'indice di volatilità in questo mese [peso BASSO]
      Nel mese di agosto il VIX ha avuto un livello medio di 18,82, su 20 anni di storia.
  • Condizioni finanziarie complessive [peso BASSO, dato non dell'ultima seduta]
      Condizioni finanziarie (NFCI): −0,55, più in basso che nel 70% delle rilevazioni degli ultimi dieci anni.
  • Tensione sul credito [peso BASSO]
      Spread HY (OAS): 2,84%, più in basso che nel 73% delle rilevazioni degli ultimi dieci anni.

  ── COSA NON C'ERA ──
  • Partecipazione al mercato — non esiste per questo strumento
  • Posizionamento speculativo — non esiste per questo strumento
  • Stabilità della relazione con pari e driver — non esiste per questo strumento

  ── COSA QUESTA LETTURA NON DICE ──
  • Questa lettura non indica una direzione di prezzo e non è un suggerimento operativo.
  • Le percentuali citate sono frequenze storiche su campioni dichiarati, non una misura di ciò che accadrà oggi.
  • La lettura vale per la giornata nel suo insieme: non distingue fra le sessioni né fra i singoli momenti.
  • Una misura non è dell'ultima seduta: il dato più vecchio usato è del 24/07/2026.
  • Le due letture della volatilità implicita si contraddicono: non sappiamo quale delle due stia descrivendo meglio la giornata.

  ── SEZIONI LETTE ──
  · Termometro di volatilità — dato al 2026-08-04
  · Trends — Volatilità — dato al 2026-07-31
  · Stagionalità — dato al 2026-08-03
  · Stagionalità — indici di volatilità — dato al 2026-07-31
  · Trends — Liquidità & Credito — dato al 2026-07-24
  Dato più vecchio usato: 2026-07-24

  [tracciato: tentativo 1: modello non raggiungibile: GEMINI_API_KEY non configurata]
```
