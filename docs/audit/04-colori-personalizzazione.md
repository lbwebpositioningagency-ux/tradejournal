# Audit cromatico e di personalizzazione

Data: 31/07/2026 · Pass di audit #4 · Scope: sistema colori (tema light/dark, accenti, P&L, grafici, Macro Desk) + profondità di personalizzazione.
Metodo: tutti i contrasti sono **calcolati** con `scripts/contrast.mjs` (OKLCH→sRGB con verifica gamut) e con conversione hex→luminanza WCAG per i colori del Macro Desk; la distinguibilità daltonica è simulata con le matrici di Viénot (1999) su RGB lineare e misurata come ΔE Lab. Nessun valore stimato a occhio.

## Sommario esecutivo

Il sistema cromatico è **fra i più disciplinati che si possano trovare in un MVP**: token unici in `globals.css`, contrasti già calcolati in fase di design con un solver dedicato, un test automatico (`src/lib/theme-contrast.test.ts`) che legge il CSS reale e verifica 30 combinazioni AA + gamut a ogni run, tooltip Recharts blindati contro il default `color:'#000'` (il bug sistemico passato) in **tutti e 12** i grafici. Tema chiaro e scuro esistono entrambi e passano entrambi.

I problemi veri trovati sono pochi e circoscritti:

1. **[C-01]** La palette generata del simulatore equity (`hsl(i·137.508°, 65%, 52%)`) produce linee con contrasto **1.58–1.95:1 su card chiara** (giallo-verdi quasi invisibili in light mode, sotto perfino il 3:1 non-text) e collassa in deuteranopia già a 10 linee (ΔE min 9.1) — è l'unico grafico fuori dal sistema token.
2. **[C-02]** Le swatch del picker accenti/P&L in Impostazioni usano **valori oklch diversi dai token reali**: mostrano i vecchi colori pre-correzione-gamut (es. loss swatch `0.577 0.245 27.325` = red-600 vs token `0.565 0.23 26`). L'utente sceglie un colore e ne ottiene un altro.
3. **[C-03]** Il badge divergenze MT5 usa `text-amber-600` fuori token: **3.08:1** su sfondo chiaro, sotto AA.
4. **[C-05]** Il Macro Desk **non eredita la coppia P&L daltonica**: chi sceglie "Blu/Rosso" per deuteranopia trova comunque verde/rosso (`--md-up/--md-down`, ΔE deuteranopia **13.9**) nel Macro Desk.

Sulla personalizzazione (Parte B): il prodotto è già nel punto giusto dello spettro — molte opzioni con ragione d'uso reale (view mode $/%/R/privacy, 26 widget nascondibili, 3 coppie P&L validate, finestre rolling con disabilitazione motivata), quasi nessuna opzione morta. I gap concreti: **lista fusi orari incompleta** (manca Europe/Berlin/Paris/Madrid), nessun preset "mese scorso", periodo che riparte sempre da "Tutto lo storico", e il gap di accessibilità del Macro Desk di cui sopra.

---

## A1 — Inventario completo della palette

### Token del tema (unica fonte: `src/app/globals.css`)

| Gruppo | Token | Dove |
|---|---|---|
| Superfici | `--background --card --popover --muted --secondary --accent --sidebar` | globals.css:79-128 (light), 130-173 (dark) |
| Testo | `--foreground --card-foreground --popover-foreground --muted-foreground --secondary-foreground --accent-foreground --sidebar-foreground` | idem |
| Interazione | `--primary --primary-foreground --ring --border --input --destructive` | idem |
| **Semantica P&L** | `--profit --loss --breakeven` (esposti come `text-profit` ecc. via `@theme inline`, globals.css:67-69) | globals.css:113-115, 162-164 |
| Grafici | `--chart-1 … --chart-5` (blu, verde, rosso, ambra, viola — stessa temperatura di saturazione) | globals.css:103-107, 154-158 |
| Accenti utente | 5 set `[data-accent=blue\|violet\|emerald\|amber\|rose]` × light/dark (ridefiniscono `--primary --ring --sidebar-primary --chart-1`) | globals.css:182-232 |
| Coppie P&L utente | 3 set `[data-pnl=classic\|blue-red\|green-violet]` × light/dark | globals.css:253-269 |
| Macro Desk (scoped) | `--md-bg --md-surface(-2,-3) --md-border --md-text(-2) --md-muted --md-up --md-down --md-warn --md-info --md-gold --md-oil --md-idx --md-cross` — dark fisso, dichiaratamente fuori dal tema | globals.css:326-358 |
| Elevazione/motion | `--shadow-card/raised/overlay --motion-duration --motion-ease` | globals.css:74-76, 118-119 |

### Specifica grafici centralizzata

`src/components/charts/chart-spec.ts` — assi, cursore, tooltip (contenitore + `itemStyle` + `labelStyle`), opacità aree, e `pnlChartColor()` che mappa valore→`var(--profit/--loss/--breakeven/--muted)`. Consumata da tutti i 12 componenti grafici verificati (dashboard, analytics, day, reports).

### Colori fuori dal sistema token

