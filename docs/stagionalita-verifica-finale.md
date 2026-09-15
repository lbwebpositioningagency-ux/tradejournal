# Stagionalità — verifica finale del rifacimento (fase 5)

15/09/2026. Stato di partenza: [`stagionalita-stato-precedente.md`](stagionalita-stato-precedente.md)
(tag `stagionalita-pre-rifacimento`). Verifica del calcolo vecchio:
[`stagionalita-verifica-calcolo.md`](stagionalita-verifica-calcolo.md). Fasi pubblicate:
`6867f21` (1), `554693a` (2), `6d1597d` (3), `ca626c1` (4), questa (5).

Numeri «prima» = produzione dopo il job delle 04:21 UTC del 15/09/2026, letti in sola lettura
(la produzione ha ancora il calcolo vecchio fino al job notturno successivo). Numeri «dopo» =
motore nuovo ricalcolato in locale sulle **stesse barre**. Le differenze vengono quindi solo
dal calcolo, non dai dati.

## 1. Che cosa è cambiato nei numeri, e perché

### 1.1 Curve degli strumenti di prezzo

Confronto sulla stessa unità: vecchio `(e^cumulata − 1)·100` in %, nuovo `indice − 100`.
Scarto massimo sui tredici punti di inizio mese e fine anno. Dati completi in
[`rifacimento/fase5/confronto-curve.txt`](stagionalita/rifacimento/fase5/confronto-curve.txt).

| Serie | Fine anno prima | Fine anno dopo | Scarto massimo |
|---|---:|---:|---:|
| Oro 20 anni | 11,07% | 11,21% | 0,21 punti |
| Oro 2 anni | 44,21% | 44,70% | 0,97 |
| WTI 20 anni | −1,12% | −0,32% | 0,80 |
| WTI 2 anni | −11,19% | −10,75% | 1,66 |
| GER40 20 anni | 7,84% | 7,84% | 0,34 |
| GER40 2 anni | 20,91% | 20,91% | 1,32 |
| S&P 500 20 anni | 8,70% | 8,88% | 0,46 |
| S&P 500 2 anni | 20,06% | 19,80% | 0,76 |

**Quale era sbagliata: la vecchia, per due difetti, non per la pipeline.** Il vecchio calcolo
partiva già dai rendimenti (la fase 2 lo ha provato: scarto 10⁻¹⁶ da «media per giorno →
cumulata»). Gli scarti vengono da:

1. **bisestile** — il vecchio percorso indicizzava il giorno di calendario, quindi negli anni
   bisestili ogni data dopo febbraio finiva un giorno più avanti e si mediavano giorni diversi.
   Si vede dove un anno bisestile ha un movimento concentrato in pochi giorni (WTI, aprile 2020).
   Il fine anno cambia anche perché il 31 dicembre dei bisestili cadeva nel giorno 366, che il
   grafico non mostrava; per il GER40, chiuso il 31 dicembre, il fine anno infatti non cambia;
2. **barre di domenica dell'oro** — fuse nel lunedì. Sul percorso sposta il movimento fra
   domenica e lunedì, non il totale.

Il nuovo è quello giusto perché media davvero lo stesso giorno dell'anno in tutti gli anni.

### 1.2 Curve degli indici di volatilità

Qui le due curve **non misurano la stessa cosa**: prima livello medio dell'indice per giorno
dell'anno, ora indice a base 100 costruito dalle variazioni log giornaliere.

| Serie | Prima | Dopo |
|---|---|---|
| VIX 20 anni | livello medio 18,1–22,0; minimo a giugno, massimo a ottobre | indice 95,9–111,2; minimo a giugno, massimo a ottobre |
| VIX 5 anni | minimo a **dicembre**, massimo a febbraio | minimo a **giugno**, massimo a febbraio |
| OVX 15 anni | minimo a giugno, massimo a **marzo** | minimo a giugno, massimo a **novembre** |
| OVX 10 anni | minimo ad agosto, massimo a **marzo** | minimo ad agosto, massimo a **novembre** |
| GVZ 15 anni | minimo a gennaio, massimo a **settembre** | minimo a gennaio, massimo a **ottobre** |
| GVZ e OVX 20 anni | curva disegnata su 9-19 anni a seconda del giorno | **omessa**: 17 e 18 anni completi, dichiarato |

