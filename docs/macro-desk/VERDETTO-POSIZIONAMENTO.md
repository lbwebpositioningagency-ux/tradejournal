# Posizionamento (COT) — analisi critica

**27 agosto 2026.** Analisi richiesta, nessuna modifica alla sezione: la
decisione è dell'utente. Tutti i numeri citati sono stati verificati contro il
database, e le query di verifica sono riportate qui sotto perché siano
rifacibili.

---

## In due righe

**I numeri sono corretti.** Le implicazioni meccaniche **no**: due delle sei
frasi attualmente a schermo sono false, e una lo è sui dati di oggi. La
scelta di tenere la sezione come descrittiva regge nella lettera — nessuna
probabilità a schermo — e **non regge nella sostanza**, perché le stesse
ipotesi che il test pre-registrato ha bocciato sono rimaste in pagina in forma
di prosa, dove nessuno può più verificarle.

Per un discrezionale intraday/swing su oro e WTI, il contenuto informativo
genuino della sezione è **una riga per strumento**, non una sezione di primo
livello.

---

## 1. Verifica dei numeri: tutti corretti

Confronto diretto fra `CotWeek` e ciò che il pannello mostra oggi.

| | a schermo | ricalcolato dal DB | |
|---|---|---|---|
| ORO · Managed Money netto | 141.648 contratti | 141.648 (18/08/2026) | ✅ |
| ORO · percentile | «più alto che nel 72%» | 72,2 (leq, n=503) | ✅ |
| ORO · banda | ALTO | 70 ≤ 72,2 < 90 | ✅ |
| ORO · Δ 4 settimane | +16.817 | 141.648 − 124.831 (21/07) | ✅ |
| ORO · open interest | 406.260 | 406.260 | ✅ |
| ORO · percentile OI | «più basso che nel 95%» | 5,2 → 100−5,2 ≈ 95 | ✅ |
| WTI · Managed Money netto | 87.479 | 87.479 | ✅ |
| WTI · percentile | «più basso che nel 87%» | 13,1 → 100−13,1 ≈ 87 | ✅ |
| WTI · Δ 4 settimane | +23.500 | 87.479 − 63.979 (21/07) | ✅ |
| WTI · open interest | 1.888.960 | 1.888.960 | ✅ |

La convenzione del percentile («leq», corrente inclusa), le fasce
[0,10,30,70,90,101), il warm-up di 156 settimane e la formula di «ultima volta
simile» sono la traduzione 1:1 del generatore Python pre-registrato, e il test
di regressione le blocca contro `dati/cot_panel_produzione.json`. **Su questo
non c'è niente da correggere.**

Una sola osservazione minore sulla riga di rarità. È
`round(52 × percentile_estremo / 100)`, e a schermo oggi produce «capita circa
**14 settimane l'anno** di stare così in alto» per l'oro al 72° percentile.
Aritmeticamente giusto, informativamente vuoto: quattordici settimane l'anno è
più di un quarto dell'anno, e chiamarla rarità stira la parola. La riga è utile
nelle bande MOLTO (l'oro in partecipazione: «circa 3 settimane l'anno») e
vicina all'inutile nelle bande ALTO/BASSO, dove per costruzione non può mai
scendere sotto le 5 settimane.

---

## 2. Le implicazioni meccaniche: due sono false

Il pannello le presenta con questa didascalia:

> «L'implicazione meccanica discende dalla definizione della metrica e dalla
> banda in cui cade oggi: non è una lettura della cronaca né un'aspettativa sul
> prezzo.»

Verificate una per una, **quattro delle sei famiglie di frasi non discendono
dalla definizione**, e due sono false su casi che si presentano regolarmente —
una delle due è a schermo adesso.

### 2.1 «Partecipazione ai minimi → mercato più sottile» — non è definizionale, e i dati non la mostrano

A schermo oggi, sull'oro:

> Partecipazione (MOLTO BASSO): *«mercato strutturalmente più sottile, dove lo
> stesso flusso di ordini può produrre oscillazioni di prezzo più ampie che in
> un mercato affollato.»*