Censiti integralmente in A2. In sintesi: 3 pagine Macro Desk con `#20293c` inline, il fallback del termometro volatilità, il default del color picker strategie, un badge amber Tailwind, la palette generata del simulatore, le swatch del picker in Impostazioni, e 4 rgba decorativi nel Macro Desk. **Nessun colore hardcoded nei componenti P&L, nelle card, nei testi o nei grafici principali**: la disciplina dichiarata in FASE 10 è reale.

## A2 — Colori hardcoded fuori dai token

| File:riga | Valore | Contesto | Gravità |
|---|---|---|---|
| [macro-desk/[id]/page.tsx:92](src/app/(app)/macro-desk/[id]/page.tsx:92) | `#20293c` | `borderColor` inline = copia di `--md-border`, usata FUORI dal contenitore `.macro-report` dove il token non è visibile | Debito: 3 copie dello stesso hex |
| [macro-desk/trends/page.tsx:60](src/app/(app)/macro-desk/trends/page.tsx:60) | `#20293c` | idem | idem |
| [macro-desk/scorecard/page.tsx:63](src/app/(app)/macro-desk/scorecard/page.tsx:63) | `#20293c` | idem | idem |
| [termometro-volatilita.tsx:45-46](src/components/macro-desk/termometro-volatilita.tsx:45) | `#d98324`, `#3b82f6` | Fallback di `var(--md-warn, …)` / `var(--md-info, …)` che **non coincidono** coi token reali (`#f5a623`, `#4f8ef7`). Mai attivi dentro `.macro-report`, ma se il componente venisse montato altrove renderebbe colori diversi | Basso ma insidioso |
| [strategy-form-dialog.tsx:105](src/app/(app)/strategies/strategy-form-dialog.tsx:105) | `#2563eb` | Default del color picker strategia (blue-600 Tailwind, non il `--primary` del tema) | Cosmetico |
| [mt5-sync-settings.tsx:58](src/app/(app)/settings/mt5-sync-settings.tsx:58) | `text-amber-600 dark:text-amber-400` | Badge "⚠ N divergenze P&L" — unico uso della palette Tailwind grezza in tutta l'app | **Contrasto sotto AA** (vedi A3) |
| [equity-simulator.tsx:96](src/components/analytics/equity-simulator.tsx:96) | `hsl(i·137.508 % 360, 65%, 52%)` | Palette generata per N linee del simulatore | **Il rilievo più serio** (C-01) |
| [accent-picker.tsx:27-38](src/app/(app)/settings/accent-picker.tsx:27) | 8 valori oklch | Swatch di anteprima accenti e coppie P&L — **divergono dai token che rappresentano** (C-02) | Medio |
| [trends-view.tsx:123-124](src/components/macro-desk/trends-view.tsx:123) | `rgba(245,166,35, .4/.08)` | Bordo/fondo callout stantio = `--md-warn` con alpha, ricopiato a mano | Basso |
| [trends-chart.tsx:100](src/components/macro-desk/trends-chart.tsx:100) | `rgba(139,152,173,0.13)` | Banda recessione = `--md-muted` con alpha, ricopiato | Basso |
| [trends-view.tsx:665](src/components/macro-desk/trends-view.tsx:665), [report-detail.tsx:77](src/components/macro-desk/report-detail.tsx:77) | `rgba(255,255,255,.04)` | Inset highlight decorativo | Trascurabile |

Totale: **11 punti** hardcoded su un'app di questa superficie è un numero basso; 7 sono confinati al Macro Desk che ha identità cromatica propria e dichiarata.

## A3 — Tabella dei contrasti calcolati con esito WCAG

Soglie: AA testo normale ≥ 4.5:1 · testo grande/grafica ≥ 3:1. Valori calcolati, hex = colore effettivamente reso.

### Tema chiaro

| Coppia | Hex | Rapporto | Esito |
|---|---|---|---|
| foreground su card | `#0a0d13` / `#ffffff` | **19.41** | AA |
| foreground su background | `#0a0d13` / `#fafbfd` | **18.76** | AA |
| muted-foreground su card | `#676d78` / `#ffffff` | **5.24** | AA |
| muted-foreground su background | | **5.06** | AA |
| muted-foreground su muted (hover righe) | `#676d78` / `#f3f4f8` | **4.77** | AA |
| primary come testo/link su card | `#005afd` / `#ffffff` | **5.40** | AA |
| primary-foreground su bottone primario | `#fafbfd` / `#005afd` | **5.22** | AA |
| secondary-fg su secondary | | **16.15** | AA |
| accent-fg su accent (hover menu) | | **15.87** | AA |
| destructive su card | `#d2041e` / `#ffffff` | **5.56** | AA |
| profit su card / su background | `#007f4e` | **5.07** / 4.90 | AA |
| loss su card / su background | `#dd001e` | **5.12** / 4.95 | AA |
| breakeven su card | `#4f5359` | **7.77** | AA |
| popover-fg su popover (tooltip grafici) | | **19.41** | AA |
| sidebar-fg su sidebar | | **18.06** | AA |
| chart-1 su card | `#005afd` | **5.40** | AA |
| chart-2 su card | `#007f4e` | **5.07** | AA |
| chart-3 su card | `#dd001e` | **5.12** | AA |
| **chart-4 su card** | `#d16900` | **3.65** | **Solo 3:1** — ok come barra/linea, NON usarlo come colore di testo |
| chart-5 su card | `#8727e5` | **6.08** | AA |
| **amber-600 su background** ([mt5-sync-settings.tsx:58](src/app/(app)/settings/mt5-sync-settings.tsx:58)) | `#d97706` / `#fafbfd` | **3.08** | **FAIL AA** (testo normale) |
| strategy default `#2563eb` su card (pallino, non testo) | | 5.17 | ok non-text |

