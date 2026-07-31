import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RangeBar } from "./primitives";

/**
 * Rendering statico come per gli altri componenti del desk (nessun DOM).
 *
 * Il test centrale è una REGRESSIONE: la traccia deve avere un'altezza
 * vera. La versione precedente (dentro il pannello COT) usava `flex-1`, che
 * in un contenitore `flex-col` azzera la flex-basis sull'ALTEZZA: la barra
 * si riduceva a 0px e a schermo restava il solo puntino sospeso, senza il
 * range sotto.
 */

function bar(props: Partial<React.ComponentProps<typeof RangeBar>> = {}) {
  return renderToStaticMarkup(
    <RangeBar
      position={42}
      color="var(--md-info)"
      ariaLabel="Posizione nel range storico: 42 su 100"
      {...props}
    />,
  );
}

/** `left: 42%` dell'indicatore, come lo scrive React nello style inline. */
function markerLeft(markup: string): string | null {
  return markup.match(/left:\s*([\d.]+%)(?![^"]*w-px)/)?.[1] ?? null;
}

describe("RangeBar — traccia del range", () => {
  it("la traccia ha un'altezza dichiarata e larghezza piena, mai flex-1", () => {
    const markup = bar();
    expect(markup).toContain("h-2");
    expect(markup).toContain("w-full");
    // La regressione: `flex-1` su un figlio di flex-col azzera l'altezza.
    expect(markup).not.toContain("flex-1");
  });

  it("l'indicatore è posizionato alla percentuale del valore", () => {
    expect(markerLeft(bar({ position: 0 }))).toBe("0%");
    expect(markerLeft(bar({ position: 42 }))).toBe("42%");
    expect(markerLeft(bar({ position: 100 }))).toBe("100%");
  });

  it("valori fuori scala rientrano nella traccia, mai fuori dalla barra", () => {
    expect(markerLeft(bar({ position: -30 }))).toBe("0%");
    expect(markerLeft(bar({ position: 180 }))).toBe("100%");
  });

  it("le tacche opzionali compaiono ai confini richiesti", () => {
    const markup = bar({ ticks: [10, 30, 70, 90] });
    for (const t of [10, 30, 70, 90]) {
      expect(markup).toContain(`left:${t}%`);
    }
    // Senza tacche la traccia resta pulita.
    expect(bar()).not.toContain("w-px");
  });

  it("è un'immagine con etichetta accessibile: il puntino da solo non parla", () => {
    const markup = bar({ ariaLabel: "Percentile su 3 anni: 58°" });
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Percentile su 3 anni: 58°"');
  });
});
