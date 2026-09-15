import { describe, expect, it } from "vitest";
import { estremiPerBucket } from "@/lib/seasonality/estremi";

describe("estremiPerBucket", () => {
  const obs = [
    { year: 2019, bucket: 9, value: 0.08 },
    { year: 2020, bucket: 9, value: -0.04 },
    { year: 2021, bucket: 9, value: 0.02 },
    { year: 2022, bucket: 9, value: -0.06 },
    { year: 2021, bucket: 10, value: 0.01 },
  ];

  it("migliore e peggiore anno dentro la finestra, con l'anno", () => {
    const e = estremiPerBucket(obs, 2020, 2022).get(9)!;
    expect(e.migliore).toEqual({ valore: 0.02, anno: 2021 });
    expect(e.peggiore).toEqual({ valore: -0.06, anno: 2022 });
    expect(e.n).toBe(3);
  });

  it("gli anni fuori finestra non contano", () => {
    expect(estremiPerBucket(obs, 2020, 2022).get(9)!.migliore.anno).not.toBe(2019);
    expect(estremiPerBucket(obs, 2023, 2025).size).toBe(0);
  });

  it("un anno solo: migliore e peggiore coincidono", () => {
    const e = estremiPerBucket(obs, 2020, 2022).get(10)!;
    expect(e.migliore).toEqual(e.peggiore);
  });

  it("a parità di valore vince l'anno più recente, qualunque sia l'ordine", () => {
    const pari = [
      { year: 2024, bucket: 1, value: 0.01 },
      { year: 2021, bucket: 1, value: 0.01 },
    ];
    expect(estremiPerBucket(pari, 2020, 2025).get(1)!.migliore.anno).toBe(2024);
    expect(estremiPerBucket([...pari].reverse(), 2020, 2025).get(1)!.migliore.anno).toBe(2024);
  });
});
