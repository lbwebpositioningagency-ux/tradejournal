import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RigaRevisione } from "./riga-revisione";
import { revisioneDaDire } from "@/lib/macro-desk-versioni";

/** La coppia di versioni del 28/08: due arrivi, un bias diverso. */
const versione = (bias: string) => ({
  arrivatoIl: new Date("2026-08-28T14:59:24Z"),
  payload: {
    assets: [
      { id: "oil", name: "Petrolio", weekly: { biasLabel: bias, confidence: 45 } },
    ],
  },
});

describe("RigaRevisione", () => {
  it("dice il numero, l'ora d'arrivo NEL FUSO UTENTE e che cosa è cambiato", () => {
    const html = renderToStaticMarkup(
      <RigaRevisione
        revisione={revisioneDaDire(2, versione("NEUTRALE"), versione("RIBASSISTA"))}
        timezone="Europe/Rome"
      />,
    );
    expect(html).toContain("2ª versione di oggi");
    // 14:59 UTC in Europa/Roma sono le 16:59: l'ora è quella di chi legge
    expect(html).toContain("16:59");
    expect(html).toContain("il bias di Petrolio è passato da NEUTRALE a RIBASSISTA");
  });

  it("cambia fuso, cambia ora: non è un orario stampato a mano", () => {
    const html = renderToStaticMarkup(
      <RigaRevisione
        revisione={revisioneDaDire(2, versione("NEUTRALE"), versione("RIBASSISTA"))}
        timezone="UTC"
      />,
    );
    expect(html).toContain("14:59");
  });

  it("senza revisione non rende NIENTE, nemmeno un contenitore vuoto", () => {
    /* La parsimonia è il punto: una riga che compare a ogni rispedizione
       smetterebbe di essere letta proprio il giorno in cui dice qualcosa. */
    expect(renderToStaticMarkup(<RigaRevisione revisione={null} timezone="Europe/Rome" />)).toBe("");
  });

  it("due versioni identiche nei bias: nessuna riga", () => {
    const html = renderToStaticMarkup(
      <RigaRevisione
        revisione={revisioneDaDire(2, versione("NEUTRALE"), versione("NEUTRALE"))}
        timezone="Europe/Rome"
      />,
    );
    expect(html).toBe("");
  });
});
