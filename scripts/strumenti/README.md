# Strumenti di indagine

Sonde di **sola lettura**, nate ognuna da un guasto vero: non scrivono niente,
né su disco né sul database, e servono a rispondere con una misura invece che
con un'ipotesi.

| Strumento | Risponde a |
| --- | --- |
| `buchi-serie.mjs` | Quali mesi delle serie giornaliere non hanno nemmeno una seduta (trovò il 2005 dell'oro sparito) |
| `prova-incrociata-stagionalita.mjs` | La media stagionale mostrata coincide con un ricalcolo indipendente dalle barre grezze? |
| `confronta-oro-fonte.ts` | L'archivio combacia con la fonte, seduta per seduta? |
| `oro-2005-dalla-fonte.ts` | Un periodo mancante in archivio esiste alla fonte, o non è mai esistito? |
| `gennaio-oro.mjs` | I rendimenti di un mese anno per anno, per capire perché un campione è più corto |
| `ciclo-retrodatato.ts` | Il trend di Trends cambia se lo si ricalcola su dati troncati indietro nel tempo? |
| `naviga.mjs` | I link navigano davvero, o React è morto in idratazione? Raccoglie errori di console |
| `chunk-check.mjs` | I chunk JS referenziati da una pagina esistono tutti, o qualcuno risponde 404? |
| `sonda-spazi.js` | Spazi mangiati dal montaggio JSX («28/08/2026nel fuso»), invisibili in uno screenshot |
| `percorso-unita.mjs` | La stessa curva stagionale costruita in quattro modi (% o valuta × media o mediana): quale scelta di metodo cambia la forma |
| `percorso-varianti.mjs` | La stessa curva cambiando allineamento (giorno di calendario o di negoziazione) e finestra: la forma descrive la stagionalità o quei cinque anni? |
| `tratto-anno-per-anno.mjs` | Apre la media su un tratto: la discesa è condivisa dagli anni, o la trascina un anno solo? |
| `ordine-media.mjs` | Ordine delle operazioni: prima i percorsi e poi la media, o prima la media e poi il cumulo? Sono due curve diverse |
| `percorso-base100.mjs` | Che numero verrebbe indicizzando a 100 come dichiara Seasonax, invece di cumulare i rendimenti |
| `impronta-storia.mjs` | **Cos'è cambiato e quando**: il registro delle variazioni dei valori chiave della Stagionalità, con il prima e il dopo |
| `contesi.mjs` | Quali file stanno toccando due sessioni in parallelo sullo stesso `main` |
| `crop.mjs` | Ritaglia uno screenshot per guardarne una zona a scala 1:1 |

`naviga.mjs`, `sonda-spazi.js` e `crop.mjs` si usano con `scripts/measure.mjs` e
`scripts/shot.mjs`, che sono il resto della cassetta.
