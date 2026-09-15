# Stagionalità — correzioni dopo la revisione del 15/09/2026

Sei interventi chiesti dall'utente sul rifacimento (fasi 1-5, ultimo commit `130f8bf`). Decisioni
visive nella tavola di Claude Design «Sistema visivo v3 - Stagionalità e grafico con banda», giro 3
(3a + 3c-i + 3d + 3e + 3f). Il motore dell'indice a base 100 non è cambiato.

## 1 · Ampiezza massimo-minimo

`src/lib/seasonality/ampiezza.ts`: per ogni mese, settimana ISO e seduta,
`(massimo del periodo − minimo del periodo) / apertura del periodo`, solo dai massimi e minimi delle
barre (un periodo con una barra senza OHLC non produce osservazione). Media sulla finestra
selezionata, sulle occorrenze (per il giorno: i singoli martedì). Righe `scope` `AMPIEZZA` /
`AMPIEZZA:Mxx` in `SeasonalityStat`, al posto di MAE/MFE: nessuna migrazione.

Base normalizzata: l'apertura del periodo, come chiesto. `ln(max/min)` è simmetrica ma non si legge
come percento del prezzo (e sui range di una seduta o di una settimana le due differiscono di pochi
centesimi di punto); la chiusura del periodo precedente mescolerebbe al range il salto d'apertura.

| Dove | Calcolabile | Perché |
|---|---|---|
| Oro, DAX, S&P — mese, settimana, giorno | sì | barre giornaliere con OHLC |
| WTI — mese, settimana, giorno | **no** | l'archivio FRED DCOILWTICO ha solo la chiusura (v. punto 1-bis) |
| Tutti — sessione e ora | **no** | le barre orarie in archivio hanno solo la chiusura |
| VIX, GVZ, OVX | colonna assente | il livello è già una misura di volatilità, e le tabelle sono in livelli |

Dove non si calcola, la colonna resta e una cella sola alta quanto la tabella dice perché (3c-i).
Oro, 20 anni: settembre 8,65%, settimana 38 4,10%, martedì 1,54%.

## 1-bis · WTI da Dukascopy: verifica, e sostituzione NON fatta

Sonda `.sonde/wti-dukascopy.ts` (rete verso Dukascopy, archivio FRED locale in sola lettura).

- **Simbolo:** `lightcmdusd` (LIGHT.CMD/USD), lo stesso già usato per l'intraday; con lo stesso
  codice di `xauusd` risponde.
- **Storia:** 2007-01-02 → 2026-09-14, 5.231 barre (711 di sabato/domenica), **4.521 sedute
  feriali**, 4.509 con OHLC. Mancano **tutto il 2008, tutto il 2010, marzo e aprile 2013** — gli
  stessi mesi con una richiesta unica e con richieste anno per anno: è l'archivio, non un download a
  metà. Anni completi: 2012, 2014-2025. Finestre possibili: **10, 5 e 2 anni** (non solo il 20:
  anche il 15). FRED: 10.240 barre dal 1986-01-02, tutte e cinque le finestre.
- **Divergenza sul periodo comune 2006-2025:**
  - giornaliero, 4.196 sedute: correlazione 0,7733, scarto medio 0,71 punti log%, stesso segno
    88,3%; il buco del 2008 produce un rendimento di −51,6% il 02/01/2009;
  - mensile, 198 mesi: correlazione 0,9952, scarto medio 0,73 punti, stesso segno 195/198;
  - tabella per mese, 10 anni: stesso segno 11/12, scarto medio 0,31 punti; 5 anni: 11/12, 0,43;
  - tabella per giorno, 10 anni: stesso segno 4/5, scarto medio 0,075 punti — **il lunedì cambia
    segno** (+0,005% Dukascopy, −0,137% FRED);
  - settimana ISO, 10 anni: stesso segno 48/53, scarto medio 0,39 punti.

Sui mesi le due serie dicono la stessa cosa; sul giorno della settimana no, e la storia si accorcia
a 13 anni con due anni interi mancanti. Come chiesto, sulla sostituzione non si decide da soli: il
WTI resta su FRED, l'ampiezza per il WTI dichiara perché non c'è. Se si sostituisce, tutti i numeri
storici del WTI della pagina cambiano, spariscono le finestre da 20 e 15 anni, e va gestito il
passaggio d'archivio: il job **unisce** le barre in archivio con quelle nuove (`unisciBarre`), quindi
cambiare fonte senza svuotare prima la serie mescolerebbe FRED e Dukascopy, e la guardia
«la serie si accorcerebbe» rifiuterebbe la scrittura (10.240 → 4.521 barre).