**Primo problema: l'open interest non è la profondità del book.** L'OI conta
le posizioni aperte, non gli ordini in attesa. Un mercato può avere OI enorme
e book sottile (posizioni tenute da chi copre e non movimenta) oppure OI
modesto e book profondo (molto turnover intraday). Il legame fra OI e impatto
di prezzo è un'ipotesi di microstruttura, non una conseguenza della
definizione. La misura che si avvicina alla liquidità è il **volume**, e non è
questa.

**Secondo problema, e qui il numero parla da solo: il contratto è fisso, il
prezzo no.** Il future COMEX sull'oro vale 100 once. Contare i contratti misura
le **once**, non il capitale.

| settimana COT | contratti | oro | nozionale aperto |
|---|---|---|---|
| 03/01/2017 | 424.673 | 1.157 $ | **49,1 mld $** |
| 18/08/2020 | 544.010 | 2.005 $ | 109,1 mld $ |
| 20/08/2024 | 532.867 | 2.513 $ | 133,9 mld $ |
| **18/08/2026** | **406.260** | **4.333 $** | **176,0 mld $** |

Oggi la partecipazione è al **5° percentile** della propria storia in contratti
e al **massimo dell'intera serie** in capitale impegnato: 3,6 volte il gennaio
2017, quando i contratti erano *di più*. La frase «mercato strutturalmente più
sottile» descrive una cosa che non sta succedendo.

**Terzo problema: nei dati non si vede.** Escursione media giornaliera nella
settimana successiva alla pubblicazione, per quintile di open interest, su
tutte le 503 settimane della serie:

| quintile OI | ORO | WTI |
|---|---|---|
| 1 (più basso) | 1,372% | 3,561% |
| 2 | 1,108% | 3,280% |
| 3 | 1,245% | **4,255%** |
| 4 | 1,148% | 3,767% |
| 5 (più alto) | **1,339%** | 3,530% |

Se la frase fosse vera la colonna scenderebbe dall'alto in basso. Sull'oro il
quintile più basso (1,372%) e quello più alto (1,339%) sono **praticamente
identici**, e i più tranquilli sono quelli di mezzo. Sul WTI le settimane più
ampie seguono la partecipazione **mediana**, e il quintile più sottile (3,561%)
è indistinguibile da quello più affollato (3,530%).

Questo non è un test pre-registrato e non lo presento come tale — è un
conteggio descrittivo su tutto il campione, senza suddivisione design/holdout
né controllo di significatività. Ma per una frase che si dichiara *conseguenza
della definizione* basta e avanza: non è una conseguenza, e non è nemmeno una
regolarità visibile.

### 2.2 «Esposizione netta ai minimi → pende dal lato corto» — falsa quasi sempre

> Managed Money netto (MOLTO BASSO): *«la struttura delle posizioni in essere
> **pende dal lato corto**, e le eventuali chiusure di quelle posizioni passano
> per acquisti.»*

MOLTO BASSO significa «sotto il 10° percentile della propria storia». Non
significa negativo. Il decimo percentile di `mm_net`:

| | 10° percentile | minimo storico | settimane davvero nette corte |
|---|---|---|---|
| ORO | **+15.253** | −109.454 | 42 su 503 |
| WTI | **+78.341** | −38.154 | **8 su 503** |

Sul WTI, uno strumento in banda MOLTO BASSO è **net long di decine di migliaia
di contratti** in 495 casi su 503. La frase descrive una posizione netta corta;
la banda descrive un percentile basso. Sono due cose diverse, e la seconda non
implica la prima.

### 2.3 «Poche scommesse lunghe in essere» — è a schermo adesso, e non si può dire

> Managed Money netto (BASSO), WTI, **oggi**: *«poche scommesse lunghe in
> essere rispetto alla storia, quindi meno posizioni lunghe da liquidare di
> quante questo mercato ne abbia di solito.»*

Il valore accanto è **+87.479 contratti netti lunghi**. `mm_net` è
long − short: un netto basso può venire da pochi lunghi **oppure** da molti
corti, e i due casi hanno conseguenze meccaniche opposte. Quale dei due sia
non lo sappiamo — `CotWeek` salva `openInterest`, `mmNet` e `prodNet`, e i
lordi non ci sono. La frase afferma qualcosa che **i nostri dati non
contengono**.

