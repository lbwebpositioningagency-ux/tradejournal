# Macro Desk — lavoro di forma sulla pagina Volatilità

> **ESITO — 28/08/2026.** È stata scelta la direzione **A · Listino**, ed è
> stata applicata a tutto il Macro Desk tranne Driver e Stagionalità. Le rotte
> di lavoro `/macro-desk/volatilita/forma/[a|b|c]` non esistono più: erano un
> banco di prova, e il loro contenuto è diventato
> `src/components/macro-desk/listino/`. Le schermate del confronto restano in
> `proposte/`, quelle del risultato applicato in `dopo/`. Le due correzioni
> chieste alla direzione — spiegazioni dietro un'icona invece che in note
> numerate, commento del report in fondo e chiuso — sono nel risultato, non in
> queste schermate. Il resoconto della sezione «In più» qui sotto resta una
> proposta: di quelle rimozioni ne è stata applicata **una sola**, il movimento
> chiusura-chiusura.

---

Ramo `macro/forma-visiva`, worktree `C:/wt/mdforma`. **Niente è pubblicato, niente è
su main.** Nessun dato è stato toccato, aggiunto o rimosso: le tre direzioni ricevono
lo stesso oggetto (`src/components/macro-desk/forma/tipi.ts`) dalle stesse query della
pagina vera.

Rotta di lavoro: `/macro-desk/volatilita/forma/a` · `/b` · `/c`.

---

## FASE 1 — Vocabolario, dai terminali veri

### Scala tipografica

I terminali professionali usano **cinque livelli, non otto**, e il salto fra un livello
e l'altro è piccolo: il contrasto lo fa il peso, non il corpo. Il riferimento misurabile
più utile è l'Economist, dove **il titolo vale il doppio del sottotitolo** e *tutto il
resto* — tacche, etichette, sottotitoli — condivide un solo corpo. Per le dashboard
dense la letteratura converge su **13px con interlinea 1,4** come corpo del dato, 12px
come minimo assoluto, 14px come massimo: sopra i 14 il tavolo smette di essere un tavolo.

Il peso va sul **valore**, mai sull'etichetta. L'etichetta si distingue per colore e
maiuscoletto spaziato, non per grassetto.

### Allineamento e cifre tabulari

Regola non negoziabile, e la trovi identica in ogni fonte seria: **i numeri si leggono
da destra**, quindi si allineano a destra; il testo si legge da sinistra e si allinea a
sinistra; **l'intestazione prende l'allineamento della sua colonna**. Servono cifre
tabulari (`font-variant-numeric: tabular-nums lining-nums`), e va tenuto **costante il
numero di decimali dentro la stessa colonna**. Nota controintuitiva ma documentata: un
proporzionale *con* cifre tabulari batte un monospaziato — stessa colonna, migliore
leggibilità.

### Densità e separatori

