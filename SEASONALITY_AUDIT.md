# SEASONALITY AUDIT — modulo Stagionalità

**Data:** 03/08/2026 · **Branch:** `feature/seasonality` · **Commit:** `e021653`
**Perimetro:** `src/lib/seasonality/*`, `src/components/seasonality/*`,
`src/app/(app)/stagionalita`, `src/app/api/seasonality-sync`, le 4 migrazioni
del modulo. Fuori perimetro: il resto dell'app.

**Metodo:** sei pass, uno per area, in modalità adversarial. **Non mi sono
fidato dei test del modulo**: dove possibile ho ri-derivato i numeri da zero
con codice indipendente che rilegge le barre grezze dal database e rifà i
conti senza toccare `precompute.ts`. Le ipotesi di difetto sono state
verificate empiricamente, e **due sono state smentite** — sono riportate lo
stesso, perché sapere cosa è stato escluso vale quanto sapere cosa è rotto.

**Nessuna correzione è stata applicata.**

---

## Sintesi

| Gravità | Numero | Significato |
|---|---|---|
| **P0** | 3 | Blocca la pubblicazione |
| **P1** | 5 | Da chiudere prima di dire «finito» |
| **P2** | 11 | Miglioramenti, nessuno urgente |

**Il cuore statistico regge.** La verifica più severa — ri-derivare da zero le
statistiche mensili dell'S&P 500 rileggendo le 14.266 chiusure e ricostruendo
i rendimenti senza usare una riga del modulo — restituisce **numeri identici a
tutte e cinque le cifre**. Non c'è un errore di calcolo nel cuore del modulo.
Quello che c'è sono problemi di **onestà del contorno** (cosa dichiara la
pagina, cosa non mostra) e un **nodo operativo che impedisce al modulo di
esistere in produzione**.

### Cosa ho verificato e trovato SANO

Vale la pena elencarlo, perché sono le cose che di solito si rompono.