### Tema scuro

| Coppia | Hex | Rapporto | Esito |
|---|---|---|---|
| foreground su card / su background | `#f5f7f9` | **16.71** / 18.42 | AA |
| muted-foreground su card / su background | `#9ca3b0` | **7.08** / 7.80 | AA |
| muted-foreground su muted | | **5.98** | AA |
| primary come testo su card | `#4584fe` | **5.09** | AA |
| primary-foreground (scuro) su bottone | `#080a0f` / `#4584fe` | **5.61** | AA (scelta corretta: il bianco starebbe a ~3.6) |
| destructive su card | `#fe3d3e` | **5.08** | AA |
| profit su card | `#03ce82` | **8.68** | AA |
| loss su card | `#fe3d3e` | **5.08** | AA |
| breakeven su card | `#9ea3ac` | **7.08** | AA |
| popover-fg su popover | | **16.03** | AA |
| chart-1…5 su card | | 5.09 / 8.68 / 5.08 / 8.99 / 5.66 | AA tutti |
| amber-400 su background (badge MT5 in dark) | `#fbbf24` | **11.86** | AA |
| strategy default `#2563eb` su card scura (pallino) | | **3.47** | ok non-text, borderline |
| equity-sim lineColor(0) su card scura | `#d43535` | 3.73 | ok non-text |
| **equity-sim hsl(60°/90°/137°) su card chiara** | `#d4d435` `#85d435` `#35d462` | **1.58 / 1.83 / 1.95** | **FAIL anche il 3:1 non-text** |

### Macro Desk (dark fisso, superfici `#080b12 → #1a2438`)

| Colore | su bg | su surface | su surface-2 | su surface-3 | Esito |
|---|---|---|---|---|---|
| `--md-text` `#eef2f9` | 17.53 | 15.82 | 14.84 | 13.82 | AA ovunque |
| `--md-text-2` `#c9d3e3` | 13.04 | 11.76 | 11.04 | 10.28 | AA ovunque |
| `--md-muted` `#8b98ad` | 6.74 | 6.08 | 5.71 | 5.31 | AA ovunque |
| `--md-up` `#2fd67a` | 10.33 | 9.32 | 8.74 | 8.14 | AA ovunque |
| `--md-down` `#f2495c` | 5.51 | 4.98 | 4.67 | **4.35** | **Sotto AA solo su surface-3** (hover delle card): il testo rosso durante l'hover scende a 4.35 |
| `--md-warn` `#f5a623` | 9.71 | 8.76 | 8.22 | 7.66 | AA ovunque |
| `--md-info` `#4f8ef7` | 6.13 | 5.53 | 5.19 | 4.84 | AA ovunque |
| `--md-gold/oil/idx/cross` | 10.76/7.35/7.81/7.36 | ≥6.6 | ≥6.2 | ≥5.8 | AA ovunque |

### Accenti e coppie P&L alternative

Già coperti dal test automatico [theme-contrast.test.ts](src/lib/theme-contrast.test.ts) (30 combinazioni: base ×2 modi, 4 accenti ×2, 2 coppie P&L ×2 colori ×2 modi, tutte ≥4.5 e in gamut). I valori dichiarati nei commenti di globals.css (5.89, 4.69, 5.07, 8.68, 5.04, 8.67, 6.32, 4.92, 8.59, 5.12, 5.09, 5.08, 6.36, 4.51…) sono verificati dal test a ogni run: non li ricopio, il meccanismo è più forte di qualsiasi tabella statica.

**Stati interattivi**: focus visibile unico (`outline: 2px solid var(--ring)`, globals.css:290-293) su tutti gli elementi; hover/active/disabled dai token shadcn (`--accent`, opacity); nessun default di libreria scoperto. Il bug "testo nero su popover scuro" di Recharts è neutralizzato centralmente (`tooltipItemStyle`/`tooltipLabelStyle` in chart-spec.ts:41-43) e ho verificato che **tutti** i `<Tooltip>` Recharts dell'app o passano `itemStyle`+`labelStyle` (10 file) o usano `content` custom che riusa `CHART.tooltipStyle` (target-scatter:51, segment-performance:62, equity-simulator:372). Nessun altro caso dello stesso tipo trovato in nessuna libreria.

**Tema chiaro**: esiste già, è completo, testato automaticamente e a parità di qualità col dark (default: dark, toggle in [theme-toggle.tsx](src/components/layout/theme-toggle.tsx)). Nessun costo da stimare: il lavoro è fatto.