**Quale era sbagliata: la vecchia, per la domanda della pagina.** La media dei livelli è la
pipeline «prezzi → media dei prezzi» che l'incarico esclude, e ha un difetto concreto: gli anni
di volatilità alta pesano più degli altri. Nel 2020 l'OVX a marzo superava 100 contro i 30-40
degli anni normali, e quel solo anno spostava il «massimo stagionale» a marzo. L'indice dalle
variazioni dà a ogni anno lo stesso peso nella forma, e marzo scende sotto novembre. Il livello
tipico, che resta un'informazione utile, non è sparito: sta nelle tabelle, in livelli.

### 1.3 Tabelle (percentuale, non riscalate)

Stesso confronto sulle statistiche di finestra 20 anni, vista grezza:

| Serie | Righe | Medie cambiate | Scarto massimo | Frequenze cambiate |
|---|---:|---:|---|---:|
| Oro · mese | 12 | 12 | agosto +1,557% → +1,490% | 1 |
| Oro · settimana | 53 | 50 | S38 **+0,550% → +0,858%** | 29 |
| Oro · giorno | 5 | 1 | lunedì **−0,042% → +0,026%** | 1 |
| WTI, GER40, S&P · mese, settimana, giorno | 210 | 0 | — | 0 |

- Cambia **solo l'oro**, ed è la fusione delle barre di domenica. Il lunedì prima misurava
  domenica→lunedì e buttava il venerdì→domenica: cambia segno, e gli anni con il lunedì in
  rialzo passano da **5 su 20 a 11 su 20**. Le settimane cambiano di più dei mesi perché la
  domenica sta nella settimana ISO precedente (lunedì-domenica): la riapertura serale veniva
  attribuita alla settimana sbagliata.
- Per WTI, GER40 e S&P le tabelle sono identiche: non hanno barre nel weekend.
- **Colonne nuove**, non confrontabili col prima: migliore e peggiore anno (dalle caselle della
  griglia) e MAE/MFE di periodo (oro, GER40, S&P; il WTI non ha massimo e minimo in archivio).

## 2. Contrasti e taglie

Sonda nel DOM su build locale, nei due temi, a 1440 e 390: tutti i nodi di testo visibili
(contrasto calcolato componendo i colori oklch col canvas) e, con una seconda sonda, **tutti i
testi SVG dei grafici**, che la prima non vedeva. Viste misurate: mese oro, GVZ (finestra da 20
anni omessa), WTI (senza MAE/MFE), giorno con drill su settembre, ora, VIX, settimana, sessione
S&P, «Solo stagionalità», OVX giorno, reindirizzamento `/stagionalita`. 76 misure in
[`rifacimento/fase5/misure.json`](stagionalita/rifacimento/fase5/misure.json).

| | Chiaro | Scuro |
|---|---:|---:|
| Testi sotto 11px (DOM) | 0 | 0 |
| Testi sotto 4,5:1 (DOM) | 0 | 0 |
| Testi SVG sotto 11px | 0 | 0 |
| Testi SVG sotto 4,5:1 | 0 | 0 |
| Pagine più larghe del viewport | 0 | 0 |
| Errori in console | 0 | 0 |
| Famiglie di carattere | Geist | Geist |

**Trovato e corretto in questa fase:** la seconda sonda ha trovato le 25 etichette delle ore del
grafico intraday a **9px** (1440) e **8px** (390), preesistenti e fuori dalla misura della fase
4. Portate a 11px, ruotate sotto i 640px. Prima della correzione la vista Ora aveva 25 testi SVG
sotto soglia.

Altezze: mese 3.574 → **2.983px** a 1440, 5.349 → **3.228px** a 390.

## 3. Voto con la rubrica dell'audit

Rubrica del §5.1 di `docs/audit/07-design-360.md` (branch `audit/design-360`), stessi pesi, stessa
severità: 90 = tutto il criterio, 70 = difetti visibili a chi guarda con attenzione, 50 = a un
primo sguardo.