| Verifica | Esito |
|---|---|
| Statistiche mensili SPX settembre, ri-derivate da zero | **identiche**: media −0,6141%, mediana +1,0717%, StDev 4,8509, Pos% 55,0%, n=20 |
| Percorso: media aritmetica o geometrica? | **geometrica, corretta**. A fine anno 8,70% contro il 9,90% che darebbe la media aritmetica dei rendimenti semplici: la deriva **non** è doppiata |
| Detrend del percorso | residuo a fine anno **0,000%**: la pendenza viene rimossa esattamente |
| Partizione delle sessioni, 9.496 giorni dal 2005 al 2030 | **zero anomalie** di contiguità o di ordine dei tagli |
| Cambi DST asincroni Londra↔New York | **gestiti**: 581 giorni a 4h di scarto (2007-2030) e **14 giorni a 6h** nel 2005-2006, quando gli USA cambiavano ancora la prima domenica di aprile. Il codice legge il database IANA e prende anche la regola storica |
| Buchi nella serie giornaliera | **salto massimo 7 giorni** (chiusura dell'11 settembre 2001), nessuno oltre, su tutti e 7 gli strumenti |
| Artefatti da roll sul CFD WTI | **ipotesi smentita** (§1.7) |
| Ricalcolo lato client | **assente**: la pagina legge solo precalcolato |
| Serie grezza esposta | **nessun endpoint la perde** |

---

# P0 — blocca la pubblicazione

## P0-1 · Il primo caricamento su Neon non converge dentro una funzione

**Area:** deploy/cold-start. **È il problema più grave del modulo.**

Il job `runSeasonalityDailyJob` fa tutto in un'invocazione sola: giornaliero
per 7 strumenti **più** l'intera pipeline oraria per 4. In locale, con il
database su `localhost` e la rete di casa, il primo popolamento orario ha
richiesto **~3 minuti**; da una funzione Vercel, con latenza verso Dukascopy e
verso Neon, sarà di più.

Non esiste alcun **budget di tempo** nel job: non guarda l'orologio, non si
ferma, non registra dove è arrivato. Al taglio della funzione viene ucciso.

Cosa succede allora, in concreto:

- le barre orarie già inserite **restano** (le `createMany` dell'ingest stanno
  fuori transazione): questo è un bene, l'ingest converge;
- il **precalcolo** viene invece annullato dal rollback della transazione,
  quindi la pagina resta senza statistiche intraday;
- la riga `SeasonalityRun` resta con `finishedAt` nullo per sempre;
- la notte dopo il job **ricomincia dal punto giusto per l'ingest** ma
  **rilegge e ricalcola tutto da capo** per il precalcolo, e ha buone
  probabilità di essere ucciso di nuovo prima di arrivare in fondo.

Il risultato realistico: **in produzione la sezione Sessione/Ora potrebbe non
popolarsi mai**, notte dopo notte, senza che nessun errore lo dichiari — il
job risponde `200` e l'esito parziale finisce in un campo JSON che nessuno
legge.

C'è anche un rischio di **memoria**: `readHourBars` carica 140.481 righe per
l'oro, e `precomputeIntraday` ne costruisce altrettante osservazioni ognuna con
un `Record` per i due orologi. Sono facilmente 100+ MB per strumento.

**Nota sulla transazione:** `$transaction(..., { timeout: 240_000 })` chiede a
Postgres una transazione interattiva fino a quattro minuti. Su una funzione che
vive un minuto è una richiesta che non ha senso, e su una connessione *pooled*
di Neon le transazioni interattive lunghe sono la cosa che si comporta peggio.

## P0-2 · Le schede Sessione e Ora dichiarano la fonte SBAGLIATA

**Area:** legittimità dati / onestà. **Verificato a schermo.**

La striscia di provenienza mostra sempre `cov.source`, che è la sorgente del
**giornaliero**. Ma i numeri delle schede Sessione e Ora vengono da
**Dukascopy**, e per WTI e S&P 500 la sorgente giornaliera è tutt'altra:

| Strumento | Cosa dice la pagina su Sessione/Ora | Da dove vengono davvero quei numeri |
|---|---|---|
| WTI | «fonte: FRED DCOILWTICO» | Dukascopy `lightcmdusd` |
| S&P 500 | «fonte: Yahoo ^GSPC» | Dukascopy `usa500idxusd` |
| GER40 | «fonte: Yahoo ^GDAXI» | Dukascopy `deuidxeur` |

Il campo `hourSource` **esiste in tabella, viene scritto correttamente dal
job, e non viene mai letto dalla pagina.**

Su un'applicazione pubblica questa non è un'imprecisione cosmetica: è
un'affermazione falsa sulla provenienza di un dato, verso l'utente e verso il
fornitore del dato. È lo screenshot `wti-sessione-buchi` a dimostrarlo.

## P0-3 · Yahoo non ufficiale come fonte primaria, su app pubblica

**Area:** legittimità dati. **Decisione di rischio, non un difetto tecnico.**

`query1.finance.yahoo.com/v8/finance/chart` è un endpoint **non pubblicato**,
e i termini di servizio di Yahoo non ne consentono l'uso programmatico in un
prodotto. Finché il progetto era un MVP privato la cosa aveva un peso; con
un'app multi-utente pubblica ne ha un altro.

Ed è la fonte **primaria di due strumenti su otto** — GER40 e S&P 500 — cioè
proprio le due serie giornaliere più lunghe (1987 e 1970). La catena di
fallback esiste ma degrada molto:

| Strumento | Fallback se Yahoo sparisce | Storia che resta |
|---|---|---|
| GER40 | Dukascopy `deuidxeur` d1 | dal 2013 → **13 anni**, le finestre 20 e 15 muoiono |
| S&P 500 | FRED `SP500` (10 anni) → Dukascopy d1 (2011) | **10 anni** |

Questa non è una cosa che «si sistema con un fix»: va **decisa**. Le opzioni
sono in §Remediation, blocco D.

---

# P1 — da chiudere prima di dire «finito»

## P1-1 · Le celle verdi più intense falliscono il contrasto AA

**Area:** accessibilità. **Misurato, non stimato.**

`cellBackground` compone il colore semantico sopra `--md-surface` con
un'opacità dal 12% al 70%. Testo `--md-text` su quel fondo:

| Colore | 12% | 30% | 50% | **70%** | Verdetto |
|---|---|---|---|---|---|
| `--md-up` standard (#2fd67a) | 12,63 | 8,16 | 4,90 | **3,08** | ❌ sotto AA |
| `--md-down` standard (#ff4160) | 14,07 | 10,86 | 7,47 | **5,11** | ✅ |
| `--md-up` daltonica (#4a87ff) | 13,58 | 10,12 | 6,97 | **4,90** | ✅ |
| `--md-down` daltonica (#9970ff) | 13,56 | 10,21 | 7,10 | **4,97** | ✅ |

Le celle della heatmap usano `text-2xs` (10-11px): ai fini WCAG è **testo
normale**, quindi la soglia è 4,5 e non 3. Il verde standard la sfonda oltre
il ~55% di intensità.

L'ironia è che sono **le celle più positive** — quelle che l'occhio cerca per
prime — a essere le meno leggibili. La palette daltonica, paradossalmente,
sta meglio di quella predefinita.

## P1-2 · La pagina pesa fino a 1,3 MB, e metà è il grafico

**Area:** performance. **Misurato sulla build di produzione.**

| Scheda | HTML | Payload RSC | Celle | Nodi DOM |
|---|---|---|---|---|
| Mese | 612 KB | 405 KB | 420 | 1.317 |
| **Settimana** | **1.323 KB** | 822 KB | 1.855 | 4.010 |
| Ora | 753 KB | 484 KB | 696 | 2.174 |

Due cause distinte:

**(a) Il grafico del percorso spedisce 1.830 punti al client** — cinque
finestre × 366 giorni × 7 campi = **209 KB di solo JSON**, cioè metà del
payload della scheda Mese. E l'**80% di quel peso serve alle quattro finestre
NON selezionate**, che sul grafico sono linee grigie sottili: inviare loro la
risoluzione giornaliera piena è sproporzionato. Arrotondare i decimali non
serve (−7%): il peso sta nel numero di punti, non nella loro precisione.

**(b) La heatmap settimanale rende 1.113 celle** con stile inline ciascuna.

Su una connessione mobile 1,3 MB per una schermata è fuori scala rispetto al
lavoro fatto sulle altre pagine (A8-A11).

*Nota positiva:* il numero di query è corretto — **cinque per render**, tutte
servite dagli indici di chiave primaria, e nessun ricalcolo lato client oltre
a una `expm1` per punto.

## P1-3 · Il marcatore di campione basso manca in metà delle viste

**Area:** correttezza metodologica. La spec (§4.4) promette che il campione
basso è marcato **in ogni vista**. Non è così:

| Vista | `n` mostrato | Marcatore |
|---|---|---|
| Tabella per bucket (desktop e mobile) | ✅ | ✅ |
| **Righe di sintesi della heatmap** | ✅ | ❌ |
| **Striscia n/Pos% sotto il percorso** | ✅ | ❌ |

Il caso concreto: la **settimana 53** ha `n=3` nella heatmap dell'S&P e appare
identica a una settimana con `n=20`. Nella tabella sotto è marcata. Due viste
dello stesso numero, due livelli di avvertimento.

## P1-4 · p25 e p75 sono calcolati, salvati, e mai mostrati in tabella

**Area:** correttezza metodologica. L'audit chiedeva «dispersione onesta:
p25/p75 in ogni vista». I quartili sono calcolati dal kernel, salvati in
`SeasonalityStat`, letti da `getBucketStats`… e poi **nessuna tabella li
rende**. Compaiono solo come banda sul grafico del percorso, dove però sono
quelli di `SeasonalityPathPoint`, un'altra tabella.

Non è un errore di calcolo — è dispersione già pagata e buttata via. Con
media e mediana molto divergenti (settembre S&P: media −0,61%, mediana
+1,07%) i quartili sono esattamente ciò che spiega la differenza.

## P1-5 · WTI: giornaliero e intraday sono due strumenti diversi, non detto

**Area:** correttezza / artefatti da strumento.

Per gli **indici** la scelta «cash sopra il giorno, CFD sotto» è deliberata,
documentata in SPEC §3 e motivata (il cash non scambia in sessione asiatica).
Per il **WTI** non è stata una scelta: è successo. Il giornaliero viene dallo
spot Cushing di FRED, l'intraday dal CFD front-month di Dukascopy.

Sono due serie di prezzo diverse per lo stesso mercato, nella stessa pagina,
sotto lo stesso nome, senza che nulla lo dichiari. Un utente che confronta la
stagionalità mensile con quella oraria del WTI crede di guardare lo stesso
strumento.

**Ipotesi correlata, TESTATA E SMENTITA:** temevo che il CFD front-month
lasciasse artefatti di roll attorno alla scadenza (giorni 18-23). Non è così:

- rendimenti orari |r| > 3% esclusi i 154 del 2020 (prezzi negativi, evento
  reale): **101 eventi**, distribuiti sui giorni 9, 10, 2, 21, 11, 1… nessun
  addensamento sulla scadenza;
- salti notturni > 1,5%: **36 in tutto**, di cui 9 nei giorni 18-23 = **25%**,
  contro il ~20% atteso per puro caso.

Nessuna firma di roll. Il difetto è di **etichettatura**, non di dato.

---

# P2 — miglioramenti

**P2-1 · `detrendPaths` usa `p[365]` come totale d'anno.** Negli anni
bisestili l'ultimo giorno resta fuori, e la deriva al giorno 366 viene
sottratta in eccesso (`driftPerDay × 366` con `driftPerDay` calcolato su 365).
Effetto misurato: il valore salvato a fine anno vale 8,70% al giorno 365 e
8,88% al giorno 366 sullo stesso `n`. Il residuo del detrend al giorno 365 è
0,000%, quindi l'errore vive solo sull'ultimo punto degli anni bisestili.

**P2-2 · StDev e media non stanno sulla stessa base.** La media passa per
`exp(μ)−1` (geometrica), la StDev è mostrata come `σ × 100` sui log-rendimenti
grezzi. Le due colonne stanno affiancate e verranno confrontate. Sui valori
mensili (~5%) le due basi divergono di circa il 2,5% relativo. È **documentato
nel tooltip** — che è meglio di niente e meno di una soluzione.

**P2-3 · I rendimenti giornalieri non hanno guardia di adiacenza.** Mese,
settimana e ora ce l'hanno; il giorno no, per scelta documentata (un ponte
festivo è legittimamente il rendimento del periodo chiuso). **Verificato che
oggi è innocuo**: il salto massimo su tutti e sette gli strumenti è di 7
giorni (11 settembre 2001). Resta però un'asimmetria latente: se una fonte
giornaliera dovesse aprire un buco di settimane, quel movimento finirebbe
intero in un bucket per giorno della settimana, e nulla lo fermerebbe.

**P2-4 · Il primo anno parziale entra nelle finestre.** GVZ inizia a giugno
2008 e OVX a maggio 2007: entrambi hanno il proprio anno parziale dentro la
finestra da 20 anni. Essendo `LEVEL`, i percorsi riportano `NaN` prima del
primo dato e i valori non vengono distorti — solo `n` è più basso nei primi
giorni. **Per i RENDIMENTI il comportamento sarebbe peggiore**
(`cumulativePathsByYear` riempie di zeri prima della prima quotazione, quindi
un anno parziale schiaccerebbe la media verso lo zero nei primi mesi), ma
**oggi nessuno strumento di prezzo è in quella condizione**. Difetto dormiente.

**P2-5 · `hourCompleteYears` sovrastima la copertura intraday.** È calcolato
come «anno dell'ultima barra completa − anno della prima barra + 1», quindi
per il WTI dice 15 anni ignorando che il 2011 ha due mesi di dati e che ne
mancano altri 10 sparsi. Le finestre offerte sono più generose del vero.

**P2-6 · Doppio messaggio sullo stato vuoto.** Su un database appena
migrato, `completeYears` è `null` → `windowCoverage` produce
`truncated: true` → compare «Finestra da 20 anni, storia disponibile 0» sopra
il callout «Dati non ancora presenti». Due messaggi per la stessa cosa, il
primo dei quali sembra un errore di calcolo.

**P2-7 · Il campo `note` fa due lavori.** Porta sia i buchi di copertura
intraday sia il messaggio d'errore di uno strumento fallito, e l'uno
sovrascrive l'altro. Se il giornaliero riesce e l'intraday fallisce, l'esito
per quello strumento diventa `errore` anche se metà del lavoro è andata bene.

**P2-8 · Nessun backoff né ritardo verso le fonti gratuite.** Il primo
popolamento fa centinaia di richieste consecutive a Dukascopy senza pausa e
senza ritentare: un `5xx` transitorio perde il blocco. FRED e Yahoo hanno
User-Agent e timeout, Dukascopy usa i default del pacchetto.

**P2-9 · Manca l'attribuzione CBOE.** VIX, GVZ e OVX sono indici **CBOE**
ridistribuiti da FRED. La pagina cita FRED e non l'autore del dato.

**P2-10 · La heatmap larga non annuncia di essere scorrevole.** A 375px la
griglia da 53 colonne scorre dentro il contenitore — verificato che il
documento non scorre (`scrollWidth` 375 = `innerWidth`) — ma non c'è ombra di
bordo né altro indizio che ci sia altro a destra.

**P2-11 · I tab disabilitati non sono raggiungibili da tastiera.** Sono
`<span aria-disabled>`: il motivo per cui sono spenti sta in `title`, visibile
solo al passaggio del mouse.

### Dettagli minori, senza numero

- **Ore doppie e mancanti nei giorni di cambio ora.** Nei due giorni l'anno di
  transizione un bucket orario italiano riceve due osservazioni e un altro
  nessuna. Su 20 anni sono ~20 osservazioni su ~5.177 per bucket: **0,4%**,
  irrilevante ma non documentato.
- **SPEC descrive solo il disallineamento a 4 ore.** Il codice gestisce
  correttamente anche i **14 giorni a 6 ore del 2005-2006** (regola USA
  pre-2007), che ricadono dentro lo storico orario dell'oro. La tabella dei
  confini UTC in SPEC §5.3 non li menziona.
- **`useCache: false` su dukascopy-node** a ogni chiamata: corretto per il
  delta notturno, spreco durante un backfill ripetuto.

---

# Piano di remediation — blocchi indipendenti

Ogni blocco è autonomo: si possono fare in qualunque ordine, da persone
diverse, e ognuno lascia il modulo in uno stato coerente. **Solo A è
bloccante per la pubblicazione.**

## Blocco A — Job ripartibile *(chiude P0-1)*

Il solo blocco che va fatto prima di pubblicare.

1. **Budget di tempo esplicito** passato al job (`deadline: Date`), controllato
   fra uno strumento e l'altro e fra un blocco annuale e l'altro. Il job si
   ferma da solo prima del taglio e restituisce `completo: false`.
2. **Ordine per utilità decrescente**: prima il giornaliero di *tutti* gli
   strumenti (~15 s, e da lì la pagina è già utile: Mese, Settimana e Giorno
   funzionano), poi l'intraday finché resta budget.
3. **Cursore persistente** per l'intraday, per strumento: l'ingest già riparte
   dall'ultima ora salvata, ma serve anche sapere **se il precalcolo di quello
   strumento è aggiornato**, così una notte che non aggiunge barre non rifà i
   conti.
4. **Precalcolo intraday solo se sono entrate barre nuove** *e* l'ingest ha
   raggiunto il presente. Elimina il grosso del costo a regime.
5. **Transazioni corte**: il `timeout: 240_000` va portato a qualcosa di
   compatibile con la vita della funzione; il precalcolo di uno strumento è
   già l'unità atomica giusta.
6. **`SeasonalityRun` deve dichiarare l'incompletezza** — `finishedAt` valorizzato
   con `completo: false`, così la pagina può dire «caricamento in corso, N di 4
   strumenti pronti» invece di sembrare rotta.

*Verifica di uscita:* simulare un budget di 45 s su database vuoto e mostrare
che tre esecuzioni consecutive portano il modulo a completo, con la pagina
utile già dopo la prima.

## Blocco B — Onestà della provenienza *(chiude P0-2, P1-5, P2-9)*

Tutto testo e lettura di campi già esistenti, nessun calcolo toccato.

1. Mostrare `hourSource` quando la scheda attiva è Sessione o Ora.
2. Dichiarare esplicitamente, sulle schede intraday, che lo strumento
   sottostante è diverso da quello del giornaliero — per **tutti** e quattro,
   non solo per il WTI.
3. Aggiungere l'attribuzione CBOE agli indici di volatilità.

## Blocco C — Dispersione e campione *(chiude P1-3, P1-4)*

1. Marcatore di campione basso nella riga `n` della heatmap e nella striscia
   del percorso.
2. Mostrare p25/p75 nella tabella per bucket (dati già in `BucketView`).

## Blocco D — Decisione sulla fonte Yahoo *(chiude P0-3)*

Non è un intervento tecnico ma una scelta, da fare consapevolmente:

- **(i)** accettare il rischio e dichiararlo in pagina;
- **(ii)** degradare a Dukascopy d1 per GER40 e S&P, perdendo la storia
  pre-2013/2011 e quindi le finestre 20 e 15 anni su quei due strumenti;
- **(iii)** cercare una fonte con licenza esplicita per gli indici (esistono
  piani gratuiti con chiave e attribuzione — ma qui si esce dal vincolo
  «keyless» della spec, e va riaperto con l'utente).

## Blocco E — Peso della pagina *(chiude P1-2)*

1. Inviare al grafico la risoluzione piena **solo per la finestra
   selezionata**; le altre quattro a risoluzione ridotta (una su sette punti è
   più che sufficiente per una linea grigia di sfondo). Risparmio stimato
   **~165 KB su 209**.
2. Valutare se la heatmap settimanale a 53 colonne debba restare integrale o
   diventare navigabile per trimestre. **Da misurare prima di decidere**: la
   griglia intera è anche la sua ragione d'essere.

## Blocco F — Contrasto *(chiude P1-1)*

Portare il verde sopra AA alle intensità alte. Le strade sono due e vanno
misurate, non scelte a occhio: ridurre l'opacità massima da 70% a ~55%
(dove il verde regge 4,90), oppure scurire il testo sulle celle molto intense.
**Va verificato con `scripts/contrast.mjs` su entrambe le palette**, e va
aggiunto un test come `theme-contrast.test.ts` per non farlo regredire.

## Blocco G — Rifiniture statistiche *(chiude P2-1..P2-5)*

Lavoro di precisione, nessuna urgenza: indice di fine anno nel detrend,
allineamento della base di StDev, guardia di adiacenza anche sul giornaliero,
esclusione dell'anno parziale dai percorsi, `hourCompleteYears` calcolato sui
mesi realmente coperti.

## Blocco H — Stati e cortesia *(chiude P2-6..P2-8, P2-10, P2-11)*

Messaggio unico sullo stato vuoto, separazione fra nota di copertura e nota
d'errore, esito per strumento più granulare, backoff verso Dukascopy,
affordance di scorrimento, tab disabilitati raggiungibili da tastiera.

---

# Rollback e sicurezza della pubblicazione

Verificato leggendo lo schema: **il modulo è isolato**.

- Le sei tabelle non hanno **nessuna chiave esterna** verso le tabelle
  dell'applicazione, e nessuna tabella esistente le referenzia.
- I quattro enum sono **nuovi**, nessun enum esistente è stato esteso.
- Nessuna colonna è stata aggiunta a tabelle preesistenti.
- L'unico `ALTER` di tutto il branch agisce su una tabella creata dal branch
  stesso.

**Conseguenza pratica:** se la Stagionalità fallisce in produzione — job in
errore, pagina vuota, dati parziali — **l'applicazione live non se ne
accorge**. Il rollback è togliere la voce di sidebar; le tabelle possono
restare dove sono, vuote, senza costo per nessuno.

Questa è la parte del lavoro che è andata bene ed è bene dirlo: il vincolo
«migrazioni solo additive» ha prodotto esattamente la proprietà che serviva.

---

# Cosa NON fare

Elenco di over-engineering da evitare. Ognuna di queste cose sembra una buona
idea e non lo è.

**1. Non riscrivere il kernel statistico.** È stato ri-derivato da zero e
torna a cinque cifre. I difetti sono nel contorno. Toccare `stats.ts` o il
grosso di `precompute.ts` significa rischiare il pezzo che funziona per
sistemare quello che non funziona.

**2. Non introdurre una coda, un worker o un servizio esterno per il
cold-start.** Il problema si risolve con un `deadline` e un cursore: due
concetti, nessuna infrastruttura nuova. Vercel Queues, un container, un cron
esterno — tutto sproporzionato per un caricamento che si fa una volta e poi
diventa un delta di poche righe a notte.

**3. Non aggiungere un secondo cron.** Il vincolo di piano è reale e la
soluzione a un solo job funziona. Spezzare in «cron daily» + «cron intraday»
consumerebbe l'ultimo slot per risolvere un problema che il budget di tempo
risolve meglio.

**4. Non cambiare la definizione delle sessioni.** Sono state verificate su
9.496 giorni, gestiscono anche la regola americana pre-2007, e la partizione
non ha mai un buco. La tentazione di aggiungere sessioni sovrapposte, o una
sessione «overlap Londra-New York», va resistita: romperebbe la partizione e
quindi la sommabilità dei bucket.

**5. Non ricalcolare niente nel browser.** Compresa la tentazione di
«sistemiamo il payload facendo interpolare i punti al client»: il peso si
toglie mandando meno punti, non spostando il conto.

**6. Non introdurre un sistema di unità configurabile dall'utente.** I punti
base per l'intraday e la percentuale per il calendario sono la scelta giusta
per quelle grandezze; un selettore di unità aggiunge stato, combinazioni da
testare e un modo in più di leggere male un numero.

**7. Non «sistemare» la divergenza fra media e mediana.** Media −0,61% e
mediana +1,07% su settembre non è un bug: è settembre. Mostrarle entrambe è la
feature.

**8. Non nascondere i buchi di copertura per far sembrare la pagina più
pulita.** L'avviso in ambra sul WTI è brutto ed è giusto che ci sia.

**9. Non aggiungere il drill per mese su sessione e ora finché non serve
davvero.** Moltiplicherebbe per tredici le righe di statistica intraday per
una domanda che nessuno ha ancora posto.

**10. Non rifare i test già scritti in forma «più rigorosa».** Il modo di
controllare questo modulo non è più unit test sugli stessi moduli: è la
ri-derivazione indipendente dal database, come in questo audit. Se serve
irrobustire, si aggiunga **quella**, come script di verifica periodica.

---

# Appendice — come riprodurre le verifiche

Gli script di controllo usati per questo audit sono stati eseguiti e poi
rimossi (erano temporanei, non fanno parte della pipeline). Riassunto di cosa
facevano, per chi volesse rifarli:

| Verifica | Metodo |
|---|---|
| Ri-derivazione statistiche mensili | rileggere `SeasonalityDailyBar`, ricostruire chiusure di fine mese e rendimenti log, calcolare media/mediana/StDev/Pos% con codice indipendente, confrontare con `SeasonalityStat` |
| Media geometrica del percorso | confrontare `exp(media dei log cumulati)−1` con la media aritmetica dei rendimenti semplici annui |
| Sessioni e DST | iterare tutti i giorni 2005-2030, verificare ordine dei tagli, contiguità, e distribuzione dello scarto Londra→New York |
| Buchi giornalieri | massima distanza fra date consecutive per strumento |
| Roll del CFD | distribuzione per giorno del mese dei rendimenti orari estremi e dei salti notturni, con e senza il 2020 |
| Contrasto | composizione manuale di `color-mix` sopra `--md-surface` e rapporto WCAG 2.1 |
| Peso pagina | `document.documentElement.outerHTML.length` e somma degli script `self.__next_f` sulla build di produzione |
