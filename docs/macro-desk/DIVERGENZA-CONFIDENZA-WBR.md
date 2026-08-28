# Due confidenze per lo stesso bias — la falla che il congelamento non chiude

**Data**: 28/08/2026 · **Origine**: indagine sui 23 report reali in Neon (23/07 → 28/08/2026)
**Dove si corregge**: nelle istruzioni del **task generatore esterno**, NON nell'app.

> Questo documento non descrive un bug del repo e non chiede una modifica al codice.
> È il verbale di una misura, scritto perché la correzione avvenga dove il difetto
> nasce. L'app continua a mostrare i numeri **come dichiarati**, senza riconciliarli:
> riconciliare qui significherebbe scegliere in silenzio quale delle due fonti è
> quella buona, che è esattamente la decisione che non spetta a chi rende la pagina.

## In una riga

Il 27/08/2026 l'endpoint ha imparato a **congelare** l'impegno della domenica
(`src/lib/macro-desk-impegno.ts`): fra i campi immutabili c'è `confidence`. Ma il
confronto avviene **solo fra `biasRecord` e `biasRecord`**: il guardiano non guarda
mai `payload.assets[].weekly.confidence`, che è il numero che la card mostra. Quel
numero continua a essere riscritto ogni giorno, e nessuno se ne accorge — perché per
il guardiano non è successo niente.

## Il fatto

Ogni report v2 porta la confidenza settimanale in **due posti diversi**:

| Canale | Dove | Chi lo legge |
|---|---|---|
| `biasRecord.assets.{xau,wti,idx}.confidence` | colonna `MacroDeskReport.biasRecord` | **Scorecard EM** (`src/lib/queries/macro-scorecard-em.ts`) |
| `payload.assets[].weekly.confidence` | colonna `MacroDeskReport.payload` | **card del dettaglio report** (`/macro-desk/[id]`) |

Il Weekly Bias Record è emesso la domenica e per definizione **immutabile fino al
venerdì**: è la dichiarazione su cui la scorecard misura la calibrazione del desk.
Il `payload.weekly.confidence` invece viene **riscritto ogni giorno** dal run
giornaliero.

Su **42 confronti possibili** (report con `biasRecord`, per i 3 asset), i due numeri
**divergono 13 volte, il 31%**. Il `bias` direzionale coincide sempre: si muove solo
la confidenza. Tutte le divergenze sono su report **DAILY**, tutte con `status: live`,
cioè su bias ancora aperti — non su record risolti.

## I 13 casi

| Report | Tipo | weekStart | Asset | Bias | `biasRecord.confidence` | `payload.weekly.confidence` | Δ | status |
|---|---|---|---|---|---|---|---|---|
| 2026-08-12 | DAILY | 2026-08-09 | wti | NEUTRALE | **48** | **46** | −2 | live |
| 2026-08-12 | DAILY | 2026-08-09 | idx | RIALZISTA | **55** | **51** | −4 | live |
| 2026-08-13 | DAILY | 2026-08-09 | xau | RIALZISTA | **60** | **62** | +2 | live |
| 2026-08-13 | DAILY | 2026-08-09 | idx | RIALZISTA | **55** | **57** | +2 | live |
| 2026-08-14 | DAILY | 2026-08-09 | idx | RIALZISTA | **55** | **58** | +3 | live |
| 2026-08-18 | DAILY | 2026-08-16 | wti | NEUTRALE | **44** | **43** | −1 | live |
| 2026-08-18 | DAILY | 2026-08-16 | idx | RIALZISTA | **52** | **48** | −4 | live |
| 2026-08-19 | DAILY | 2026-08-16 | idx | RIALZISTA | **52** | **48** | −4 | live |
| 2026-08-21 | DAILY | 2026-08-16 | xau | NEUTRALE | **48** | **44** | −4 | live |
| 2026-08-21 | DAILY | 2026-08-16 | wti | NEUTRALE | **44** | **41** | −3 | live |
| 2026-08-21 | DAILY | 2026-08-16 | idx | RIALZISTA | **52** | **46** | −6 | live |
| 2026-08-27 | DAILY | 2026-08-23 | wti | NEUTRALE | **45** | **43** | −2 | live |
| 2026-08-28 | DAILY | 2026-08-23 | wti | NEUTRALE | **45** | **44** | −1 | live |

Scarto massimo **6 punti** (indici, 21/08). Il segno è quasi sempre negativo: il
giornaliero tende ad abbassare la confidenza rispetto a quella congelata la domenica —
il che è coerente con la prosa dei report, che il taglio lo motiva («evento binario in
agenda → confidence limitata a prescindere dal resto»), ma non con la regola dichiarata
del WBR, secondo cui la settimana non si riscrive.

## Perché conta

La **Scorecard EM misura la calibrazione di un numero che l'utente non vede mai**, e
la card mostra un numero che nessuno misura. Il 21/08 gli indici comparivano a 46/100
in pagina mentre la scorecard valutava la settimana su un 52/100. Nessuna delle due
pagine è sbagliata rispetto alla propria fonte, e proprio per questo la contraddizione
è invisibile a chi legge.

E resta invisibile anche DOPO il congelamento del 27/08. Alla data di questa misura
**nessun report in archivio ha `impegnoRifiutato` valorizzato** (0 su 23): il desk il
`biasRecord` lo rispedisce identico, come deve. È il `payload` che si muove sotto,
lungo un canale che il guardiano non sorveglia. La banda in cima alla Scorecard non ha
niente da dire, e ha ragione: la falla non passa da lì.