Tufte: massimizzare la densità del dato, azzerare il non-dato. Il corollario pratico per
le tabelle è che **lo spazio bianco è il separatore primario** e il filetto è
l'eccezione: righelli verticali solo quando le colonne sono così strette da poter
confondere, e **niente righe zebrate** (evidenziano una riga sì e una no, cioè
introducono un pattern che nei dati non c'è). Il FT usa filetti *capillari* per dividere
le colonne «senza consumare spazio»; su schermo vanno ingrossati un poco, altrimenti
spariscono.

### Colore

La regola dei terminali è la più severa che ho trovato, ed è quella di Bloomberg:
**gerarchia di luminanza, non di tinta**. Livelli secondari resi con la stessa tinta
smorzata o con grigi freddi, «senza alcun ornamento tipografico convenzionale».
Il consiglio operativo che ne segue: **comporre in scala di grigi**, e se la gerarchia
non si legge senza colore, il colore non la salverà. Il colore resta per il **segno**
(su/giù) e per una scala; tutto il resto è neutro.

### Un valore accanto al suo contesto storico, senza raddoppiare lo spazio

La risposta di Tufte sono le **sparkline**: «datawords», grafici della dimensione di una
parola, senza assi, seguiti dal numero chiave. Si mettono ovunque stia una parola:
dentro una frase, dentro una cella, dentro un'intestazione. Il contesto non si affianca
al numero — **si rimpicciolisce fino a stare nella stessa riga**.

L'altro strumento è la **cella a due piani**: valore sopra, contesto sotto a 3px in meno
e in grigio. Costa zero larghezza e circa 12px di altezza.

### Come si subordina una spiegazione

Tre modi, tutti in uso: **nota numerata** in fondo (le research note), **tooltip
sull'intestazione** (Koyfin, Stagionalità), **didascalia sotto l'esibizione** in corpo
minore e corsivo. Quello che non si fa è mettere la spiegazione *fra* i numeri, allo
stesso rientro.

### Riferimenti che scarto, e perché

- **Bloomberg / Refinitiv Workspace**: la loro densità presuppone un flusso in tempo
  reale e decine di serie che cambiano al secondo. Con serie giornaliere FRED/CBOE/CFTC/
  EIA/Yahoo, quella griglia sarebbe bellissima e mezza vuota. Ne prendo la *disciplina
  del colore* e la gerarchia di luminanza, non la densità.
- **TradingView**: il suo linguaggio è quello del *grafico* e dei pannelli
  ridimensionabili. Questa è una pagina di misure, non un workspace.
- **Trading floor «CRT green»**: pura citazione estetica, nessuna informazione.

Resta come modello **Koyfin** (poche serie, composte benissimo), la **research note** e
la **tabella FT/Economist**. È la scala giusta per i dati che abbiamo.

---

## FASE 2 — Diagnosi, sulla pagina vera

Riferimento: `docs/macro-forma/prima/vol-1440-dark__1440__dark.png` (1440×**5191**px).
I ritagli citati sono `crop-a.png` e `crop-b.png` nella stessa cartella.

### 1. Il difetto strutturale: una struttura che si ripete quattro volte e non è mai una tabella

Questa forma —

> `20 sedute  1,94%  ·  90,07   banda 25-75%: 1,55% – 2,46%  ·  massimo 4,95%  ·  n=20`

— è una riga di sei colonne (finestra, mediana, mediana in punti, q25, q75, massimo, n).
Compare **quattro volte per strumento** (escursione ×2 finestre, movimento ×2 finestre),
per quattro strumenti: **trentadue righe con la stessa identica struttura**, e nessuna
delle trentadue è resa come tabella. Sono frasi con i punti mediani.

La conseguenza si misura: `1,94%` di Oro e `3,56%` di WTI stanno a due `x` diversi in due
card diverse. **Non c'è modo di confrontarli.** È il difetto che spiega la maggior parte
degli altri.

### 2. La barra del percentile: 1.100 pixel per un dato

`RangeBar` è larga quanto la card — sul desktop ~1.100px — e trasporta **un numero**
(il percentile). Compare 12 volte. È il peggior rapporto dato/inchiostro della pagina, ed
è anche il motivo per cui la pagina è alta 5.191px.

Peggio: **il pallino è blu (`--md-info`) in tutte e 12 le occorrenze.** Il colore non
significa niente. Dove il desk lo usa bene — il Driver — il pallino prende il colore del
giudizio (MOLTO ALTO ambra, BASSO blu), e allora il colore *è* informazione.

### 3. La prosa vince sui numeri

Nella card Oro (`crop-b.png`) ho contato **circa 14 righe di prosa esplicativa contro
circa 12 righe di dato**. La prosa è a `text-[11px]` grigio, quindi *dovrebbe* essere
subordinata — ma è messa **allo stesso rientro dei numeri, subito sotto di essi, e a
piena larghezza (~1.100px di misura, oltre 180 caratteri per riga)**. Massa e posizione
battono corpo e colore: l'occhio finisce lì.

E si ripete. «Fonte: CBOE Global Markets (riserva e storico: FRED)…» compare **dentro
ognuna delle quattro card**, più due volte nei blocchi in alto. La data `al 25/08/2026 ·
3 giorni fa` compare **sette volte**. La Stagionalità la scrive **una volta sola**, in
cima.

### 4. La gerarchia non è monotona

Dentro una sola card convivono sei stili, e l'ordine visivo non corrisponde all'ordine
logico:

| Elemento | Reso | Rango logico |
|---|---|---|
| `Oro` | 14px semibold bianco | 1 |
| `GVZ · VOLATILITÀ IMPLICITA` | 10px maiuscoletto grigio | 2 |
| `27,69` | 24px bold mono | 3 (il valore) |
| `Implicita contro realizzata` | 12px regular grigio | 4 (sottoblocco) |
| prosa | 11px grigio, piena larghezza | 5 |

Il sottoblocco di rango 4 è **più grande** dell'etichetta di rango 2. E il titolo del
pannello (10px, grigio, spaziato) è l'elemento **più debole** di un blocco che intitola.

### 5. Le percentuali storiche sono incastrate in una frase

`più alto del 92% delle sedute dal 2008` — il `92%` è in grassetto ma sta in mezzo a una
proposizione. I quattro percentili della pagina (92, 79, 35, 29…) non stanno mai in
colonna. Non si confrontano.

### 6. Ritmo verticale assente

`gap-3`, `gap-2.5`, `gap-2`, `gap-1.5`, `gap-1`, `gap-0.5`, `pt-2`, `p-4`, `p-5`: nessuna
griglia di base. Le card si toccano con distanze diverse a seconda del blocco.

### 7. Tre contenitori per una tabella

`.macro-report` (bordo, raggio 18, due glow radiali) → `.md-card` (bordo, raggio 18,
ombra, hover che solleva) → blocchi separati da `border-t`. Tre livelli di scatola. Il
`::before` con i due gradienti radiali oro/blu è l'unico evento cromatico *forte* della
pagina, e non veicola nulla.

### 8. L'isola nera

`.macro-report` è **dark fisso**. In tema chiaro (`prima/crop-light.png`) l'app è bianca
e il desk è un rettangolo nero appoggiato sopra, con lo stacco netto a metà pagina. La
pagina Volatilità ha *due* sistemi tipografici impilati: `page-title`/`page-subtitle`
dell'app sopra, e i token `--md-*` sotto.

### 9. L'ordine mette per ultimo chi opera

Le quattro card escono nell'ordine della query: **S&P 500 in alto a sinistra**, cioè
l'unico strumento che non si tratta, nella posizione di massima attenzione. Oro e WTI
sono in seconda fila.

### Perché Driver e Stagionalità funzionano — il metro

Sono le due sezioni che il committente considera fatte bene, e la diagnosi si spiega
meglio guardandole. Riferimenti: `docs/macro-forma/metro/crop-driver.png` e
`crop-stag.png`.

**Driver — l'unità di riga fissa.** Ogni relazione è resa in cinque righe, sempre le
stesse: (1) nome in bianco semibold a sinistra **e valore `ρ` allineato a destra al
bordo**, (2) badge semantico, (3) barra col pallino **dello stesso colore del badge**,
(4) *una* frase di lettura, (5) *una* riga di metodo in corpo minore. Mai una riga in
più. E poiché i `ρ` sono incolonnati a destra, `0,92 / −0,27 / −0,05 / −0,48` si leggono
in verticale. È esattamente ciò che la Volatilità non fa.

**Stagionalità — la tabella vera.** Intestazioni di colonna, numeri incolonnati a destra
in cifre tabulari, **colore solo sul segno** e solo nelle colonne dove il segno è il
messaggio (Mediana, StDev, n restano bianchi). Provenienza **una riga sola in cima**.
Spiegazioni in **tooltip ⓘ sull'intestazione** e una nota a piè di tabella. Cella a due
piani (`−1,30% – +7,87%` con sotto `copre 68% degli anni`). Riga corrente marcata con
filetto d'accento e pillola «adesso»: unico accento, ed è informazione posizionale.

Le tre direzioni qui sotto nascono da questo confronto.

---

## FASE 3 — Tre direzioni

Tutte e tre sono **theme-aware** (chiaro e scuro), il che è già una risposta al punto 8.
Tutte e tre riordinano gli strumenti **Oro → WTI → DAX → S&P**, con l'S&P marcato
`contesto`. Nessuna aggiunge o toglie un numero.

### A · «Listino» — `/macro-desk/volatilita/forma/a`

**Principio.** La pagina è un foglio di quotazioni. Tutto ciò che si ripete diventa una
**colonna**; tutto ciò che spiega esce dal flusso e diventa **nota numerata**. Nessuna
card, nessun raggio, nessuna ombra, nessun glow: la struttura la fanno filetti e
incolonnamento. Colore **solo dove c'è un segno** (Δ e scarto). Cinque corpi in tutto:
9,5 / 10 / 11 / 12 / 15 px.

**Firma.** La **barra-parola** del percentile: 56px dentro la cella, con tacca al 50% e
il minimo/massimo storici nel tooltip. Il contesto storico non si affianca al numero, si
rimpicciolisce fino a starci accanto. E una colonna **ETÀ** fissa a destra: la vecchiaia
del dato diventa qualcosa che si scorre in verticale invece di una frase ripetuta sette
volte.

**Risultato misurato: 5.191px → 2.172px a 1440.** La pagina intera sta in due schermate.

**Cosa sacrifica.** La voce. Non spiega niente mentre la leggi: dà per scontato che tu
sappia cos'è lo SKEW e rimanda alla nota 20 chi non lo sa. È una superficie di controllo
mattutino, non una pagina che insegna. Chi arriva per la prima volta ha bisogno delle
note. È anche la direzione che regge peggio sotto i 1000px di larghezza.

### B · «Nota» — `/macro-desk/volatilita/forma/b`

**Principio.** La pagina è una nota di ricerca. La prosa di questo desk è scritta bene e
merita di essere letta: le do una **colonna da 64 caratteri** invece di 1.100px. I numeri
smettono di essere testo e diventano **elemento display** — 62px per la volatilità
implicita.

**La scelta tipografica è deliberatamente rovesciata:** *serif da testo* (Source Serif 4)
per la prosa, *grottesco* (Archivo) per le cifre. La convenzione web è l'opposto — sans
per il testo, mono per i numeri — ma qui la prosa si legge davvero e i numeri si
guardano, e i caratteri seguono l'uso, non l'abitudine.

**Firma.** Due cose. La **riga di lettura**: ogni strumento apre con una frase che
ricompone in italiano i numeri che l'esibizione elenca sotto («GVZ a **27,69**, più alto
del 92% delle sedute dal 2008; la seduta del 25/08/2026 ha attraversato **1,97%**…»).
Non aggiunge nulla — è composizione, non interpretazione. E le **esibizioni numerate**:
la numerazione dice l'ordine in cui il desk vuole che le prove siano lette.

