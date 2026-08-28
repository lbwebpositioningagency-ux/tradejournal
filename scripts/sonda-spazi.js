/**
 * Sonda: parole incollate a un numero o a un'altra parola dentro il testo
 * della pagina.
 *
 * Serve a stanare il difetto JSX per cui uno spazio fra un'espressione e il
 * testo che la segue sparisce nel montaggio — «28/08/2026nel fuso», «Fonte non
 * lettanon vuol dire». Sono errori che la revisione a occhio non prende: a
 * schermo intero uno spazio mancante fra due parole si vede appena, e in uno
 * screenshot ridotto non si vede affatto.
 *
 * Da usare con `scripts/measure.mjs --file`.
 */
(() => {
  const testo = document.body.innerText;
  const casi = [];
  /* Una cifra attaccata a una lettera minuscola: quasi sempre è una data o un
     numero seguito da una parola che ha perso lo spazio. Le unità legittime
     (12px, 3gg, 20p) si scrivono col numero PRIMA, quindi si escludono per
     lista invece che per regola. */
  const unita = /^(gg|px|pt|pp|mesi|min|ore|anni|sedute|settimane|d|h|m|s|k|M|y|a|Q|W)$/;
  for (const m of testo.matchAll(/(\d)([A-Za-zÀ-ÿ]+)/g)) {
    if (unita.test(m[2])) continue;
    const i = Math.max(0, m.index - 28);
    casi.push(testo.slice(i, m.index + m[0].length + 16).replace(/\s+/g, " "));
  }
  /* Una minuscola attaccata a una maiuscola dentro una parola: «lettaNon». */
  for (const m of testo.matchAll(/([a-zà-ÿ]{3,})([A-ZÀ-Þ][a-zà-ÿ]{2,})/g)) {
    const i = Math.max(0, m.index - 28);
    casi.push(testo.slice(i, m.index + m[0].length + 16).replace(/\s+/g, " "));
  }
  return casi;
})();
