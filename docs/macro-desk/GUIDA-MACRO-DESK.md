# Come si legge il Macro Desk

**Aggiornata il 28 agosto 2026.** I numeri usati come esempio sono quelli di
quel giorno. I numeri cambiano ogni notte; il modo di leggerli no.

Il desk risponde a **una domanda sola: quanto sarà larga la giornata.** Non
dice dove va il prezzo — non lo sa, e non c'è una riga che finga di saperlo.
Quello che sa fare è dirti quanto spazio il prezzo tende ad attraversare in
condizioni come queste, e quanto è affollato il posizionamento. Da lì escono
**la distanza dello stop e la size**, cioè metà del mestiere.

---

## Indice

1. [Le tre decisioni](#le-tre-decisioni)
2. [Come si legge un rango storico](#come-si-legge-un-rango-storico)
3. [Le misure, una per una](#le-misure-una-per-una)
4. [Implicita e realizzata](#implicita-e-realizzata)
5. [La struttura a termine](#la-struttura-a-termine)
6. [Contango e backwardation sul WTI](#contango-e-backwardation-sul-wti)
7. [Il posizionamento COT](#il-posizionamento-cot)
8. [Le convenzioni](#le-convenzioni)
9. [Cosa il desk NON dice](#cosa-il-desk-non-dice)

---

## Le tre decisioni

Ogni misura del desk serve a una di queste tre cose. Se non serve a nessuna,
non dovrebbe essere in pagina.

| Decisione | La domanda | Le misure che la servono |
| --- | --- | --- |
| **Dimensionare** | Quanto grande può essere la posizione | Volatilità implicita e il suo rango · ampiezza attesa |
| **Scegliere lo stop** | A quanti punti lo metto | Escursione tipica in punti · escursione dell'ultima seduta |
| **Stare fuori** | Oggi ha senso operare | Eventi programmati · età dei dati · scorte EIA il mercoledì |

Le due righe col **filetto d'accento** nella Sintesi — ampiezza attesa ed
escursione tipica — sono quelle da cui esce la distanza dello stop. Se hai
dieci secondi, guarda solo quelle.

---

## Come si legge un rango storico

È il concetto più importante del desk, ed è quello che rende leggibile un
numero che da solo non dice niente.

**«GVZ 27,69» non significa nulla.** Alto? Basso? Rispetto a cosa? Il rango
risponde: mette il valore di oggi accanto a **tutta la storia della stessa
serie**.

> **«Più alto del 92% delle sedute dal 2008»** vuol dire: da quando esiste la
> serie, su cento giorni di mercato **otto** hanno avuto un valore più alto di
> oggi, e **novantadue** più basso.

Detto altrimenti: sei nell'8% più alto della storia di quello strumento.

### La barra

Accanto alla cifra c'è una barra larga come una parola. Non è decorazione:

- la **tacca al centro** è il 50%, cioè la mediana storica;
- il **segno verticale** è dove sta oggi;
- il numeretto in coda (`'08`) è **l'anno da cui parte la serie**: un rango
  calcolato dal 2008 e uno calcolato dal 1990 non sono la stessa affermazione;
- passando il mouse sulla barra compaiono **minimo e massimo storici**, che
  sono la scala entro cui il percentile ha senso.

### Come si usa

| Rango | Cosa vuol dire in pratica |
| --- | --- |
| **sopra 80** | Giornate larghe. A parità di rischio in euro, size più piccola e stop più lontano. |
| **fra 30 e 70** | Condizioni ordinarie. Il dimensionamento abituale funziona. |
| **sotto 20** | Giornate strette. Attenzione: gli stop stretti vengono presi lo stesso, e il ritorno alla norma è spesso brusco. |

### Le due trappole

1. **Un rango alto raggiunto in cinque sedute non è un rango alto stabile da
   tre mesi.** Per questo accanto al rango ci sono le variazioni a 5, 20 e 60
   sedute: dicono la *velocità*.
2. **Il rango non è una previsione.** Dice dove sei, non dove vai. Un valore al
   95° percentile può salire ancora — è successo, ed è nel massimo storico.

### Perché il rango non scade

È il motivo per cui il desk usa ranghi e non soglie. Una soglia («sopra 20 è
volatilità alta») è tarata una volta e resta ferma mentre il mercato si sposta:
prima o poi tutte le giornate cadono dalla stessa parte e la classificazione
smette di dire qualcosa, **senza che nulla lo segnali**. È esattamente il
motivo per cui il termometro di volatilità è stato tolto il 27 agosto 2026. Un
rango si ricalcola su tutta la storia ogni notte: cambia, e te lo dice.

---

## Le misure, una per una

### Volatilità implicita — GVZ, OVX, VDAX, VIX

**Cosa è.** Quanto il mercato delle **opzioni fa pagare oggi** per i prossimi
trenta giorni. È un prezzo, e guarda avanti.

**Come si calcola.** Non la calcoliamo noi: la pubblica il CBOE ogni sera, e
l'archivio la scarica ogni notte. GVZ è sull'oro (opzioni sull'ETF GLD), OVX
sul petrolio (ETF USO), VIX sull'S&P 500, VDAX sul DAX.

**A cosa serve.** A **dimensionare**. Rango alto = giornate più larghe = size
più piccola a parità di rischio. Non dice niente sulla direzione.

> **Nota sul DAX.** VDAX non ha una fonte viva: il ticker Yahoo `V1X.DE` è
> fermo al 2016. Il DAX — uno dei tre strumenti che operi — resta **senza
> volatilità implicita**, e in tabella la sua riga è vuota. Nel frattempo il
> VIX è l'unica lettura di volatilità azionaria viva del desk, ed è per questo
> che l'S&P 500 resta in pagina marcato `contesto` pur non essendo operato.

### Escursione vera della giornata

**Cosa è.** Quanto spazio il prezzo ha **attraversato** in una seduta.

**Come si calcola.** `(massimo − minimo) ÷ chiusura`. In tabella trovi:

- l'escursione **dell'ultima seduta**, col suo rango storico;
- la **mediana** delle ultime 20 e 60 sedute;
- la **banda 25–75%**, cioè dove cadono le due giornate centrali su quattro;
- il **massimo** della finestra;
- **n**, quante sedute sono davvero entrate nel calcolo.

**A cosa serve.** A **scegliere lo stop**, ed è la misura più operativa del
desk. La colonna **punti** è la stessa mediana resa nell'unità del prezzo:
è la cifra da confrontare con la distanza dello stop che stai per mettere.

> **Esempio.** Oro, mediana a 20 sedute `1,94%`, cioè **90,07 $**. Uno stop a
> 45 $ dal prezzo sta dentro *metà* della giornata mediana: verrà preso circa
> una volta su due anche senza che succeda niente. Uno stop a 130 $ sta sopra
> il 75° percentile: sopravvive alla giornata normale, ma paghi in size.

**Perché la banda e non solo la mediana.** La mediana è la giornata centrale.
La banda 25–75% ti dice quanto sono diverse fra loro le giornate: `1,55%–2,46%`
è un mercato regolare, `0,9%–4,1%` è un mercato in cui la mediana descrive
poco.

> **Una misura tolta il 28 agosto 2026.** Accanto a questa c'era una tabella
> «movimento fra due chiusure», che misurava quanto la giornata aveva portato
> via da dove era partita. È stata rimossa: una giornata che sale del 2% e
> torna in pari valeva **zero** lì, ma lo stop lo aveva già preso. Sull'oro
> dava `0,84%` contro `1,94%` di escursione sulla stessa finestra — chi
> dimensionava su quel numero dimensionava a metà.

### Ampiezza attesa oggi (implicita)

**Cosa è.** L'escursione che l'indice di volatilità implicita **si aspetta**
per la giornata di oggi.

**Come si calcola.** L'indice è una volatilità *annua*: si riporta a un giorno
dividendo per la radice di 252 (le sedute di un anno), poi si moltiplica per
l'ultima chiusura.

**A cosa serve.** A **dimensionare**. È l'unico numero del desk che riguarda
oggi invece del passato recente. Confrontalo con l'escursione tipica: se
l'attesa è molto più larga della mediana recente, il mercato sta prezzando una
giornata fuori norma.

### Eventi programmati · prossimi 7 giorni

**Cosa è.** Solo eventi il cui **orario è pubblicato in anticipo
dall'istituzione che li produce**: decisioni FOMC e BCE, EIA del mercoledì,
COT del venerdì.

**Cosa non c'è, deliberatamente.** Il **consenso di mercato**. Nessuna fonte
gratuita e verificabile lo pubblica, e un consenso da fonte fragile è un numero
su cui si prendono posizioni.

**A cosa serve.** A **stare fuori**. Conta la **distanza**, non la data: se
c'è un FOMC fra due ore, tutto il resto del desk descrive un mercato che fra
due ore non esisterà più.

### Scorte di greggio (EIA)

**Cosa è.** Scorte totali escluse le riserve strategiche, scorte a **Cushing**
— il punto di consegna che sta fisicamente dietro al prezzo del WTI — e
utilizzo della capacità di raffinazione.

**Come si calcola.** Non si calcola: la pubblica l'EIA. Escono insieme, il
**mercoledì alle 10:30 di New York**, ed è il rilascio settimanale che muove
di più questo mercato.

**A cosa serve.** A **stare fuori** il mercoledì a metà mattina, e come
contesto sul WTI. Attenzione all'unità: le variazioni qui sono in
**settimane**, non in sedute — è una serie settimanale.

### VVIX e SKEW — il costo della copertura

**Cosa sono.** VVIX è quanto costano le opzioni *sul VIX*: sale quando cresce
la domanda di coprirsi da un salto della volatilità stessa. SKEW è quanto si
pagano le opzioni molto fuori dal denaro sull'S&P rispetto a quelle vicine:
sale quando le code vengono prezzate con più attenzione.

**A cosa servono.** A leggere il **sottotesto** quando il VIX è basso. Un VIX
basso con uno SKEW alto non è una contraddizione: nessuno teme il movimento
ordinario, molti pagano ancora per quello raro. Sono le due misure meno
operative del desk — riguardano l'azionario americano e non hanno un analogo
su oro e WTI.

---

## Implicita e realizzata

Sono due misure della stessa cosa che guardano in due direzioni opposte.

| | Implicita | Realizzata |
| --- | --- | --- |
| **Cosa è** | Un **prezzo**: quanto le opzioni fanno pagare | Una **misura**: quanto si è mosso davvero |
| **Guarda** | Avanti, prossimi 30 giorni | Indietro, ultime 20 sedute |
| **Da dove viene** | CBOE (GVZ, OVX, VIX) | La calcoliamo noi sulle chiusure |
| **Unità** | % annua | % annua |

**Come si calcola la realizzata.** Deviazione standard dei rendimenti
logaritmici chiusura-chiusura sulle ultime 20 sedute, moltiplicata per √252
per riportarla ad anno. In parole: quanto sono state disperse le variazioni
giornaliere recenti.

### Lo scarto

**Scarto = implicita − realizzata**, in punti percentuali.

| Scarto | Cosa dice |
| --- | --- |
| **Positivo** (es. `+1,0 pp`) | Le opzioni costano **più** di quanto il movimento recente giustifichi. Il mercato sta pagando per qualcosa che non è ancora successo. |
| **Vicino a zero** | Il prezzo dell'opzionalità è in linea col movimento osservato. |
| **Negativo** | Le opzioni costano **meno** del movimento recente. Spesso segue una fase in cui il mercato si è mosso più di quanto si aspettasse. |

**A cosa serve.** È **contesto**, non un segnale. Non dice la direzione e non
è un arbitraggio: su oro e WTI i due numeri guardano **sottostanti diversi
dello stesso mercato** — l'implicita è sulle opzioni di un ETF (GLD, USO),
la realizzata è sullo spot o sul future. Il confronto è indicativo. In tabella
questa avvertenza sta dietro l'icona ⓘ della colonna dell'indice.

---

## La struttura a termine

**Cosa è.** Il rapporto fra due scadenze della **stessa** curva di volatilità.
Sul VIX: `VIX9D ÷ VIX` (nove giorni contro trenta) e `VIX ÷ VIX3M` (trenta
giorni contro tre mesi).

**Come si legge.** È l'unica cosa che il rapporto dice:

| Valore | Significato |
| --- | --- |
| **Sopra 1** | La scadenza **corta** costa più della lunga. Il mercato prezza più movimento *adesso* che nel medio periodo. |
| **Sotto 1** | La scadenza **lunga** costa più della corta. È la condizione ordinaria. |

**A cosa serve.** A distinguere **volatilità alta** da **volatilità alta
adesso**. Un VIX a 25 con la curva sopra 1 è uno stress in corso; un VIX a 25
con la curva sotto 1 è un mercato che si aspetta di restare mosso a lungo.
Sono due situazioni diverse per chi tiene una posizione oltre la giornata.

**Il rango della struttura.** Come per ogni altra misura, accanto al rapporto
c'è il suo rango. Attenzione a una finezza dichiarata: il rango è calcolato
**solo sulle sedute in cui esistono entrambe le scadenze**, non sulla più lunga
delle due — altrimenti confronterebbe periodi diversi.

---

## Contango e backwardation sul WTI

Riguarda i **future** sul petrolio, non la volatilità. Il desk mostra la
differenza fra il contratto più vicino alla scadenza (*front*) e quello del
mese successivo.

| Segno | Nome | Cosa vuol dire |
| --- | --- | --- |
| **Positivo** (front > secondo) | **Backwardation** | Chi vuole il barile **adesso** paga un premio. Di solito è offerta stretta nel breve. |
| **Negativo** (front < secondo) | **Contango** | Il barile di oggi costa meno di quello di domani: c'è greggio in abbondanza. |

**A cosa serve.**

1. **Contesto sul mercato fisico.** La backwardation è il segno che qualcuno
   ha bisogno di greggio subito.
2. **Costo di restare in posizione.** Se sei lungo su un future che va rollato,
   in **contango** il rollo ti costa — compri ogni volta il contratto più caro.
   In backwardation ti paga. Su una posizione tenuta per settimane non è un
   dettaglio.

> È la **definizione del segno** della differenza, non una previsione. Il desk
> non dice cosa farà il prezzo del petrolio perché la curva è in contango.

---

## Il posizionamento COT

**Cosa è.** Il *Commitments of Traders*: quanto sono lunghi o corti, in saldo,
i grandi operatori. Il desk mostra la voce **managed money net** — cioè i
fondi speculativi — per **oro e WTI**. Sugli indici azionari la CFTC non
pubblica un equivalente, quindi il DAX non ha questa riga.

**Come si legge il numero.**

- `+87.479 contratti **netti**` significa **lunghi meno corti**. Il segno c'è
  sempre e la parola «netti» c'è sempre: senza il segno un saldo corto si
  legge come lungo, e senza «netti» il numero si legge come il numero delle
  posizioni lunghe. Non lo è.
- Accanto c'è la **banda** — dove sta il saldo rispetto alla propria storia —
  e la **variazione a 4 settimane**, cioè se si sta affollando o svuotando.
- I **lordi non ci sono**: l'archivio conserva solo il saldo netto, quindi non
  si può dire quanti lunghi e quanti corti ci siano.

**A cosa serve.** È l'unica dimensione di «dove sto rispetto alla norma» che le
misure di volatilità non coprono: quelle dicono *quanto* il mercato si muove,
il COT dice *da chi è tenuto*.

### Cosa il COT NON dice

Questo va letto per intero, perché è la parte che di solito viene raccontata
male.

- **Non è un segnale di direzione.** Il desk ha eseguito un test
  **pre-registrato** sulla capacità predittiva del posizionamento (in
  `dati/PRE_REG_cot_posizionamento.md`): è **fallito su tutti e tre i
  criteri**. La sezione è stata tenuta come *descrittiva* e nient'altro.
- **Un saldo estremo non implica un'inversione.** «I fondi sono molto lunghi,
  quindi il prezzo scenderà» è esattamente l'inferenza che il test ha
  bocciato. Un posizionamento affollato può restare affollato per mesi.
- **È vecchio per costruzione.** È una **fotografia del martedì, pubblicata il
  venerdì**: quando la leggi ha già tre giorni, e resta la stessa per tutta la
  settimana successiva. Non cambia perché il mercato si è mosso.

---

## Le convenzioni

### Da dove vengono i numeri

| Cosa | Fonte | Aggiornamento |
| --- | --- | --- |
| Indici di volatilità implicita (VIX, VVIX, SKEW, GVZ, OVX) | **CBOE**, con FRED come riserva e per lo storico | Ogni notte |
| Prezzo dell'oro (XAU/USD) | **Dukascopy** | Ogni notte |
| Prezzo del WTI | **future NYMEX** più vicino alla scadenza, via Yahoo Finance | Ogni notte |
| Prezzo di S&P 500 e DAX | **Yahoo Finance** | Ogni notte |
| Scorte di greggio | **EIA** | Settimanale, mercoledì |
| Posizionamento | **CFTC** | Settimanale, venerdì |
| MOVE e put/call | **Il report scritto a mano** | Quando arriva un report |

Ogni pagina dichiara le proprie fonti **una volta sola, in cima**. La
provenienza specifica di una singola serie — quale fonte ha davvero risposto
all'ultimo aggiornamento, se lo storico è stato cucito da due fonti — sta
dietro l'icona ⓘ accanto alla sigla dell'indice.

> **Regola in caso di conflitto: vince l'archivio.** Se un numero del report
> generato a mano diverge da uno dell'archivio giornaliero, quello buono è
> quello dell'archivio. Il report è più vecchio e trascritto a mano.

### Il WTI ha due serie, e non sono confrontabili

Le misure di prezzo della Volatilità usano il **future front-month**, perché
lo spot Cushing di FRED non pubblica massimo e minimo (quindi non ne uscirebbe
un'escursione) e arriva con otto giorni di ritardo. La **Stagionalità** usa
invece lo **spot**, perché sui rendimenti di lungo periodo il future porta gli
artefatti dei cambi di contratto. Sulle sedute comuni le due serie correlano
0,94, non 1: **i numeri delle due sezioni non si confrontano riga per riga.**

### L'età di un dato

Accanto a ogni misura c'è una colonna **Età**: quanti giorni sono passati fra
la seduta a cui il dato si riferisce e oggi.

> **Perché un dato di venerdì letto di lunedì risulta di tre giorni.** L'età è
> in **giorni di calendario**, non in sedute. Il mercato è stato chiuso sabato
> e domenica, quindi il venerdì è ancora l'**ultima seduta disponibile** — il
> dato è freschissimo — ma il calendario di giorni ne ha contati tre.
>
> Serve a sapere **quanto è vecchio** ciò che stai guardando, non a giudicarlo
> scaduto. Un `3 gg` di lunedì mattina è normale. Un `3 gg` di mercoledì no:
> vuol dire che il job non ha aggiornato.

L'età è calcolata **nel tuo fuso orario**, non in quello del server: «oggi»
dipende da dove sei tu.

### Le date

Le date delle sedute sono nel fuso del mercato che le produce. Le date dei
report sono in **UTC**, come arrivano dal sistema che li genera: un report «del
21/08» è il report di quella giornata di mercato, non dell'ora locale in cui è
stato ricevuto.

### n, campione, e l'asterisco

`n` è quante osservazioni sono davvero entrate nel calcolo. Non è pignoleria:
una mediana «su 20 sedute» calcolata su 12 non è una mediana su 20 sedute. Un
**asterisco** accanto a `n` nella tabella dell'escursione segnala che alcune
sedute della finestra sono state escluse perché non avevano massimo e minimo;
il numero esatto è nel titolo della cella.

### Il colore

Nel desk il colore significa **una cosa sola: il segno**. Verde positivo, rosso
negativo, e solo nelle colonne dove il segno è il messaggio (variazioni,
scarti). Tutto il resto è una gerarchia di grigi. Se vedi un colore, c'è un
segno da leggere.

Se hai attivato una delle palette per daltonismo in Impostazioni, il desk la
eredita: la promessa vale anche qui.

---

## Cosa il desk NON dice

Vale la pena averlo scritto una volta, perché è la parte che rende affidabile
tutto il resto.

- **Non dice dove va il prezzo.** Nessuna sezione, nessuna riga.
- **Non dà consigli operativi.** Dà le due quantità — ampiezza e affollamento —
  da cui *tu* ricavi stop e size.
- **Non prezza il consenso.** Il calendario dice quando esce un dato, mai cosa
  ci si aspetta che dica.
- **Non nasconde le assenze.** Dove un dato manca c'è scritto che manca e
  perché: VDAX senza fonte viva, il put/call che il CBOE pubblica solo in una
  pagina generata da JavaScript, le scorte quando la chiave EIA non risponde.
  Una riga vuota dichiarata è meglio di un numero inventato.
- **Non tiene classificazioni che possono scadere in silenzio.** È il motivo
  per cui il termometro di volatilità non c'è più: ranghi e mediane osservate
  non smettono di essere veri quando il regime cambia — cambiano, e te lo
  dicono.

---

*Le sezioni **Driver** e **Stagionalità** hanno una loro logica di lettura, con
la chiave di lettura direttamente in pagina sopra ciascun grafico.*
