# Rapporto notte — Driver Desk (F0 → F3)

Sessione autonoma del 2026-08-03/04 · branch `feature/driver-desk` (4 commit, MAI toccato main) · tutto in locale, nessuna scrittura su Neon, nessun deploy.

**TL;DR: tutte e quattro le fasi complete.** Spec congelata, 13/13 serie ingerite in locale, motore testato con verifica indipendente (74 test nuovi, suite completa 1394 verdi), tab "Driver" nel Macro Desk con typecheck+lint+build verdi. Due sorprese: il **Bund 10Y daily esiste gratis** (Bundesbank, D2 non è scattata) e il **rame l'ho lasciato fuori per affidabilità, non per indisponibilità** (D1 applicata — decisione da rivedere tu, punto 2 delle questioni aperte).

---

## 1 · Obiezioni al piano (D9)

1. **La premessa di D1 è per metà sbagliata, e la decisione andrebbe riformulata.** Il rame daily gratuito ESISTE: Yahoo `HG=F` (futures COMEX front-month, dal 2000, granularità giornaliera verificata). L'ho comunque escluso applicando D1, perché il criterio era "gratis **e affidabile**" e Yahoo — per policy di questo stesso repo — «non è mai l'unica fonte di uno strumento»: l'unico fallback gratuito (CFD Dukascopy `coppercmdusd`) ha oltre metà delle sedute mancanti ed è inutilizzabile. Nota però l'incoerenza: il paniere DAX si regge su Euro Stoxx 50 e CAC 40 che sono anch'essi Yahoo-primari — lì il fallback Dukascopy esiste ma copre solo dal 2011-2014, quindi in pratica anche il DAX dipende da Yahoo per la storia lunga. Se accetti quel rischio per gli indici, è difficile non accettarlo per il rame. Riabilitarlo è un'aggiunta di ~5 righe al catalogo.
2. **L'intersezione delle date (D5) ha un costo di freschezza che il piano non nomina:** le serie petrolio di FRED escono con ~7 giorni di ritardo, quindi la scheda WTI è SEMPRE ferma a una settimana fa (oggi: dati al 2026-07-27), e il dollar index (~3 giorni di lag) frena anche la scheda oro. È dichiarato a schermo, ma se in futuro vorrai freschezza, servirà una fonte petrolio non-FRED — non l'ho fatto perché sarebbe stato contro D5/D8 e la filosofia "mai surrogati".

Nessun'altra obiezione: la separazione paniere/driver e il divieto di compositi si sono rivelati comodi anche implementativamente.

## 2 · Verifica fonti (download reali del 2026-08-03)

| Serie | Fonte scelta | Inizio | Esito |
|---|---|---|---|
| Oro | Dukascopy `xauusd` (in casa) | 1999-06 | ✅ 8236 righe |
| Argento | Dukascopy `xagusd` | 1999-06 | ✅ 8223 righe |
| **Rame** | Yahoo `HG=F` (2000) unica; fallback Duka inutilizzabile (63 % buchi); FRED mensile | — | ⚠️ **escluso per affidabilità (D1)** |
| WTI | FRED `DCOILWTICO` (in casa) + fallback Duka | 1986 | ✅ 10209 righe (lag ~7g) |
| Brent | FRED `DCOILBRENTEU` + fallback Yahoo `BZ=F` | 1987 | ✅ 9942 righe (lag ~7g) |
| DAX | Yahoo `^GDAXI` (in casa) + fallback Duka | 1987 | ✅ 9758 righe |
| Euro Stoxx 50 | Yahoo `^STOXX50E` + fallback Duka (dal 2014) | 2007-03 | ✅ 4847 righe |
| CAC 40 | Yahoo `^FCHI` + fallback Duka (dal 2011) | 1990 | ✅ 9250 righe |
| S&P 500 | Yahoo `^GSPC` (in casa) + FRED + Duka | 1970 | ✅ 14267 righe |
| Real yield 10Y | FRED `DFII10` | 2003 | ✅ 5899 righe |
| Breakeven 10Y | FRED `T10YIE` | 2003 | ✅ 5900 righe |
| Dollar index | FRED `DTWEXBGS` | 2006 | ✅ 5159 righe (lag ~3g) |
| EURUSD | FRED `DEXUSEU` + fallback Yahoo | 1999 | ✅ 6916 righe |
| **Bund 10Y** | **Bundesbank REST** (keyless, ufficiale, nuova fonte) | **1997-08** | ✅ 7357 righe |
| Spread WTI−Brent | derivato dalla coppia FRED, mai salvato | 1987 | ✅ |

