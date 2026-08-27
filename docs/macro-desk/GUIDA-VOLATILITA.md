# Guida alla sezione Volatilità

**Scritta il 27 agosto 2026**, con i numeri veri di quel giorno come esempi.
I numeri cambiano ogni notte; il modo di leggerli no.

---

## 1. Cosa stai guardando

Questa sezione risponde a **una domanda sola: quanto sarà larga la giornata.**

Non a dove va il prezzo. Il desk non lo sa, e non c'è una riga in questa
pagina che finga di saperlo. Quello che sa fare è dirti quanto spazio il
prezzo tende ad attraversare in condizioni come queste, che è l'informazione
da cui escono **la distanza dello stop e la size** — cioè metà del mestiere.

### Cosa è sparito, e perché ti conviene

Fino al 27 agosto 2026 la sezione conteneva un **termometro di volatilità**:
una classificazione ESPANSA / COMPRESSA per strumento, con accanto una
statistica del tipo «in giornate come questa l'escursione è risultata ampia
nel 75% dei casi, contro il 55% di una giornata qualsiasi».

Suonava utile. Il problema era che la classificazione nasceva da una **soglia
assoluta tarata una volta**: sopra tot di indice, ESPANSA; sotto, COMPRESSA.
Quando il mercato si sposta su un livello di volatilità diverso — e lo fa —
la soglia resta ferma e la classificazione smette di separare due gruppi. Su
oro e WTI era successo, e per otto mesi tutte le giornate erano cadute dalla
stessa parte senza che nulla lo segnalasse. La percentuale continuava a
comparire: aritmeticamente vera, e priva di contenuto.

La risposta di allora era stata circondare il termometro di controlli — un
rilevatore di degenerazione e un cancello di validità. Funzionavano: il
verdetto quasi non compariva più, e al suo posto la pagina mostrava dei
riquadri che spiegavano perché non c'era.

Ora non c'è più niente da spiegare. **Non è stato tolto un solo fatto**: tutto
quello che il termometro condizionava allo stato, la pagina lo misura e basta.
Il guadagno pratico è che nessuna riga di questa sezione può più scadere in
silenzio: un rango storico o una mediana osservata non smettono di essere veri
quando il regime cambia — cambiano, e te lo dicono.

---

## 2. L'ordine dei blocchi non è casuale

Si legge dall'alto e si scende, ed è l'ordine delle domande:

1. **Eventi programmati** — fra quanto succede qualcosa. Viene prima di tutto:
   se c'è un FOMC fra due ore, il resto della pagina descrive un mercato che
   fra due ore non esisterà più.
2. **Contesto di volatilità** — dove sta la volatilità rispetto alla propria
   storia, e quanto si è mossa davvero. È il cuore.
3. **Scorte di greggio (EIA)** — il fatto settimanale che muove il WTI più di
   ogni altro.
4. **Le due misure senza fonte pubblica** e **il commento del report** — quel
   poco che arriva ancora da un report generato a mano, con la data addosso.

Dentro il contesto l'ordine è: prima le due letture d'ambiente che valgono per
tutti (la curva del VIX, il prezzo della copertura), poi una scheda per
strumento.

---

## 3. Blocco per blocco

### 3.1 Eventi programmati · prossimi 7 giorni

**Cosa è.** Solo eventi il cui **orario è pubblicato in anticipo
dall'istituzione che li produce**: le decisioni FOMC e BCE, l'EIA del
mercoledì, il COT del venerdì. Le date del FOMC del 2027 sono già note oggi e
non cambiano. Ogni voce porta la distanza («domani», «fra 6 giorni»), l'ora
nel tuo fuso, chi lo pubblica e su quali strumenti pesa.

**Cosa NON c'è, dichiarato:** il consenso di mercato e il valore precedente.
Nessuna fonte gratuita e verificabile li pubblica, e un consenso preso da una
fonte fragile è un numero su cui poi si aprono posizioni. Meglio l'assenza.

**A quale decisione serve.** A decidere *se* aprire, non *cosa*. La distanza
conta più della data: «fra 3 ore» cambia la giornata, «16 settembre» no.

**Oggi (27/08).** CFTC domani alle 21:30 (oro e WTI), EIA fra 6 giorni,
il 02/09 alle 16:30 (WTI). Nessuna banca centrale nella settimana: nessuno dei
quattro strumenti ha in agenda qualcosa che possa allargare la giornata di
propria iniziativa.

