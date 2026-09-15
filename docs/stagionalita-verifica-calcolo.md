# Stagionalità — verifica del calcolo attuale (fase 2)

15/09/2026 · solo analisi, nessuna modifica al codice. Codice verificato:
`stagionalita-pre-rifacimento` (`40934a0`). Dati: produzione dopo il job delle
04:21 UTC del 15/09/2026, copiati in locale in sola lettura. Stato di partenza:
[`stagionalita-stato-precedente.md`](stagionalita-stato-precedente.md).

## Esito in una riga

**Per i quattro strumenti di prezzo la pipeline è quella giusta** — prezzi →
rendimenti log giornalieri → cumulata per anno → media fra gli anni — **non** la
media dei prezzi. **Per i tre indici di volatilità (VIX, GVZ, OVX) la curva è
invece la media dei livelli**, cioè proprio la pipeline «prezzi → media dei
prezzi → grafico», scelta a suo tempo di proposito. Accanto, tre difetti reali
che cambiano i numeri: il bisestile disallinea i giorni, le barre della
domenica dell'oro spostano rendimenti fuori dalla tabella per giorno e dentro
il mese sbagliato, e la banda di dispersione è calcolata ma non disegnata.

## 1. La pipeline, con file e riga

| Passo | Strumenti di prezzo | Indici di volatilità |
|---|---|---|
| 1 | `series.ts:147-156` `dailyLogReturns`: `ln(P_t/P_{t-1})` su sedute consecutive | nessun rendimento |
| 2 | `series.ts:346-377` `cumulativePathsByYear`: per ogni anno, somma dei rendimenti dal 1° gennaio sul **giorno dell'anno di calendario** (1-366), valore riportato nei giorni chiusi | `series.ts:384-412` `levelPathsByYear`: il **livello** di chiusura per giorno dell'anno, riportato nei giorni chiusi |
| 3 | `precompute.ts:607-611` sceglie il percorso, `precompute.ts:401-420` (`pathRows`) fa per ogni giorno **media**, mediana, p25, p75 fra gli anni | idem, sui livelli |
| 4 | salvataggio `job.ts:464-481` in `SeasonalityPathPoint.meanCum` | idem |
| 5 | `page.tsx:365-371`: in pagina `(e^meanCum − 1)·100`, asse in `%` (`path-chart.tsx:237-239`) | in pagina il livello, asse senza unità |

L'ordine «cumula per anno, poi media fra gli anni» e «media dei rendimenti per
giorno, poi cumula» coincidono quando ogni anno della finestra contribuisce a
ogni giorno — ed è il caso qui, perché il cumulato vale 0 prima della prima
seduta e si riporta dopo l'ultima. La prova sotto lo misura.

## 2. La prova numerica

Script `verifica-calcolo.ts` (sonda locale, sola lettura). Per ogni strumento e
finestra:

- **A** ricalcola con il codice dell'app (`precomputeDaily`) dalle barre in
  archivio e confronta con i punti salvati;
- **B** costruisce la media dei PREZZI per giorno dell'anno, riportata in log
  rispetto al primo giorno, e misura lo scarto dai punti salvati;
- **C** costruisce «media dei rendimenti giornalieri per giorno → cumulata» e
  misura lo scarto da A.

| Strumento | Finestra | A · salvato − codice | B · salvato − media dei prezzi | C · cumulata della media − media delle cumulate |
|---|---:|---:|---:|---:|
| Oro | 20 | 5,0·10⁻⁹ | **0,192** | 1,1·10⁻¹⁶ |
| Oro | 10 | 5,0·10⁻⁹ | **0,179** | 1,8·10⁻¹⁶ |
| Oro | 2 | 5,0·10⁻⁹ | **0,279** | 2,8·10⁻¹⁶ |
| WTI | 20 | 5,0·10⁻⁹ | **0,321** | 9,0·10⁻¹⁷ |
| WTI | 10 | 5,0·10⁻⁹ | **0,233** | 2,6·10⁻¹⁶ |
| WTI | 2 | 5,0·10⁻⁹ | **0,190** | 1,5·10⁻¹⁶ |
| GER40 | 20 | 5,0·10⁻⁹ | **0,130** | 6,9·10⁻¹⁷ |
| GER40 | 10 | 5,0·10⁻⁹ | **0,126** | 6,9·10⁻¹⁷ |
| GER40 | 2 | 5,0·10⁻⁹ | **0,164** | 2,5·10⁻¹⁶ |
| S&P 500 | 20 | 5,0·10⁻⁹ | **0,224** | 4,2·10⁻¹⁷ |
| S&P 500 | 10 | 5,0·10⁻⁹ | **0,316** | 9,7·10⁻¹⁷ |
| S&P 500 | 2 | 5,0·10⁻⁹ | **0,120** | 1,4·10⁻¹⁶ |

