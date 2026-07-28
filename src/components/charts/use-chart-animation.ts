"use client";

import { useEffect, useState } from "react";

/**
 * Le animazioni d'ingresso dei grafici Recharts devono rispettare
 * `prefers-reduced-motion`, come già fanno le animazioni CSS del progetto
 * (vedi il blocco `@media (prefers-reduced-motion: reduce)` in globals.css).
 * Recharts non legge la media query da sé: va passato `isAnimationActive`.
 *
 * Effetto collaterale utile: le animazioni girano su `requestAnimationFrame`,
 * che in un browser headless (nessun frame composto) non scatta mai — barre e
 * punti restano a scala zero e i grafici si fotografano vuoti. Emulando la
 * reduced motion, gli screenshot di verifica mostrano i dati veri.
 *
 * Parte da `false` (nessuna animazione) e la abilita dopo il mount solo se
 * l'utente non ha chiesto meno movimento: così il primo paint è già completo,
 * senza sfarfallio.
 */
export function useChartAnimation(): boolean {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setAnimate(!query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return animate;
}