---

### 3.2 Struttura a termine del VIX

**Cosa è.** Tre scadenze della stessa curva: VIX9D (nove giorni), VIX (trenta),
VIX3M (tre mesi). E i due rapporti fra scadenze adiacenti, ciascuno col
proprio rango storico.

**Come si legge.** Sopra 1 la scadenza corta costa più della lunga; sotto 1 il
contrario. È tutto quello che il rapporto dice — e basta, perché è quello che
serve.

**A quale decisione serve.** A distinguere **volatilità alta** da **volatilità
alta *adesso***. È l'unica misura della pagina che ha un orizzonte: se i
prossimi nove giorni costano più del mese, il mercato sta prezzando qualcosa
di ravvicinato, e non lo si vede dal livello del VIX.

**Oggi.** VIX9D 13,45 · VIX 15,45 · VIX3M 18,21. Il rapporto **VIX9D ÷ VIX =
0,871**, al 21° percentile dal 2011: le prossime due settimane costano il 13%
meno del mese, e questa configurazione si è vista solo in un quinto delle
sedute. Curva regolarmente inclinata, niente di ravvicinato prezzato.

---

### 3.3 Quanto costa coprirsi sull'azionario (VVIX e SKEW)

**Cosa è.** Due prezzi della copertura, entrambi col rango sull'intera storia.
**VVIX** è quanto costano le opzioni *sul VIX*: sale quando cresce la domanda
di coprirsi da un salto della volatilità stessa. **SKEW** è quanto si pagano le
opzioni molto fuori dal denaro sull'S&P rispetto a quelle vicine: sale quando
le code vengono prezzate con più attenzione.

**A quale decisione serve.** A leggere il sottotesto quando il VIX è basso. Un
VIX basso e uno SKEW alto non si contraddicono: dicono che il mercato non
prezza un movimento *ordinario* grande, ma sta pagando per proteggersi da uno
*straordinario*.

**Oggi.** VVIX 85,67, al 34° percentile dal 2006 e **−7,20 in cinque sedute**:
la domanda di coprirsi dai salti di volatilità sta calando. SKEW 143,27, al
**92° percentile dal 1990**: le code, invece, restano prezzate care come
raramente accade. Le due cose insieme si leggono così: nessuno teme il
prossimo mese, molti pagano ancora per l'evento raro.

---

### 3.4 La scheda dello strumento — il blocco che conta

Una scheda per Oro, WTI, S&P 500 e GER40. Dentro, quattro riquadri sempre
nello stesso ordine. Vale la pena imparare a leggere questi quattro, perché
tutto il resto della pagina è contorno.

#### a) Indice di volatilità implicita — livello, rango, variazioni

**Cosa è.** GVZ per l'oro, OVX per il WTI, VIX per l'S&P. È **quanto il
mercato delle opzioni sta facendo pagare oggi** per l'incertezza dei prossimi
trenta giorni, espresso in percentuale annua.

**Come si legge, e come NON si legge.** Mai il livello nudo. «GVZ 27,69» non
dice niente a nessuno: 27,69 è alto o basso? La riga da leggere è quella
sotto, **il rango** — «più alto del 92% delle sedute dal 2008» — perché è un
confronto con sé stesso e non scade quando il regime cambia. Accanto ci sono
le variazioni a 5, 20 e 60 sedute: dicono in che *direzione* si sta muovendo
il prezzo del rischio.

**A quale decisione serve.** A capire se il mercato *si aspetta* più
movimento del solito. È l'unico numero della pagina che guarda avanti — e non
è una previsione del desk, è un prezzo.

**Oggi.**
- **Oro · GVZ 27,69**, più alto del 92% delle sedute dal 2008 (n=4.584; minimo
  storico 8,88, massimo 64,53), **+3,71 (+15,5%) in cinque sedute**. Il
  mercato delle opzioni sull'oro non è quasi mai stato così caro, e sta
  rincarando in fretta.
- **WTI · OVX 46,16**, 79° percentile dal 2007, ma **−10,99 (−19,2%) in venti
  sedute**: alto in assoluto, in discesa netta.
- **S&P · VIX 15,45**, 35° percentile dal 1990: *sotto* la mediana della
  propria storia, e −2,76 (−15,2%) in venti sedute.

