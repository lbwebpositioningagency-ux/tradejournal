# SCHEDULING — come gira il precalcolo notturno

**Scelta: Vercel Cron**, con uno script locale per il primo popolamento.
GitHub Actions resta il piano B, documentato in §4.

---

## 1. Perché Vercel Cron

Il repo **lo usa già**: `vercel.json` contiene il cron settimanale del COT e
`src/app/api/cot-sync/route.ts` è il modello di endpoint protetto. Aggiungere
una seconda voce non introduce infrastruttura nuova, non introduce un secondo
posto dove tenere i secret, e non introduce un secondo modo di autenticare un
job. Un'automazione in più su GitHub Actions avrebbe voluto dire copiare la
connection string di Neon nei secret del repository: una copia in più di un
segreto che oggi vive in un posto solo.

Limiti del piano da tenere presenti:

| | Hobby | Pro |
|---|---|---|
| Numero di cron | 2 | molti di più |
| Frequenza | **una volta al giorno** | qualunque |
| Orario | eseguito *entro l'ora* indicata | puntuale |
| Durata funzione | 300 s | 300 s (estendibile) |

Il progetto avrà **due** cron in tutto (COT settimanale + stagionalità
notturna) e la stagionalità gira **una volta al giorno**: rientra anche nel
piano Hobby. Se il piano dovesse rifiutare la seconda voce, il messaggio
arriva al deploy e si passa al piano B senza toccare il codice del job.

## 2. Configurazione

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cot-sync",        "schedule": "0 5 * * 6"  },
    { "path": "/api/seasonality-sync","schedule": "30 3 * * *" }
  ]
}
```

**`30 3 * * *` = ogni notte alle 03:30 UTC** (05:30 in Italia d'estate, 04:30
d'inverno). La finestra è scelta apposta: la settimana di Dukascopy chiude
venerdì alle 21:00 UTC e le sessioni asiatiche del giorno prima sono già
archiviate; FRED pubblica durante la giornata americana, quindi alle 03:30 UTC
il dato del giorno precedente c'è.

Gli orari dei cron Vercel sono **sempre in UTC**: nessun aggiustamento
stagionale, l'orario di esecuzione in Italia si sposta di un'ora tra CET e
CEST ed è irrilevante per un job che lavora su dati già chiusi.

## 3. Autenticazione dell'endpoint

Identica a `cot-sync`, riusata riga per riga:

```ts
if (!isAuthorizedMacroRequest(
      request.headers.get("authorization"),
      process.env.CRON_SECRET)) {
  return Response.json({ error: "Non autorizzato" }, { status: 401 });
}
```

- Vercel aggiunge da sé `Authorization: Bearer <CRON_SECRET>` alle invocazioni
  cron **quando la env var `CRON_SECRET` esiste sul progetto**. Esiste già:
  la usa il job COT.
- Il confronto è **timing-safe** e **fail-closed** (secret assente → nega).
- L'endpoint risponde **sempre 200** con l'esito dettagliato, come il job COT:
  un problema di rete o una serie ritirata finiscono nel corpo e nei log, mai
  in un crash che spegnerebbe il cron in silenzio.

## 4. Piano B — GitHub Actions

Da usare **solo** se il piano Vercel rifiuta il secondo cron. Il job resta
identico: cambia solo chi bussa all'endpoint.

```yaml
# .github/workflows/seasonality-sync.yml
name: Stagionalità — sync notturno
on:
  schedule: [{ cron: "30 3 * * *" }]
  workflow_dispatch:
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -sS -f -X GET "$URL" -H "Authorization: Bearer $SECRET"
        env:
          URL:    https://<dominio-di-produzione>/api/seasonality-sync
          SECRET: ${{ secrets.CRON_SECRET }}
```

Richiede di aggiungere `CRON_SECRET` ai *Secrets* del repository GitHub — cioè
esattamente la duplicazione di segreto che il piano A evita. Per questo è il
piano B e non il piano A.

## 5. Primo popolamento: **non** passa dal cron

Il backfill iniziale scarica centinaia di file mensili da Dukascopy per
strumento (~23 anni di candele orarie per l'oro). Non entra nei 300 secondi di
una funzione, e non ha senso spezzarlo in decine di notti.

Il primo popolamento gira quindi **in locale**, una volta sola, con uno script
`tsx` che scrive sullo stesso database. Il cron notturno fa solo il **delta**:
i giorni nuovi dall'ultima barra salvata, che sono pochi file e stanno
comodamente nel limite.

Questa separazione ha un secondo vantaggio: il backfill è **ripetibile e
interrompibile** senza mettere a rischio il job di produzione, perché le
scritture sono idempotenti sulla chiave `(instrument, data)`.

Lo script arriva nella fase di ingest, non in Fase 0.

## 6. Cosa succede se una notte salta

Niente di irreversibile, per costruzione:

- l'ingest è **incrementale e idempotente**: la notte dopo recupera anche il
  giorno perso, perché parte dall'ultima barra effettivamente salvata e non da
  «ieri»;
- il precalcolo è **integralmente riscritto** a ogni esecuzione riuscita, non
  accumulato: non esiste uno stato parziale che si sporca;
- `SeasonalityCoverage` e `SeasonalityRun` registrano l'ultima esecuzione
  riuscita, così la pagina può dire da sé quanto è vecchio il numero che sta
  mostrando invece di far finta che sia di oggi.
