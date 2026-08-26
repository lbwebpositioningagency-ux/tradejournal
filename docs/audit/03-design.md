# Audit di design

Audit condotto **solo sul codice** (nessun rendering): DOM, gerarchia dei componenti, classi di tipografia/spaziatura, stati, responsive, accessibilità strutturale, microcopy. I giudizi che richiederebbero l'occhio sono nella sezione «Da verificare visivamente». Data: 31/07/2026. Riferimenti: PROGRESS.md (fasi 1–43), `src/app/(app)/**`, `src/components/**`, `src/app/globals.css`.

---

## Sommario esecutivo

I 5 interventi che alzerebbero di più la percezione di qualità, in ordine:

1. **Una lingua sola per l'interfaccia** — oggi convivono tre regimi: pagine in italiano, etichette di navigazione in inglese ("Day View" porta a una pagina intitolata "Calendario"), e l'Equity Simulator interamente in inglese da manuale ("Start simulation", "Number of lines") con tabelle miste ("Peggiore (5%)" accanto a "Median"). È il segnale più immediato di "progetto assemblato" contro "prodotto disegnato". → D-01, D-02.
2. **Dare una struttura navigabile ad Analytics** — 10 card full-width impilate per ~1000 righe di pagina, senza indice, ancore o tab, con un sottotitolo che descrive solo la prima sezione. È la pagina più ricca dell'app e quella dove un professionista si perde di più. → D-03.
3. **Portare la landing del Macro Desk all'altezza delle sue sottopagine** — Trends, Scorecard e dettaglio report hanno un'identità "terminale" curatissima; la pagina indice che le introduce è due card generiche e una lista. Il primo contatto con la sezione premium è la sua schermata più povera. → D-08.
4. **Un default di densità per la dashboard** — ~18 blocchi tutti accesi di default; il menu "widget visibili" esiste ma parte col massimo. Un preset curato (core vs completo) farebbe percepire intenzione, non accumulo. → D-07.
5. **Accessibilità strutturale: heading reali e grafici etichettati** — `CardTitle` è un `div`, quindi ogni pagina ha un solo heading (l'`h1`); i grafici Recharts non hanno `aria-label` mentre gli SVG custom sì. Sistemarlo è poco costoso e distingue un prodotto professionale da uno amatoriale a un audit esterno. → D-05, D-06.

---

## Giudizio per pagina

### Dashboard (`src/app/(app)/dashboard/page.tsx` + `dashboard-view.tsx`)
**Funziona:** gerarchia tipografica rigorosa via classi `.stat-*` (hero solo su Net P&L e Saldo); onboarding a 3 passi per l'utente nuovo (`onboarding-hero.tsx`) al posto della griglia di trattini; 4 viste $/%/R/privacy senza re-fetch; empty state per ogni widget; layout mobile ripensato con `order` espliciti e toggle "Tutte le metriche"/"Analytics"; sottotitolo con trade e periodo. **Non funziona:** densità di default (D-07), titoli widget in inglese misto (D-01), "Nessun trade." come testo secco nel widget Ultimi trade mentre ovunque c'è `EmptyState` (D-16). **Priorità:** media.

### Calendario (`/day`)
**Funziona:** tinta scalare a 3 fasce proporzionale al giorno più grande del mese (F42), totali settimanali in colonna, month-picker, formato ultra-compatto sotto `sm` con `overflow-hidden` di sicurezza, footer che dichiara valuta e fuso. **Non funziona:** la voce di navigazione si chiama "Day View" ma la pagina "Calendario" (D-02); l'icona nota (`NotebookPen` size-3) è l'unico segnale del journal ed è solo visiva. **Priorità:** bassa (pagina matura).

### Day View (`/day/[date]`)
**Funziona:** 3 stat card con card "Qualità del giorno" al posto della vecchia card vuota; frecce sui giorni *operativi* (mai catene di pagine vuote), con bottone disabilitato e `aria-label` esplicita quando non c'è un giorno; caveat onesto sull'asse dell'intraday («la distanza orizzontale non è tempo»); "Revisione guidata" nascosta sul conto demo. **Non funziona:** niente di strutturale rilevato dal codice. **Priorità:** bassa.

### Trade View (`/trades`)
**Funziona:** header con le 3 azioni giuste (Esporta/Importa/Nuovo) e badge lucchetto sul demo; sorting SSR con link e icone di stato; doppio empty state (nessun trade vs nessun match dei filtri) con CTA differenziate; sotto `md` card impilate con Net P&L e R sempre in vista. **Non funziona:** la card "Sequenza trade" sta sopra la tabella e spinge il contenuto primario sotto la piega (D-09); barra filtri su mobile ancora nel backlog dichiarato (D-15). **Priorità:** media.

### Dettaglio trade (`/trades/[id]`)
**Funziona:** prev/next con tie-break stabile, piano vs esito, badge bias macro del giorno di apertura, allegati separati dai dati. Letto parzialmente: nessun rilievo strutturale nelle prime ~200 righe. **Priorità:** bassa.

### Nuovo trade (`/trades/new`, `trade-form.tsx`)
**Funziona:** form sezionato (Dati / Rischio pianificato (opzionale) / Esecuzioni / Note), tutte le label italiane con `htmlFor`, placeholder con esempi concreti ("Es. 2 o 0.5", "Es. 5010.25"). Il gesto più frequente è a un click da ovunque (bottone `+` in topbar con scorciatoia "n", `layout.tsx:66`). **Priorità:** bassa.

### Reports (`/reports`)
**Funziona:** `CollapsibleCard` coerente col pattern mobile della dashboard; drill-down di ogni riga verso la Trade View filtrata; caveat sui tag sovrapposti e sul confine openedAt/closedAt scritti in pagina; card mobile col Net P&L in vista. **Non funziona:** il confine con Analytics non è leggibile per l'utente (D-10). **Priorità:** media.

### Analytics (`/analytics`)
**Funziona:** ogni card dichiara metodologia, denominatori e limiti del campione (riga di copertura in testa, note sulle finestre sovrapposte, ipotesi del risk of ruin) — onestà statistica rara anche nei prodotti commerciali. **Non funziona:** è un muro di 10 card full-width senza navigazione interna (D-03); sottotitolo stantio; skeleton di caricamento generico a tabella per una pagina di grafici (D-04); Equity Simulator in inglese (D-01) con validazione a errore unico (D-12). **Priorità:** alta — è la pagina "pro" e merita la struttura migliore.

### Macro Desk — landing (`/macro-desk`)
**Funziona:** empty state con l'istruzione operativa (endpoint API); storico con etichette leggibili e affordance di click esplicita (F48). **Non funziona:** è la pagina più povera della sezione più curata (D-08). **Priorità:** alta per la percezione premium.

### Macro Desk — dettaglio report, Trends, Scorecard, COT
**Funziona:** identità "terminale" con token scoped (`.macro-report`), mono per tutti i numeri, `prefers-reduced-motion` rispettato; Trends con gerarchia esplicita (Ciclo generale → tessere → pillole → sezioni); scorecard con ogni percentuale accanto al denominatore; pannello COT deliberatamente descrittivo con vincolo testato sul markup. Analisi dedicata più sotto. **Non funziona:** semantica tab incompleta (D-06), chip percentili criptico (D-13), formati data misti dentro la stessa card (D-14).

### Strategies (`/strategies`)
**Funziona:** lista pulita, pallino colore, conteggio trade. **Non funziona:** empty state fatto a mano invece del componente `EmptyState` — violazione della regola FASE 10 dichiarata in `empty-state.tsx` (D-11); titolo pagina in inglese in un'app italiana (D-02). **Priorità:** bassa.

### Impostazioni (`/settings`)
**Funziona:** `max-w-2xl` centrata (l'unica pagina che limita la larghezza: giusto per un form), sezioni in ordine sensato, card-link ai conti. **Priorità:** bassa.

### Notebook (`/notebook`)
Placeholder onesto (`PagePlaceholder`), non linkato in sidebar: raggiungibile solo per URL. Coerente.

*Non letti in dettaglio:* `/reports/settimana`, `/day/[date]/review`, `/import` (wizard), pagine auth. Non esprimo giudizi su di essi.

---

## Rilievi

### [D-01] Equity Simulator in inglese, tabelle miste italiano/inglese
- Severità: **P1**
- Dove: `src/components/analytics/equity-simulator.tsx:220-317` (form: "Start equity", "Win probability (%)", "Win/loss relation (X : 1)", "Number of trades", "Number of lines", "Start simulation", "Scale (asse Y)" — metà e metà nella stessa label), `:534-540` (scenari: "Peggiore (5%)", "Sfavorevole (25%)", **"Median"**, "Favorevole (75%)"), `:545-568` ("P(in profitto)", "Median return", "Median max drawdown"), `:682-758` ("Max equity", "Average max drawdown", "Max consecutive wins" con sub in italiano "trade di fila").
- Problema: l'app ha un glossario dichiarato (F18: termine tecnico inglese, frase italiana — es. "4 trade in win") ma il simulatore lo ignora: intere label di form e di statistiche sono in inglese, e nella stessa tabella "Median" convive con "Peggiore/Favorevole".
- Perché conta: un professionista riconosce subito il copy incollato da un tool di riferimento estero. La riga mista "Peggiore (5%) / Median / Favorevole (75%)" è il tipo di dettaglio che fa dire "non l'ha riletto nessuno".
- Proposta concreta: applicare il glossario F18 anche qui — label di form in italiano ("Equity iniziale", "Probabilità di vincita (%)", "Rapporto win/loss", "Numero di trade", "Numero di linee", "Rischio per trade", "Avvia simulazione"), "Median" → "Mediano", e per le statistiche tenere il termine tecnico inglese solo dove è gergo consolidato (max drawdown, streak) con il resto della frase in italiano, come già fa la dashboard.
- Costo: **S** · Rischio di regressione: **basso** (solo stringhe; attenzione ai 2 test che verificano il markup del simulatore).

### [D-02] Navigazione e titoli di pagina non allineati (lingua e nomi)
- Severità: **P1**
- Dove: `src/components/layout/sidebar.tsx:27-36` (NAV_ITEMS: "Day View", "Trade View", "Strategies", "Impostazioni") vs `src/app/(app)/day/page.tsx:33,136` (metadata e `h1` = "Calendario") e `src/app/(app)/strategies/page.tsx:10,26` ("Strategies").
- Problema: la voce "Day View" atterra su una pagina che si chiama "Calendario" (e la vera "vista giorno" è `/day/[date]`, che non ha voce propria); "Strategies" e "Impostazioni" convivono nella stessa lista in due lingue.
- Perché conta: la corrispondenza voce-cliccata → titolo-letto è il patto di fiducia di base di una navigazione; romperlo costa orientamento a ogni sessione.
- Proposta concreta: decidere il nome canonico per rotta e usarlo in entrambi i punti. Proposta minima: sidebar "Calendario" (o titolo pagina "Day View", una delle due), "Strategie" per coerenza con "Impostazioni" — oppure tutta la nav in inglese tecnico, ma senza ibridi.
- Costo: **S** · Rischio di regressione: **basso**.

### [D-03] Analytics: 10 sezioni impilate senza navigazione interna, sottotitolo stantio
- Severità: **P1**
- Dove: `src/app/(app)/analytics/page.tsx:440-997` (sequenza di Card full-width: istogramma R → target R → simulatore → rolling ratio → rolling trade → metriche pro → streak → concentrazione → fascia oraria → durata → scatter), `:446-448` (sottotitolo "Distribuzione dei ritorni per target R" che descrive solo le prime due card).
- Problema: nessun indice, ancora o raggruppamento: per arrivare allo scatter finale si scorrono ~10 card, ognuna col proprio blocco esplicativo. Il sottotitolo è rimasto a quando la pagina faceva una cosa sola.
- Perché conta: è la pagina che giustifica il posizionamento "pro", ma un utente che cerca "risk of ruin" non ha modo di sapere che esiste senza scrollare tutto. La densità senza mappa si legge come disordine, non come profondità.
- Proposta concreta: (a) aggiornare il sottotitolo ("Distribuzioni, rolling, rischio e concentrazione sul periodo selezionato"); (b) aggiungere una riga di ancore sotto l'header (chip "Distribuzioni · Simulatore · Rolling · Rischio · Timing" con `href="#..."` e `id` sulle card) — pattern già presente nel progetto con le pillole di Trends; nessun redesign.
- Costo: **M** · Rischio di regressione: **basso**.

### [D-04] Analytics senza `loading.tsx` dedicato: skeleton a tabella per una pagina di grafici
- Severità: **P2**
- Dove: manca `src/app/(app)/analytics/loading.tsx`; il fallback è `src/app/(app)/loading.tsx` (`PageHeaderSkeleton` + `TableSkeleton rows={6}`). La pagina lancia ~17 query (`analytics/page.tsx:279-298, 324, 378`), quindi il fallback resta visibile a lungo.
- Problema: le pagine principali hanno skeleton fedeli al layout (dashboard, day, trades, reports, tutte le rotte macro-desk); Analytics — la più lenta — mostra una tabella che poi si trasforma in grafici: il "flash" di layout mismatch è esattamente ciò che gli skeleton della FASE 10 volevano evitare.
- Perché conta: lo stato di caricamento è il primo secondo di ogni visita; un placeholder che non somiglia al contenuto vale quasi quanto uno spinner generico.
- Proposta concreta: `analytics/loading.tsx` con `PageHeaderSkeleton` + 3-4 `ChartCardSkeleton` (già esistono in `page-skeleton.tsx:40`).
- Costo: **S** · Rischio di regressione: **basso**.

### [D-05] Nessun heading sotto l'`h1`: i titoli di sezione sono `div`
- Severità: **P2**
- Dove: `src/components/ui/card.tsx:36-42` (`CardTitle` = `div`); tutte le sezioni di dashboard, reports, analytics usano `CardTitle`; in Trends l'unico heading di sezione è un `h3` senza `h2` intermedio (`trends-view.tsx:725`), in Scorecard `h3` in `scorecard-em-view.tsx:51`.
- Problema: la struttura per uno screen reader (o per la reader mode) è: `h1` e poi nulla per 1000 righe. La gerarchia visiva c'è (classi `.stat-label`), quella semantica no.
- Perché conta: prodotti finanziari professionali passano audit di accessibilità dei clienti enterprise; è anche il modo più economico per far "capire la pagina" a strumenti automatici.
- Proposta concreta: dare a `CardTitle` un `asChild`/prop `as` e usare `h2` per i titoli di card di primo livello (o wrappare il testo in `h2` dove `CardTitle` è usato come titolo di sezione); in Trends inserire un `h2` per la sezione attiva sopra gli `h3` dei sottogruppi.
- Costo: **M** (tocca molti file, ma meccanico) · Rischio di regressione: **basso** (attenzione ai default di stile degli heading; i test di markup del macro-desk vanno aggiornati se contano i tag).

### [D-06] Grafici Recharts senza nome accessibile; semantica tab incompleta in Trends
- Severità: **P2**
- Dove: nessun `aria-label`/`role` in `src/components/charts/*` (verificato con grep: zero occorrenze), `dashboard/pnl-charts.tsx`, `reports/report-bar-chart.tsx`, `analytics/rolling-charts.tsx`; per contrasto gli SVG custom lo fanno bene (`macro-desk/trends-chart.tsx:194-195` `role="img"` + `aria-label`, `cot-panel.tsx:77-78`, e `segment-performance-chart` riceve `ariaLabel`). In Trends la tab bar ha `role="tablist"`/`role="tab"` ma senza `aria-controls`/`id` del pannello né gestione frecce (`trends-view.tsx:645-675`).
- Problema: metà dei grafici dell'app è anonima per le tecnologie assistive, l'altra metà no: incoerenza interna oltre che gap.
- Proposta concreta: wrapper `<div role="img" aria-label={...}>` attorno ai `ResponsiveContainer` (pattern unico, applicabile in chart-spec o in un componente `ChartFrame`); per la tablist di Trends o completare la semantica (id/aria-controls sul pannello `:706`) o declassare onestamente a `role="group"` + `aria-pressed`, come già fatto per l'orizzonte.
- Costo: **M** · Rischio di regressione: **basso**.

### [D-07] Dashboard: default a densità massima (~18 blocchi)
- Severità: **P2**
- Dove: `src/components/dashboard/dashboard-view.tsx:591-1392` — 8 stat card + 4 metriche avanzate + sequenza + distribuzione R + Winners&Losers + Best/Worst Days + sessioni + score + cumulativo + underwater + P&L giornaliero + saldo + ultimi trade + calendario mensile, tutti visibili se `hidden` è vuoto (default per ogni utente nuovo).
- Problema: il meccanismo di personalizzazione c'è (menu widget, persistito), ma il default mostra tutto: la prima impressione desktop è una colonna lunghissima in cui Net P&L e Underwater plot hanno lo stesso peso percepito. Su mobile il problema è già stato risolto (F26, toggle e priorità); su desktop no.
- Perché conta: la domanda del posizionamento ("capisco in 5 secondi cosa guardare?") si gioca qui. I prodotti di riferimento aprono con 6-8 widget e lasciano *aggiungere*.
- Proposta concreta: default con le metriche avanzate (Sortino/Calmar/SQN/Ulcer) e l'underwater nascosti per gli utenti nuovi (bastano 5 id in `hidden` alla creazione del layout), più la voce di menu esistente per riattivarli. Zero UI nuova.
- Costo: **S** · Rischio di regressione: **basso** (non toccare i layout già salvati).

### [D-08] Macro Desk: la landing non regge le sue sottopagine
- Severità: **P2**
- Dove: `src/app/(app)/macro-desk/page.tsx:147-231` (2 card + lista storico, tema app) vs l'identità terminale di `/macro-desk/[id]`, `/macro-desk/trends`, `/macro-desk/scorecard` (`.macro-report`, mono, gauge, animazioni).
- Problema: l'hub della sezione premium è la schermata meno disegnata della sezione; inoltre il salto tema-app → terminale dark fisso avviene *dentro* la pagina (riquadro scuro incassato nel tema chiaro, `trends/page.tsx:54-63`), e la landing non anticipa in alcun modo quel linguaggio. Trends e Scorecard sono raggiungibili solo dai due bottoni in alto a destra: nessun accenno a cosa contengono.
- Perché conta: il primo contatto con il Macro Desk decide se sembra un terminale o una lista di record.
- Proposta concreta: senza redesign — (a) card di ingresso per Trends e Scorecard con un assaggio del dato (il badge "Ciclo generale" già calcolato, l'hit rate dell'ultima scorecard), nello stile card dell'app; (b) sui bias della landing riusare i colori/gauge semantici già esistenti in `bias-gauge.tsx` invece del solo testo colorato.
- Costo: **M** · Rischio di regressione: **basso**.

### [D-09] Trade View: il grafico sequenza sta sopra la tabella
- Severità: **P2**
- Dove: `src/app/(app)/trades/page.tsx:236-264` (card "Sequenza trade (filtri attivi)" renderizzata prima della lista, sempre quando ci sono ≥2 chiusi).
- Problema: la pagina si chiama Trade View e il suo contenuto primario (la tabella) parte sotto header + barra filtri + un grafico alto 220px: su un laptop 1280×800 la prima riga di trade rischia di stare sotto la piega anche senza filtri attivi.
- Perché conta: per il flusso "rivedo i miei trade" il grafico è contesto, non risposta.
- Proposta concreta: spostare la card sequenza sotto la tabella, oppure renderla collassabile con `CollapsibleCard` (già esistente) chiusa di default quando non ci sono filtri attivi.
- Costo: **S** · Rischio di regressione: **basso**.

### [D-10] Confine Reports ↔ Analytics non leggibile (timing duplicato)
- Severità: **P2**
- Dove: `reports/page.tsx:661-674` ("Per ora di apertura", P&L per bucket) e `analytics/page.tsx:894-930` ("Performance per fascia oraria", avg R per bucket). Analytics dichiara la non-duplicazione solo per il giorno della settimana (`:800-806`).
- Problema: due pagine con nomi generici ("Reports", "Analytics") offrono entrambe un'analisi per ora di apertura, con metrica diversa ma stessa domanda dell'utente ("quando rendo meglio?"). La nota in pagina copre il weekday, non l'ora.
- Perché conta: l'utente che trova due risposte leggermente diverse alla stessa domanda smette di fidarsi di entrambe (qui i numeri *sono* coerenti, ma è lui a doverlo verificare).
- Proposta concreta: intervento minimo di copy: nel titolo o nella descrizione di ciascuna delle due card dichiarare il taglio ("in valuta, per il P&L di bucket" vs "in R medio, per la qualità del timing") e cross-linkare, come già fatto per il weekday. In prospettiva: un'unica card timing in Analytics con toggle valuta/R.
- Costo: **S** (copy) / **M** (unificazione) · Rischio di regressione: **basso**.

### [D-11] Strategies: empty state fuori standard
- Severità: **P2**
- Dove: `src/app/(app)/strategies/page.tsx:35-40` — blocco `div` artigianale (icona nuda, un solo `p`), mentre la regola di progetto è «UNICO design per ogni pagina/widget senza dati» (`src/components/empty-state.tsx:5-7`) e tutte le altre pagine la rispettano.
- Problema: manca il titolo/descrizione a due livelli e soprattutto manca la CTA (il dialog "crea strategia" esiste già in pagina ma l'empty state non lo richiama).
- Proposta concreta: sostituire con `<EmptyState icon={Target} title="Nessuna strategia ancora" description="…">` e come children il trigger di `StrategyFormDialog`.
- Costo: **S** · Rischio di regressione: **basso**.

### [D-12] Equity Simulator: validazione a messaggio unico
- Severità: **P2**
- Dove: `equity-simulator.tsx:321-326` — qualunque input invalido produce lo stesso paragrafo «Parametri non simulabili: servono equity e rischio positivi, una probabilità fra 0 e 100…».
- Problema: 7 campi liberi, un solo errore cumulativo: l'utente deve rileggersi la frase e dedurre quale campo ha sbagliato (es. virgola vs punto è gestita, ma un rischio % ≥100 no).
- Perché conta: nei tool finanziari il form è il prodotto; l'errore contestuale al campo è lo standard che l'utente si aspetta.
- Proposta concreta: validare per campo al submit e marcare l'input (`aria-invalid` + bordo `destructive` + messaggio sotto la label del campo colpevole); il messaggio cumulativo può restare come fallback.
- Costo: **M** · Rischio di regressione: **basso**.

### [D-13] Trends: chip percentili criptico
- Severità: **P3**
- Dove: `trends-view.tsx:470-479` — chip mono `pct 1A 78° · 3A — · 5A 12°` senza tooltip né spiegazione in pagina (il chip percentile "semplice" è stato rimosso in FASE 32, questo è sopravvissuto).
- Problema: "pct 1A 78°" è comprensibile solo a chi l'ha scritto; il simbolo ° per il percentile e i trattini per i null aggravano.
- Proposta concreta: `title`/tooltip sul chip («Percentile storico dell'ultimo valore su 1/3/5 anni: 78° = più alto del 78% delle osservazioni») o etichetta estesa "percentile 1A: 78°".
- Costo: **S** · Rischio di regressione: **basso**.

### [D-14] Trends: due formati data nella stessa card
- Severità: **P3**
- Dove: `trends-view.tsx:59-72` — header della card: "al 18 lug 2026" (`obsDateLabel`); tabella comparazione e tessere: "18/07/26" (`shortDate`); COT usa un terzo formato esteso (`formatDataIt`). Anche l'anno a 2 cifre ("26") è un formato che nei prodotti dati si evita.
- Proposta concreta: unificare su un formato breve unico per i contesti mono ("18/07/2026" o "18 lug 26") e tenere quello esteso solo nel copy discorsivo.
- Costo: **S** · Rischio di regressione: **basso**.

### [D-15] Mobile: backlog dichiarato ancora aperto su filtri e titoli
- Severità: **P2**
- Dove: PROGRESS.md (FIX MOBILE 20/07, «fuori perimetro»): barra filtri Trade View su 5 righe a 375px (`trade-filters-bar.tsx`), titolo "Trade View" a capo, dashboard mobile ora mitigata da F26. I touch target della topbar sono stati corretti solo in parte (`layout.tsx:70` `max-lg:size-11` sul quick-add, `sidebar.tsx:101` sull'hamburger — theme toggle e user menu da verificare).
- Problema: segnalazioni note e accettate come debito; le cito perché restano il gap mobile più visibile.
- Proposta concreta: per la barra filtri, il pattern già usato altrove: `CollapsibleCard`/Sheet "Filtri (N)" sotto `md`, coi filtri attivi riassunti in chip.
- Costo: **M** · Rischio di regressione: **medio** (interazioni con la preservazione dei searchParams).

### [D-16] "Nessun trade." secco nel widget Ultimi trade
- Severità: **P3**
- Dove: `dashboard-view.tsx:1334-1335`.
- Problema: unico punto della dashboard in cui lo stato vuoto è una riga di testo invece del pattern `EmptyState compact` usato dagli altri 6 widget.
- Proposta concreta: `EmptyState compact` o almeno la stessa frase standard «Nessun trade chiuso nel periodo».
- Costo: **S** · Rischio di regressione: **basso**.

### [D-17] Colori "spaghetti" del simulatore fuori dal sistema
- Severità: **P3**
- Dove: `equity-simulator.tsx:94-97` — `hsl((i*137.508)%360, 65%, 52%)`: rotazione ad angolo aureo, saturazione/luminosità fisse, indipendente da light/dark e dai token (`--chart-*`).
- Problema: è l'unico grafico dell'app con colori non derivati dai token; a L 52% fissa alcune tinte (gialli/ciani) su fondo bianco hanno contrasto molto basso anche a opacità piena, e qui sono a 0.2. Come "texture" può funzionare (le bande σ e la media portano l'informazione), ma è una scelta non validata mentre tutto il resto della palette è passato dal solver.
- Proposta concreta: mantenere la rotazione ma ancorarla ai token (interpolare tra `--chart-1..5`) o almeno adattare la lightness al tema (es. 45% in light, 62% in dark).
- Costo: **S** · Rischio di regressione: **basso**.

### [D-18] Tooltip SVG di Trends a larghezza fissa
- Severità: **P3**
- Dove: `trends-chart.tsx:284-313` — box hover `width={140}` fisso con valore+unità in mono `fontSize 12`.
- Problema: con valori lunghi (migliaia con separatori + unità tipo "Mld $") il testo può uscire dal rettangolo; l'SVG non tronca né wrappa. Non posso confermarlo senza rendering, ma il rischio è strutturale.
- Proposta concreta: calcolare la larghezza dal testo (`getComputedTextLength` o stima `char × 7px`) o allargare a 170 e troncare la data.
- Costo: **S** · Rischio di regressione: **basso**.

### [D-19] Sequenza trade: barre senza asse X né conteggio in vista
- Severità: **P3**
- Dove: `charts/trade-sequence-chart.tsx:66` (tick soppressi, deliberato F21) — l'informazione "quanti trade sto guardando" vive solo nella nota sotto al grafico quando la serie è troncata (`dashboard-view.tsx:911-915`) e nel tooltip (`#index`).
- Problema: senza tick va bene (erano rumore), ma quando la serie NON è troncata non c'è alcun conteggio: due periodi diversi producono grafici visivamente simili con numerosità molto diverse.
- Proposta concreta: rendere la nota sempre visibile («{n} trade chiusi nel periodo», non solo quando tronca).
- Costo: **S** · Rischio di regressione: **basso**.

---

## Grafici: analisi dedicata

**Cosa è già giusto (e raro da vedere):**
- `chart-spec.ts` come fonte unica di altezza (220), margini, tick, tooltip, opacità aree: i grafici dell'app sono davvero uniformi *by construction*, non per disciplina. Il commento su `tooltipItemStyle` (Recharts che hardcoda `#000` sulle righe quando il colore sta sulle `<Cell>`) dimostra che il dark mode dei tooltip è stato debuggato davvero.
- Clamp visivo degli outlier con marcatore ▲/▼ e valore reale nel tooltip (`ClampMark` + `chart-clamp.ts`): la soluzione corretta al problema "una barra da 10k schiaccia tutte le altre", con onestà dichiarata ("barra troncata").
- Curve cumulative che partono da uno zero sintetico (tooltip "Inizio"): il primo movimento è il primo risultato reale.
- Scelte di tipo grafico giuste: barre per bucket categorici, area per il cumulativo, istogramma per la distribuzione R con colonna BE dedicata, scatter con diagonale per target vs realizzato, tabella (non radar) per le sessioni. Nel simulatore, la scala log che *interrompe* le linee a equity ≤0 invece di interpolarle è correttezza statistica resa visiva.
- Rolling: metriche selezionabili una alla volta con motivazione scritta (unità incompatibili) — la spiegazione nel commento di `rolling-charts.tsx:27-35` meriterebbe di stare nel MetricInfo.

**Cosa manca o stona:**
1. **Accessibilità**: i grafici Recharts non hanno nome accessibile; gli SVG custom sì (D-06). Due sistemi, un solo standard rispettato.
2. **Due motori di rendering** (Recharts nell'app, SVG custom nel Macro Desk): la scelta è difendibile (identità terminale, zero dipendenze per hover custom), ma comporta due implementazioni di tooltip, assi e griglie da mantenere coerenti a mano. Da sorvegliare, non da unificare ora.
3. **Griglie orizzontali assenti** in tutti i grafici Recharts (nessun `CartesianGrid` da nessuna parte) mentre lo Trends SVG le ha (3 linee tratteggiate min/mid/max). Scelta pulita ma incoerente tra i due mondi; per serie in valuta con range ampi qualche riferimento orizzontale aiuta la lettura. Da valutare visivamente prima di intervenire.
4. **Equity simulator**: colori percorsi fuori token (D-17); il resto (bande σ dietro, media in `--foreground` sopra, legenda custom perché "le serie sono troppe per quella automatica") è ben ragionato. L'asse Y con `fmtEquity` senza valuta è accettabile perché la valuta sta nel tooltip e nelle label del form.
5. **Trends SVG**: asse X con solo prima/ultima data (`trends-chart.tsx:243-262`) su finestre fino a "Max" pluriennale — per orizzonti lunghi mancano riferimenti intermedi; le bande NBER compensano in parte. Micro-testo assi a 10px in mono: sotto la soglia usuale di leggibilità, da verificare a schermo.

---

## Macro Desk Trends: analisi dedicata

**La gerarchia funziona sulla carta.** L'ordine di lettura costruito nelle fasi 29-33 è il migliore possibile per questa quantità di dati: (1) badge "Ciclo generale" — un'etichetta sola con il metodo dichiarato nel `title`; (2) 6 tessere del quadro sintetico; (3) 10 pillole di sezione con etichetta prevalente e conteggio voti in hover; (4) tab di sezione + orizzonte condiviso; (5) callout "cosa alimenta questa sezione" prima delle card. Un utente che apre la pagina ha una risposta in un colpo d'occhio *prima* del muro. Le pillole che fanno anche da salto al tab sono un buon doppio uso.

**Dove il muro resta muro:**
- **Dentro la sezione attiva**, ogni `SeriesCard` porta 8 elementi (label+unità, chip stale/percentili, valore hero, delta, grafico, riga metriche, tabella comparazione, riga "reading") su griglia a 2 colonne: con sezioni da 6-10 serie (~60 totali in `macro-trends-series.ts`) il dettaglio resta molto denso. La struttura a sottosezioni titolate aiuta; una possibile evoluzione incrementale è collassare la tabella comparazione dietro un toggle per-card o mostrare di default solo le serie `highlight` con un "mostra tutte".
- **Il controllo orizzonte** (5A ecc.) sta nella barra in alto: quando si è scrollati in fondo a una sezione lunga non è più visibile e il suo effetto (ri-finestra tutti i grafici) non è scopribile. Candidato a `position: sticky` insieme alla tab bar.
- **Semantica**: tablist incompleta (D-06); le pillole sono `button` con solo `title` come spiegazione — il contenuto del `title` non è raggiungibile da tastiera.
- **Microcopy**: eccellente sull'onestà (data di osservazione per serie, chip "in ritardo di pubblicazione", card errore "La sezione prosegue senza questa serie" — il miglior stato d'errore dell'app), ma il chip percentili è criptico (D-13) e i formati data doppi (D-14).
- **Il pannello COT** è il pezzo più maturo: lettura a tre livelli dichiarata (etichetta verbale → barra di posizione → frase piana), niente verde/rosso dove non c'è un "bene/male", stantio dichiarato con giorni di ritardo, e il vincolo "niente linguaggio da segnale" fatto rispettare da un test sul markup. Da non toccare.

---

## Incoerenze tra pagine

1. **Lingua**: italiano (pagine core) / inglese (Equity Simulator, titoli widget dashboard, nav) / misto nella stessa riga ("Scale (asse Y)", "Peggiore… Median"). → D-01, D-02.
2. **Empty state**: `EmptyState` ovunque tranne Strategies (artigianale) e widget Ultimi trade (testo secco). → D-11, D-16.
3. **Formati data**: `formatDayKey` / "18 lug 2026" (macro list) / "al 18 lug 2026" + "18/07/26" (Trends, stessa card) / `formatDataIt` (COT). → D-14.
4. **Aria sui grafici**: SVG custom etichettati, Recharts no. → D-06.
5. **Nomi di rotta vs titoli**: "Day View"→"Calendario"; "Reports" ha dentro "Report settimanale" (Button `reports/page.tsx:452-457`) — unico caso in cui una sotto-pagina è raggiungibile solo da un bottone contestuale, come Trends/Scorecard dal Macro Desk: pattern coerente tra loro, ma nessuno di questi tre ha voce in sidebar né breadcrumb comune (il back-link è artigianale e diverso: freccia+testo in Trends, `ArrowLeft` ghost-button in Day View).
6. **Larghezza pagina**: Settings e Strategies limitano (`max-w-2xl/3xl`), tutte le altre pagine sono full-width — corretto per dashboard/tabelle, ma Analytics full-width con card singola a colonna produce grafici larghissimi su monitor grandi (vedi "Da verificare").

---

## Da verificare visivamente (non deducibile dal codice)

1. **Analytics su monitor ≥1600px**: card a colonna singola full-width → grafici Recharts larghi 1400px+ con 220px di altezza; il rapporto d'aspetto potrebbe rendere le serie illeggibili (pendenze schiacciate). Se confermato: `max-w` sulla colonna o griglia a 2 colonne per le card compatibili.
2. **Contrasto reale dei percorsi spaghetti** (D-17) su entrambi i temi, a opacità 0.2.
3. **Leggibilità dei micro-testi mono a 10px** negli SVG di Trends e del tooltip a 140px fissi (D-18) con valori lunghi.
4. **Il blocco terminale dark dentro il tema chiaro** (Trends/Scorecard in light mode): da codice è un riquadro `#080b12` incassato in una pagina bianca — se l'effetto sia "premium incorniciato" o "iframe estraneo" si decide solo guardandolo.
5. **Equilibrio della topbar**: account switcher a sinistra, tre icone a destra, nessun titolo di contesto — con la sidebar chiusa (mobile) l'orientamento dipende solo dall'`h1` sotto.
6. **Tinte scalari del calendario** (3 fasce /10 /20 /30 di opacità): se il gradino tra fascia 1 e 2 sia percepibile in light mode.
7. **Dashboard sopra la piega a 1280×800**: quante card entrano davvero nel primo viewport e se Net P&L "vince" visivamente.
8. **Animazioni del Macro Desk** (fade stagger, ago del gauge, hover-lift): la quantità è calibrata nel codice, l'effetto cumulato si giudica a schermo.
9. Pagine non lette in dettaglio: `/reports/settimana`, `/day/[date]/review`, wizard `/import`, auth — fuori dal giudizio di questo audit.

---

## Cosa è già di livello e non va toccato

1. **Il sistema di token** (`globals.css`): palette OKLCH con rapporti di contrasto *calcolati dal solver e annotati nei commenti*, non stimati; coppie P&L alternative validate anche per daltonismo sull'asse blu-giallo; scala tipografica `.stat-*` unica; 3 livelli di elevazione; motion token con `prefers-reduced-motion`. È il fondamento che la maggior parte dei prodotti commerciali non ha.
2. **`chart-spec.ts` + clamp degli outlier + partenza da zero delle cumulative**: i grafici sono un sistema, non una collezione.
3. **`MetricInfo`**: ogni numero ha spiegazione e formula che vivono accanto alla funzione di calcolo, aperta al tap (non hover). La disciplina "il testo sta col calcolo" previene la deriva del copy.
4. **L'onestà come pattern di design**: denominatori sempre accanto alle percentuali (scorecard), copertura del campione dichiarata (Analytics), "mai sommati" sulle multi-valute, date di osservazione su ogni dato macro, caveat sull'asse intraday, "barra troncata" nei tooltip, gate espliciti sotto soglia (Calmar/SQN con "Dati insufficienti (n/m)"). È il singolo tratto che più distingue questo prodotto; qualunque intervento futuro deve preservarlo.
5. **Stati vuoti e skeleton** (dove il pattern è applicato): doppio empty state della Trade View, onboarding hero a 3 passi, card errore di Trends che dichiara il degrado parziale.
6. **Il percorso delle 3 azioni frequenti**: nuovo trade = 1 click da ovunque (+ scorciatoia "n"); rivedere la giornata = 2 click (Calendario → giorno) con navigazione sui soli giorni operativi; statistiche = 0 click (dashboard è la home). Non c'è nulla da accorciare.
7. **Il pannello COT** e la scorecard a Expected Move: rigore metodologico reso leggibile, con vincoli difesi dai test.
