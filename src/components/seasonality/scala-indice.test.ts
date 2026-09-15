import { describe, expect, it } from "vitest";
import { PX_PER_TACCA, scalaIndice, tickDelDominio } from "./scala-indice";

describe("scalaIndice", () => {
  it("oro, 20 anni (100,0–111,2) su 424px: passo 1, dominio 99–112", () => {
    const s = scalaIndice({ min: 100, max: 111.2 }, 424);
    expect(s.dominio).toEqual([99, 112]);
    expect(s.passo).toBe(1);
    expect(s.tick).toContain(100);
    expect(s.tick[0]).toBe(99);
    expect(s.tick.at(-1)).toBe(112);
  });

  it("stessa finestra su 254px: il passo sale a 2 per non far toccare le etichette", () => {
    const s = scalaIndice({ min: 100, max: 111.2 }, 254);
    expect(s.passo).toBe(2);
    expect(s.dominio).toEqual([98, 112]);
    const spazio = 254 / ((s.dominio[1] - s.dominio[0]) / s.passo);
    expect(spazio).toBeGreaterThanOrEqual(PX_PER_TACCA);
  });

  it("il 100 resta dentro anche se le linee stanno tutte sopra", () => {
    const s = scalaIndice({ min: 105, max: 111 }, 424);
    expect(s.dominio[0]).toBeLessThanOrEqual(100);
    expect(s.tick).toContain(100);
  });

  it("e anche se stanno tutte sotto", () => {
    const s = scalaIndice({ min: 88, max: 97 }, 424);
    expect(s.dominio[1]).toBeGreaterThanOrEqual(100);
    expect(s.tick).toContain(100);
  });

  it("nessuna linea accesa: l'intorno del 100, tacche senza residuo binario", () => {
    const s = scalaIndice(null, 424);
    expect(s.dominio).toEqual([99.7, 100.3]);
    expect(s.passo).toBe(0.1);
    expect(s.tick).toEqual([99.7, 99.8, 99.9, 100, 100.1, 100.2, 100.3]);
  });

  it("escursioni grandi (OVX, anno in corso fino a 400) trovano un passo", () => {
    const s = scalaIndice({ min: 83.3, max: 400.8 }, 424);
    expect(s.passo).toBe(50);
    expect(s.dominio[0]).toBeLessThanOrEqual(83.3);
    expect(s.dominio[1]).toBeGreaterThanOrEqual(400.8);
    expect(s.tick).toContain(100);
  });

  it("le tacche non superano mai l'altezza disponibile", () => {
    for (const h of [120, 154, 254, 424, 504]) {
      for (const [min, max] of [[99.5, 100.4], [100, 111.2], [92.3, 148.5], [85, 207]]) {
        const s = scalaIndice({ min, max }, h);
        expect(s.tick.length - 1).toBeLessThanOrEqual(Math.max(2, Math.floor(h / PX_PER_TACCA)));
      }
    }
  });
});

describe("tickDelDominio", () => {
  it("dominio stretto dallo zoom: tacche sui multipli del passo, estremi compresi", () => {
    const t = tickDelDominio([102, 108], 424);
    expect(t.passo).toBe(0.5);
    expect(t.tick[0]).toBe(102);
    expect(t.tick.at(-1)).toBe(108);
  });

  it("estremi non multipli: si parte dal primo multiplo dentro, alla distanza minima", () => {
    // 154px → al massimo 4 intervalli: 4,5 punti chiedono passo 2, non 1.
    const t = tickDelDominio([99.25, 103.75], 154);
    expect(t.passo).toBe(2);
    expect(t.tick).toEqual([100, 102]);
  });
});