## A4 — Colori dei grafici: distinguibilità e daltonismo

### I 5 token chart (uso reale: mai più di 2-3 serie simultanee)

ΔE Lab a coppie (soglia pratica di distinguibilità affidabile ~20-25):

- **Visione normale**: minimo **31.2** (blu vs viola, light) — tutte le coppie distinguibili. Coerenza di saturazione dichiarata e verificata.
- **Deuteranopia** (il caso più comune): blu vs viola scende a **16.7** (light) / **12.3** (dark); rosso vs ambra a **9.5** (light). Confondibili.
- **Protanopia**: blu vs viola **9.8** (light) / **3.6** (dark) — di fatto identici; verde vs rosso **16.6** (light).

**Attenuante decisiva**: nell'app i 5 token non compaiono mai insieme. L'uso reale è: rolling ratios = chart-1 (Sharpe) vs chart-2 (Sortino), coppia che regge benissimo (ΔE deuteranopia 118.5/101.9, protanopia 120.9/108.1); tutti gli altri grafici sono monocromatici (chart-1) o semantici (profit/loss). Il rischio blu-viola/rosso-ambra diventerebbe reale solo aggiungendo grafici multi-serie a 4-5 categorie: da tenere presente, non da fixare oggi.

**Con 5, 10, 20 serie**: il sistema token si ferma a 5 — qualsiasi grafico futuro con più di 5 serie dovrà estendere la famiglia. L'unico grafico che oggi supera 5 serie è il simulatore (fino a 100 linee), che infatti esce dal sistema: vedi C-01.

### Coppia profit/loss e daltonismo

- Classic verde/rosso: ΔE deuteranopia **42.1** (light) / **33.7** (dark), protanopia **16.6** (light) — debole, com'è inevitabile per il verde/rosso.
- **La mitigazione è già progettata**: le coppie alternative "Blu/Rosso" (ΔE deuteranopia **189.1** light / 132.5 dark) e "Verde/Viola" (**123.1** / 104.9) sono selezionabili in Impostazioni con l'hint esplicito "adatta al daltonismo rosso-verde" ([constants.ts:53-57](src/lib/constants.ts:53)), e i grafici le ereditano via `var(--profit/--loss)` senza codice. Questo è lo stato dell'arte del pattern.
- Ridondanza non cromatica presente quasi ovunque: segni +/− sugli importi, frecce ↑↓ nel Macro Desk (trends-view.tsx:133-135), posizione dell'ago nel bias gauge, etichette testuali sul termometro. Il colore non è mai l'unico canale.

### Il buco: Macro Desk (vedi C-05)

`--md-up #2fd67a` vs `--md-down #f2495c`: ΔE deuteranopia **13.9** — quasi indistinguibili — e il selettore `data-pnl` **non ha effetto** dentro `.macro-report`. Un utente deuteranope che ha scelto "Blu/Rosso" ottiene l'app corretta e il Macro Desk illeggibile nei chip bias/direzione dove il testo è uguale ("rialzista"/"ribassista" aiutano, ma gauge e barre no).

### Simulatore equity (vedi C-01)

`lineColor()` a rotazione d'angolo aureo, L e S fisse: n=5 → ΔE min 61 (ok); n=10 → **20.3** normale, **9.1** deuteranopia; n=20 (il default!) → **9.2** normale, **1.7** deuteranopia. Le linee individuali però sono dichiaratamente "spaghetti" decorativi (media e bande ±σ portano l'informazione), quindi il vero problema non è la distinguibilità reciproca ma il contrasto su card chiara (1.58:1): in light mode un terzo delle linee sparisce.

## A5 — Incoerenze semantiche

Il sistema è **coerente al 95%**: profit/loss/breakeven passano tutti da `text-profit/text-loss/text-breakeven` o `pnlChartColor()` ([chart-spec.ts:50-55](src/components/charts/chart-spec.ts:50)) — verificato su dashboard, trades, analytics, day, reports, calendari. Rilievi minori:

1. **Score gauge** ([score-gauge.tsx:12-19](src/components/dashboard/score-gauge.tsx:12)): usa `--profit`/`--loss`/`--chart-4` per le fasce di score (≥70 / 40-69 / <40). Stesso colore, significato diverso ("qualità" vs "denaro"). Accettabile come convenzione buono/cattivo, ma con `data-pnl="blue-red"` lo score ≥70 diventa **blu**: coerente col resto (blu = buono ovunque per quell'utente), quindi difendibile — da conoscere, non da correggere.
2. **chart-2 ≡ profit e chart-3 ≡ loss** (light: valori oklch identici): una serie categorica colorata chart-2 (es. Sortino nei rolling) è indistinguibile dal verde-profitto. Rischio di lettura semantica involontaria ("la linea verde = guadagno"). Oggi innocuo perché i rolling hanno legenda; diventerebbe ambiguo in grafici misti semantici+categorici. Inoltre chart-2/chart-3 **non seguono** `data-pnl`: per l'utente daltonico che ha scelto blu/rosso, il Sortino resta verde — incoerenza di secondo ordine.
3. **destructive vs loss**: quasi identici (`0.545 0.22 26` vs `0.565 0.23 26` light; identici in dark). "Errore di validazione" e "perdita di denaro" condividono il rosso — convenzione universale, nessun caso trovato in cui la sovrapposizione confonda.
4. **Macro Desk ambra**: `--md-warn` significa sia "cautela/rischio" (Radar rischi, report-tabs.tsx:206) sia "stantio" (cot-panel.tsx:295) sia "inflazione" come categoria (trends-view.tsx:35) sia "volatilità espansa" (termometro:45). Quattro significati per un colore dentro lo stesso modulo — il commento in report-tabs.tsx:547 ("freccia GRIGIA, non ambra: qui non è un warning") dimostra che il team sente già la tensione. Da sorvegliare.

## A6 — Rilievi cromatici

### [C-01] Palette generata del simulatore equity: invisibile in light mode, fuori dal sistema token
- **File**: [equity-simulator.tsx:94-97](src/components/analytics/equity-simulator.tsx:94)
- **Evidenza**: `hsl(h, 65%, 52%)` con L fissa. Su card chiara: hsl(60°) = `#d4d435` → **1.58:1**, hsl(90°) → 1.83, hsl(137°) → 1.95 — sotto anche il 3:1 della grafica non-text. Con 20 linee (default) ΔE min tra linee = 9.2 (1.7 in deuteranopia).
- **Impatto**: in tema chiaro fino a un terzo dei percorsi è quasi invisibile; l'unico grafico dell'app che ignora chart-spec.
- **Proposta**: lightness adattiva al tema (es. L 42% in light, 60% in dark) o — meglio — interpolare le linee da 2-3 token chart esistenti variando solo l'opacità: le linee sono decorative, la distinguibilità individuale non serve. Costo: ~1 h con verifica dei contrasti al solver.

### [C-02] Swatch del picker in Impostazioni divergenti dai token reali
- **File**: [accent-picker.tsx:27-38](src/app/(app)/settings/accent-picker.tsx:27)
- **Evidenza**: swatch blu `oklch(0.546 0.245 262.881)` vs token `oklch(0.54 0.251 262)`; smeraldo `0.508 0.118 165.612` (emerald-700 Tailwind, tinta 165.6) vs token `0.525 0.123 158`; loss di "classic" `0.577 0.245 27.325` (red-600, il vecchio valore FUORI GAMUT eliminato dalla palette) vs token `0.565 0.23 26`. Le swatch mostrano i colori **pre-revisione**: la revisione dei token (commentata in globals.css:108-112) non è arrivata al picker.
- **Impatto**: l'anteprima promette un colore, l'app ne applica un altro. Differenze piccole ma percepibili sulla tinta smeraldo (165.6° vs 158°).
- **Proposta**: sostituire le mappe hardcoded con i valori dei token (o rendere le swatch dei `div` con `data-accent` che leggono `var(--primary)`). Costo: 30 min.

### [C-03] Badge divergenze MT5 sotto AA in light
- **File**: [mt5-sync-settings.tsx:58](src/app/(app)/settings/mt5-sync-settings.tsx:58)
- **Evidenza**: `text-amber-600` = `#d97706` su `--background` chiaro → **3.08:1**; è testo normale (stessa taglia del testo circostante), soglia 4.5. In dark `amber-400` → 11.86, ok.
- **Impatto**: l'avviso più delicato della sync (P&L divergente dal broker) è il testo meno leggibile della pagina.
- **Proposta**: un token `--warning` di tema (light `oklch(0.55 0.15 60)` ≈ ambra AA, dark l'attuale) o riuso di `--chart-4` **solo se** portato ad AA. Costo: 30 min + coppia al solver.

### [C-04] chart-4 (ambra) sotto AA come testo in light
- **File**: [globals.css:106](src/app/globals.css:106), consumato da [score-gauge.tsx:18](src/components/dashboard/score-gauge.tsx:18)
- **Evidenza**: `#d16900` su card = **3.65:1**. Oggi è usato solo come stroke del gauge e barre (soglia non-text 3:1: passa). Nessuna violazione attiva.
- **Impatto**: rilievo preventivo — il token è una trappola: chiunque lo usi domani per testo (es. un'etichetta "score medio") scende sotto AA senza che il test attuale lo intercetti (chart-4 non è fra i token testati come testo).
- **Proposta**: o alzarlo ad AA (il solver dà il punto), o annotare in globals.css "solo grafica, mai testo". Costo: 10 min.

### [C-05] Macro Desk fuori dal sistema di accessibilità daltonica
- **File**: [globals.css:340-341](src/app/globals.css:340) (`--md-up/--md-down`), [constants.ts:43-57](src/lib/constants.ts:43) (data-pnl che non li tocca)
- **Evidenza**: ΔE deuteranopia up/down = **13.9** (protanopia 46.8). Il cookie `tj-pnl` ridefinisce `--profit/--loss` ma il Macro Desk legge `--md-up/--md-down`, che restano verde/rosso per tutti.
- **Impatto**: la promessa fatta in Impostazioni ("adatta al daltonismo rosso-verde") vale ovunque tranne che nel modulo più denso di semafori direzionali dell'app.
- **Proposta**: 2 righe CSS per coppia — `[data-pnl="blue-red"] .macro-report { --md-up: …; --md-down: …; }` con valori cercati al solver sulle superfici `#080b12/#1a2438`. Costo: ~1 h test inclusi.
- **In subordine**: `--md-down` su `--md-surface-3` (stato hover) = **4.35** — portare il rosso a ~`#f4576a` (≥4.5 su surface-3) chiude anche questo.

### [C-06] Bordo `#20293c` triplicato fuori scope
- **File**: [macro-desk/[id]/page.tsx:92](src/app/(app)/macro-desk/[id]/page.tsx:92), [trends/page.tsx:60](src/app/(app)/macro-desk/trends/page.tsx:60), [scorecard/page.tsx:63](src/app/(app)/macro-desk/scorecard/page.tsx:63)
- **Evidenza**: tre copie inline dello stesso hex perché `--md-border` vive dentro `.macro-report` e gli header delle pagine ne stanno fuori.
- **Proposta**: dichiarare i token `--md-*` anche su una classe utility applicabile all'header (o spostare l'header dentro il contenitore). Costo: 20 min.

### [C-07] Fallback del termometro disallineati dai token
- **File**: [termometro-volatilita.tsx:45-46](src/components/macro-desk/termometro-volatilita.tsx:45)
- **Evidenza**: `var(--md-warn, #d98324)` ma `--md-warn = #f5a623`; `var(--md-info, #3b82f6)` ma `--md-info = #4f8ef7`. Fallback mai attivi oggi, ma mentono su cosa succederebbe.
- **Proposta**: allineare i fallback ai token o toglierli. Costo: 5 min.

### [C-08] Coppia chart-1/chart-5 (blu/viola) indistinguibile in protanopia
- **File**: [globals.css:103,107,154,158](src/app/globals.css:103)
- **Evidenza**: ΔE protanopia **3.6** (dark) / 9.8 (light); deuteranopia 12.3-16.7. Oggi mai affiancati in un grafico. Rilievo preventivo, stesso spirito di C-04: la famiglia chart dichiara 5 colori "distinguibili" ma due di essi non lo sono per l'8% degli uomini.
- **Proposta**: nessun intervento ora; regola di progetto "mai blu e viola nello stesso grafico multi-serie" o sostituzione futura del viola con teal.

---

## B1 — Inventario di ciò che è personalizzabile oggi

| Area | Opzione | Valori | Persistenza | Dove |
|---|---|---|---|---|
| Impostazioni | Nome, fuso orario, valuta base | 10 timezone, 5 valute (USD EUR GBP CHF JPY) | DB (`User`) | [profile-form.tsx:26-37](src/app/(app)/settings/profile-form.tsx:26) |
| Impostazioni | Password (set/cambio) | — | DB | password-form.tsx |
| Impostazioni | **Accento UI** | 5 (blu, viola, smeraldo, ambra, rosa) | cookie `tj-accent` → `data-accent` | [constants.ts:23](src/lib/constants.ts:23) |
| Impostazioni | **Coppia profit/loss** | 3 (classic, blu/rosso, verde/viola — 2 daltoniche dichiarate) | cookie `tj-pnl` → `data-pnl` | [constants.ts:43](src/lib/constants.ts:43) |
| Impostazioni | Sync MT5 | file, conto, asset class, enabled per sorgente | DB | mt5-sync-settings.tsx |
| Impostazioni | Conti trading | CRUD + archiviazione | DB | settings/accounts |
| Header | **Tema chiaro/scuro** | 2 (default dark) | next-themes (localStorage) | [theme-toggle.tsx](src/components/layout/theme-toggle.tsx) |
| Header | Conto attivo | per-conto o "Tutti" | cookie `tj-account` | account-switcher.tsx |
| Dashboard | **View mode** | $ / % / R / **Privacy** (maschera importi) | stato client | [dashboard.ts:4](src/lib/dashboard.ts:4) |
| Dashboard | **Widget visibili** | 26 widget on/off | DB (`User.dashboardLayout`, parse tollerante) | [dashboard.ts:15-42](src/lib/dashboard.ts:15) |
| Dashboard mobile | Metriche estese / analytics | 2 toggle | DB (chiave separata) | dashboard.ts:78-87 |
| Ovunque | **Periodo** | 7 preset (settimana, mese, 7/30/90gg, YTD, tutto) + range custom da calendario | searchParams (link condivisibili) | [period.ts:16-37](src/lib/period.ts:16) |
| Ovunque (multi-valuta) | Valuta in esame | fra le valute dei conti | searchParams | currency-filter.tsx |
| Trades | Filtri: simbolo (testo), direzione, stato, esito (win/loss/be), asset class, strategia (incl. "senza"), tag | — | searchParams + export CSV coi filtri | [trade-filters-bar.tsx](src/components/trades/trade-filters-bar.tsx) |
| Analytics | Filtri strumento + direzione | — | searchParams | analytics-filters.tsx |
| Analytics | Finestra rolling giorni / trade | 60·120·252 gg / 50·100·250·500 trade (disabilitate con motivo se manca storico) | searchParams | [rolling.ts:47,57](src/lib/metrics/rolling.ts:47) |
| Analytics | Metrica rolling | win rate, R medio, expectancy, profit factor | stato client | rolling.ts:258-263 |
| Analytics | Metrica segmenti (ora/durata) | avgR / expectancy | stato client | segment-performance-chart.tsx:41 |
| Simulatore | start equity, win %, W/L ratio, n. trade (≤1000), n. linee (≤100), rischio (% o importo), scala (lineare/log) | default = statistiche reali del conto | stato client | [equity-simulator.tsx:150-159](src/components/analytics/equity-simulator.tsx:150) |
| Strategie | Nome, descrizione, **colore libero** (color picker) | qualsiasi hex | DB | strategy-form-dialog.tsx |
| Report settimana | Settimana (`?w`), stampa | — | searchParams | reports/settimana |
| Day | Mese del calendario | — | month-picker | day/month-picker.tsx |

Filosofia riconoscibile e sana: le opzioni di **analisi** vivono nei searchParams (condivisibili, SSR), le **preferenze** in cookie/DB, e le scelte cromatiche sono **set curati e validati**, non picker liberi (unica eccezione: il colore strategia, usato solo come pallino identificativo — corretto così).

## B2 — Preset e ventagli di scelta: adeguati o insufficienti

| Ventaglio | Giudizio | Motivazione |
|---|---|---|
| Periodi (7 preset + custom) | **Quasi adeguato** | Coprono review settimanale/mensile/trimestrale/annuale. Manca **"Mese scorso"** — la review a inizio mese del mese appena chiuso è il rito più comune del trading journal e oggi obbliga al range custom ogni volta. "Trimestre corrente" è il secondo assente plausibile. |
| Finestre rolling (60/120/252 gg; 50/100/250/500 trade) | **Adeguato** | Scala ben ragionata (commento in rolling.ts:51-55); le finestre impossibili restano visibili e disabilitate col motivo — pattern esemplare. Un'opzione 20-30 gg aiuterebbe i conti giovani, ma serve a <1 utente su 10 e per poco tempo: non prioritaria. |
| Timezone (10 voci) | **Insufficiente** | C'è Hong Kong ma **non Berlino, Parigi, Madrid, Amsterdam**: per un prodotto con utenza europea è il buco più probabile al primo onboarding. Chi non trova il suo fuso ripiega su Rome/UTC e tutti i bucket giornalieri ne risentono. |
| Valute (5) | **Sufficiente ora** | USD/EUR/GBP/CHF/JPY coprono i broker principali. AUD/CAD sono la prima richiesta prevedibile (prop firm australiane); costo di aggiunta banale quando serve. |
| Accenti (5) + coppie P&L (3) | **Adeguato per design** | Set piccolo, curato, ogni voce AA-validata dal test. Allargarlo o liberalizzarlo distruggerebbe la garanzia: giusto così. |
| Widget dashboard (26 on/off) | **Adeguato** | Copertura totale delle card; manca solo il riordino (vedi B3-6). |
| View mode ($/%/R/privacy) | **Adeguato** | Il privacy mode è una finezza rara nei journal. |
| Simulatore (7 parametri) | **Adeguato** | Default = statistiche reali del conto (ottimo); limiti difensivi giusti. Il parametro assente più richiesto sarà "commissioni/costi per trade" (vedi B3-5). |
| Filtri trades (7 dimensioni + CSV) | **Adeguato** | Più ricco della media di categoria. Manca solo un filtro "range di R" o "importo", richiesta rara. |

## B3 — Opzioni mancanti proposte, con costo e utenza stimata

Ordinate per rapporto valore/costo:

1. **Lista timezone completa (IANA)** — Chi: ogni nuovo utente non coperto dalle 10 voci; quando: una volta all'onboarding ma con effetto permanente sui bucket giornalieri. Dove: Impostazioni → Profilo. Come: `Intl.supportedValuesOf("timeZone")` raggruppata per continente, con le 10 attuali in cima come "frequenti". Costo: **~1 h**. Da fare.
2. **Preset "Mese scorso" (+ eventuale "Trimestre")** — Chi: chiunque faccia review mensile (stima: metà degli utenti attivi, ogni mese). Dove: [period.ts](src/lib/period.ts) + il select esistente. Costo: **~1 h** (preset + label + test di `resolvePeriod`). Da fare.
3. **Coppia P&L daltonica estesa al Macro Desk** — è C-05: qui conta come opzione che l'utente crede di avere e non ha. Chi: utenti daltonici (~8% maschile) che hanno già scelto la coppia alternativa. Costo: **~1 h**. Da fare.
4. **Periodo di default persistente** (l'ultimo periodo scelto ricordato in cookie invece di ripartire da "Tutto lo storico") — Chi: tutti, a ogni visita; il trader attivo vive su "Questo mese"/"7 giorni" e oggi lo re-imposta ogni sessione. Dove: nessuna UI nuova — scrittura del cookie nel PeriodFilter, lettura in `resolvePeriod` quando il searchParam è assente. Costo: **~2 h** (attenzione a non rompere i link condivisi: il searchParam esplicito deve sempre vincere). Da fare.
5. **Commissioni per trade nel simulatore** — Chi: futures/scalper (fee incidono sull'expectancy simulata); stima 3-4 utenti su 10, uso mensile. Dove: ottavo campo del form. Costo: **~2 h** (motore + test per divisione zero/fee>rischio). Seconda fascia.
6. **Riordino dei widget dashboard** (drag & drop) — Chi: power user, una tantum; stima **<1 su 10** dopo che l'on/off esiste già. Costo: **alto** (~2-3 gg: dnd, persistenza ordine, mobile). Classificazione: *nice-to-have, non giustificato ora* — dichiararlo fuori scope finché non lo chiedono. |
7. **Granularità aggregazione grafici** (P&L giornaliero → settimanale/mensile per storici lunghi) — Chi: utenti con >1 anno di storico, uso mensile; stima 2-3 su 10 a regime. Dove: toggle sul grafico daily-pnl. Costo: **~1 gg** (groupBy SQL per settimana/mese nel fuso utente — attenzione al doppio `AT TIME ZONE`). Seconda fascia.
8. **Primo giorno della settimana (lun/dom)** — Chi: utenti USA; stima **<1 su 10** dell'utenza attuale (prodotto in italiano). Costo: ~mezza giornata (calendari + `mondayOf`). *Sotto soglia: rimandare.*
9. **Soglie dello score personalizzabili** (oggi 70/40 hardcoded in score-gauge.tsx:15-17) — Chi: <1 su 10; il valore dello score sta proprio nell'essere una scala fissa confrontabile. *Sconsigliata: opzione senza ragione d'uso solida.*
10. **Colori profit/loss liberi (color picker)** — richiesta che prima o poi arriverà. *Sconsigliata esplicitamente*: il valore del sistema attuale è che ogni coppia è AA-validata e daltonicamente misurata; un picker libero sposta sull'utente la responsabilità del contrasto. Se si vorrà ampliare, aggiungere una **quarta coppia curata** (es. teal/arancio) al costo di ~30 min inclusa la validazione automatica, che il test raccoglie da solo.

## B4 — Opzioni superflue da rimuovere

Ricerca condotta apposta: **non c'è quasi nulla da togliere** — il segno che il rasoio è già stato applicato (la rimozione del widget Monte Carlo dalla dashboard, con parse tollerante per non perdere i layout salvati — dashboard.ts:89-98 — dimostra la pratica).

Due osservazioni al margine:

1. **Timezone esotiche prima di quelle ovvie**: `Asia/Hong_Kong` e `Australia/Sydney` presenti mentre manca mezza Europa — non superflue di per sé, ma la lista attuale è insieme troppo corta e strana; si risolve con B3-1.
2. **`--md-oil/--md-idx/--md-cross`** (globals.css:345-347): token per-asset del Macro Desk usati solo via `assetAccentVar`; se un domani gli asset coperti cambiano, ricordarsi che sono nomi legati al contenuto (petrolio, indici, cross) più che al ruolo. Non rimuovere: annotare.

Nessuna opzione utente esistente risulta senza ragione d'uso: i quattro view mode, il privacy mask, i toggle mobile persistiti e le finestre rolling hanno tutti un caso reale.

## Cosa è già coerente e non va toccato

- **Il ciclo token → solver → test**: contrasti calcolati in design (`scripts/contrast.mjs`), scritti nei commenti del CSS, e **ri-verificati automaticamente a ogni run** leggendo il CSS reale ([theme-contrast.test.ts](src/lib/theme-contrast.test.ts), 30 combinazioni AA + gamut). È il meccanismo che rende obsoleto metà di questo audit prima ancora di scriverlo: qualsiasi regressione della palette rompe la build.
- **La verifica di gamut sRGB**: unico progetto in cui ho visto testato che i token non "mentano" sulla propria saturazione per clamping del browser.
- **La semantica P&L**: un solo punto di decisione (`pnlChartColor` + classi `text-profit/loss/breakeven`), ereditato ovunque via CSS var — le coppie alternative si propagano ai grafici senza una riga di codice.
- **La disciplina tooltip Recharts**: il bug storico del testo nero è neutralizzato centralmente e tutti i 12 grafici sono conformi (verificati uno a uno).
- **Focus/hover/motion unificati**: outline di focus identico su ogni elemento interattivo, durata/easing unici, `prefers-reduced-motion` rispettato anche nel Macro Desk.
- **Il pattern "disabilitato col motivo"** delle finestre rolling (rolling-controls.tsx:11-14): l'opzione impossibile resta visibile e spiega perché — da estendere, non da cambiare.
- **Set di personalizzazione curati e validati** invece di picker liberi: è la scelta architetturale giusta per un prodotto data-heavy, e va difesa anche in futuro.
- **Il tema chiaro**: esiste, è completo e testato — nessun investimento richiesto.
