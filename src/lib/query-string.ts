/**
 * Ricostruire una query string dai `searchParams` di una pagina App Router.
 *
 * Nasce da un difetto vero: `/stagionalita` reindirizzava a
 * `/macro-desk/stagionalita` **buttando via la query**, quindi un segnalibro
 * come `/stagionalita?s=WTI&w=5` atterrava sull'oro a vent'anni — cioè
 * esattamente sulla pagina sbagliata, in silenzio, con l'aria di funzionare.
 * Un reindirizzamento che esiste per non rompere i vecchi link non può essere
 * il pezzo che li rompe.
 *
 * Modulo puro: nessun accesso alla rete, nessuno stato.
 */

/** Quello che App Router consegna in `searchParams`. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `base` con la query ricostruita, o `base` nudo se non c'è niente da passare.
 *
 * I parametri ripetuti (`?m=1&m=2`) restano ripetuti: sono un array, e
 * schiacciarli su un valore solo cambierebbe il significato del link. L'ordine
 * delle chiavi è quello di partenza, così due link uguali restano uguali.
 */
export function conQueryString(base: string, params: SearchParams): string {
  const qs = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(params)) {
    if (valore === undefined) continue;
    if (Array.isArray(valore)) {
      for (const v of valore) qs.append(chiave, v);
    } else {
      qs.append(chiave, valore);
    }
  }
  const stringa = qs.toString();
  return stringa === "" ? base : `${base}?${stringa}`;
}