#### b) Implicita contro realizzata

**Cosa è.** Due numeri e la loro differenza. L'**implicita** è l'indice qui
sopra (quanto si paga). La **realizzata** è la deviazione standard dei
rendimenti chiusura-chiusura delle ultime 20 sedute, annualizzata ×√252
(quanto si è mosso davvero). Entrambe in percentuale annua, quindi
confrontabili alla pari.

**A quale decisione serve.** È il **controllo di calibrazione** su tutto il
resto. Se l'implicita sta molto sopra la realizzata, il mercato sta pagando
per un movimento che finora non è arrivato: la giornata potrebbe risultare più
stretta di quanto il prezzo delle opzioni suggerisca. Se sta sotto, il passato
recente è più mosso di quanto il mercato stia prezzando.

**Il disallineamento è dichiarato, leggilo.** GVZ misura le opzioni sull'ETF
GLD, la realizzata è calcolata sullo spot XAU/USD; OVX misura l'ETF USO, le
misure di prezzo vengono dal future NYMEX. Sono sottostanti diversi dello
stesso mercato: il confronto è indicativo, non un arbitraggio.

**Oggi.**
- **Oro: 27,7% contro 26,7% · scarto +1,0 pp.** Questo è il numero più
  interessante della pagina. Il GVZ è al 92° percentile della propria storia,
  ma il premio sulla realizzata è di **un punto solo**. Non è paura prezzata:
  è un regime genuinamente più mosso, e la realizzata lo conferma.
- **WTI: 46,2% contro 43,4% · +2,8 pp.** Stessa lettura, premio modesto.
- **S&P: 15,5% contro 13,3% · +2,2 pp.** Premio ordinario su un mercato calmo.

#### c) Escursione vera della giornata — **il numero dello stop**

**Cosa è.** `(massimo − minimo) ÷ chiusura`. È **lo spazio che il prezzo
attraversa dentro la giornata**, ed è esattamente quello che uno stop
incontra. Il riquadro ne dà tre cose: l'escursione dell'**ultima seduta** col
suo rango storico, e la distribuzione su **20 e 60 sedute** — mediana, banda
25-75%, massimo, e quante sedute compongono il campione.

**Come si legge.** La mediana a 20 sedute è l'ambiente in cui stai operando
*adesso*; quella a 60 è il termine di paragone. Se le due divergono, il regime
si è mosso. La banda 25-75% dice quanto ti puoi fidare della mediana: una
banda stretta è un regime regolare, una larga è un regime che alterna.

**A quale decisione serve.** A questa e a nient'altro: **quanto lontano mettere
lo stop**. Uno stop dentro la banda 25-75% viene toccato da una giornata
ordinaria — non da un evento, dalla normalità.

**Oggi (mediana a 20 sedute · valore in valuta · banda 25-75% · a 60 sedute):**

| | 20 sedute | in valuta | banda 25-75% | 60 sedute |
|---|---|---|---|---|
| Oro | 1,94% | 90,07 $ | 1,55% – 2,46% | 1,97% |
| WTI | 3,56% | 2,86 $ | 2,73% – 4,42% | 4,34% |
| GER40 | 0,71% | 188 pt | 0,57% – 0,94% | 0,89% |
| S&P 500 | 0,59% | 45 pt | 0,45% – 0,98% | 0,89% |

**L'ultima seduta**, col suo rango su tutta la storia disponibile:
oro 1,97% (81° percentile dal 1999) · WTI 2,10% (25° dal 2000) · GER40 0,72%
(29° dal 1987) · S&P 0,46% (**7° percentile dal 1970**: una delle sedute più
strette in cinquantasei anni di storia).

**Un avviso che vale la pena aspettare.** Se l'ultima seduta è quella di
*oggi*, il riquadro lo dichiara: «seduta ancora aperta». Quell'escursione può
solo crescere, e leggerla come definitiva è il modo più facile per
sottodimensionare uno stop.

#### d) Movimento giornaliero osservato

**Cosa è.** La variazione fra due chiusure, in valore assoluto. Stessa forma
del riquadro accanto: mediana, banda, massimo, su 20 e 60 sedute.

