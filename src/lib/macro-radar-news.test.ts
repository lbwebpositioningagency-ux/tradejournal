import { describe, expect, it } from "vitest";
import {
  AREA_ALTRO,
  componiDettaglio,
  frasiCopertura,
  listaRadar,
  type EvidenzaRadarLike,
  type VoceRadarLike,
} from "./macro-radar-news";

/**
 * La mappatura registro → schede News. Le due cose che qui possono rompersi
 * in silenzio, e per cui esiste questo file: la DEDUPLICA di `top[]` (che se
 * fallisce raddoppia le voci in pagina) e la composizione
 * dell'approfondimento (che è una stringa sola, e un pezzo assente non deve
 * lasciare righe vuote a penzoloni).
 */

const D = (chiave: string) => new Date(`${chiave}T00:00:00.000Z`);

function voce(v: Partial<VoceRadarLike> & { slug: string }): VoceRadarLike {
  return {
    area: "A",
    title: `Titolo ${v.slug}`,
    whatChanged: "Testo esteso.",
    ordine: 0,
    ...v,
  };
}

// ═══════════════════════ componiDettaglio ═══════════════════════

describe("componiDettaglio", () => {
  it("mette i tre pezzi nell'ordine, separati da una riga vuota", () => {
    expect(
      componiDettaglio({
        descrizione: "Cosa è successo.",
        azione: "Chiedere al broker.",
        inVigoreDal: D("2026-08-24"),
      }),
    ).toBe(
      "Cosa è successo.\n\nCosa fare: Chiedere al broker.\n\nIn vigore dal: 24 ago 2026",
    );
  });

  it("salta i pezzi assenti senza lasciare righe vuote", () => {
    expect(componiDettaglio({ descrizione: "Solo questo.", azione: null })).toBe(
      "Solo questo.",
    );
    expect(componiDettaglio({ descrizione: null, azione: "Fare." })).toBe(
      "Cosa fare: Fare.",
    );
  });

  it("`null` DICE che la data non è dichiarata: il silenzio si leggerebbe «già in vigore»", () => {
    expect(
      componiDettaglio({ descrizione: "Annunciato.", inVigoreDal: null }),
    ).toBe("Annunciato.\n\nIn vigore dal: non ancora dichiarata");
  });

  it("`undefined` NON stampa la riga: una lettura non entra in vigore", () => {
    expect(componiDettaglio({ descrizione: "Un paper." })).toBe("Un paper.");
  });

  it("senza nessun pezzo torna undefined: la scheda non mostra il comando", () => {
    expect(componiDettaglio({ descrizione: "  ", azione: null })).toBeUndefined();
  });

  it("la data si formatta in UTC, mai slittata", () => {
    // Mezzanotte UTC: in un fuso a est diventerebbe il giorno dopo.
    expect(componiDettaglio({ inVigoreDal: D("2026-01-01") })).toBe(
      "In vigore dal: 1 gen 2026",
    );
  });
});

// ═══════════════════════ la deduplica ═══════════════════════

describe("listaRadar — top[] porta azioni, non voci", () => {
  const changes = [voce({ slug: "uno" }), voce({ slug: "due" })];

  it("aggancia per slug e non crea una voce in più", () => {
    const lista = listaRadar({
      changes,
      readings: [],
      watches: [],
      highlights: [{ slug: "due", title: "Altro titolo", action: "Fare questo." }],
    });
    expect(lista.gruppi[0].items).toHaveLength(2);
    expect(lista.gruppi[0].items[1].dettaglio).toContain("Cosa fare: Fare questo.");
    expect(lista.gruppi[0].items[0].dettaglio).not.toContain("Cosa fare");
    expect(lista.orfane).toEqual([]);
  });

  it("senza slug ripiega sul titolo: è il caso delle evidenze più vecchie", () => {
    const lista = listaRadar({
      changes,
      readings: [],
      watches: [],
      highlights: [
        { slug: null, title: "Titolo uno", action: "Fare quello." },
      ] satisfies EvidenzaRadarLike[],
    });
    expect(lista.gruppi[0].items[0].dettaglio).toContain("Cosa fare: Fare quello.");
    expect(lista.orfane).toEqual([]);
  });

  it("un'evidenza che non aggancia niente NON sparisce: torna in orfane", () => {
    const lista = listaRadar({
      changes,
      readings: [],
      watches: [],
      highlights: [{ slug: "tre", title: "Sconosciuta", action: "Fare." }],
    });
    expect(lista.orfane).toEqual(["tre"]);
    expect(lista.gruppi[0].items).toHaveLength(2);
  });
});

// ═══════════════════════ gruppi e ordine ═══════════════════════

