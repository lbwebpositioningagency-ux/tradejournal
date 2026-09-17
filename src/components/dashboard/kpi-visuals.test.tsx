import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvgWinLossBar, ProfitFactorRing, StreakRing, WinRateGauge } from "./kpi-visuals";

/**
 * Grafiche dei widget KPI: disegnano i numeri già calcolati dalla card. Qui
 * si verifica che la geometria segua i dati e che i casi limite (zero
 * trade, nessuna perdita, serie oltre la massima) non producano NaN né
 * disegni falsi, e che i colori siano quelli della famiglia --viz-*.
 */

const dashes = (markup: string) =>
  [...markup.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)].map((m) => Number(m[1]) / Number(m[2]));

describe("WinRateGauge — arco Vinti / Pareggio / Persi", () => {
  it("uno spicchio per esito presente, con i conteggi nelle pillole", () => {
    const markup = renderToStaticMarkup(<WinRateGauge wins={307} breakevens={4} losses={316} />);
    expect(markup).toContain('stroke="var(--viz-profit)"');
    expect(markup).toContain('stroke="var(--viz-neutral)"');
    expect(markup).toContain('stroke="var(--viz-loss)"');
    for (const n of ["307", "4", "316"]) expect(markup).toContain(`>${n}</span>`);
    expect(markup).toContain("Trade vinti 307, in pareggio 4, persi 316");
  });

  it("nessun pareggio: niente spicchio grigio, la pillola dice 0", () => {
    const markup = renderToStaticMarkup(<WinRateGauge wins={10} breakevens={0} losses={5} />);
    expect(markup).not.toContain('stroke="var(--viz-neutral)"');
    expect(markup).toContain(">0</span>");
  });

  it("zero trade: solo il binario, nessun NaN", () => {
    const markup = renderToStaticMarkup(<WinRateGauge wins={0} breakevens={0} losses={0} />);
    expect(markup).not.toContain("NaN");
    expect(markup.match(/<path/g)).toHaveLength(1);
  });
});

describe("AvgWinLossBar — barra a due estremi", () => {
  it("la parte verde è la quota della vincita media sul totale", () => {
    const markup = renderToStaticMarkup(
      <AvgWinLossBar avgWin="673.96" avgLoss="427.80" winLabel="673,96 USD" lossLabel="427,80 USD" masked={false} />,
    );
    // 673,96 / (673,96 + 427,80) = 61,2%
    expect(markup).toContain("width:61.2%");
    expect(markup).toContain("text-profit");
    expect(markup).toContain("427,80 USD");
  });

  it("in privacy i valori non si colorano; senza dati resta il binario", () => {
    const masked = renderToStaticMarkup(
      <AvgWinLossBar avgWin="10" avgLoss="5" winLabel="•••" lossLabel="•••" masked />,
    );
    expect(masked).not.toContain("text-profit");
    const empty = renderToStaticMarkup(
      <AvgWinLossBar avgWin={null} avgLoss={null} winLabel="—" lossLabel="—" masked={false} />,
    );
    expect(empty).toContain("bg-viz-track");
    expect(empty).not.toContain("NaN");
  });
});

describe("ProfitFactorRing — quota dei profitti lordi", () => {
  it("PF 1 divide l'anello a metà, PF 3 ne dà tre quarti", () => {
    expect(dashes(renderToStaticMarkup(<ProfitFactorRing profitFactor="1.00" wins={5} />))[0]).toBeCloseTo(0.5, 1);
    expect(dashes(renderToStaticMarkup(<ProfitFactorRing profitFactor="3.00" wins={5} />))[0]).toBeCloseTo(0.75, 1);
  });

  it("nessuna perdita: anello pieno; nessun trade vincente né perdente: binario", () => {
    expect(dashes(renderToStaticMarkup(<ProfitFactorRing profitFactor={null} wins={3} />))[0]).toBe(1);
    const vuoto = renderToStaticMarkup(<ProfitFactorRing profitFactor={null} wins={0} />);
    expect(vuoto).toContain("var(--viz-track)");
    expect(vuoto).not.toContain("var(--viz-profit)");
  });
});

describe("StreakRing — serie corrente sulla sua massima", () => {
  it("riempie in proporzione alla massima nello stesso verso", () => {
    const markup = renderToStaticMarkup(<StreakRing label="Trade" length={3} direction="WIN" max={6} />);
    expect(dashes(markup)[0]).toBeCloseTo(0.5, 2);
    expect(markup).toContain("var(--viz-profit)");
    expect(markup).toContain(">3</text>");
  });

  it("una serie oltre la massima (finestra dei 200 trade) satura, non sfonda", () => {
    const markup = renderToStaticMarkup(<StreakRing label="Trade" length={9} direction="LOSS" max={6} />);
    expect(dashes(markup)[0]).toBeCloseTo(1, 2);
    expect(markup).toContain("var(--viz-loss)");
  });

  it("nessuna serie: binario vuoto e trattino", () => {
    const markup = renderToStaticMarkup(<StreakRing label="Giorni" length={0} direction="NONE" max={4} />);
    expect(markup).not.toContain("stroke-dasharray");
    expect(markup).toContain(">—</text>");
  });
});