Lettura:
- **A ≈ 5·10⁻⁹** è l'arrotondamento a 8 decimali del `Decimal(18,8)`: i punti in
  pagina escono esattamente da quel codice.
- **B da 0,12 a 0,32** in unità log (12-38 punti percentuali): i punti salvati
  NON sono la media dei prezzi.
- **C a livello di 10⁻¹⁶** (errore di macchina): la pipeline dell'app è
  matematicamente la stessa di «media dei rendimenti per giorno → cumulata».

Indici di volatilità: A vale 2·10⁻⁹ o meno (VIX, GVZ, OVX), cioè i punti salvati
sono il livello medio per giorno dell'anno di `levelPathsByYear`. Confrontati
con la media semplice delle chiusure dello stesso giorno, lo scarto relativo
mediano è 4-5%: la differenza è il riporto del venerdì sui giorni chiusi, non
un'altra formula.

## 3. I difetti che la verifica ha trovato

### 3.1 Il bisestile disallinea il calendario

Il percorso è indicizzato sul giorno dell'anno di calendario. Negli anni
bisestili dal 1° marzo in poi ogni data sta un giorno più avanti: il 21 aprile è
il giorno 111 nel 2019 e il 112 nel 2020. Si mediano quindi, per un quarto
degli anni, giorni diversi. Misurato sulla finestra 20 anni (2006-2025),
confrontando con un calendario non bisestile (29/2 fuso nel 28/2):

| Strumento | Scarto massimo | Dove | Fine anno, calendario → allineato |
|---|---:|---|---|
| Oro | 0,56 punti log % | giorno 223 | 10,50 → 10,63 |
| WTI | **3,51** punti log % | giorno 111 (aprile 2020) | −1,12 → −0,32 |
| GER40 | 0,57 | giorno 328 | 7,55 → 7,55 |
| S&P 500 | 0,61 | giorno 75 | 8,34 → 8,51 |

Il fine anno cambia perché il giorno 365 di un bisestile è il 30 dicembre: il
31 dicembre di quegli anni finiva nel giorno 366, che il grafico non raggiunge.

### 3.2 Le barre della domenica dell'oro

Dukascopy pubblica una barra per le poche ore di apertura della domenica: 1.034
nella finestra 2006-2025 (~52 l'anno; già registrato in
`docs/DEBITO-TECNICO.md`, «La serie giornaliera dell'oro contiene barre della
DOMENICA»). Effetti misurati:

- **tabella per giorno della settimana:** i 1.034 rendimenti venerdì→domenica
  finiscono in un giorno che la tabella (lun-ven) scarta. La loro somma vale
  **71,45 punti log %**. Il lunedì medio passa da **−0,042%** (domenica→lunedì,
  oggi in pagina) a **+0,026%** (venerdì→lunedì): **cambia segno**;
- **mesi:** quando il mese finisce di domenica, la chiusura del mese è quella
  della sessione domenicale. 62 rendimenti mensili su 240 cambiano, fino a
  **1,37 punti** (novembre 2014);
- **percorso annuale:** nessun effetto sul cumulato dei giorni feriali (la somma
  si compensa), solo la distribuzione fra sabato-domenica e lunedì.

Gli altri strumenti non hanno barre di weekend (0 in archivio).

### 3.3 La banda c'è ma non si vede

`pathRows` salva p25 e p75 fra gli anni per ogni giorno
(`precompute.ts:414-417`), ma la pagina legge solo `meanCum`
(`page.tsx:369`) e il grafico disegna una linea sola per finestra. La nota sotto
il grafico lo ammette: «la dispersione attorno … sta nelle tabelle».

### 3.4 Minori

- La vista a percentuale mostra `e^(media dei log cumulati) − 1`: è la media
  geometrica, corretta, ma non è un indice e non ha una base dichiarata.