describe("listaRadar — gruppi e ordine", () => {
  it("le tre origini finiscono nella stessa lista, divise per area", () => {
    const lista = listaRadar({
      changes: [voce({ slug: "c", area: "B" })],
      readings: [voce({ slug: "r", area: "G", publishedOn: D("2026-08-18") })],
      watches: [voce({ slug: "w", area: "A", whatChanged: null, note: "Nota." })],
      highlights: [],
    });
    expect(lista.gruppi.map((g) => g.label)).toEqual(["Prop firm", "Borse", "Ricerca"]);
    // L'osservazione non ha `whatChanged`: l'approfondimento prende `note`.
    // E non ha `effectiveFrom` fra i campi: niente riga «In vigore dal».
    expect(lista.gruppi[0].items[0].dettaglio).toBe("Nota.");
    // Idem la lettura: un paper non entra in vigore.
    expect(lista.gruppi[2].items[0].dettaglio).toBe("Testo esteso.");
  });

  it("un cambiamento senza data di efficacia lo dichiara, non tace", () => {
    const lista = listaRadar({
      changes: [voce({ slug: "c", area: "B", effectiveFrom: null })],
      readings: [],
      watches: [],
      highlights: [],
    });
    expect(lista.gruppi[0].items[0].dettaglio).toContain(
      "In vigore dal: non ancora dichiarata",
    );
  });

  it("publishedOn diventa la data visibile della lettura", () => {
    const lista = listaRadar({
      changes: [],
      readings: [voce({ slug: "r", area: "G", publishedOn: D("2026-08-18") })],
      watches: [],
      highlights: [],
    });
    expect(lista.gruppi[0].items[0].when).toBe("2026-08-18");
  });

  it("dentro il gruppo si scende per data; le voci senza data vanno in fondo", () => {
    const lista = listaRadar({
      changes: [
        voce({ slug: "senza", ordine: 0 }),
        voce({ slug: "vecchia", announcedOn: D("2026-08-01"), ordine: 1 }),
        voce({ slug: "nuova", announcedOn: D("2026-08-20"), ordine: 2 }),
      ],
      readings: [],
      watches: [],
      highlights: [],
    });
    expect(lista.gruppi[0].items.map((i) => i.title)).toEqual([
      "Titolo nuova",
      "Titolo vecchia",
      "Titolo senza",
    ]);
  });

  it("un'area sconosciuta non fa cadere niente e resta dopo le sette", () => {
    const lista = listaRadar({
      changes: [voce({ slug: "h", area: "H" }), voce({ slug: "a", area: "A" })],
      readings: [],
      watches: [],
      highlights: [],
    });
    expect(lista.gruppi.map((g) => g.area)).toEqual(["A", "H"]);
    expect(lista.gruppi[1].label).toBe("H");
  });

  it("le voci senza area finiscono in «Altro», ultimo", () => {
    const lista = listaRadar({
      changes: [voce({ slug: "a", area: "A" })],
      readings: [],
      watches: [voce({ slug: "w", area: null })],
      highlights: [],
    });
    expect(lista.gruppi.at(-1)?.area).toBe(AREA_ALTRO);
    expect(lista.gruppi.at(-1)?.label).toBe("Altro");
  });

  /* `status` ("annunciato"/"attivo") non è nemmeno un campo di `VoceRadarLike`:
     l'unico slot di `NewsCard` che potrebbe ospitarlo è il chip tag, che il
     componente colora con `assetAccentVar` — e il suo fallback è
     `--md-cross`, un colore della palette ASSET. Finché il chip non può
     essere neutro, il Radar non passa tag. */
  it("nessun tag: il Radar non colora chip con la palette asset", () => {
    const lista = listaRadar({
      changes: [voce({ slug: "a" })],
      readings: [],
      watches: [],
      highlights: [],
    });
    expect(lista.gruppi[0].items[0].tags).toEqual([]);
  });
});

// ═══════════════════════ la riga in fondo ═══════════════════════

describe("frasiCopertura", () => {
  it("due frasi, aree per nome, nell'ordine A-G", () => {
    expect(frasiCopertura({ vuote: ["G", "D"], cieche: ["F", "B", "C"] })).toEqual([
      "Aree guardate senza novità: Regole, Ricerca.",
      "Non è stato possibile leggere l'elenco completo di: Borse, Broker, Dati.",
    ]);
  });

  it("ciascuna frase compare solo se ha contenuto", () => {
    expect(frasiCopertura({ vuote: [], cieche: ["B"] })).toEqual([
      "Non è stato possibile leggere l'elenco completo di: Borse.",
    ]);
    expect(frasiCopertura({ vuote: [], cieche: [] })).toEqual([]);
  });
});