Nessuna serie richiede chiave o abbonamento; nessun blocco anti-bot con lo User-Agent già in uso. Conferme negative: rame FRED = mensile, Bund FRED = mensile (come previsto dal piano).

**Storia comune per scheda (D6, scritta a schermo):** Oro **dal 2006-01** (vincolo: dollar index) · WTI **dal 2006-01** (idem) · DAX **dal 2007-03** (vincolo: Euro Stoxx 50).

**Showstopper trovati: nessuno.** Le tre schede esistono tutte, complete dei tre blocchi.

## 3 · Decision log

| # | Decisione | Perché è scattata |
|---|---|---|
| D1 | **APPLICATA** — paniere oro = solo argento, rame dichiarato assente a schermo con il motivo | rame daily solo su Yahoo senza fallback utilizzabile → non "affidabile" secondo lo standard del repo (vedi obiezione 1) |
| D2 | **NON scatta** — driver DAX = EURUSD **e** Bund 10Y | Bundesbank REST pubblica il rendimento 10Y daily dal 1997, gratis e keyless; scritto un piccolo client nuovo (`src/lib/driver-desk/sources/bundesbank.ts`, parser puro testato) |
| D3 | non scattata | Euro Stoxx 50 e CAC 40 disponibili |
| D4 | non scattata | Brent disponibile su FRED |
| D5 | applicata come da spec | intersezione date per scheda, mai fill; giorni persi dichiarati in UI (oro ne perde ~1300 su 20 anni: calendari metalli vs FRED) |
| D6 | applicata | data di inizio storia comune scritta su ogni scheda |
| D7 | rispettata | nessuno scheduling implementato; proposta al §6 |
| D8 | mai servita | nessun test fallito senza spiegazione |