**Perché sta accanto all'escursione e non al suo posto.** Sono due misure
diverse della stessa giornata. L'escursione dice **quanto spazio la giornata
ha attraversato**; il movimento dice **quanto ne ha portato a casa**. Una
giornata che sale del 2% e torna in pari vale 2% di escursione e **zero** di
movimento.

**A quale decisione serve.** Il rapporto fra i due è la misura di quanto il
mercato restituisce prima della chiusura. È la differenza fra un mercato che
tiene i movimenti e uno che li riassorbe.

**Oggi.** Sull'S&P: escursione 0,59%, movimento 0,48% — rapporto 1,2, quasi
tutto quello che attraversa lo tiene. Sul GER40: escursione 0,71%, movimento
0,40% — rapporto 1,8, quasi metà del percorso torna indietro prima della
chiusura. Sull'oro: 1,94% contro 0,84%, rapporto 2,3.

#### e) Curva a termine del WTI (solo nella scheda del petrolio)

Front meno secondo contratto. **Backwardation** (spread positivo) vuol dire che
il barile di oggi vale più di quello del mese prossimo: scorte tese.
**Contango**, il contrario. È lo stato del mercato fisico, non un indicatore.

---

### 3.5 Scorte di greggio · rapporto settimanale EIA

I tre numeri che escono ogni mercoledì alle 10:30 di New York: quanto greggio
c'è, quanto ce n'è a **Cushing** — il punto di consegna che sta dietro al
prezzo del WTI — e quanto stanno lavorando le raffinerie. Livelli con il
proprio rango, non variazioni nude, perché «−3 milioni di barili» non dice
niente se non sai da dove parti.

---

### 3.6 Le due misure senza fonte pubblica, e il commento del report

**MOVE** (volatilità implicita dei Treasury) e **PUT/CALL** dell'S&P sono le
uniche due misure che nessuna fonte gratuita pubblica. Arrivano dal report
giornaliero, che è **generato a mano**, e per questo portano due date: quella
del report e il vintage che il report dichiara.

Sotto c'è il **commento del report**: prosa, marcata come tale, che vale alla
data del report e non è ricalcolata da questa pagina.

**Come li tratti.** Con la data in mano. Oggi il MOVE è 75,63 «dal report del
21/08/2026, vintage 17 ago»: **dieci giorni fa**. Il commento cita GVZ 23,9 e
OVX 47,2, mentre poche righe sopra la pagina mostra GVZ 27,69 del 25/08. Non è
una contraddizione: è un testo vecchio accanto a numeri freschi, e la data lo
dice. Se le due cose divergono, **vince l'archivio**.

---

## 4. Come si usa in pratica: stop e size

Tutto quello che segue è aritmetica sui numeri della pagina. Nessuna
raccomandazione: la scelta del rischio è tua.

### Il passaggio, in tre righe

1. **La distanza dello stop viene dall'escursione tipica**, non dal grafico.
   La mediana a 20 sedute è quanto attraversa una giornata ordinaria; la banda
   25-75% dice quanto quel numero è stabile.
2. **La size viene dallo stop**, non dal capitale: se rischi una cifra fissa
   per operazione, `size = rischio ÷ distanza dello stop`. Con lo stop che
   scala con la volatilità, la size scala all'inverso — automaticamente.
3. **Il controllo finale è l'agenda.** Se in giornata c'è un evento
   programmato, i numeri di questa pagina descrivono il mercato *prima*
   di quell'evento.

### Perché la size si muove da sola, coi numeri di oggi

Se il rischio per operazione è **200 $**, e lo stop è messo a una volta
l'escursione tipica a 20 sedute:

| | escursione tipica | stop | unità che puoi tenere |
|---|---|---|---|
| Oro | 90,07 $ | 90 $ | 2,2 |
| WTI | 2,86 $ | 2,86 $ | 70 |
| S&P 500 | 45 pt | 45 pt | 4,4 |
| GER40 | 188 pt | 188 pt | 1,1 |

Non è una scelta: è la stessa cifra di rischio, divisa per quattro
volatilità diverse. È tutto il senso di avere il numero.

### Cosa succede se usi la finestra sbagliata

**WTI, oggi.** L'escursione tipica è 3,56% su venti sedute e **4,34% su
sessanta**. Uno stop calibrato sul trimestre sarebbe 3,49 $ invece di 2,86 $:
**il 22% più largo del necessario**, e quindi il 18% di size in meno a parità
di rischio.