**Cosa sacrifica.** La densità: **6.206px**, cioè *più lunga* della pagina attuale. Non è
una superficie di controllo, è una lettura — chi ha trenta secondi la mattina non la
vuole. Ed è l'unica delle tre che **non guadagna nulla da uno schermo più largo** (6.206px
identici a 1440 e a 1920): la misura di lettura non si allarga, per definizione.

### C · «Scheda» — `/macro-desk/volatilita/forma/c`

**Principio.** Non inventare un linguaggio: **generalizzare quello che nel desk funziona
già**. Prende l'unità di riga fissa del Driver (etichetta a sinistra, valore incolonnato
a destra, barra, una riga di lettura) e le due regole della Stagionalità (provenienza una
volta sola in cima, spiegazione in nota) e le applica alla Volatilità. Niente di più.
Ogni strumento è una scheda con filetto d'accento dell'asset e una griglia interna fissa
a tre blocchi: **Livello e storia · La giornata · Confronto e movimento**.

**Firma.** La colonna **«in punti»**: la mediana resa nell'unità del prezzo. Esiste già
in pagina — nascosta dopo un punto mediano, dentro una frase — ed è il numero che serve
davvero a decidere uno stop. Qui è una cifra allineata, non una parentesi.

**Risultato: 5.191px → 2.920px.**

