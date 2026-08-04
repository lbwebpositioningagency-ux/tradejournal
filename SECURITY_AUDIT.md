# SECURITY AUDIT — L&B TradingSpace

**Data:** 03/08/2026
**Commit analizzato:** `4892ac7` (branch `feature/seasonality`, con working tree)
**Perimetro:** applicazione Next.js 16 + Prisma 7 + Postgres (Neon), deploy Vercel su push a `main`.
**Metodo:** lettura del codice reale (server actions, route API, query, auth, upload), `npm audit`, verifica della history git, verifica empirica del sanitizzatore HTML.

> **Stato al 03/08/2026 — tutti i finding P0 e P1 sono chiusi in produzione.**
>
> Deployati in due ondate: **blocchi 2+3** (CVE dipendenze, commit `8fec649`) e **blocchi hardening** (header, XSS Macro Desk, MIME allegati, MT5, cookie — commit `5f51d95`). La credenziale Neon è stata **ruotata**. Dettagli in [Registro di remediation](#registro-di-remediation).
>
> **Resta aperto un solo residuo, deliberatamente:** l'app si connette ancora al database come `neondb_owner`, ruolo proprietario. Non è urgente e la motivazione sta in P0-1.
> Restano inoltre le voci escluse per scelta (rate limiting applicativo, HIBP, policy password severe, reset password, isolamento DB Preview, CSP): vedi [Fuori scope](#fuori-scope-per-decisione-esplicita).

---

## Sintesi in tre righe

L'isolamento multi-tenant — la cosa che conta di più in un'app con i dati finanziari di più utenti — **è fatto bene e in modo coerente**: non ho trovato IDOR. I problemi veri sono altrove: **dipendenze con CVE critiche già patchate a monte**, **assenza totale di security header**, **rate limiting che su Vercel non funziona davvero**, e la **credenziale Neon da ruotare**.

**Conteggio:** 3 P0 · 5 P1 · 6 P2 · 9 verifiche superate (falsi allarmi documentati in fondo).

---

## Tabella riassuntiva

| # | Severità | Finding | Tipo | Stato |
|---|----------|---------|------|-------|
| P0-1 | 🔴 P0 | Credenziale Neon `neondb_owner` potenzialmente compromessa + ruolo super-privilegiato | Manuale | ✅ **RUOTATA** · ⬜ resta il ruolo privilegiato *(residuo accettato)* |
| P0-2 | 🔴 P0 | `next-auth`/`@auth/core`: CVE critiche (fail-open dell'auth, bypass email homoglyph) | Codice (1 riga) | ✅ **IN PRODUZIONE** |
| P0-3 | 🔴 P0 | `next` 16.2.10: cache confusion tra risposte + disclosure endpoint Server Function | Codice (1 riga) | ✅ **IN PRODUZIONE** |
| P1-4a | 🟠 P1 | Mancano X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy (+ X-Powered-By esposto) | Codice | ✅ **IN PRODUZIONE** |
| P1-4b | 🟠 P1 | Manca la CSP | Codice | ⬜ fuori scope *(scelta)* |
| P1-5 | 🟠 P1 | `sanitizeInlineHtml` non rimuove gli event handler → XSS stored cross-utente | Codice | ✅ **IN PRODUZIONE** |
| P1-6 | 🟠 P1 | Allegati serviti `inline` con MIME dichiarato dal client, mai verificato sui byte | Codice | ✅ **IN PRODUZIONE** |
| P1-7 | 🟠 P1 | Il cambio password non invalida le sessioni esistenti (JWT non revocabile) | Codice | ⬜ fuori scope *(scelta)* |
| P1-8 | 🟠 P1 | Rate limiting in memoria di processo: su Vercel è quasi inefficace | Codice | ⬜ fuori scope *(scelta)* |
| P2-9 | 🟡 P2 | MT5: percorso file arbitrario lato server (oracolo di esistenza file) | Codice + Manuale | ✅ **CHIUSO ALLA RADICE** |
| P2-10 | 🟡 P2 | Nessun flusso di reset password | Codice (feature) | ⬜ fuori scope *(scelta)* |
| P2-11 | 🟡 P2 | Policy password debole (8 caratteri, nessun controllo su password note) | Codice | ⬜ fuori scope *(scelta)* |
| P2-12 | 🟡 P2 | Cookie `tj-account` senza `httpOnly`/`secure`/`sameSite` | Codice | ✅ **IN PRODUZIONE** |
| P2-13 | 🟡 P2 | Nessuna scadenza assoluta di sessione (30 giorni scorrevoli) | Codice | ⬜ fuori scope *(scelta)* |
| P2-14 | 🟡 P2 | Backup/PITR Neon e scoping env var Vercel da verificare | Manuale | ⬜ aperto (Azioni B, C, E) |
| P2-15 | 🟢 P3 | `@hono/node-server` e `@modelcontextprotocol/sdk`: CVE moderate in dev-dependency | — | ⬜ nessun intervento consigliato |

---

# P0 — Critici

## P0-1 · Credenziale Neon `neondb_owner` potenzialmente compromessa

> ### ✅ PASSWORD RUOTATA — 03/08/2026, 16:33 CEST
> La password di `neondb_owner` è stata reimpostata dall'utente dalla console Neon. La credenziale trapelata in chat **non è più valida**.
>
> **Verifica della riconnessione (prova diretta, non inferenza).** Redeploy `dpl_5tjfnCuVd1CgvZr5JkDFVbB1zCJ6`, build verde in 2 minuti. Dal log di build:
> ```
> Datasource "db": PostgreSQL database "neondb", schema "public" at "[REDACTED]"
> 18 migrations found in prisma/migrations
> No pending migrations to apply.
> ```
> `prisma migrate deploy` si è autenticato su Neon con la password nuova e ha letto `_prisma_migrations`: è un round-trip autenticato completo. Log runtime puliti — zero `password authentication failed`, `P1000`, `P1001`, `SASL`, `PrismaClientInitializationError`.
>
> #### 🔑 Comportamento dell'integrazione Neon-Vercel — verificato sul campo
> **L'integrazione risincronizza da sola le variabili d'ambiente su Vercel** (`DATABASE_URL`, `PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_URL`, `DATABASE_URL_UNPOOLED` riscritte **29 secondi** dopo il reset), **ma NON fa partire un redeploy.** Atteso 3 minuti: nessun deploy automatico.
>
> **➜ Regola da ricordare per le rotazioni future: dopo il reset, il redeploy va lanciato a mano.** Finché non lo si fa, la produzione continua a girare con la credenziale vecchia — cioè, dopo una rotazione, **scollegata**.
> ```bash
> vercel redeploy <deployment-id> --target production
> ```
> Il caso patologico della "cache del database target lato Vercel" **non si è verificato**: nessun re-sync forzato è stato necessario.
>
> #### Cosa resta aperto di questo finding
> La rotazione chiude la parte urgente. **Resta il privilegio**: l'applicazione si connette ancora come `neondb_owner`, il ruolo proprietario che può fare `DROP TABLE`. Il ruolo applicativo a privilegio ridotto (blocco 9 del piano) è ancora da fare.

**Dove:** infrastruttura Neon (non è un file del repo). Riferimenti locali: `.env.production.local` (`DATABASE_URL`, `PGPASSWORD`, `POSTGRES_URL`…), `src/lib/db.ts:8`.

**Cosa:** come da tuo contesto, la connection string del ruolo `neondb_owner` è transitata in chiaro in chat durante dei seed manuali. Va trattata come compromessa. Aggravante emersa dall'audit: **l'applicazione si connette al database con il ruolo `owner`**, cioè il ruolo che può fare `DROP TABLE`, leggere tutto e creare ruoli. Non esiste un ruolo applicativo a privilegio ridotto.

**Perché è un rischio:** chi ottiene quella stringa ha accesso completo e diretto ai dati finanziari di *tutti* gli utenti, bypassando integralmente l'applicazione e ogni controllo `userId` descritto nel resto di questo documento. Tutta la sicurezza applicativa qui sotto vale zero se la password del database è in giro. È il motivo per cui questo è il finding numero uno.

**Come lo correggerei:**
1. Ruotare subito la password di `neondb_owner` (procedura passo-passo: **Azione manuale A**).
2. Aggiornare `DATABASE_URL` su Vercel (Production **e** Preview) e in locale.
3. In un secondo momento, creare un ruolo `tradingspace_app` con solo `SELECT/INSERT/UPDATE/DELETE` sulle tabelle applicative e usare quello per l'app, tenendo `neondb_owner` esclusivamente per le migrazioni.

**Tipo:** azione manuale (rotazione) + codice/infra (ruolo a privilegio ridotto).
**Effort:** 20 minuti la rotazione · 1-2 ore il ruolo dedicato.

---

## P0-2 · `next-auth` / `@auth/core`: vulnerabilità critiche note

> ### ✅ RISOLTO IN LOCALE — 03/08/2026, commit `5a0893b` (blocco 2)
> `npm audit fix` ha aggiornato `@auth/core` 0.41.2 → **0.41.3**, `next-auth` 5.0.0-beta.31 → **beta.32**, `@auth/prisma-adapter` 2.11.2 → **2.11.3**. Le 2 CVE **critical** dell'audit sono a zero.
> **Verificato dal vivo** su istanza locale, perché nessun test automatico copre il flusso di autenticazione: handler NextAuth attivo (`/api/auth/providers` e `/api/auth/csrf` rispondono 200), e soprattutto le guardie **falliscono chiuse** — `/dashboard` senza sessione dà 307 verso `/login`, `/api/export/trades` e `/api/attachments/[id]` danno 401, i due endpoint cron danno 401 senza bearer. È esattamente il comportamento che l'advisory "fail open" metteva in dubbio.
> **⚠️ Non ancora in produzione:** il fix è solo nel repo locale, in attesa del push.

**Dove:** `package.json` — `"next-auth": "^5.0.0-beta.31"`, `@auth/prisma-adapter`. Confermato da `npm audit` (2 critical, 6 high, 4 moderate; 12 totali).

**Cosa:** `npm audit` segnala su `@auth/core` (severità **critical**), tra le altre:
- *"Configuration errors can cause existence-based auth checks to fail open (auth object populated with an error)"*
- *"Email normalizer validates the address before Unicode normalization, allowing a homoglyph @ bypass"*
- *"OAuth state, nonce, and PKCE check cookies are not bound to the provider that created them"*
- *"getToken() throws an uncaught exception on malformed Bearer authorization headers"*

**Perché è un rischio:** la prima è quella che mi preoccupa di più **in questa specifica applicazione**. Ogni singolo controllo di autorizzazione qui è scritto nella forma:

```ts
const session = await auth();
if (!session?.user?.id) redirect("/login");
```

cioè esattamente un *"existence-based auth check"*. È il pattern nominato dall'advisory. Ho verificato che nella forma attuale (`?.user?.id`) un oggetto-errore non produrrebbe uno `user.id` valido, quindi **non ho una prova di sfruttabilità diretta oggi**; ma è troppo vicino al bersaglio per lasciarlo su una beta non patchata, in produzione, con dati finanziari. La seconda (homoglyph `@`) può permettere di registrare un'email che *normalizza* su quella di un altro utente.

**Come lo correggerei:** aggiornare `next-auth`/`@auth/core` alla versione patchata (`npm audit fix`, il fix è disponibile e **non** è un major). Poi rilanciare `npm test` e verificare a mano login credentials, login Google e logout.

**Tipo:** fix di codice (bump di versione + verifica).
**Effort:** 30 minuti, più il tempo di verifica del flusso di auth (~1 ora in tutto).

---

## P0-3 · `next` 16.2.10 → 16.2.12: cache confusion e disclosure di endpoint

> ### ✅ RISOLTO IN LOCALE — 03/08/2026, commit `48eec44` (blocco 3)
> `npm audit fix` non era potuto uscire dal range perché `package.json` pinnava `"next": "16.2.10"` **esatto, senza `^`**. Bump manuale a **16.2.12** (più `eslint-config-next`, pinnato alla stessa versione): patch nella stessa minor, `isSemVerMajor: false`, nessun `--force`.
> **Chiuse tutte e 9 le CVE dirette di Next.js**, fra cui le due *cache confusion* — lo scenario di leak cross-utente che rendeva questo finding un P0 — e la *unauthenticated disclosure of internal Server Function endpoints*.
> **Verificato:** 1299 test verdi, build verde, typecheck e lint puliti, smoke test auth con guardie fail-closed.
> **⚠️ Non ancora in produzione:** il fix è solo nel repo locale, in attesa del push.
>
> #### Le 3 "high" che `npm audit` mostra ancora NON sono di Next
> Sono `postcss` 8.4.31 e `sharp` 0.34.5 che Next **incapsula al suo interno**, più `next` stesso elencato solo perché li trascina (`via: postcss, sharp` — zero advisory diretti). Ho verificato la raggiungibilità reale in questa applicazione:
> - **`sharp` non viene mai eseguito:** `next/image` non è usato in nessun punto del codice (l'unica occorrenza di "Image" è `ImagePlus`, un'icona lucide) e `next.config.ts` non ha configurazione `images`. È una dipendenza opzionale che resta a riposo.
> - **`postcss` è build-time su input fidato:** la copia vulnerabile è annidata sotto `next`, e l'unico CSS che la attraversa è `src/app/globals.css`, che sta nel repo. Le tre CVE richiedono CSS controllato da un attaccante. La copia di primo livello usata da Tailwind è la **8.5.19**, fuori dal range vulnerabile.
>
> Si chiuderanno da sole a una prossima release di Next. **Nessun intervento consigliato.**
>
> #### ⛔ Avvertenza importante
> Dopo questo bump, `npm audit fix --force` propone **`next@9.3.3`** con `isSemVerMajor: true` — cioè un **downgrade a Next.js del 2020**, perché è l'unica versione fuori dal range vulnerabile dichiarato. Distruggerebbe l'applicazione. **Non eseguirlo mai su questo repo.**

**Dove:** `package.json` — `"next": "16.2.10"`.

**Cosa:** `npm audit` riporta su `next` severità **high**, con fix disponibile non-major (16.2.12). Le due voci rilevanti qui:
- *"Cache confusion of response bodies for requests with bodies"* (e la variante con byte UTF-8 non validi)
- *"Unauthenticated disclosure of internal Server Function endpoints"*

Trascina anche `postcss` (high) e `sharp` (high, CVE libvips).

**Perché è un rischio:** *cache confusion* significa che il corpo di una risposta può essere servito alla richiesta sbagliata. In un'app multi-utente dove ogni risposta contiene i trade e il P&L di uno specifico utente, questo è **esattamente lo scenario di data leak cross-utente** che mi hai chiesto di cercare al punto 2 — solo che non nasce dal tuo codice, nasce dal framework. Il tuo codice filtra correttamente per `userId`; è lo strato di cache sotto a poter mescolare le risposte.

**Come lo correggerei:** aggiornare a `next@16.2.12`. È una patch, non un major: `npm i next@16.2.12`, poi `npm run build`, `npm test`, `npm run typecheck`. Da fare **prima** del prossimo merge su `main`, visto che ogni push deploya.

**Tipo:** fix di codice (bump di versione).
**Effort:** 30 minuti + build di verifica.

> **Nota su tutte e tre le P0 di dipendenza:** `npm audit fix` risolve 12 vulnerabilità senza breaking change dichiarati. Consiglio di farlo come **primo blocco di implementazione**, isolato, così se qualcosa si rompe si sa cosa è stato.

---

# P1 — Alti

## P1-4 · Nessun security header configurato

**Dove:** `next.config.ts` — il file contiene solo `serverExternalPackages` e `experimental.serverActions`. **Non esiste una funzione `headers()`.** Non esiste `src/middleware.ts` né `middleware.ts` (verificato: entrambi assenti). `vercel.json` contiene solo i cron.

**Cosa:** l'applicazione non invia nessuno di questi header:

| Header | Stato | Conseguenza |
|---|---|---|
| `Content-Security-Policy` | ❌ assente | nessuna mitigazione se un XSS passa (vedi P1-5) |
| `Strict-Transport-Security` | ❌ assente | nessun HSTS proprio (Vercel forza HTTPS, ma senza preload/max-age dichiarato) |
| `X-Frame-Options` / `frame-ancestors` | ❌ assente | **l'app è inseribile in un iframe: clickjacking** |
| `X-Content-Type-Options: nosniff` | ❌ assente | il browser può indovinare il tipo di un allegato (vedi P1-6) |
| `Referrer-Policy` | ❌ assente | URL con id di trade inviati a domini terzi nel Referer |
| `Permissions-Policy` | ❌ assente | difesa in profondità mancante |

**Perché è un rischio:** il clickjacking è concreto e immediato — un sito terzo può caricare `/trades` in un iframe invisibile e indurre l'utente loggato a cliccare "Elimina". L'assenza di CSP è ciò che trasforma il finding P1-5 da fastidio a compromissione: senza CSP, uno script iniettato può esfiltrare tutto.

**Come lo correggerei:** aggiungere `async headers()` in `next.config.ts` con i cinque header sopra. La CSP va introdotta con attenzione: Next.js inietta script inline, quindi serve `'unsafe-inline'` in una prima fase (oppure una nonce via middleware, più pulito ma più invasivo). Proporrei di partire da CSP in `Content-Security-Policy-Report-Only`, osservare, poi promuoverla — così non si rompe nulla in produzione.

**Tipo:** fix di codice, nessuna dipendenza nuova.
**Effort:** 1 ora per i quattro header semplici · 3-4 ore per una CSP seria in due tempi (report-only → enforce).

---

## P1-5 · `sanitizeInlineHtml` non rimuove gli event handler → XSS stored

**Dove:** `src/lib/macro-desk-payload.ts:292-294`
```ts
export function sanitizeInlineHtml(html: string): string {
  return html.replace(/<(?!\/?(?:b|i|em|strong|br)\b)[^>]*>/gi, "");
}
```
Consumato da `src/components/macro-desk/report-tabs.tsx:46` tramite `dangerouslySetInnerHTML`.

**Cosa:** il regex rimuove i tag **non** in allowlist, ma su un tag in allowlist lascia passare l'intero contenuto, **attributi compresi**. Verificato eseguendo la funzione reale:

| Input | Output |
|---|---|
| `<script>alert(1)</script><b>ok</b>` | `alert(1)<b>ok</b>` ✅ rimosso |
| `<img src=x onerror=alert(1)>` | `` ✅ rimosso |
| `<b onclick=alert(1)>click</b>` | `<b onclick=alert(1)>click</b>` ❌ **passa** |
| `<br onfocus=alert(1) autofocus>` | `<br onfocus=alert(1) autofocus>` ❌ **passa** |
| `<i style="position:fixed;inset:0" onclick=alert(1)>` | invariato ❌ **passa** |

Il caso `<br onfocus=... autofocus>` è il peggiore: `autofocus` fa scattare `onfocus` **senza alcuna interazione dell'utente**.

**Perché è un rischio:** i report Macro Desk sono **dato globale, mostrato a tutti gli utenti**. Un payload malevolo qui è un XSS *stored* e *cross-utente*: si esegue nel browser di ogni utente che apre la pagina, con la sua sessione. Senza CSP (P1-4) può leggere il DOM, chiamare le server action per conto dell'utente ed esfiltrare i dati.

**Attenuante onesta:** l'unica via d'ingresso è `POST /api/macro-desk`, protetta da `MACRO_DESK_API_SECRET` con confronto timing-safe e fail-closed (`src/lib/macro-desk.ts:16-25` — codice corretto, verificato). Quindi **non è sfruttabile da un utente qualsiasi**: serve il segreto, o la compromissione del sistema esterno che genera i report. È il motivo per cui è P1 e non P0. Ma il commento nel codice — *"Fonte: il nostro stesso sistema"* — è precisamente l'assunzione che rende questi bug longevi.

**Come lo correggerei:** non tentare di riparare il regex (i sanitizzatori a regex si aggirano sempre). Due opzioni, in ordine di preferenza:
1. **Nessuna dipendenza:** togliere `dangerouslySetInnerHTML` e fare un mini-parser che riconosce solo `<b> <i> <em> <strong> <br>` *senza attributi*, produce React element e scarta tutto il resto. ~40 righe, testabile, zero peso.
2. Se in futuro servisse HTML più ricco: `isomorphic-dompurify`. Da motivare, oggi non serve.

**Tipo:** fix di codice.
**Effort:** 2-3 ore con i test (i test esistenti in `macro-desk-payload.test.ts:102-108` vanno estesi ai casi qui sopra: oggi coprono solo `<script>` e `<img>`, cioè i due che già funzionano).

---

## P1-6 · Allegati serviti `inline` con MIME dichiarato dal client

**Dove:**
- `src/app/api/attachments/[id]/route.ts:30-38` — risposta con `Content-Type: attachment.mimeType` e `Content-Disposition: inline`
- `src/server/attachments.ts:46-50` — il MIME salvato è `file.type`, cioè **il valore dichiarato dal browser del client**
- `src/lib/constants.ts:41-47` — allowlist: PNG, JPEG, WEBP, GIF, **PDF**

**Cosa:** tre problemi che si sommano.
1. Il MIME non viene **mai** verificato contro i byte reali (nessun controllo di magic number). Un client può caricare qualsiasi contenuto dichiarando `image/png`.
2. La risposta è servita `inline`, sullo **stesso origin** dell'applicazione.
3. Manca `X-Content-Type-Options: nosniff` (P1-4), quindi in alcuni casi il browser può ignorare il `Content-Type` dichiarato e indovinare dal contenuto.

**Perché è un rischio:** `application/pdf` è in allowlist e servito `inline`. I PDF possono contenere JavaScript, eseguito dal viewer del browser nel contesto dell'origin dell'app. Combinato con l'assenza di CSP, è un vettore di esecuzione di codice nel dominio dell'applicazione. In più, senza `nosniff`, un file HTML caricato come `image/png` può essere interpretato come HTML da browser che fanno sniffing.

**Nota positiva:** il controllo di ownership su questa route è **corretto** — `findFirst({ where: { id, userId: session.user.id } })`. Non c'è IDOR sugli allegati. Il problema è solo il *come* vengono serviti.

**Come lo correggerei:**
1. `X-Content-Type-Options: nosniff` sulla risposta (e globalmente, P1-4).
2. `Content-Disposition: attachment` per i PDF (scaricali, non renderizzarli), tenendo `inline` per le immagini.
3. Verificare il magic number dei byte ricevuti e derivare il `Content-Type` da lì, ignorando quello dichiarato dal client. ~30 righe, nessuna dipendenza (le firme di PNG/JPEG/WEBP/GIF/PDF sono cinque costanti).
4. Opzionale ma efficace: servire gli allegati da un sottodominio separato.

**Tipo:** fix di codice.
**Effort:** 2-3 ore.

---

## P1-7 · Il cambio password non invalida le sessioni esistenti

**Dove:** `src/lib/auth.ts:46` (`session: { strategy: "jwt" }`) e `src/lib/auth.ts:49-58` (callback `jwt`/`session`, che trasportano solo `token.id`). `src/server/auth-actions.ts:146-147` aggiorna `passwordHash` e basta.

**Cosa:** con `strategy: "jwt"` la sessione vive interamente nel token firmato lato client. Non c'è nessun riferimento a una riga di sessione nel database e nessun "token version" nel payload. Di conseguenza, dopo un cambio password **tutti i token già emessi restano validi fino alla loro scadenza naturale** (default Auth.js: 30 giorni).

**Perché è un rischio:** è lo scenario classico "mi hanno rubato la sessione, cambio la password". L'utente cambia la password credendo di aver chiuso l'accesso all'attaccante; in realtà l'attaccante resta dentro fino a 30 giorni. Per un'app con dati finanziari è un'aspettativa di sicurezza tradita in silenzio.

**Come lo correggerei (senza rompere l'auth esistente, come da tuo vincolo):**
- Aggiungere `passwordChangedAt` (o `tokenVersion Int @default(0)`) su `User`.
- Nel callback `jwt` scriverlo nel token alla creazione; nel callback `session` confrontarlo con il valore a database e rifiutare la sessione se non combacia.
- Costo: **una query in più per richiesta autenticata.** Va misurato. In alternativa, la variante senza query: passare a `strategy: "database"` — più invasivo, quindi lo sconsiglio per ora.
- Aggiungere in `changePasswordAction` l'incremento del contatore.

**Tipo:** fix di codice (+ 1 migrazione additiva).
**Effort:** 3-4 ore incluse migrazione e verifica.

---

## P1-8 · Il rate limiting su Vercel è in gran parte inefficace

**Dove:** `src/lib/rate-limit.ts:15` — `const buckets = new Map<string, Bucket>()`, memoria di processo. Usato in `src/lib/auth.ts:24` (login), `src/server/auth-actions.ts:37` (registrazione), `:121` (cambio password).

**Cosa:** il limite è per-istanza. Il commento nel file **lo dichiara già onestamente** (`src/lib/rate-limit.ts:5-8`), quindi non è una svista — è un debito noto. Ma il contesto è cambiato: l'app ora è **live in produzione su Vercel**, dove le funzioni scalano su più istanze e vengono riciclate di continuo. Ogni nuova istanza riparte con la mappa vuota.

Secondo problema: la chiave è **solo l'email** (`login:${email}`). Non c'è un limite per indirizzo IP. Un attaccante che prova una password comune contro mille email diverse (*password spraying*) non tocca mai nessun contatore.

**Perché è un rischio:** il limite dichiarato è "10 tentativi per email ogni 15 minuti", ma il limite reale in produzione è molto più alto e non determinabile. Con una policy password di soli 8 caratteri senza controlli (P2-11), il brute force diventa realistico.

**Come lo correggerei:** serve uno stato condiviso. In ordine di costo:
1. **Vercel Firewall / rate limiting nativo della piattaforma** — configurazione, zero codice, zero dipendenze. È la strada che consiglio: risolve anche il limite per IP che il codice applicativo non può vedere bene.
2. Se serve granularità applicativa: uno store condiviso (Upstash Redis dal Marketplace). Introduce una dipendenza e un servizio — da motivare, oggi la 1 basta.
3. In ogni caso: aggiungere una chiave per IP accanto a quella per email.

**Tipo:** principalmente configurazione della piattaforma + un piccolo fix di codice per la chiave IP.
**Effort:** 1 ora (opzione 1) · mezza giornata (opzione 2).

---

# P2 — Medi

## P2-9 · MT5: percorso file arbitrario lato server

> ### 🟡 WATCHER SPENTO IN PRODUZIONE — 03/08/2026 · ⬜ fix strutturale ancora aperto
>
> #### Il problema, confermato prima del rimedio
> Non era un'ipotesi: dai log runtime del deployment di produzione compariva
> ```
> [mt5-sync] watcher attivo (polling 10s · 120s senza sorgenti)
> ```
> Causa accertata: **`MT5_WATCHER_DISABLED` non esisteva affatto** fra le variabili d'ambiente di Production. Il kill-switch documentato non era mai stato impostato, e il default del codice è "acceso". La primitiva di lettura file arbitraria era quindi raggiungibile in produzione da qualsiasi utente autenticato.
>
> #### ✅ Rimedio applicato
> `MT5_WATCHER_DISABLED=1` aggiunta su **Production** e **Preview** (deliberatamente **non** su Development, dove il watcher serve ancora in locale), seguita da redeploy di produzione — `dpl_HHN4Wo3g7rw4Kvzz9xK1xYprmich`, ● Ready.
>
> > ⚠️ **Il valore deve essere esattamente `1`.** Il codice fa un confronto stretto di stringa (`src/lib/mt5-watcher.ts:66`: `process.env.MT5_WATCHER_DISABLED === "1"`). Un `true` comparirebbe regolarmente in dashboard **senza spegnere nulla**: è un fix che passa la revisione e non fa niente.
>
> **Verifica, per confronto controllato** — stessi identici percorsi richiesti sul deploy precedente e su quello nuovo, tutti con `cache: MISS` (invocazioni fresche, la condizione in cui il watcher si annunciava):
>
> | | deploy precedente | deploy con la variabile |
> |---|---|---|
> | occorrenze `[mt5-sync]` | 3 | **0** |
> | errori DB/fatali | 0 | **0** |
> | livelli di log | info + error | **solo info** |
>
> I log applicativi interni risultano vuoti: il `console.log` del watcher non è mai partito.
>
> #### Perché spegnerlo non ha rotto nulla (verificato prima di applicare)
> - **Non esiste alcun endpoint HTTP per MT5**: `src/app/api/` non contiene nessuna cartella `mt5`. L'EA non ha mai avuto un POST verso l'app.
> - **`persistTradeInputs` ha due soli chiamanti**: il watcher (filesystem) e `src/server/import.ts`, cioè la procedura guidata `/import` **via upload** — il percorso che gli utenti usano davvero, del tutto indipendente dal watcher.
> - Sul serverless i percorsi MT5 non esistono: il watcher non ha mai importato nulla in produzione, faceva solo polling a vuoto ogni 10 secondi.
>
> #### ⬜ Cosa resta aperto: il fix strutturale
> Il rimedio applicato è una **variabile d'ambiente, non una proprietà del codice**. Oggi il default resta "acceso": una nuova istanza, un nuovo progetto Vercel o un ambiente in cui qualcuno dimentichi la variabile **nascerebbero di nuovo col watcher attivo**. Restano da fare:
>
> 1. **Invertire il kill-switch** — attivo solo con `MT5_WATCHER_ENABLED=1`, così l'assenza della variabile è lo stato *sicuro* e non quello pericoloso.
> 2. **Confinare `filePath`** a una directory base configurata (`path.resolve` + verifica che il risultato inizi con la base), eliminando la primitiva di lettura file arbitraria alla radice invece che disattivando chi la usa.
>
> Finché questi due punti non sono fatti, il finding **non è chiuso**: è solo disinnescato nell'ambiente attuale.

**Dove:** `src/lib/validations/mt5.ts:5-18` (validazione: solo lunghezza ed estensione `.ndjson/.jsonl/.json/.txt`), `src/server/mt5.ts:38` (salvato così com'è), `src/lib/mt5-watcher.ts:133` (`fs.stat`) e `:152` (`fs.readFile`).

**Cosa:** un utente autenticato può salvare un percorso **assoluto e arbitrario** e il server ci farà `stat` e `readFile`. Non c'è confinamento a una directory base né normalizzazione del path.

**Perché è un rischio (e perché non è peggio):** ho tracciato il flusso fino in fondo per capire se il contenuto del file può essere esfiltrato. **Non può**: `parseMt5File` (`src/lib/mt5-import.ts:96-121`) riporta solo `{ line, error: "JSON non valido" }`, senza mai includere il testo della riga. Quindi resta un **oracolo**: l'utente può stabilire se un file esiste sul server ("file non trovato" vs un risultato di parsing), quante righe ha e se contiene JSON valido. È information disclosure limitata, non lettura arbitraria.

Il watcher è disattivabile con `MT5_WATCHER_DISABLED=1`, che la documentazione dice di impostare su Vercel — **ma è una env var da ricordare, non un default sicuro**. Se manca in Production, il watcher gira. Da verificare (Azione manuale D).

**Come lo correggerei:** confinare il percorso a una directory base configurata (`path.resolve` + verifica che il risultato inizi con la base), e invertire il default del kill-switch: attivo solo se `MT5_WATCHER_ENABLED=1`, così l'assenza della variabile è lo stato sicuro.

**Tipo:** fix di codice + verifica manuale su Vercel.
**Effort:** 2 ore.

---

## P2-10 · Nessun flusso di reset password

**Dove:** assente. Verificato con ricerca su `forgot|reset.?password|VerificationToken|sendMail|nodemailer|resend` in tutto `src/`: **zero occorrenze**. Non esiste infrastruttura email.

**Cosa:** un utente che dimentica la password non ha alcun modo di recuperare l'account. Il cambio password (`changePasswordAction`) richiede di essere già loggati.

**Perché lo segnalo in un audit di sicurezza:** oggi è un problema di usabilità, non una vulnerabilità — e va detto chiaramente, non è un falso allarme mascherato da finding. Lo includo perché **il reset password è storicamente il punto più bucato di qualsiasi autenticazione**, e quando lo implementerai le regole vanno decise prima: token monouso ad alta entropia, scadenza breve (15-30 min), invalidati all'uso, risposta identica per email esistente e inesistente (per non fare enumeration), e rate limit sulla richiesta.

**Tipo:** nuova feature.
**Effort:** 1-2 giorni, inclusa la scelta di un provider email.

---

## P2-11 · Policy password debole

**Dove:** `src/lib/validations/auth.ts:11` (registrazione) e `:31` (cambio password) — `z.string().min(8).max(72)`.

**Cosa:** minimo 8 caratteri, nessun altro requisito. `password` supera la validazione.

**Perché è un rischio:** da solo sarebbe accettabile (le linee guida NIST moderne sconsigliano giustamente le regole di complessità barocche). Diventa rilevante **in combinazione con P1-8**: password deboli + rate limiting inefficace = brute force realistico.

**Come lo correggerei:** alzare il minimo a 10-12 caratteri e — più utile di qualsiasi regola di complessità — controllare la password contro l'elenco di quelle già compromesse via l'API k-anonymity di Have I Been Pwned (si inviano solo i primi 5 caratteri dell'hash SHA-1, la password non lascia mai il server). Nessuna dipendenza: è una `fetch`.
`bcrypt` con cost 12 (`auth-actions.ts:46,146`) è **corretto e adeguato**, non va toccato.

**Tipo:** fix di codice.
**Effort:** 2 ore.

---

## P2-12 · Cookie `tj-account` senza flag di sicurezza

**Dove:** `src/server/accounts.ts:98,120,141` e (stesso schema) `src/server/settings.ts:59,80` per `tj-accent`/`tj-pnl`.
```ts
store.set(ACTIVE_ACCOUNT_COOKIE, accountId, { path: "/", maxAge: ... });
```

**Cosa:** nessun `httpOnly`, `secure`, `sameSite`.

**Perché è un rischio — e perché è basso:** ho verificato la conseguenza peggiore, cioè la manomissione del cookie per vedere i dati altrui, e **non funziona**: `resolveTradeScope` (`src/lib/demo-account.ts:88-91`) rifiuta esplicitamente un conto che non appartiene all'utente e non è demo, ricadendo su "tutti i conti". Questo è codice difensivo scritto bene. Resta quindi solo difesa in profondità: leggibile da JavaScript, inviabile in chiaro, allegato a richieste cross-site.

**Come lo correggerei:** aggiungere `httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax"`. Attenzione: `tj-accent` e `tj-pnl` potrebbero essere letti dal client per il tema — da verificare prima di metterli `httpOnly`.

**Tipo:** fix di codice.
**Effort:** 30 minuti.

---

## P2-13 · Nessuna scadenza assoluta di sessione

**Dove:** `src/lib/auth.ts:46` — `session: { strategy: "jwt" }`, senza `maxAge`.

**Cosa:** si applica il default Auth.js: 30 giorni, rinnovati a ogni utilizzo. Una sessione attiva non scade mai davvero.

**Perché è un rischio:** su un'app con dati finanziari, un token rubato resta valido per un mese. Va letto insieme a P1-7 (non revocabile nemmeno cambiando password).

**Come lo correggerei:** `session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 }`. Da bilanciare con la comodità d'uso: 7 giorni è una scelta ragionevole per un journal usato quotidianamente.

**Tipo:** fix di codice (2 righe).
**Effort:** 15 minuti + decisione sulla durata.

---

## P2-14 · Configurazione di deploy da verificare

**Dove:** dashboard Vercel e Neon (non ispezionabili da qui).

**Cosa:** non posso verificare dal codice: (a) se le env var sono correttamente separate tra Preview e Production — è importante perché **un deploy Preview con il `DATABASE_URL` di produzione esporrebbe i dati reali su URL di anteprima**; (b) se il point-in-time-recovery Neon è attivo e con quale finestra; (c) chi ha accesso al progetto Neon e Vercel; (d) se `MT5_WATCHER_DISABLED=1` è impostata in Production (vedi P2-9).

**Come lo correggerei:** procedure passo-passo nelle **Azioni manuali B, C, D, E**.

**Tipo:** azione manuale.
**Effort:** 45 minuti in tutto.

---

## P2-15 · CVE moderate residue in dipendenze di sviluppo *(emerso durante il blocco 2)*

**Dove:** `@hono/node-server` (via `prisma` → `@prisma/dev`) e `@modelcontextprotocol/sdk` (via `shadcn`).

**Cosa:** dopo `npm audit fix` restano due advisory **moderate**:
- `@hono/node-server`: *middleware bypass via repeated slashes in serveStatic* e *path traversal su Windows via `%5C` codificato* (CWE-22).
- `@modelcontextprotocol/sdk`: comparso nell'audit solo dopo l'aggiornamento, quando la ricostruzione dell'albero delle dipendenze lo ha portato in superficie. Non è stato introdotto da noi.

Entrambi hanno `fixAvailable: true` ma non sono stati risolti automaticamente: sono annidati sotto pacchetti che non possono salire restando nei range dichiarati.

**Perché è un rischio basso:** sono **dipendenze di sviluppo**. `@prisma/dev` è il motore di Prisma Studio (`npm run db:studio`), `shadcn` è la CLI per aggiungere componenti. **Nessuno dei due finisce nel bundle di produzione né gira su Vercel.** Il path traversal di `@hono/node-server` riguarda un server statico che questa app non espone. Li segnalo per completezza, non perché vadano corretti con urgenza.

**Come lo correggerei:** lasciarli lì per ora. Si chiuderanno da soli al prossimo aggiornamento di `prisma` o `shadcn`. Da rivalutare solo se `@prisma/dev` dovesse mai comparire fra le dipendenze di produzione.

**Tipo:** nessun intervento consigliato adesso.
**Effort:** zero (monitoraggio).

---

# ✅ Verifiche superate (falsi allarmi, documentati come tali)

Le riporto perché mi hai chiesto di segnalare anche ciò che *non* è un problema — e perché sono le aree dove il codice è fatto bene e non va toccato.

**1. Isolamento multi-tenant / IDOR — nessuna vulnerabilità trovata.**
Ho ispezionato **tutte** le server action in `src/server/` (`accounts`, `attachments`, `import`, `mt5`, `notes`, `settings`, `strategies`, `trades`) e tutte le pagine con parametro dinamico. Il pattern è coerente ovunque: `requireUserId()` dalla sessione, poi `userId` **sempre** nel `where`. Le mutazioni usano `updateMany`/`deleteMany` con `{ id, userId }`, che è la forma corretta (una `update` su solo `id` sarebbe stata bucata). Le pagine `/trades/[id]`, `/trades/[id]/edit`, `/day/[date]` filtrano tutte per `account: { userId } }`. **Non sono riuscito a costruire un percorso per leggere i dati di un altro utente cambiando un id.**

**2. `GET /api/macro-desk/[id]` senza filtro `userId` — non è un IDOR.**
`MacroDeskReport` è dato **globale dell'istanza**, come `CotWeek` e la Stagionalità: non ha colonna `userId` per costruzione. Serve la stessa informazione macro a tutti gli utenti. Corretto così.

**3. SIM1 — implementato correttamente.**
`resolveTradeScope` (`src/lib/demo-account.ts:74-102`) è l'unico punto che cambia `userId`, e lo fa solo per `isDemo: true`. Gli artefatti personali (note, allegati) restano sempre legati al `sessionUserId` reale anche in scope demo. C'è una guardia in scrittura ridondante (`assertWritableAccount`) e le action escludono `isDemo` nel `where`. È un buon esempio di eccezione contenuta invece che sparsa.

**4. SQL injection — nessuna.**
Tutte le query raw (~30 in `src/lib/queries/`) usano il tagged template `Prisma.sql`, quindi sono parametrizzate. L'unico `Prisma.raw` (`src/lib/queries/analytics.ts:381`) riceve `String(size - 1)` **dopo** che `size` è stato validato contro un'allowlist (`TRADE_WINDOWS.includes(...)`, righe 377-380) — e sarebbe comunque un numero. **Falso allarme.** Anche il `timezone` utente, che finisce in `AT TIME ZONE ${timezone}`, passa come parametro ed è validato con `Intl.DateTimeFormat`.

**5. Segreti — niente di committato.**
`git log --all --diff-filter=A` sui file `.env*`: l'unico mai aggiunto è `.env.example`, che contiene solo placeholder vuoti. `.gitignore` copre `.env*` con eccezione per l'example. Nessun segreto hardcoded nel sorgente (l'unico match è `"test-secret-abc123"` in un file di test). **Zero occorrenze di `NEXT_PUBLIC_`**: nessun segreto può finire nel bundle client.

**6. Logging — pulito.**
Nessuna password, token o connection string nei log. Gli script che stampano il database di destinazione **redigono la password** (`scripts/cot-contesto-once.ts:36`: `url.replace(/\/\/[^@]*@/, "//***@")`). Buona pratica, già presente.

**7. XSS — React protegge, un solo punto scoperto.**
Un unico `dangerouslySetInnerHTML` in tutto il codice, ed è il P1-5. Note del journal, tag e nomi conti sono resi come testo da React, che li escapa: **niente XSS su quei campi.** Il punto 4 della tua lista è coperto.

**8. CSRF — coperto dal framework.**
Le server action Next.js verificano `Origin`/`Host` per costruzione. Auth.js gestisce il token CSRF sul flusso credentials. Non c'è custom server che aggiri questi controlli. Le route API che mutano dati (`POST /api/macro-desk`) usano un bearer token, non i cookie, quindi non sono CSRF-abili.

**9. SSRF — nessun input utente nelle richieste in uscita.**
Tutte le `fetch` (`fred.ts`, `yahoo.ts`, `cot-sync.ts`, `cot-contesto-gemini.ts`) costruiscono l'URL da costanti o env var, mai da input utente. La validazione del parametro sulla pagina Stagionalità passa da parser con allowlist (`parseInstrument`, `parseLookback`, `TABS.find`).

*Nota:* `docker-compose.yml` usa `tradejournal/tradejournal` come credenziali — è **solo per il database locale di sviluppo**, non tocca la produzione. Non è un finding.

---

# Piano di remediation consigliato

Ordinato per rapporto rischio/sforzo. Ogni blocco è indipendente e verificabile.

| Blocco | Contenuto | Effort | Stato |
|---|---|---|---|
| **1** | Rotazione credenziale Neon (Azione A) + verifiche Vercel/Neon (B, C, D, E) | 1 ora, manuale | 🟡 **rotazione FATTA**; restano B, C, D, E |
| **2** | `npm audit fix` → 8 CVE su 12, incluse entrambe le critical. Build + test + verifica auth | 1-2 ore | ✅ **IN PRODUZIONE** (`8fec649`) |
| **3** | `next` 16.2.10 → 16.2.12 a mano (P0-3): chiude le 9 CVE dirette di Next.js | 30 min | ✅ **IN PRODUZIONE** (`8fec649`) |
| **3** | Security header (P1-4) senza CSP + `nosniff` + allegati (P1-6) + cookie (P1-12) | mezza giornata |
| **4** | Sanitizzatore HTML (P1-5) con test estesi | mezza giornata |
| **5** | Rate limiting via Vercel Firewall (P1-8) + scadenza sessione (P2-13) | mezza giornata |
| **6** | Invalidazione sessioni al cambio password (P1-7) + policy password (P2-11) | 1 giorno |
| **7** | CSP in report-only → enforce (P1-4, seconda parte) + confinamento path MT5 (P2-9) | 1 giorno |
| **8** | Reset password (P2-10), se lo vuoi | 1-2 giorni |
| **9** | Ruolo Postgres a privilegio ridotto (P0-1, seconda parte) | mezza giornata |

**Nessuna dipendenza nuova pesante** in nessun blocco. Le uniche aggiunte esterne considerate — DOMPurify e Upstash Redis — sono evitabili e le ho segnate come non necessarie oggi.

**Attenzione al deploy:** ogni push su `main` va in produzione, e `npm run build` esegue `prisma migrate deploy`. I blocchi 6 e 9 toccano lo schema: vanno fatti con una migrazione additiva e verificati su Preview prima del merge.

---

# Registro di remediation

## Blocco 2 — `npm audit fix` · ✅ completato in locale, ⏳ in attesa di deploy

**Data:** 03/08/2026 · **Commit:** `5a0893b` su `feature/seasonality` · **Push: NON effettuato** · **Produzione: NON aggiornata**

**Comando eseguito:** `npm audit fix` — **senza** `--force`, come richiesto.

**Risultato:** da **12** vulnerabilità (2 critical · 6 high · 4 moderate) a **5** (0 critical · 3 high · 2 moderate).

### CVE risolte (8)

| Pacchetto | Prima | Dopo | Severità | Cosa chiudeva |
|---|---|---|---|---|
| `@auth/core` | 0.41.2 | **0.41.3** | 🔴 critical | fail-open dei controlli auth · bypass email homoglyph · cookie OAuth non legati al provider · crash su Bearer malformato |
| `next-auth` | 5.0.0-beta.31 | **5.0.0-beta.32** | 🔴 critical | stesse CVE, via `@auth/core` |
| `@auth/prisma-adapter` | 2.11.2 | **2.11.3** | 🟠 high | via `@auth/core` |
| `brace-expansion` | 1.1.16 | **1.1.18** | 🟠 high | DoS per espansione illimitata (OOM) |
| `fast-uri` | 3.1.3 | **3.1.5** | 🟠 high | host confusion via backslash nell'authority |
| `prisma` | 7.8.0 | **7.9.1** | 🟡 moderate | via `@prisma/dev` |
| `@prisma/dev` | 0.24.3 | **0.24.17** | 🟡 moderate | via `@hono/node-server` e `valibot` |
| `valibot` | 1.2.0 | **1.4.2** | 🟡 moderate | `flatten()` lancia su property ereditate |

### CVE ancora aperte (5)

| Pacchetto | Severità | Perché non è stata risolta |
|---|---|---|
| `next` | 🟠 high | `package.json` pinna `16.2.10` esatto → 16.2.12 è "fuori range". **Vedi P0-3: fix manuale di 2 righe.** |
| `postcss` | 🟠 high | dipendenza di `next`, si chiude con lo stesso aggiornamento |
| `sharp` | 🟠 high | dipendenza di `next`, si chiude con lo stesso aggiornamento |
| `@hono/node-server` | 🟡 moderate | dev-dependency (Prisma Studio) — vedi P2-15, nessuna urgenza |
| `@modelcontextprotocol/sdk` | 🟡 moderate | dev-dependency (CLI shadcn) — vedi P2-15, nessuna urgenza |

### Note sul diff

- **`package.json` non è stato modificato.** L'intero aggiornamento vive in `package-lock.json` (65 voci cambiate): tutti i bump erano già ammessi dai range `^` esistenti. Questo è il motivo per cui non serviva `--force`.
- Fra le 65 voci compaiono pacchetti **aggiunti** (`@visx/*`, `d3-*`, `lodash`, `elkjs`) e **rimossi** (`chart.js`, `@kurkle/color`, `http-status-codes`): sono ricadute di `@prisma/studio-core` 0.27.3 → 0.33.0, che ha cambiato libreria di grafici. Riguarda **solo Prisma Studio**, uno strumento locale — nessun impatto sul bundle di produzione.
- `prisma` è salito a 7.9.1 mentre `@prisma/client` resta 7.8.0. Il disallineamento **non causa problemi** (`prisma generate` gira nel build, i 1299 test e le integration test passano), ma è bene riallinearli al prossimo aggiornamento di Prisma.

### Verifiche superate (gate)

| Verifica | Esito |
|---|---|
| `npm test` | ✅ 1299 test, 71 file, tutti verdi |
| `npm run build` | ✅ verde — 31 route, tutte dinamiche |
| `npm run typecheck` | ✅ pulito |
| `npm run lint` | ✅ pulito |
| Smoke test auth (istanza locale) | ✅ vedi sotto |

**Perché uno smoke test manuale dell'auth:** `next-auth` è passato da una beta alla successiva e **nessun test automatico del progetto copre il flusso di autenticazione**. Il build verde non lo avrebbe dimostrato. Verificato a mano su `localhost:3000`:

| Controllo | Atteso | Ottenuto |
|---|---|---|
| `GET /api/auth/providers` | 200, provider credentials | ✅ 200 |
| `GET /api/auth/csrf` | 200, token emesso | ✅ 200 |
| `GET /dashboard` senza sessione | redirect a `/login` | ✅ 307 → `/login` |
| `GET /api/export/trades` senza sessione | 401 | ✅ 401 |
| `GET /api/attachments/[id]` senza sessione | 401 | ✅ 401 |
| `GET /api/cot-sync` senza bearer | 401 | ✅ 401 |
| `GET /api/seasonality-sync` senza bearer | 401 | ✅ 401 |
| `/login` e `/register` | 200, form completi | ✅ 200 |
| Log del server | nessun errore | ✅ nessuno |

L'esito che conta è che le guardie **falliscono chiuse**: è precisamente il comportamento che l'advisory critical "auth checks fail open" metteva in discussione.

> **Il database di produzione non è stato toccato.** `npm run build` esegue `prisma migrate deploy`: prima di lanciarlo ho verificato che `prisma.config.ts` legga `DATABASE_URL` da `.env`, che punta a `localhost:5432` (il Postgres Docker locale, attivo e healthy). Le migrazioni hanno colpito quello, non Neon.

### Esito

✅ **Deployato in produzione** il 03/08/2026 con il commit `8fec649` — vedi [Blocco 4](#blocco-4--deploy-in-produzione--️-completato).

---

## Blocco 3 — `next` 16.2.10 → 16.2.12 · ✅ completato in locale, ⏳ in attesa di deploy

**Data:** 03/08/2026 · **Commit:** `48eec44` su `feature/seasonality` · **Push: NON effettuato** · **Produzione: NON aggiornata**

**Intervento:** modifica manuale di `package.json` (`next` e `eslint-config-next` da `16.2.10` a `16.2.12`) + `npm install`. **Nessun `--force`.**

**Controllo di versione prima di procedere:** `16.2.10` → `16.2.12` è major `16` invariata, minor `2` invariata, patch `10` → `12`. È una patch. Verificata anche l'esistenza di entrambi i pacchetti sul registry (`16.2.11` e `16.2.12` pubblicate).

### CVE risolte: tutte e 9 quelle dirette di Next.js

| CVE | Perché contava qui |
|---|---|
| **Cache confusion of response bodies for requests with bodies** | 🎯 **il motivo del P0**: corpo di risposta servito alla richiesta sbagliata = leak cross-utente di trade e P&L |
| **Cache confusion · variante con byte UTF-8 non validi** | stessa classe di problema |
| **Unauthenticated disclosure of internal Server Function endpoints** | espone gli endpoint delle server action senza autenticazione |
| Server-Side Request Forgery in Server Actions on custom servers | SSRF |
| Server-Side Request Forgery in rewrites via attacker-controlled destination hostname | SSRF |
| Middleware / Proxy bypass in App Router (Turbopack, locale singolo) | bypass di controlli |
| Denial of Service in App Router using Server Actions | DoS |
| Unbounded Server Action payload in Edge runtime | DoS |
| Denial of Service in the Image Optimization API using SVGs | DoS |

**Conteggio `npm audit`:** 5 → 5. **Il numero non è cambiato, ma il contenuto sì**, ed è la cosa importante: prima `next` aveva **9 advisory diretti**, ora ne ha **zero** ed è elencato solo perché incapsula `postcss` e `sharp`. Il conteggio grezzo di `npm audit` qui inganna — vedi il riquadro in P0-3.

### Diff

`package.json`: 2 righe. `package-lock.json`: **12 voci, tutte della famiglia Next** (`next`, `@next/env`, `@next/eslint-plugin-next`, `eslint-config-next` e i 8 binari `@next/swc-*` per le varie piattaforme). Nessuna ricaduta su altri pacchetti — l'opposto del blocco 2, dove Prisma Studio aveva trascinato mezzo albero.

### Verifiche superate (gate)

| Verifica | Esito |
|---|---|
| `npm test` | ✅ 1299 test, 71 file, tutti verdi |
| `npm run build` | ✅ verde — 31 route, tutte dinamiche |
| `npm run typecheck` | ✅ pulito |
| `npm run lint` | ✅ pulito |
| `GET /api/auth/providers` · `/api/auth/csrf` | ✅ 200 |
| `/dashboard` senza sessione | ✅ 307 → `/login` |
| `/api/export/trades` · `/api/attachments/[id]` senza sessione | ✅ 401 |
| `/api/cot-sync` · `/api/seasonality-sync` senza bearer | ✅ 401 |
| `/login` · `/register` | ✅ 200, form integri |
| Log del server | ✅ nessun errore |

> **Il database di produzione non è stato toccato.** Riverificato prima del build: `DATABASE_URL` in `.env` → `localhost:5432`, nessuna variabile ereditata dalla shell, Postgres Docker locale `accepting connections`. Le migrazioni di `prisma migrate deploy` hanno colpito quello.

### Esito

✅ **Deployato in produzione** il 03/08/2026 con il commit `8fec649` — vedi [Blocco 4](#blocco-4--deploy-in-produzione--️-completato).

---

## Blocco 4 — Deploy in produzione · ✅ completato

**Data:** 03/08/2026, 15:44 CEST · **Commit in produzione:** `8fec649` · **`origin/main`:** `c49e4e3` → `8fec649` (fast-forward)

### Perché i commit sono stati ricostruiti invece che cherry-pickati

I fix erano stati sviluppati e validati su `feature/seasonality` (commit `5a0893b` e `48eec44`). Quei commit **non erano deployabili**: il loro `package-lock.json` porta con sé le dipendenze della stagionalità (`dukascopy-node` e derivate), che su `main` non esistono. Un cherry-pick le avrebbe trascinate in produzione.

I due blocchi sono stati quindi **rieseguiti da zero** su un ramo `hotfix/security-deps` creato da `main` pulito, ottenendo lo stesso risultato con un lockfile coerente con `main`.

**Verifica del diff prima del push:** esattamente 2 file (`package.json`, `package-lock.json`), e ricerca esplicita di `dukascopy`, `dukascopy-node`, `yahoo`, `tough-cookie` nel diff → **nessuna occorrenza**.

> ⚠️ **Conseguenza da ricordare:** i commit `5a0893b` e `48eec44` su `feature/seasonality` sono ora **duplicati sporchi** di `8fec649`. Quando quel ramo verrà mergiato porterà lo stesso bump in un lockfile diverso: è probabile un conflitto su `package-lock.json`. Si risolve rigenerando il lockfile, non scegliendo una delle due versioni a mano.

### Nota operativa

Il lavoro è stato svolto in un **git worktree separato**, perché al momento del deploy la cartella principale conteneva modifiche non committate di un'altra sessione (~650 righe sui file di stagionalità). `git stash` o `checkout --` avrebbero distrutto quel lavoro. Nel worktree è stato copiato **solo `.env`** e non `.env.production.local`: la credenziale Neon non era fisicamente presente durante build e test.

### Verifica post-deploy in produzione

URL: `https://tradejournal-red-zeta.vercel.app` · Stato deploy Vercel: **● Ready**

| Controllo | Atteso | Ottenuto |
|---|---|---|
| `/login` · `/register` | 200, form integri | ✅ 200 |
| `/dashboard` senza sessione | redirect a `/login` | ✅ 307 → `/login` |
| `/api/export/trades` · `/api/attachments/[id]` | 401 | ✅ 401 |
| `/api/cot-sync` senza bearer | 401 | ✅ 401 |
| `/api/auth/providers` · `/api/auth/csrf` | 200, handler vivo | ✅ 200 |
| `/api/seasonality-sync` | **404** (non esiste su `main`) | ✅ 404 — conferma che la produzione gira `main` pulito, non la stagionalità |

Le guardie di autorizzazione **falliscono chiuse anche in produzione**: è la verifica che chiude il cerchio su P0-2.

### Stato CVE in produzione

**0 critical · 0 high applicative.** Restano 5 advisory, tutte verificate come non raggiungibili in questa applicazione (3 incapsulate in Next, 2 in dev-dependency che non entrano nel bundle).

---

---

## Blocco 5 — Hardening del codice · ✅ in produzione

**Data:** 03/08/2026 · **Commit:** `5f51d95` (4 commit) · **`origin/main`:** `58a6606` → `5f51d95`, fast-forward

Sviluppato su un **git worktree separato** perché la cartella principale era occupata da un'altra sessione. Un commit per blocco, gate completo su ciascuno (test + build + typecheck + lint, con `DATABASE_URL` su `localhost` verificato prima di ogni build).

| Blocco | Finding | Commit |
|---|---|---|
| Header | P1-4a | `59b43e1` |
| Contenuto non fidato | P1-5 + P1-6 | `afab4df` |
| MT5 strutturale | P2-9 | `9f917f8` |
| Cookie | P2-12 | `5f51d95` |

### Scelte che vale la pena ricordare

**HSTS lasciato a Vercel.** Il report originale lo elencava fra gli header mancanti: era un errore, la piattaforma lo aggiunge già (`max-age=63072000; includeSubDomains; preload`). Riscriverlo a mano avrebbe solo rischiato di indebolirlo.

**Sanitizzatore: nessun rattoppo al regex.** L'ordine è: rimuovi i tag estranei (cosmetico) → **escapa tutto** → ripristina solo i 5 tag ammessi scartandone gli attributi. Dopo l'escape niente può più essere markup, quindi la sicurezza non dipende dal passo di strip. I 4 test preesistenti passano invariati; 16 casi nuovi coprono tutti i bypass dimostrati.

**MIME verificato in due punti.** In upload (rifiuto se la firma manca o contraddice il dichiarato) e nella route che serve l'allegato. Il secondo copre gli allegati **caricati prima** della correzione, che a database hanno ancora un MIME dichiarato dal client — evitando una migrazione dati. Firma ignota → `application/octet-stream` + download forzato.

**MT5 chiuso alla radice.** Il watcher ora è spento per tre ragioni indipendenti: serve `MT5_WATCHER_ENABLED=1` (assente), serve `MT5_WATCH_DIR` (assente), e i percorsi sarebbero comunque confinati. `MT5_WATCHER_DISABLED` è stata **rimossa** da Production e Preview il 03/08/2026 dopo il deploy — era diventata codice morto. Development non l'ha mai avuta.

### Verifica in produzione

| Controllo | Esito |
|---|---|
| `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | ✅ presenti su pagine **e** route API |
| `X-Powered-By` | ✅ sparito |
| `Strict-Transport-Security` | ✅ presente (da Vercel) |
| Cookie Auth.js | ✅ `__Host-authjs.csrf-token` e `__Secure-authjs.callback-url`, entrambi `HttpOnly; Secure; SameSite=Lax` |
| Guardie di autorizzazione | ✅ fail-closed: 307 su `/dashboard`, 401 su API protette e cron |
| `[mt5-sync]` nei log | ✅ 0 occorrenze su 100 righe di richieste fresche |
| Errori DB/fatali nei log | ✅ 0 |

> ⚠️ **Non verificato:** il comportamento **con una sessione autenticata** (dashboard che carica i trade, cambio conto, apertura di un allegato). Richiede credenziali reali e non è stato possibile automatizzarlo — vedi la nota in fondo alle azioni manuali.

---

# AZIONI MANUALI PER L'UTENTE

Queste cose non le posso fare io: vanno fatte a mano nei siti di Neon e Vercel. Ho scritto ogni passaggio per esteso, senza dare per scontato nulla. Fai le azioni **nell'ordine in cui sono scritte**.

> **Stato:** l'**Azione A** (rotazione) e l'**Azione D** (watcher MT5) sono ✅ **già state fatte** il 03/08/2026. Restano da fare la **B**, la **C** e la **E**.

> ⚠️ **Prima di iniziare, tieni aperto un blocco note.** Nell'Azione A dovrai copiare una password che vedrai **una volta sola**.

---

## AZIONE A — Cambiare la password del database (la più importante)

**Perché:** la password attuale è passata in chiaro in una chat. Vale come "persa". Chi ce l'ha può leggere i dati di tutti gli utenti senza passare dal sito.

**Quanto ci vuole:** 15 minuti. Il sito resterà offline per circa 1-2 minuti verso la fine.

**Scegli un momento tranquillo**, non mentre stai usando l'app.

### Parte 1 — Genera la nuova password su Neon

1. Apri il browser e vai su **https://console.neon.tech**
2. Fai il login.
3. Nella lista dei progetti, clicca sul progetto di TradingSpace.
4. Nel menù a sinistra cerca la voce **"Roles"** (in italiano "Ruoli") e cliccala.
   - Se non la vedi, cerca prima **"Branches"**, clicca sul branch chiamato **`main`**, e lì dentro troverai **"Roles"**.
5. Vedrai un elenco di ruoli. Cerca la riga **`neondb_owner`**.
6. All'estrema destra di quella riga c'è un pulsante con **tre puntini `⋯`**. Cliccalo.
7. Dal menù che si apre scegli **"Reset password"** (Reimposta password).
8. Appare una finestra di conferma: clicca il pulsante **"Reset password"**.
9. **FERMATI QUI E LEGGI.** Neon ora ti mostra la nuova password. **La vedrai una volta sola.** Se chiudi questa finestra senza copiarla, dovrai rifare tutto dal punto 6.
   - Clicca l'icona di **copia** accanto alla password.
   - **Incollala subito nel blocco note.**
10. Ora ti serve la connection string completa. Sempre su Neon, nel menù a sinistra clicca **"Dashboard"** (o "Connection Details" / "Connect").
11. Trovi un riquadro con una stringa che inizia con `postgresql://`. Assicurati che il menù a tendina sopra dica **`neondb_owner`**.
12. Clicca **"Show password"** (Mostra password) se la password appare puntinata, poi clicca l'icona di **copia**.
13. **Incolla anche questa nel blocco note.** È lunga e assomiglia a:
    `postgresql://neondb_owner:PASSWORD@ep-qualcosa.eu-central-1.aws.neon.tech/neondb?sslmode=require`

### Parte 2 — Aggiorna la password su Vercel

Da questo momento il sito è rotto finché non finisci. Non fermarti a metà.

14. Apri una nuova scheda del browser e vai su **https://vercel.com**
15. Fai il login e clicca sul progetto **tradejournal**.
16. In alto clicca la scheda **"Settings"**.
17. Nel menù a sinistra clicca **"Environment Variables"**.
18. Vedrai una lista di variabili. Cerca la riga chiamata **`DATABASE_URL`**.
19. A destra di quella riga clicca i **tre puntini `⋯`** → **"Edit"** (Modifica).
20. Si apre un riquadro con il valore attuale. **Cancella tutto** quello che c'è dentro (clicca nel campo, `Ctrl+A`, poi `Canc`).
21. **Incolla la nuova connection string** che hai salvato nel blocco note al punto 13.
22. Sotto al campo ci sono tre caselline: **Production**, **Preview**, **Development**. Assicurati che siano spuntate le stesse che erano spuntate prima (di norma almeno **Production**).
23. Clicca **"Save"**.
24. **Ripeti i punti 18-23 per ogni altra variabile che contiene la vecchia password.** Cerca in particolare, se presenti:
    - `DATABASE_URL_UNPOOLED`
    - `POSTGRES_URL`
    - `POSTGRES_PRISMA_URL`
    - `POSTGRES_URL_NON_POOLING`
    - `PGPASSWORD` (qui va **solo la password**, non tutta la stringa)
    - `POSTGRES_PASSWORD` (idem, solo la password)

    Per capire se una variabile contiene la vecchia password, clicca l'iconcina a forma di **occhio** per mostrarne il valore.

### Parte 3 — Fai ripartire il sito con la password nuova

25. In alto su Vercel clicca la scheda **"Deployments"**.
26. La prima riga in cima è il deploy attuale. Clicca i suoi **tre puntini `⋯`**.
27. Scegli **"Redeploy"**.
28. Appare una finestra: **NON** spuntare "Use existing Build Cache". Lasciala vuota.
29. Clicca **"Redeploy"** e aspetta. Ci vogliono 1-3 minuti. Quando compare la scritta **"Ready"** con il pallino verde, è fatto.

### Parte 4 — Verifica

30. Apri il sito di TradingSpace nel browser.
31. Fai il login e apri la Dashboard.
32. **Se vedi i tuoi trade, è andato tutto bene.** ✅
33. Se invece vedi una pagina di errore: torna al punto 18 e ricontrolla di aver incollato la stringa **giusta e per intero** (deve finire con `?sslmode=require`). L'errore più comune è aver dimenticato un pezzo nel copia-incolla.

### Parte 5 — Pulizia

34. **Svuota il blocco note** dove avevi incollato la password: cancella tutto e chiudilo senza salvare.
35. Sul tuo computer, nella cartella del progetto, c'è un file `.env.production.local` con la vecchia password. Non è in pericolo (non finisce su internet), ma per pulizia aprilo con un editor di testo e aggiorna le righe con la password nuova — oppure cancella il file, tanto si riscarica.

---

## AZIONE B — Controllare che i deploy di prova non usino il database vero

**Perché:** ogni volta che apri un branch, Vercel crea un sito di anteprima. Se quel sito di anteprima si collega al database di produzione, i dati veri degli utenti finiscono su un indirizzo web di prova, spesso meno protetto.

**Quanto ci vuole:** 10 minuti.

1. Su **https://vercel.com** → progetto **tradejournal** → **"Settings"** → **"Environment Variables"**.
2. Guarda la riga **`DATABASE_URL`**. Nella colonna a destra c'è scritto per quali ambienti vale (Production, Preview, Development).
3. **La domanda a cui rispondere:** c'è scritto "Preview"?
   - **Se c'è scritto SOLO "Production":** perfetto, è già a posto. ✅ Salta al punto 6.
   - **Se c'è scritto anche "Preview":** i siti di anteprima stanno usando il database vero. Va sistemato (punto 4).
4. Per sistemarlo servono due database separati. Su Neon puoi crearne uno di prova gratis: console.neon.tech → il tuo progetto → **"Branches"** → **"Create branch"**, chiamalo `preview`. Neon ti darà una nuova connection string.
5. Torna su Vercel: modifica `DATABASE_URL` lasciando spuntato solo **Production**, poi crea una **nuova** variabile chiamata sempre `DATABASE_URL`, spuntando solo **Preview**, con dentro la connection string del branch `preview`.
6. Già che sei in questa pagina, controlla che esistano queste variabili con **Production** spuntato: `AUTH_SECRET`, `CRON_SECRET`, `MACRO_DESK_API_SECRET`. Se una manca, i lavori automatici notturni o gli endpoint protetti non funzionano.

---

## AZIONE C — Controllare i backup del database

**Perché:** se un giorno i dati vengono cancellati per sbaglio, il backup è l'unica via di ritorno. Meglio scoprire adesso se c'è, non quel giorno.

**Quanto ci vuole:** 5 minuti.

1. Vai su **https://console.neon.tech** → il tuo progetto.
2. Nel menù a sinistra cerca **"Settings"**, poi dentro cerca una voce che parla di **"History retention"** o **"Point-in-time restore"** o **"Backups"**.
3. Trovi un numero di giorni o di ore. **Annotalo.**
   - Nel piano gratuito di Neon di solito è **24 ore**. Vuol dire che puoi tornare indietro solo di un giorno.
   - Se ti sembra poco per i dati finanziari dei tuoi utenti, in quella stessa pagina puoi aumentarlo (richiede un piano a pagamento).
4. **Test consigliato, una volta l'anno:** prova a fare un ripristino su un branch di prova, per essere sicuro che il backup funzioni davvero. Un backup mai provato non è un backup.

---

## AZIONE D — Spegnere il lettore di file MT5 in produzione

> ### ✅ GIÀ FATTA — 03/08/2026. Non devi rifarla.
> `MT5_WATCHER_DISABLED=1` è stata aggiunta su **Production** e **Preview** (non su Development, dove il watcher serve ancora in locale) e il redeploy è stato verificato: la riga `[mt5-sync] watcher attivo` non compare più nei log. Dettagli in **P2-9**.
> I passi qui sotto restano solo come riferimento, per esempio se un giorno servisse rifarli su un nuovo progetto Vercel.
>
> ⚠️ **Se mai dovessi rifarla: il valore è `1`, non `true`.** Il codice confronta la stringa esatta `"1"`; qualsiasi altro valore lascia il watcher acceso senza dare segnali.

**Perché:** c'è una funzione che legge file dal disco del server. Su Vercel non serve a niente (quei file non ci sono) e lasciarla accesa apre una porta inutile.

**Quanto ci vuole:** 3 minuti.

1. Su **https://vercel.com** → progetto **tradejournal** → **"Settings"** → **"Environment Variables"**.
2. Cerca una variabile chiamata **`MT5_WATCHER_DISABLED`**.
3. **Se non esiste:** cliccala di creare. Nome: `MT5_WATCHER_DISABLED`. Valore: `1`. Spunta **Production** e **Preview**. Salva.
4. **Se esiste:** clicca l'occhio per vederne il valore. Deve essere esattamente **`1`**. Se è vuoto o diverso, modificalo mettendo `1`.
5. Perché il cambiamento abbia effetto serve un nuovo deploy: **"Deployments"** → tre puntini sul primo → **"Redeploy"**.

---

## AZIONE E — Vedere chi ha accesso

**Perché:** capire chi, oltre a te, può entrare nel database e nel sito.

**Quanto ci vuole:** 5 minuti.

1. **Su Neon:** console.neon.tech → il tuo progetto → cerca **"Settings"** → **"Members"** (o "Team"). Guarda l'elenco delle persone. **Se c'è qualcuno che non riconosci o che non collabora più, rimuovilo.**
2. **Su Vercel:** vercel.com → in alto a sinistra clicca sul nome del tuo team → **"Settings"** → **"Members"**. Stessa cosa: rimuovi chi non deve esserci.
3. **Controlla di avere l'autenticazione a due fattori attiva** sui due account, perché sono le chiavi di tutto:
   - Vercel: menù in alto a destra (la tua foto) → **"Account Settings"** → **"Authentication"** → attiva **"Two-Factor Authentication"**.
   - Neon: **"Account settings"** → **"Security"** → attiva l'autenticazione a due fattori.
   - Se hai fatto il login su entrambi con Google o GitHub, allora la protezione dipende da quell'account: assicurati che **quello** abbia la verifica in due passaggi attiva.

---

## AZIONE F — Collaudo con sessione reale (10 minuti, solo tu puoi farlo)

**Perché:** tutta la verifica automatica si ferma davanti al login. Nessuna rotta pubblica dell'app tocca il database — è una buona proprietà di sicurezza, ma significa che i tre cambiamenti con più probabilità di dare fastidio non sono stati provati con una sessione vera.

1. Vai su **https://tradejournal-red-zeta.vercel.app** e fai il **login** normalmente.
2. Controlla che la **Dashboard carichi i tuoi trade**. → verifica i cookie ora `httpOnly` + `secure` (P2-12).
3. **Cambia conto** dal selettore in alto (e prova anche SIM1). → verifica il cookie `tj-account`.
4. Apri un **allegato già caricato** (uno screenshot su un trade o su una giornata). → verifica la nuova lettura del MIME dai byte (P1-6).
   - Se un allegato **si scarica invece di aprirsi in pagina**, non è un guasto: significa che i suoi byte non corrispondono a nessuna firma riconosciuta e viene servito come download per prudenza. Segnalamelo, si guarda insieme.
5. Apri **Macro Desk** e **Stagionalità**: devono caricare senza errori.

Se qualcosa non va, il ripristino è immediato: su Vercel → Deployments → il deploy precedente → **"Promote to Production"**.

---

## Da fare più avanti (non urgente, non farlo adesso)

Queste tre cose sono migliorie, non emergenze. Le annoto qui per non perderle.

- **Cambiare gli altri segreti.** `MACRO_DESK_API_SECRET` e `CRON_SECRET` non risultano mai finiti in chat, quindi non sono urgenti. Se li vuoi cambiare per abitudine, si fa come nell'Azione A parte 2, generandone di nuovi.
  ⚠️ **`AUTH_SECRET` è diverso dagli altri: se lo cambi, tutti gli utenti vengono disconnessi** e devono rifare il login. Non è un guasto, ma avvisali prima.
- **Creare un utente database con meno poteri** (finding P0-1). Oggi l'app si collega al database come "proprietario", che può anche cancellare intere tabelle. Sarebbe meglio un utente che può solo leggere e scrivere le righe. È un lavoro da fare insieme, con calma.
- **Attivare il firewall di Vercel** per bloccare chi prova migliaia di password sulla pagina di login (finding P1-8). Si trova in Settings → Firewall.

---

---

# Stato finale — 03/08/2026

## Chiuso e in produzione

| Finding | Cosa è stato fatto | Commit |
|---|---|---|
| P0-1 | Password `neondb_owner` ruotata, riconnessione verificata | — (manuale) |
| P0-2 | `@auth/core` 0.41.3 · `next-auth` beta.32 — 2 CVE critical a zero | `8fec649` |
| P0-3 | `next` 16.2.12 — 9 CVE dirette di Next.js chiuse, cache confusion inclusa | `8fec649` |
| P1-4a | 4 security header + `poweredByHeader: false` | `5f51d95` |
| P1-5 | Sanitizzatore riscritto: nessun input può produrre un attributo | `5f51d95` |
| P1-6 | MIME degli allegati dedotto dai byte, in upload **e** in lettura | `5f51d95` |
| P2-9 | Kill-switch invertito + `filePath` confinato + env var rimossa | `5f51d95` |
| P2-12 | Cookie server `httpOnly` + `secure` + `sameSite` | `5f51d95` |

**Nessun finding P0 o P1 resta aperto**, salvo il residuo qui sotto.

## L'unico residuo tecnico: il ruolo `neondb_owner`

L'applicazione si connette al database come **ruolo proprietario**, che può `DROP TABLE`, leggere tutto e creare ruoli. La password è stata ruotata, quindi la parte urgente è chiusa; resta il **raggio d'azione** in caso di compromissione futura.

**Perché è stato lasciato aperto, e non è pigrizia.** L'integrazione Neon-Vercel **risincronizza `DATABASE_URL` da sola** — l'abbiamo vista farlo 29 secondi dopo la rotazione. Puntare quella variabile a un ruolo ristretto significa che il prossimo sync può riportarla a `neondb_owner` **in silenzio**, lasciando l'illusione di un privilegio ridotto che non c'è più. La strada corretta è probabilmente una variabile separata (es. `APP_DATABASE_URL`) letta dal codice applicativo, lasciando `DATABASE_URL` all'integrazione per le sole migrazioni — ma va progettata, non improvvisata.

Con **due utenti** e la credenziale appena ruotata, il rischio residuo è basso. Da riprendere se l'app dovesse aprirsi a più utenti.

## Fuori scope, per decisione esplicita

Escluse in quanto sproporzionate per un'applicazione privata a due utenti — **non** sono sviste:

| Finding | Cosa | Perché escluso |
|---|---|---|
| P1-4b | CSP | Richiede una fase report-only e cura continua; il rischio XSS principale (P1-5) è chiuso a monte |
| P1-7 | Invalidazione sessioni al cambio password | Migrazione + 1 query per richiesta, per uno scenario che con 2 utenti noti è remoto |
| P1-8 | Rate limiting distribuito | Misura anti-traffico-di-massa: non c'è traffico di massa |
| P2-10 | Reset password | Richiede un provider email; i 2 utenti si recuperano a voce |
| P2-11 | Policy password severe / HIBP | Idem: nessun utente sconosciuto da proteggere da sé stesso |
| P2-13 | Scadenza assoluta di sessione | Fastidio quotidiano sproporzionato al rischio |
| P2-14 | Isolamento DB Preview | Delicato per via dell'integrazione gestita; con 2 utenti l'esposizione è contenuta |

## Cosa resta da fare, quando vorrai

1. **Azione E** — 2FA su Vercel e Neon, e revisione dei membri. Sforzo minimo, e quegli account sono le chiavi di tutto, database compreso. **È la cosa con il miglior rapporto valore/sforzo rimasta.**
2. **Azione C** — verificare la finestra di backup/PITR su Neon (piano gratuito = 24 ore).
3. **Azione B** — separare il database dei deploy Preview da quello di produzione. Verificato: tutte e 16 le variabili di database sono scopate `Production, Preview`.

---

*Fine dell'audit. Ricognizione, remediation e verifica in produzione: 03/08/2026.*