**S&P 500, oggi.** L'effetto è più grande e va nella stessa direzione: 0,59%
su venti sedute contro **0,89% su sessanta**. Uno stop sul trimestre sarebbe
68 punti invece di 45 — **una volta e mezza**. Su un mercato che ieri ha
chiuso al 7° percentile di ampiezza dal 1970, è mezzo stop buttato.

Nel verso opposto vale lo stesso: quando la finestra corta è più *larga* della
lunga, uno stop sul trimestre viene toccato da una giornata normale.

### Quando la mediana non basta

Guarda la **banda 25-75%** e il **massimo**. Sul WTI oggi la banda va da 2,73%
a 4,42%: fra una giornata del primo quartile e una del terzo c'è **il 62% di
differenza**, e il massimo delle venti sedute è 9,53% — quasi il triplo della
mediana. Su uno strumento così, uno stop alla mediana viene toccato spesso; è
il motivo per cui la banda è mostrata e non nascosta dietro un numero solo.

Sull'S&P la banda è 0,45%–0,98%: più stretta in valore assoluto, ma in
proporzione peggio — il 75° percentile è **più del doppio** del 25°.

### La lettura d'insieme, sui tre strumenti di oggi

**Oro — regime genuinamente più mosso.** GVZ al 92° percentile dal 2008 e in
salita del 15,5% in cinque sedute; ma implicita 27,7% contro realizzata 26,7%,
un punto di scarto. Le opzioni non stanno gonfiando un premio di paura: il
prezzo si muove davvero così. L'escursione tipica lo conferma da sola —
1,94% su venti sedute contro 1,97% su sessanta, cioè nessun restringimento.
**Conseguenza pratica:** su questo strumento la volatilità implicita alta *va
presa sul serio*, e lo stop di 90 $ è quello giusto, non un'esagerazione.

**WTI — alto in assoluto, ma in raffreddamento.** OVX al 79° percentile ma giù
del 19,2% in venti sedute; escursione tipica 3,56% contro 4,34% del trimestre;
ultima seduta al 25° percentile della propria storia. Tre misure indipendenti
che dicono la stessa cosa: il mercato più mosso dei quattro si sta calmando.
**Conseguenza pratica:** è lo strumento dove usare la finestra a 60 sedute
costa di più.

**S&P 500 — compresso, ma le code sono care.** VIX al 35° percentile,
escursione tipica ristretta di un terzo rispetto al trimestre, ultima seduta al
7° percentile dal 1970, curva a termine regolarmente inclinata (VIX9D ÷ VIX =
0,871, al 21° percentile). Tutto concorde. **L'unica riga che non concorda è
lo SKEW a 143,27, al 92° percentile dal 1990:** il mercato non prezza un
movimento ordinario grande, ma sta pagando caro per l'evento raro. Le due cose
non si contraddicono, e la pagina le mostra entrambe invece di sintetizzarle
in un giudizio unico — che è precisamente ciò che faceva il termometro.

---

## 5. Cosa questa sezione NON dice

- **Non dice dove andrà il prezzo.** Nessuna riga, in nessun blocco.
- **Non dice se una giornata sarà ampia.** Dice quanto sono state ampie le
  giornate recenti e quanto il mercato sta pagando per l'incertezza. La
  differenza non è formale: la prima sarebbe una previsione, le seconde sono
  misure.
- **Non distingue le sessioni.** L'escursione è quella della giornata intera:
  se operi solo sull'apertura europea, il numero è un tetto, non la tua
  giornata.
- **Non è aggiornata in tempo reale.** L'archivio si aggiorna ogni notte alle
  03:30. Ogni riga porta la propria data e la propria età: leggile, soprattutto
  il lunedì, quando il dato di venerdì risulta di tre giorni pur essendo
  l'ultima seduta.

---

## 6. Riferimenti nel codice

- Fatti e query: `src/lib/queries/volatilita-contesto.ts`, `src/lib/volatilita-fatti.ts`
- Resa della sezione: `src/components/macro-desk/contesto-volatilita.tsx`
- Calendario degli eventi: `src/lib/calendario-macro.ts`
- Le schede per strumento della Sintesi, che riusano gli stessi fatti:
  `src/lib/ai-analyst/scheda-strumento.ts`
- Storia della rimozione del termometro: `docs/DEBITO-TECNICO.md`