**Cosa sacrifica.** La voce, di nuovo, ma in modo diverso da A: è un *sistema*, non una
presa di posizione. Nessuno ricorderà questa pagina per come è composta. In cambio è
**l'unica delle tre estendibile al resto del desk senza inventare altre regole**, perché
le regole sono già quelle di due sezioni esistenti — e quindi l'unica che non crea un
terzo dialetto dentro il Macro Desk.

### Cosa NON è nelle tre schermate

Onestà sul perimetro: le pagine campione coprono calendario, struttura a termine, costo
della copertura, le quattro schede strumento, la struttura a termine del WTI, le lacune
del report, il commento e le scorte EIA. **Non contengono il Termometro di volatilità né
la banda di freschezza.** Il Termometro è un blocco grosso e con una logica sua; metterlo
nella sua forma attuale in fondo a tre pagine ricomposte avrebbe inquinato il confronto —
in una direzione «research note» chiara, 400px di card nere avrebbero deciso il giudizio
al posto tuo. Va rifatto nella direzione che sceglierai. La banda di freschezza sta
*fuori* dal contenitore del desk anche oggi, quindi non è materia di questo giro.

Nota d'ambiente: le **scorte EIA compaiono vuote** in tutti gli scatti perché la chiave
dell'API EIA non è configurata in locale. In produzione quel blocco ha i dati.