| Sezione | C1 ·14 | C2 ·12 | C3 ·12 | C4 ·12 | C5 ·10 | C6 ·10 | C7 ·12 | C8 ·6 | C9 ·7 | C10 ·5 | Calcolo | **Voto** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| S14 Stagionalità, prima | 68 | 55 | 55 | 72 | 66 | 75 | 55 | 60 | 50 | 70 | 6266/100 | 62,7 |
| S14 Stagionalità, dopo | 78 | 80 | 84 | 86 | 76 | 85 | 78 | 62 | 62 | 76 | 7824/100 | **78,2** |

- **C1 78.** Il riepilogo è nel primo viewport a 1440×900 e il grafico comincia sotto; due
  livelli di peso per blocco. Ma la pagina del mese è 3,3 viewport e quella dell'ora 4,6: oltre i
  3 del 90.
- **C2 80.** Una famiglia, scala 11 · 12 · 14 · 20, nessun `text-[Npx]`, cifre tabulari. Toglie
  punti l'11px usato anche per righe secondarie non maiuscole (anni sotto i valori, quote fra
  parentesi, note): il 90 lo vuole solo per le etichette.
- **C3 84.** 0 testi sotto 4,5:1 nei due temi, DOM e grafici; niente isola di tema; il colore
  dice il segno e l'attenzione. Non misurato il 3:1 dei controlli; i grafici non hanno un'etichetta
  accessibile propria.
- **C4 86.** Formattatore unico, decimali costanti per colonna, separatori italiani, frequenze
  come conteggio. Il segno meno è il trattino, non «−»; l'`n` di ogni finestra si legge solo nel
  tooltip della cella.
- **C5 76.** Una tabella del listino a ogni larghezza, prima colonna ferma, ombra dove continua.
  A 1440 la tabella per mese **scorre ancora di 138px** (banda ±1σ e campione fuori vista);
  intestazione non ferma allo scorrimento verticale.
- **C6 85.** Un motore, assi dichiarati, l'indice dichiarato come indice in una riga sopra il
  grafico, lisciatura e fascia dichiarate, crosshair con i valori, «oggi». A 390 sei linee e una
  fascia in 320px si leggono a fatica; il grafico intraday congiunge i punti con una curva
  monotona (non crea estremi, ma non è una spezzata).
- **C7 78.** PageHeader, schede del desk, segmentato, listino. Restano propri la
  legenda-interruttore dei grafici e la griglia anni × periodo (celle con fondo, non `ml-tab`);
  lo stato vuoto condiviso dice «non disponibile in questo report», testo di un'altra pagina.
- **C8 62.** Stato vuoto e stato di transizione («Indice in ricalcolo») ci sono; il caricamento è
  lo scheletro generico (testata + due card) con una geometria che non somiglia alla pagina;
  nessuno stato d'errore per fonte.
- **C9 62.** Nessuna pagina più larga di 390; mese 3.228px a 390, ma **settimana 5.042px** e
  **ora 4.409px** superano i 4.000; segmentati da 28px, sotto i 44px di tocco.
- **C10 76.** Allineamenti coerenti, niente raggi nel listino, una lingua. La voce disabilitata
  (VDAX, sessione e ora sui livelli) è resa al 50% di opacità; il campo «Scala» dello zoom resta
  un controllo diverso dai segmentati.

## 4. Residui, dichiarati

1. **Produzione in transizione** fino al job delle 04:21 UTC del 16/09/2026: prezzi mostrati coi
   punti vecchi (stessa grandezza), VIX/GVZ/OVX con «Indice in ricalcolo», MAE/MFE assenti con
   la nota. Il job non rifà il giornaliero sotto le 20 ore, quindi un lancio manuale oggi non
   cambierebbe niente; nessuna scrittura in produzione è stata fatta da questa sessione.
2. Vista **settimana** a 390: 5.042px (griglia di 53 colonne e tabella di 53 righe).
3. Tabella per mese a 1440: 138px di scorrimento.
4. Scheletro di caricamento generico; testo dello stato vuoto condiviso.
5. **WTI senza MAE/MFE**: servirebbe l'OHLC dello spot Cushing (EIA e FRED pubblicano solo la
   chiusura); il future CL con OHLC esiste in archivio ma è un altro strumento.
6. MAE/MFE di sessione e ora: le barre orarie hanno solo la chiusura.
7. Il voto non è stato riportato nel referto sul branch `audit/design-360`: sta qui.