**Scelte conservative su bivi non previsti:**
- *Dati propri vs riuso tabelle Stagionalità per oro/S&P/WTI:* il Driver Desk ha le SUE righe (`DriverDeskBar`) anche per le serie già presenti altrove — modulo davvero additivo, zero accoppiamento col job stagionalità. Costo: ~40k righe duplicate in locale. Alternativa (leggere `SeasonalityDailyBar`) possibile in futuro.
- *Dettagli di formula non specificati nel prompt*, congelati in spec PRIMA di guardare i risultati: percentile con `<` stretto e giorno corrente fuori dal denominatore; z su tutta la storia; variazione recente = 20 sedute; trasformazione a differenze (non log) per tassi e spread, che attraversano lo zero; campione minimo 250 osservazioni sotto il quale si dichiara "campione insufficiente".
- *Tassi negativi:* il filtro `>0` della pipeline stagionalità sarebbe stato un bug qui (DFII10 e Bund negativi 2019-21): l'ingest del Driver Desk lo applica solo ai prezzi.
- *Integrazione UI:* il tab richiede 3 righe in `report-detail.tsx` e 3 in `page.tsx` del report (stessa via d'ingresso usata a suo tempo dal pannello COT); nessun altro modulo esistente toccato.

**QA dell'ingest (segnalato, non corretto):** 55 anomalie su 13 serie, TUTTE eventi storici reali (Guerra del Golfo 1991, crisi 2008, COVID marzo-aprile 2020 sul petrolio, crollo argento gen-feb 2026). Nessun buco oltre 9 giorni civili, nessuna data fuori ordine. Verifica incrociata riuscita: lo spread WTI−Brent calcolato (−7,57 $) coincide col conto a mano sugli ultimi dati FRED (84,25 − 91,82).

## 4 · Stato per fase

| Fase | Stato | Note |
|---|---|---|
| F0 | **Completa** | spec congelata in `docs/driver-desk/SPEC_driver_desk_v1.0.md` prima di ogni calcolo |
| F1 | **Completa** | migrazione puramente additiva applicata SOLO in locale; 13/13 serie ingerite; backfill ripetibile (`scripts/driver-desk-backfill.ts`) |
| F2 | **Completa** | motore puro + composizione schede; 74 test nuovi con verifica indipendente per ogni blocco (ricostruzione naive/a mano, metodo stagionalità); anteprima numerica su dati reali: `scripts/driver-desk-preview.ts` |
| F3 | **Completa, con un caveat** | tab "Driver" fra Posizionamento ed Eventi; typecheck, lint, build e suite completa (1394) verdi. Caveat: la verifica **visiva** nel browser non è stata possibile (il pane non componeva i frame senza schermo attivo: click e screenshot inerti — limite dell'ambiente, anche sui tab preesistenti). Ho verificato però che la pagina servita contenga il payload reale del Driver Desk (frasi, fonti, assenze) e il rendering del componente è coperto da 26 test di markup che vietano linguaggio predittivo, gergo statistico e verde/rosso. Un'occhiata a occhio nudo al tab resta la prima cosa da fare al risveglio. |

Commit sul branch: `b57c548` (F0) · `292a98c` (F1) · `e311686` (F2) · `b9e2638` (F3).

## 5 · Questioni aperte (in ordine di importanza)

1. ~~**Commit estraneo sul branch.**~~ **RISOLTA (04/08/2026).** Alle 23:27 una TUA sessione parallela (Claude Opus 5) ha committato `2fa7831` — "Budget del cron a 150s" (stagionalità: `src/lib/seasonality/job.ts` + PROGRESS.md) — mentre era attivo il checkout di `feature/driver-desk`. **Non serviva nessun cherry-pick: quella sessione l'aveva già pushato su `origin/main` come `8cd8afa`** (albero identico, stesso autore e data); il locale `main` era solo rimasto indietro ed è ora allineato a origin. Il commit resta anche nella storia di `feature/driver-desk`, ed è innocuo: al merge o al rebase git riconosce la modifica già applicata (stesso patch-id) e la scarta. La suite completa è verde in entrambi i casi.
2. **Rame: dentro o fuori?** Ho applicato D1 (fuori) per lo standard di affidabilità del repo, ma Yahoo `HG=F` funziona e il paniere DAX di fatto accetta già rischi Yahoo simili (obiezione 1). Se decidi "dentro", è un'aggiunta di catalogo da 10 minuti.
3. **Scheduling** — decisione tua, proposta al §6.
4. **Produzione:** al primo deploy del branch la migrazione additiva si applica da sola (build = `prisma migrate deploy`), ma la tabella resterà VUOTA finché non gira un ingest: la UI lo dichiara ("l'ingest non è ancora stato eseguito su questo ambiente"), niente crash. Il backfill contro Neon NON l'ho eseguito (divieto assoluto): servirà lanciarlo tu o dallo scheduling che sceglierai.
5. **Verifica visiva del tab** (vedi caveat F3): aprire un report del Macro Desk → tab "Driver" e giudicare la resa.

## 6 · Proposta di scheduling (D7 — NON implementata)

Due strade vere:

**A. Agganciarsi al cron Stagionalità delle 03:30 UTC** — dopo il job stagionalità, la stessa invocazione lancia l'ingest Driver Desk col budget residuo. *Pro:* zero infrastruttura nuova. *Contro:* quel budget è già conteso — proprio stanotte l'altra sessione l'ha dovuto alzare a 150s perché il refresh M15 non ci stava; l'ingest completo Driver Desk sono ~1-2 minuti (Dukascopy oro/argento è la parte lenta), e un fallimento del primo job affamerebbe il secondo. Servirebbe comunque rendere l'ingest incrementale (oggi sostituisce l'intera serie: semplice e robusto, ma non ottimizzato).

**B. GitHub Actions nel repo `macro-desk-bridge` (RACCOMANDATA).** Un workflow cron notturno (es. 04:15 UTC, dopo la stagionalità) che chiama una route protetta da token (`/api/driver-desk/sync`, da scrivere: ~30 righe sul modello del sync COT) oppure esegue lo script di backfill contro Neon con la connection string nei secrets. *Pro:* nessun vincolo sui 2 cron Vercel, minuti di budget senza contese, retry e log gratis, fallimenti indipendenti dagli altri moduli. *Contro:* un segreto in più da gestire e un pezzo di scheduling che vive fuori dall'app.

Raccomando **B**: il precedente di stanotte (budget stagionalità alzato all'ultimo minuto) è esattamente il tipo di fragilità che l'opzione A erediterebbe.

## 7 · Cosa serve da te per sbloccare

1. Decidere sul **commit estraneo** (`2fa7831`: cherry-pick su main o lasciarlo qui).
2. Guardare il tab **a occhio** e dirmi cosa cambiare nella resa.
3. Decidere **rame sì/no** (questione 2).
4. Scegliere **A o B** per lo scheduling; con B mi servono: conferma del repo `macro-desk-bridge` come sede e un token/segreto per la route di sync.
5. Quando vorrai i dati in produzione: ok esplicito al **backfill contro Neon** (una tantum o via scheduling).