## Le tre uscite possibili, per il task generatore

1. **Il WBR è la fonte di verità.** Il run giornaliero non tocca la confidenza:
   `payload.weekly.confidence` ricopia `biasRecord.confidence` per tutta la settimana.
   Coerente con la regola «il bias si verifica, non si ricalcola», ma perde
   l'informazione — reale e utile — che oggi la lettura convince meno di domenica.
2. **Il giornaliero può ritoccare, e lo dichiara.** Si aggiunge al WBR un campo di
   monitoraggio esplicito (per esempio `monitor.{asset}.confidenceOggi`) distinto da
   `confidence`, che resta congelato. Le due fonti smettono di contraddirsi perché
   smettono di essere la stessa cosa, e la scorecard continua a misurare la
   dichiarazione domenicale.
3. **Un solo campo, aggiornato in entrambi i posti.** La più semplice da scrivere e la
   più fragile: qualunque run che aggiorni uno solo dei due riapre il problema, ed è
   quello che sta succedendo ora.

L'opzione 2 è la sola che conserva entrambe le informazioni senza far misurare alla
scorecard un numero mobile — ed è anche la sola coerente con il congelamento già in
vigore, che un ritocco quotidiano dichiarato in un campo suo non contraddice.

Se invece si sceglie l'opzione 1, il controllo va **esteso**: oggi
`src/lib/macro-desk-impegno.ts` confronta `biasRecord` con `biasRecord`, e per
accorgersi di questa divergenza dovrebbe confrontare anche
`payload.assets[].weekly.confidence` con il `confidence` congelato per lo stesso
asset. È una modifica all'app, e va fatta solo dopo che il generatore ha deciso quale
delle tre uscite prendere: sorvegliare una regola che nessuno ha ancora scritto
produrrebbe solo rumore.

Finché non è presa una decisione, l'app resta com'è: la card mostra
`payload.weekly.confidence`, la scorecard `biasRecord.confidence`, ognuna dichiarando
la propria fonte.

## Epilogo — 28/08/2026, sera: decisa l'opzione 2, e il guardiano è stato esteso

La scelta è caduta sull'**opzione 2**, e le istruzioni dei due task generatori sono
state riscritte di conseguenza:

- `payload.assets[].weekly.confidence` **non si muove più** a settimana aperta: resta
  l'impegno dichiarato la domenica, uguale a `biasRecord.confidence`;
- la lettura del giorno ha un campo suo, `monitor.<asset>.confidenceOggi`, affiancato
  da `monitor.<asset>.confMotivo`, che dice **perché** è quella;
- i settimanali dichiarano il motivo una volta per settimana in `weekly.confMotivo`.

Di conseguenza il controllo previsto in fondo alla sezione precedente **è stato
fatto**: `confidenzaPayloadRifiutata()` in `src/lib/macro-desk-impegno.ts` confronta
`payload.assets[].weekly.confidence` con quella già in archivio per la stessa
settimana, e ogni scarto finisce nella colonna `impegnoRifiutato`, nella risposta HTTP
e nella banda in pagina — dove finiscono già i rifiuti sul `biasRecord`.

Una differenza deliberata rispetto al `biasRecord`: qui si **registra**, non si
riscrive. Il `biasRecord` viene congelato perché è ciò che la scorecard misura; il
payload invece si archivia byte per byte, ed è l'unica copia del report. Riscriverne
un campo significherebbe conservare un payload che il desk non ha mai spedito — e la
divergenza, che è il dato interessante, sparirebbe proprio nel momento in cui si
manifesta.

La card, dal canto suo, ha smesso di dover scegliere: quando i due numeri divergono li
mostra **entrambi**, con la differenza e con la riga che impedisce di leggere il
secondo come la correzione del primo.

## Come rileggere la misura

Query di sola lettura su Neon, via Prisma (mai col driver `pg` grezzo, che restituisce
le date sfalsate di un giorno): per ogni report con `biasRecord`, confrontare
`biasRecord.assets[chiave].confidence` con `parseMacroPayload(payload).assets[]
.weekly.confidence`, mappando `gold→xau`, `oil→wti`, `idx→idx`.

## Poscritto — 28/08/2026, sera tardi: il guardiano guardava il riferimento sbagliato

Al primo giro su dati veri il controllo esteso ha segnalato una violazione che era
l'esatto contrario di una violazione. Il report delle 14:46 portava
`payload.assets[oil].weekly.confidence` da **43** a **45**, e il guardiano ha detto
«tenuto 43, rifiutato 45» — ma 45 era il valore che il `biasRecord` dichiarava dalla
domenica: il desk stava **correggendo** il payload, non spostandolo.

La causa: il confronto era col **payload archiviato**, che in quella settimana era lui
stesso il valore sbagliato. Il guardiano difendeva l'errore che era nato per scoprire.

Ora `confidenzaPayloadRifiutata` confronta con `biasRecord.<asset>.confidence`
dell'archivio, cioè con l'impegno vero. Ne seguono le due proprietà che servono:

- una correzione **verso** il record non produce più falso allarme;
- uno scostamento **dal** record continua a produrlo, **anche quando il report è
  internamente coerente** — cioè quando il desk muove payload e record insieme. In quel
  caso `applicaImpegno` congela il record, il controllo n. 4 della sentinella (che
  confronta le due metà dello stesso report) tacerebbe, e questo resta l'unico a
  vedere la deriva.

Sullo stesso report, intanto, la divergenza storica è chiusa: `payload`, `biasRecord` e
colonna dicono tutti 51 / 45 / 46 sui tre asset.