---

## In più — il vaglio editoriale, dato per dato

Criterio: *ogni dato deve dare almeno un vantaggio **informativo**, **di contesto** o
**operativo** a un trader discrezionale su oro, WTI e DAX.* Sotto ci sono **proposte**:
non ho toccato niente.

### Da tenere, e da promuovere

| Dato | Vantaggio |
|---|---|
| GVZ / OVX / VDAX, livello e rango | **Operativo**: è il regime che decide la size |
| **Escursione vera, ultima seduta e mediana 20 — e la sua resa in punti** | **Operativo**, il più forte della pagina: è lo spazio che uno stop incontra. Oggi è sepolta dopo un `·` |
| Calendario 7 giorni con tag oro/WTI/DAX | **Operativo**: quando non stare in posizione |
| Scorte EIA + Cushing | **Operativo** sul WTI: è il rilascio che lo muove di più |
| Struttura a termine del WTI | **Contesto/operativo**: carry e roll |
| Scarto implicita − realizzata | **Contesto**: l'opzionalità è cara o a sconto |
| Δ5 e Δ20 dell'indice IV | **Contesto**: direzione e velocità del regime |

### Proposte di rimozione

1. **VVIX** — è la volatilità della volatilità dell'S&P. Serve a chi tratta opzioni *sul
   VIX*. Per oro, WTI e DAX non aggiunge niente che VIX + struttura a termine non diano
   già. → **togliere.**
2. **SKEW** — prezzo delle code sull'S&P. Nessun analogo su oro e WTI, ed è notoriamente
   pessimo come segnale di tempismo. → **togliere**, o al massimo una riga dentro il
   blocco S&P.
3. **Movimento chiusura-chiusura** (mediana, banda, massimo, n × 2 finestre × 4
   strumenti = **32 numeri**) — la pagina stessa scrive che l'escursione è quella che uno
   stop incontra. Il chiusura-chiusura è un ingresso per un modello di volatilità, non per
   una decisione discrezionale. → **togliere**: è il taglio più grande disponibile.
4. **Finestra a 60 sedute** ovunque — per decidere la size di oggi, una mediana a tre mesi
   non porta a una decisione diversa da quella a un mese. → **togliere**, tenere 5 e 20.
5. **«massimo» della finestra** — un singolo estremo. Su Oro vale `4,95%` sia a 20 che a
   60 sedute: è lo stesso outlier contato due volte. Non è ripetibile, quindi non è
   operativo. → **togliere.**