## 2 · Frequenze contate sull'unità della riga

**Era un errore di calcolo, non solo di etichetta.** Per giorno, sessione e ora la quota «in rialzo»
era calcolata sulle unità statistiche, cioè sulle medie annue: la quota di ANNI in cui il martedì
medio (la sessione media, l'ora media) era salito. Il campione accanto contava invece le occorrenze.
Ora la quota si conta sulle occorrenze: martedì saliti, sessioni salite (somma dei rendimenti orari
della sessione in quel giorno), ore salite. Per mese e settimana osservazione e unità coincidevano:
i numeri non cambiano, cambia l'etichetta («mesi», «settimane»).

Oro, finestra 20 anni, prima → dopo:

| Riga | Prima | Dopo |
|---|---|---|
| Giorno · martedì | 12 anni su 20 (60%) | **559 martedì su 1.044 (54%)** |
| Sessione · Londra | 9 anni su 20 (45%) | **2.496 sessioni su 5.135 (49%)** |
| Ora · 15 (Roma) | 4 anni su 20 (20%) | **2.528 ore su 5.135 (49%)** |
| Mese · settembre | 8 anni su 20 (40%) | 8 mesi su 20 (40%) |
| Settimana · 38 | 14 anni su 20 (70%) | 14 settimane su 20 (70%) |

Viste ricontate: tabella per bucket (5 viste), riepilogo in testa (3 righe), riga di sintesi della
griglia (l'etichetta dichiara l'unità: «In rialzo · giorni»). «Dentro» la banda media ± 1σ resta sugli
anni e lo scrive: la banda è la dispersione fra gli anni. Per i livelli di volatilità «sopra
mediana» si conta sulle osservazioni rispetto alla mediana delle osservazioni della finestra.

**Transizione:** fino al primo giro notturno l'archivio di produzione ha la quota del calcolo
precedente. La pagina confronta `SeasonalityCoverage.computedAt` e `SeasonalityJobState.hourComputedAt`
con `FREQUENZE_PER_OCCORRENZA_DAL` e, prima, scrive «in ricalcolo» invece di un conteggio falso.

## 3 · Grafico senza banda e senza lisciatura

Via la fascia 1°-3° quartile, la media mobile centrata a 5 giorni, la traccia grezza sotto e la frase
che le spiegava; la nota di calcolo dice «un punto per giorno, senza lisciatura». Via
`mediaMobileCentrata` e il calcolo dei quartili in `percorsoIndice`. Le colonne `p25Cum`/`p75Cum` di
`SeasonalityPathPoint` sono NOT NULL: ripetono `meanCum` finché una migrazione non le toglie.

## 4 · Via MAE e MFE

Via `escursioni.ts`, le righe MAE/MFE del precalcolo, la lettura e le colonne. Le righe vecchie in
produzione spariscono al primo giro (il job cancella tutte le righe di calendario dello strumento).

## 5 · Via il grafico degli andamenti orari

Via `hour-path-chart.tsx`, la lettura `getQuarterPaths` e — perché il grafico era il suo unico
lettore — la fase M15 del job (`quarter-ingest.ts`, `quarter.ts`, lo scarico M15 di Dukascopy): ~40 s
a notte in meno. La tabella `SeasonalityQuarterYear` resta, non più aggiornata.

**Cosa resta nella vista Ora:** i controlli (profondità e orologio Roma/UTC), la griglia anni × ora
con le righe di sintesi e la tabella per ora su tutte le finestre, entrambe sulle barre H1. La vista
risponde ancora alla sua domanda — a che ora il prezzo si muove — quindi resta.

## Verifica

Build locale (`next start` dal worktree, BUILD_ID controllato), archivio locale ricalcolato col codice
nuovo. Schermate in `docs/stagionalita/correzioni/`: oro mese, giorno, sessione, ora e WTI, a 1440 e
390, nei due temi; in `transizione/` lo stato «in ricalcolo» prima del giro notturno. Misure DOM e
SVG: 0 testi sotto 11px, 0 sotto 4,5:1, solo Geist, nessuna pagina più larga del viewport, 0 errori
in console. Trovata e corretta nel giro una sovrapposizione già esistente a 390: il sottotitolo della
griglia («variazione %, media delle osservazioni di quell'anno») finiva sopra il titolo; ora va a
capo sotto 640px. Gate: typecheck, lint (0 errori), 2.139 test, build verdi.