Vale per tutte e cinque le frasi di `mm_net`: parlano di «scommesse lunghe in
essere» e di «cosa c'è da liquidare» partendo da un saldo netto.

### 2.4 «Ai massimi → più da liquidare che da aggiungere» — è H3

> Managed Money netto (MOLTO ALTO): *«lo sbilancio delle posizioni in essere è
> tutto dal lato lungo — **per definizione, su quel lato c'è più da liquidare
> che da aggiungere**.»*

La prima metà è vera per definizione: la quantità liquidabile *è* la posizione.
La seconda no. «Più da liquidare che da aggiungere» presuppone un tetto alla
posizione, e il 90° percentile storico non è un tetto — è il 90° percentile.

È l'intuizione contrarian, cioè **esattamente H3** della pre-registrazione:

> «H3 — Terziaria: il contrarian classico. Sopra il 90° percentile →
> rendimento forward negativo entro 4 settimane. **Prior basso: mi aspetto che
> fallisca.** La testo perché è l'ipotesi che tutti citano, e un fallimento
> documentato ha valore.»

Fallì, come previsto. E poi rientrò in pagina come definizione.

### 2.5 Le frasi che invece sono corrette

Per equilibrio: **«le eventuali chiusure di posizioni lunghe passano per
vendite»** e la sua simmetrica sono vere per definizione. Chiudere un lungo è
una vendita. Sono la parte buona del blocco, e sono anche l'unica che
sopravvive.

---

## 3. La regola non negoziabile n° 4, letta oggi

La pre-registrazione chiudeva così:

