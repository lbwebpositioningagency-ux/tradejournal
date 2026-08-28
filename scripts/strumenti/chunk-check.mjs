/**
 * Verifica che ogni chunk client referenziato da una pagina esista davvero.
 *
 * È il controllo che separa «la pagina è rotta nel codice» da «la pagina è
 * rotta perché manca un file statico»: se un chunk risponde 404, React non si
 * idrata, i link smettono di navigare e il server non registra NESSUNA
 * richiesta — perché il click non arriva mai a produrne una. Un guasto che nei
 * log del server è invisibile per costruzione.
 *
 * Uso: node scripts/strumenti/chunk-check.mjs <url-di-una-pagina>
 */
const pagina = process.argv[2];
if (!pagina) {
  console.error("Uso: node scripts/strumenti/chunk-check.mjs <url>");
  process.exit(1);
}

const origine = new URL(pagina).origin;
const html = await (await fetch(pagina)).text();

const percorsi = [
  ...new Set(
    [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map(
      (m) => m[1],
    ),
  ),
];

const esiti = await Promise.all(
  percorsi.map(async (p) => {
    const r = await fetch(origine + p, { method: "GET" });
    return { p, stato: r.status };
  }),
);

const rotti = esiti.filter((e) => e.stato !== 200);
console.log(
  JSON.stringify(
    {
      pagina,
      controllati: esiti.length,
      rotti: rotti.length,
      dettaglio: rotti,
    },
    null,
    1,
  ),
);
process.exit(rotti.length === 0 ? 0 : 1);
