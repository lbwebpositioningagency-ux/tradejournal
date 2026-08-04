# SPEC Driver Desk v1.1 — addendum del Round 2 (grafico, pulizia, legenda)

Integra `SPEC_driver_desk_v1.0.md`, che resta congelata: qui c'è **solo il
delta** del secondo giro di design (2026-08-04). Dove i due documenti si
contraddicono, per le parti toccate vale questo.

## 1 · Cosa sostituisce cosa

| v1.0 | v1.1 |
|---|---|
| Blocco A — forza nel paniere, in blocchi testuali con z-score e percentili | **Grafico di forza relativa**, una linea per componente |
| Blocco B — contesto driver, un riquadro per driver | assorbito nello **stesso grafico**: i driver sono linee come gli altri |
| Blocco C — stabilità della relazione | **invariato**, in linguaggio piano, sotto il grafico |
| Componente assente dichiarato a schermo con il motivo | **nessuna dichiarazione**: chi non c'è non compare |

Il motore v1.0 (z-score, percentili, forza relativa, correlazioni rolling)
resta nel codice e resta testato: le correlazioni del Blocco C lo usano. Le
funzioni della forza relativa a 20/60 sedute non alimentano più la UI.

## 2 · L'indice del grafico (formula congelata)

Per ogni componente di una scheda — lo strumento, ogni membro del paniere,
ogni driver, spread derivato incluso:

1. variazione giornaliera sul calendario della scheda, con la trasformazione
   già stabilita in v1.0 §3.0 (rendimento log per i prezzi, differenza prima
   per tassi e spread);
2. **divisione per la deviazione standard storica** della stessa serie, σ
   stimata su **tutta la storia comune** della scheda (non sulla sola finestra
   mostrata): è la volatilità abituale della serie a fare da unità di misura;
3. **somma progressiva** dal primo giorno della finestra, che parte da 0.

`indice_t = indice_{t−1} + variazione_t / σ_storica`, con `indice_inizio = 0`.

**La media NON viene sottratta.** La normalizzazione richiesta è per la sola
deviazione standard; togliere anche la deriva storica trasformerebbe ogni
linea nel residuo rispetto al proprio trend di lungo periodo — un oggetto
diverso, più difficile da spiegare in linguaggio piano e capace di ribaltare
l'ordine visivo delle linee. Restare sulla scala grezza è la scelta
conservativa. Un test lo blocca esplicitamente (`la media NON viene
sottratta`).

Vincoli invariati:

- **niente compositi**: le linee restano serie separate, non si sommano mai
  fra loro in un unico indicatore;
- **nessun segno invertito**: ogni driver è disegnato nella sua direzione
  naturale. Invertirlo per farlo sembrare allineato allo strumento
  significherebbe assumere la relazione invece di misurarla — esattamente ciò
  che il Blocco C esiste per evitare. Il significato di «in salita» vive nel
  catalogo (`risingMeans`) ed è pubblicato nella legenda della pagina;
- **finestra fissa**: ultimi 12 mesi civili, nessun selettore.

Una linea si disegna solo se σ è definita e positiva; un grafico si disegna
solo con almeno 20 punti nella finestra. In caso contrario l'elemento manca e
basta.

## 3 · Palette

Riusata la palette categorica già in casa (`--md-w20/15/10/5/2`, derivata da
Okabe-Ito, leggibile con deuteranopia e protanopia), più `--md-cross` come
sesto colore. **Nessun verde, nessun rosso**: restano riservati al P&L.

Lo strumento della scheda non consuma uno slot: è la linea di **riferimento**,
disegnata con il colore neutro del testo e tratto più spesso.

## 4 · Assenze

Regola unica in tutto il modulo: **un componente che non c'è non viene
nominato**. Nessun banner, nessuna riga vuota, nessun posto riservato. Vale
sia per le esclusioni di progetto (il rame nel paniere dell'oro) sia per un
buco temporaneo di una fonte. La motivazione delle esclusioni vive nel
commento del catalogo e nel rapporto, non in pagina.

Anche una scheda che non si può comporre semplicemente non compare; l'errore
resta nel payload per i log del server.

**Unica eccezione, deliberata**: se l'intera tabella è vuota (ingest mai
eseguito su quell'ambiente) il tab lo dice in una riga. Non è l'assenza di un
componente, è l'assenza del modulo: senza quella riga il tab sarebbe una
pagina bianca senza spiegazione.

## 5 · Legenda della pagina

Blocco `<details open>` sopra le schede — richiudibile, aperto di default,
senza JavaScript. Copre: cos'è la pagina (e cosa non è), come si legge il
grafico, cosa significa «in salita» per ciascun driver realmente presente, e a
cosa serve il blocco di stabilità sotto il grafico. Le righe dei driver sono
generate dai dati: se un driver non c'è, la sua riga non compare.
