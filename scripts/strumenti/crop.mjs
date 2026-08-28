/**
 * Ritaglio di uno screenshot, per guardare una zona a scala 1:1.
 *
 * Strumento di verifica visiva, non di prodotto: `shot.mjs` fotografa la
 * pagina intera e la riduce, e su una tabella fitta la riduzione nasconde
 * proprio ciò che si vuole controllare — allineamento delle colonne, corpo del
 * testo, contrasto dei filetti.
 *
 * Uso: node scripts/strumenti/crop.mjs <src.png> <out.png> <x> <y> <w> <h>
 */
import sharp from "sharp";

const [, , src, out, x, y, w, h] = process.argv;
if (!src || !out) {
  console.error("Uso: node scripts/strumenti/crop.mjs <src> <out> <x> <y> <w> <h>");
  process.exit(1);
}
await sharp(src)
  .extract({ left: +x, top: +y, width: +w, height: +h })
  .toFile(out);
console.log("scritto", out);
