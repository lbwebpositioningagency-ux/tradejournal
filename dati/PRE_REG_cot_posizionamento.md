# PRE-REGISTRAZIONE — Posizionamento e Partecipazione (COT)

**Data:** 31 luglio 2026, prima di calcolare qualsiasi risultato
**Strumenti:** GOLD (COMEX), WTI (NYMEX)
**Dati:** CFTC Disaggregated Futures Only 2017-2026 (archivi ufficiali) + OHLC giornalieri OANDA

---

## 0. Prior dichiarato in anticipo

A differenza del termometro di volatilità — dove il predittore *era* la previsione del mercato e
il prior era altissimo — qui **l'evidenza accademica è mista e in larga parte debole**. Il
posizionamento estremo degli speculatori spesso *accompagna* i trend invece di anticiparne la
fine.

**Probabilità stimata a priori che il test primario passi: 25-35%.** Scritta prima di guardare.
Se fallisce non è una sorpresa da razionalizzare: è l'esito più probabile.

---

## 1. Dati e allineamento temporale

| | Valore |
|---|---|
| Settimane totali per strumento | 496 (2017-01-03 → 2026-07-21) |
| Design | 443 settimane (fino a 2025-06-24) |
| **Holdout SIGILLATO** | **53 settimane (2025-07-01 → 2026-06-30)** |
| Warm-up percentile espandente | 156 settimane (3 anni) |
| Settimane di design effettivamente testabili | **287** |

**Catena temporale (verificata su casi campione):**
```
COT fotografa il MARTEDÌ  →  pubblicato VENERDÌ 15:30 ET  →  entry LUNEDÌ successivo
```
Ritardo mediano COT→entry: **6 giorni** (min 6, max 7). Nessuna osservazione usa informazione
non ancora pubblicata.

**Nota sul contratto WTI:** il CFTC ha rinominato "CRUDE OIL, LIGHT SWEET" in "WTI-PHYSICAL"
a inizio 2022. Le due serie sono state unite; la giunzione è stata verificata (open interest
1,87M → 2,09M in continuità, nessun salto artificiale).

**Limite dichiarato:** i prezzi sono CFD OANDA, non i futures COMEX/NYMEX su cui il COT è
calcolato. Proxy accettato consapevolmente: le due serie sono altamente correlate ma non
identiche. Va ricordato nell'interpretazione.

---

## 2. Variabili

**Predittori (misurati al martedì, utilizzabili dal lunedì successivo):**
- `mm_net` = Managed Money long − short → **posizionamento**
- `open_interest` = open interest totale → **partecipazione**

Percentile empirico **espandente** (min 156 settimane), causale per costruzione.

**Categorie escluse a priori:** Producer/Merchant (correlazione con Managed Money **−0,53 oro /
−0,70 WTI**: è in gran parte l'immagine speculare, non informazione indipendente) e
Non-Reportable (rumorosa e marginale). Testarle raddoppierebbe la famiglia di confronti senza
aggiungere informazione.

**Esiti:** rendimento forward a 1, 2 e 4 settimane dall'entry.

---

## 3. Ipotesi, in ordine di prior decrescente

### H1 — PRIMARIA: partecipazione conferma il trend
Settimane con **prezzo e open interest concordi in crescita** (denaro nuovo che entra) mostrano
maggiore continuazione a 4 settimane rispetto a settimane con **prezzo su e OI in calo** (short
covering, rally fragile).

*Criterio di superamento:* differenza nel rendimento medio a 4 settimane **≥ 1,5 punti
percentuali**, p < 0,05 con bootstrap a blocchi (blocchi di 8 settimane, 5000 replicati), e
**segno coerente su entrambi gli strumenti**.

### H2 — Secondaria: l'estremo comprime, non inverte
Sopra il **90° percentile** di `mm_net`, i rendimenti forward a 4 settimane **si comprimono**
(minore ampiezza media assoluta), non si invertono di segno.

*Criterio:* riduzione ≥ 25% nella media del valore assoluto del rendimento, p < 0,05, segno
coerente.

### H3 — Terziaria: il contrarian classico
Sopra il 90° percentile → rendimento forward negativo entro 4 settimane.

*Criterio:* rendimento medio ≤ −1,5 pp, p < 0,05, coerente. **Prior basso: mi aspetto che
fallisca.** La testo perché è l'ipotesi che tutti citano, e un fallimento documentato ha valore.

**Correzione per confronti multipli:** Holm-Bonferroni sulla famiglia delle tre ipotesi ×
tre orizzonti. La primaria è H1 a 4 settimane; il resto è robustezza e non può salvarla.

---

## 4. Regole non negoziabili

1. **L'holdout (53 settimane) si apre una volta sola**, dopo che H1 è stata valutata sul design.
   Se H1 fallisce sul design, l'holdout **non si apre affatto** — non c'è ipotesi da confermare.
2. **Nessuna quarta ipotesi** se le tre falliscono. Nessun orizzonte aggiuntivo cercato a
   posteriori.
3. **Nessuna soglia si sposta** dopo aver visto i risultati.
4. Se nulla passa: il posizionamento COT può comunque entrare nel Macro Desk come **fatto
   descrittivo** ("Managed Money al 93° percentile della propria storia"), **mai** accompagnato
   da probabilità condizionate non dimostrate.

---

## 5. Vincolo di potenza — dichiarato in anticipo

Con 287 settimane di design e ~29 osservazioni sopra il 90° percentile, H2 e H3 sono
**strutturalmente sottodimensionate**. Un esito non significativo su quelle si legge come
"campione insufficiente", non come prova contraria. H1 usa tutto il campione ed è l'unica con
potenza adeguata — per questo è la primaria.
