import type { ScoringAsset } from "@/lib/ai/scoring-engine";
import {
  AI_MODE_SCORE_THRESHOLDS,
  qualifiesForAi,
  scoreAsset,
  warrantyState
} from "@/lib/ai/scoring-engine";

const baseAsset: ScoringAsset = {
  assetCode: "IT-TEST-001",
  assetName: "Perangkat Uji",
  purchaseDate: new Date("2025-01-01"),
  processor: "Intel Core i5-12400",
  ram: "16 GB",
  storage: "512 GB SSD",
  operatingSystem: "Windows 11",
  conditionStatus: "BAIK",
  lifecycleStatus: "AKTIF",
  serviceRecords: []
};

describe("AI scoring engine", () => {
  it("mengakumulasi faktor risiko sebelum batas skor tercapai", () => {
    const result = scoreAsset({ ...baseAsset, ram: "4 GB", storage: "1 TB HDD", warrantyEndDate: new Date("2020-01-01") });

    expect(result.score).toBe(45);
    expect(result.details.map((detail) => [detail.factor, detail.scoreImpact])).toEqual([
      ["RAM", 20], ["Storage", 15], ["Garansi", 10]
    ]);
    expect(result.scoreStatus).toBe("PERLU_DIPANTAU");
  });

  it("membatasi skor gabungan yang melebihi 100 menjadi 100", () => {
    const result = scoreAsset({
      ...baseAsset,
      purchaseDate: new Date("2010-01-01"),
      processor: "Intel Core i5-7200U",
      ram: "4 GB",
      storage: "1 TB HDD",
      warrantyEndDate: new Date("2020-01-01"),
      conditionStatus: "RUSAK_BERAT",
      serviceRecords: [{ cost: 1_100_000 }, { cost: 0 }, { cost: 0 }, { cost: 0 }]
    });

    expect(result.details.reduce((total, detail) => total + detail.scoreImpact, 0)).toBeGreaterThan(100);
    expect(result.score).toBe(100);
    expect(result.scoreStatus).toBe("PRIORITAS_PENGGANTIAN");
    expect(result.priority).toBe("kritis");
  });

  it("tidak menganggap garansi yang kosong sebagai kedaluwarsa", () => {
    const result = scoreAsset({ ...baseAsset, warrantyEndDate: null });

    expect(result.score).toBe(0);
    expect(result.details.some((detail) => detail.factor === "Garansi")).toBe(false);
    expect(result.dataQualityWarnings).toContain(
      "Tanggal akhir garansi belum tersedia; faktor garansi tidak menambah skor."
    );
  });

  it("menambahkan faktor risiko hanya untuk garansi yang benar-benar kedaluwarsa", () => {
    const result = scoreAsset({ ...baseAsset, warrantyEndDate: new Date("2020-01-01") });

    expect(warrantyState(new Date("2020-01-01"))).toBe("EXPIRED");
    expect(result.score).toBe(10);
    expect(result.details).toContainEqual(
      expect.objectContaining({ factor: "Garansi", scoreImpact: 10 })
    );
  });

  it("tidak menambah risiko untuk garansi aktif", () => {
    const result = scoreAsset({ ...baseAsset, warrantyEndDate: new Date("2100-01-01") });

    expect(warrantyState(new Date("2100-01-01"))).toBe("ACTIVE");
    expect(result.score).toBe(0);
  });

  it("tidak salah menandai prosesor Intel lima digit sebagai generasi lama", () => {
    const result = scoreAsset({ ...baseAsset, processor: "Intel Core i5-12400", warrantyEndDate: new Date("2100-01-01") });

    expect(result.details.some((detail) => detail.factor === "Processor")).toBe(false);
  });

  it("menerapkan ambang mode AI secara konsisten", () => {
    expect(AI_MODE_SCORE_THRESHOLDS).toEqual({ FAST: null, RECOMMENDED: 80, FULL: 30 });
    expect(qualifiesForAi(100, "FAST")).toBe(false);
    expect(qualifiesForAi(79, "RECOMMENDED")).toBe(false);
    expect(qualifiesForAi(80, "RECOMMENDED")).toBe(true);
    expect(qualifiesForAi(29, "FULL")).toBe(false);
    expect(qualifiesForAi(30, "FULL")).toBe(true);
  });

  it("menandai tanggal pembelian tidak valid sebagai masalah kualitas data", () => {
    const result = scoreAsset({ ...baseAsset, purchaseDate: "bukan-tanggal", warrantyEndDate: null });

    expect(result.dataQualityWarnings).toContain(
      "Tanggal pembelian belum tersedia atau tidak valid; faktor umur aset tidak menambah skor."
    );
  });
});