- Le finestre più lunghe della storia restano selezionabili con «!» (GVZ e OVX
  a 20 anni): la curva a 20 anni di GVZ poggia su 9-18 anni a seconda del giorno
  (`n` minimo 9, massimo 18, v. inventario).

## 4. Che cosa c'è davvero in archivio

Sola lettura su produzione, 15/09/2026. Granularità: **giornaliera** (una barra
per seduta) per tutti; nessuno strumento ha dati mensili nativi. «Anni completi»
= anni solari chiusi con dati da gennaio a dicembre, fino al 2025.

| Strumento | Tipo | Dal | Anni completi | Chiusura | Massimo e minimo della barra | Finestre possibili per l'indice |
|---|---|---|---:|---|---|---|
| Oro XAU/USD | prezzo | 03/06/1999 | 26 (2000-2025) | sì | **sì** · completi dal 2003, parziali 2000-2002 (195/247, 232/252, 240/262) | 2 · 5 · 10 · 15 · 20 |
| Petrolio WTI (spot Cushing) | prezzo | 02/01/1986 | 40 | sì | **no, mai** (FRED pubblica solo la chiusura) | 2 · 5 · 10 · 15 · 20 |
| GER40 (DAX cash) | prezzo | 30/12/1987 | 38 | sì | **sì**, tutte le sedute | 2 · 5 · 10 · 15 · 20 |
| S&P 500 (cash) | prezzo | 02/01/1970 | 56 | sì | **sì**, tutte le sedute | 2 · 5 · 10 · 15 · 20 |
| VIX | livello | 02/01/1990 | 36 | sì | sì (47 sedute 1992-2006 senza) | 2 · 5 · 10 · 15 · 20 |
| GVZ | livello | 03/06/2008 | 17 (2009-2025) | sì | no | 2 · 5 · 10 · 15 — **20 no** |
| OVX | livello | 10/05/2007 | 18 (2008-2025) | sì | no | 2 · 5 · 10 · 15 — **20 no** |
| VDAX | livello | — | 0 | — | — | nessuna (nessuna fonte) |

Barre orarie (solo chiusura, H1): oro dal 2003, WTI CFD dal 2011, S&P CFD dal
2011, DAX CFD dal 2013. Nessun massimo/minimo orario.

## 5. Che cosa rende fattibile, e che cosa no

| Richiesta della fase 3 | Fattibile? | Su quali strumenti |
|---|---|---|
| Indice stagionale da rendimenti giornalieri, finestre 2-20 anni | **sì** | tutti; GVZ e OVX senza 20 anni |
| Banda Q1-Q3 fra gli anni | **sì** (serve un percorso per anno: c'è) | tutti |
| Media, mediana, σ, migliore e peggiore anno per periodo, in % | **sì** | tutti (livelli per gli indici di volatilità) |
| Frequenze come conteggio | **sì** (`n` e quota sono già salvati) | tutti |
| MAE/MFE di periodo dalla barra | **sì** | oro, GER40, S&P 500 |
| MAE/MFE di periodo | **no** | **WTI**: l'archivio non ha massimo e minimo. Servirebbe l'OHLC dello spot Cushing (EIA e FRED pubblicano solo la chiusura) oppure passare al future front-month (CL, già raccolto con OHLC dal 2000, ma è un altro strumento: sulle sedute comuni i rendimenti correlano 0,9376) |
| MAE/MFE di sessione e ora | **no** | tutti: le barre orarie hanno solo la chiusura |
| MAE/MFE sugli indici di volatilità | non si applica | un'escursione percentuale su un livello di volatilità non è un rischio di posizione; per GVZ e OVX mancherebbe comunque il dato |

## 6. Cosa si porta nella fase 3

1. Calendario **non bisestile** (365 giorni, 29/2 fuso nel 28/2) per il percorso.
2. **Solo sedute feriali**: la barra di sabato/domenica dell'oro si fonde nel
   lunedì successivo (massimo e minimo compresi) invece di restare una seduta a
   sé. Le barre in archivio non si toccano: le usa anche la Volatilità.
3. Anche per VIX, GVZ e OVX l'indice nasce dalle variazioni log giornaliere, non
   dalla media dei livelli; le loro tabelle restano in livelli.
4. Banda Q1-Q3 disegnata; finestre senza anni sufficienti omesse e dichiarate.