> «Se nulla passa: il posizionamento COT può comunque entrare nel Macro Desk
> come **fatto descrittivo** ("Managed Money al 93° percentile della propria
> storia"), **mai** accompagnato da probabilità condizionate non dimostrate.»

Il test è fallito **0 criteri su 3**. La sezione ha obbedito alla lettera: a
schermo non c'è una sola percentuale di successo, e un test sul markup vieta
le parole «hit rate», «probabilit», «affidabilit», «prevision», «edge»,
«segnale».

Ma il divieto è **sul vocabolario, non sul contenuto**. Le implicazioni
meccaniche dicono in prosa quello che le probabilità avrebbero detto in cifre,
e lo dicono in una forma che nessuno può falsificare: senza un numero non c'è
niente da verificare. **Una probabilità sbagliata è meglio di una prosa non
verificabile**, perché almeno invita al controllo.

Il verdetto «descrittivo, non predittivo» era ed è quello giusto. Non è stato
fatto rispettare fino in fondo.

---

## 4. È materiale da discrezionale o da gestore?

### Il problema di cadenza

La CFTC **fotografa il martedì** e **pubblica il venerdì alle 15:30 ET**. Il
dato più fresco che questa sezione possa mai mostrare ha **3 giorni**; oggi,
giovedì, ne ha **9** (riferimento 18/08, pagina del 27/08), ed è il ciclo
normale, non un ritardo.

Per un intraday è irrilevante per costruzione: nessuna decisione delle 7 del
mattino cambia per un saldo di nove giorni fa. Per uno swing su qualche giorno
è una fotografia in ritardo che sarà **sostituita prima che l'operazione
chiuda**.

È la stessa informazione che a un gestore serve eccome — chi tiene una
posizione per trimestri ha tutto il tempo di vedere il posizionamento
riassorbirsi, e per lui nove giorni sono niente. La sezione non è sbagliata:
è **tarata su un altro orizzonte**.

### Il problema di proporzione

Oggi la sezione occupa una scheda di primo livello con quattro carte, due
riquadri di implicazione e un piè di pagina, per **due numeri per strumento
che cambiano una volta a settimana e non predicono nulla**. È il rapporto
spazio/decisione più sbilanciato del desk.

### Quello che invece vale, e che va tenuto

Il COT è **l'unica misura del desk che dice chi tiene il mercato**, non quanto
si muove. Tutte le altre — escursione, movimento, implicita, realizzata, curva
a termine — descrivono l'ampiezza. Questa descrive la struttura, e gli estremi
sono genuinamente rari e genuinamente informativi: l'oro al 5° percentile di
partecipazione dal 2017 è un fatto che vale la pena sapere, quali che siano le
sue conseguenze.

Ma per saperlo basta **una riga**.

---

## 5. Raccomandazione

Nessuna modifica è stata fatta. In ordine di importanza:

1. **Togliere o riscrivere il riquadro «Implicazione meccanica».** Due delle
   sei frasi a schermo sono false, e delle quattro non definizionali due sono
   ipotesi già bocciate. Se resta, l'etichetta «discende dalla definizione
   della metrica» va tolta, perché non è vero. La versione onesta e completa di
   quel riquadro è: *chiudere un lungo è una vendita, chiudere un corto è un
   acquisto* — e finisce lì.
2. **Non parlare più di lunghi e corti partendo da un netto.** Finché
   `CotWeek` salva solo i saldi, le frasi possono dire «esposizione netta», mai
   «scommesse lunghe in essere». (Se i lordi servono, l'API Socrata li
   pubblica: sono due colonne in più nel job.)
3. **Ridurre la sezione a una riga per strumento.** Banda, valore, variazione
   a 4 settimane, con la data. È già così nelle nuove schede della Sintesi, e
   lì la riga ha un contesto — sta accanto alle misure di ampiezza, che è
   dove serve.
4. **Decidere che cosa resta della scheda di primo livello.** Le carte con la
   barra di posizione, la rarità e l'«ultima volta a questi livelli» sono ben
   fatte e vale la pena consultarle ogni tanto: la domanda è se meritino un
   posto nella navigazione principale accanto a Volatilità e Driver, o una
   pagina di archivio.

**La scelta è dell'utente.** Il punto 1 è quello che segnalo come difetto
vero: oggi la pagina dice al lettore due cose sbagliate, e le dice con
l'autorevolezza di chi le presenta come definizioni.

---

## Query di verifica

```sql
-- percentili leq, bande e delta a 4 settimane
WITH last AS (
  SELECT instrument, "mmNet" cur, "openInterest" oicur FROM "CotWeek" w
  WHERE "reportDate" = (SELECT max("reportDate") FROM "CotWeek" WHERE instrument = w.instrument)
)
SELECT c.instrument, l.cur, l.oicur,
  round(100.0*count(*) FILTER (WHERE c."mmNet" <= l.cur)/count(*), 1) mm_pct,
  round(100.0*count(*) FILTER (WHERE c."openInterest" <= l.oicur)/count(*), 1) oi_pct,
  count(*) n
FROM "CotWeek" c JOIN last l ON l.instrument = c.instrument
GROUP BY c.instrument, l.cur, l.oicur;

-- il 10° percentile di mm_net è POSITIVO su entrambi gli strumenti
SELECT instrument,
  percentile_cont(0.10) WITHIN GROUP (ORDER BY "mmNet") p10,
  min("mmNet") minimo,
  count(*) FILTER (WHERE "mmNet" < 0) nette_corte, count(*) tot
FROM "CotWeek" GROUP BY instrument;

-- escursione della settimana successiva, per quintile di open interest
WITH w AS (
  SELECT instrument, "reportDate", "openInterest",
         ntile(5) OVER (PARTITION BY instrument ORDER BY "openInterest") q
  FROM "CotWeek"
), succ AS (
  SELECT w.instrument, w.q, avg(((b.high-b.low)/b.close)::numeric) tr
  FROM w JOIN "SeasonalityDailyBar" b
    ON b.instrument = (CASE WHEN w.instrument='GOLD' THEN 'XAUUSD' ELSE 'WTIFUT' END)::"SeasonalityInstrument"
   AND b.date > w."reportDate" + 3 AND b.date <= w."reportDate" + 10
   AND b.high IS NOT NULL
  GROUP BY w.instrument, w.q, w."reportDate"
)
SELECT instrument, q, round((100*avg(tr))::numeric, 3) escursione_pct, count(*) settimane
FROM succ GROUP BY instrument, q ORDER BY instrument, q;
```

Fonti in codice: `src/lib/cot-metrics.ts` (formule congelate),
`src/lib/cot-contesto.ts` (`IMPLICAZIONI_MECCANICHE`),
`src/components/macro-desk/cot-panel.tsx` (resa),
`dati/PRE_REG_cot_posizionamento.md` (pre-registrazione).