6. **PUT/CALL** — una tessera che dice `n/d` più tre righe che spiegano un 403 del CDN
   CBOE. Zero vantaggio di qualunque tipo. → **togliere finché non ha una fonte**; il
   motivo tecnico sta in `DEBITO-TECNICO.md`, non in pagina.
7. **«Ultimo aggiornamento servito da: CBOE GVZ + storico FRED GVZCLS (327 sedute)»** e
   **«calcolata sulle 7822 sedute su 7944»** — sono impianto di fiducia, non decisione.
   → **non togliere, ma spostare** in tooltip/nota (tutte e tre le direzioni lo fanno).
8. **Commento del report** — negli scatti è del **21/08** su una pagina del **28/08**, e
   discute `VIX 15,98` mentre venti centimetri più su la pagina mostra `VIX 15,45` da
   fonte più fresca. Due numeri diversi per la stessa cosa nella stessa schermata.
   → **togliere da questa pagina** (vive già in `/macro-desk/report`), oppure mostrarlo
   solo se il report ha ≤2 giorni.
9. **Termometro a cancello chiuso** — quando non ha un verdetto da dare stampa ~400px di
   testo grigio che spiega perché non ce l'ha. → **comprimere a una riga** quando è chiuso.

### Da tenere ma con riserva

- **MOVE** — la volatilità implicita dei Treasury è un driver reale dell'oro attraverso i
  tassi reali: vantaggio **di contesto**, quindi resta. Ma arriva col `vintage 17 ago`, e
  la vecchiaia deve essere una **colonna**, non una nota (tutte e tre le direzioni la
  mettono in colonna).
- **S&P 500 / VIX** — non si opera. Però il DAX ha un beta alto sull'S&P **e VDAX non ha
  fonte viva**: al momento il VIX è l'unica lettura di volatilità azionaria viva della
  pagina. Resta, marcato `contesto` (tutte e tre lo marcano).

### Dove la forma migliore chiederebbe un dato che non abbiamo

Segnalazioni, non proposte di costruzione.

1. **VDAX non ha fonte viva** (il ticker Yahoo `V1X.DE` è fermo al 2016). Il DAX — uno dei
   tre strumenti operati — ha la riga vuota **proprio nella colonna che conta di più**. In
   una tabella questo si vede molto più che nella forma attuale, dove un `—` in mezzo alla
   prosa passa inosservato. È il buco informativo più grande della pagina.
2. Per rispondere alla domanda che il calendario suggerisce — *quanto si muove il WTI nel
   giorno dell'EIA?* — servirebbero distribuzioni dell'escursione **condizionate
   all'evento**. Non le abbiamo. Non le ho inventate.
3. La barra-parola del percentile darebbe di più con gli estremi etichettati sulla traccia
   (minimo/massimo storici). I valori ci sono già (`rango.minimo`/`massimo`): oggi li metto
   nel tooltip in A e in una colonna in B, ma a 56px non ci stanno scritti. È un limite di
   forma, non di dati.

---

## Schermate consegnate

`docs/macro-forma/`

- `prima/` — stato attuale: `vol-1440-dark`, `vol-1440-light`, più i ritagli `crop-a`,
  `crop-b`, `crop-light`
- `metro/` — Driver e Stagionalità con i ritagli `crop-driver`, `crop-stag`
- `proposte/` — le tre direzioni, ciascuna a **1440 e 1920 px, tema chiaro e scuro**
  (12 file), più i ritagli a scala 1:1

Altezza della pagina, stesso contenuto, stessi dati, a 1440:

| | altezza |
|---|---|
| oggi | 5.191 px |
| A · Listino | **2.172 px** |
| C · Scheda | 2.920 px |
| B · Nota | 6.206 px |

Scelta la direzione, resta da: rifare il Termometro nel linguaggio scelto, decidere le
proposte di rimozione qui sopra, e propagare al resto del desk (Driver e Stagionalità
restano come sono — in C sono già la regola, in A e B andrebbero riallineate).
