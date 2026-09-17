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
