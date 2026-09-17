import type {
  AiPriority,
  AiRecommendationType,
  AiScoreStatus,
  AssetConditionStatus,
  AssetLifecycleStatus
} from "@prisma/client";
import { differenceInYears } from "date-fns";

export type ScoringAsset = {
  assetCode: string;
  assetName: string;
  purchaseDate?: Date | string | null;
  processor?: string | null;
  ram?: string | null;
  storage?: string | null;
  operatingSystem?: string | null;
  conditionStatus: AssetConditionStatus;
  lifecycleStatus: AssetLifecycleStatus;
  warrantyEndDate?: Date | string | null;
  serviceRecords?: Array<{ cost?: number | string | { toString(): string } | null }>;
};

export type ScoreDetail = {
  factor: string;
  scoreImpact: number;
  message: string;
};

export type ScoreResult = {
  score: number;
  scoreStatus: AiScoreStatus;
  priority: AiPriority;
  recommendationTypes: AiRecommendationType[];
  details: ScoreDetail[];
  dataQualityWarnings: string[];
};

export type AiAnalysisMode = "FAST" | "RECOMMENDED" | "FULL";

export const AI_MODE_SCORE_THRESHOLDS: Record<AiAnalysisMode, number | null> = {
  FAST: null,
  RECOMMENDED: 80,
  FULL: 30
};

export function qualifiesForAi(score: number, mode: AiAnalysisMode) {
  const threshold = AI_MODE_SCORE_THRESHOLDS[mode];
  return threshold !== null && score >= threshold;
}

function parseRamGb(ram?: string | null) {
  const match = String(ram || "").match(/(\d+(?:[.,]\d+)?)/);
  return match ? Number(match[1].replace(",", ".")) : 0;
}

function isOldProcessor(processor?: string | null) {
  const value = String(processor || "").toLowerCase();
  return (
    // Intel old generations
    value.includes("pentium") ||
    value.includes("celeron") ||
    value.includes("core 2") ||
    value.includes("atom") ||
    /gen\s?[1-7]\b/.test(value) ||
    /i[357]\s?-[1-7]\d{3}\b/.test(value) ||
    // AMD old generations
    value.includes("amd fx") ||
    value.includes("amd a4") ||
    value.includes("amd a6") ||
    value.includes("amd a8") ||
    value.includes("amd a10") ||
    value.includes("amd e1") ||
    value.includes("amd e2") ||
    value.includes("athlon") ||
    value.includes("sempron") ||
    value.includes("phenom") ||
    value.includes("turion") ||
    // Old Ryzen (1st & 2nd gen)
    /ryzen\s?[357]\s?1\d{3}/.test(value) ||
    /ryzen\s?[357]\s?2\d{3}/.test(value)
  );
}

function isOldOs(os?: string | null) {
  const value = String(os || "").toLowerCase();
  return (
    value.includes("windows 7") ||
    value.includes("windows 8") ||
    value.includes("windows xp") ||
    value.includes("windows vista") ||
    value.includes("windows server 2008") ||
    value.includes("windows server 2012") ||
    value.includes("ubuntu 16") ||
    value.includes("ubuntu 18")
  );
}

function isHdd(storage?: string | null) {
  return String(storage || "").toLowerCase().includes("hdd");
}

export function warrantyState(endDate?: Date | string | null): "ACTIVE" | "EXPIRED" | "UNKNOWN" {
  if (!endDate) return "UNKNOWN";
  const date = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (Number.isNaN(date.getTime())) return "UNKNOWN";
  return date.getTime() < Date.now() ? "EXPIRED" : "ACTIVE";
}

function sumRepairCost(asset: ScoringAsset) {
  return (asset.serviceRecords || []).reduce((sum, repair) => sum + Number(repair.cost ?? 0), 0);
}

function statusForScore(score: number): AiScoreStatus {
  if (score >= 80) return "PRIORITAS_PENGGANTIAN";
  if (score >= 60) return "DIREKOMENDASIKAN_UPGRADE";
  if (score >= 30) return "PERLU_DIPANTAU";
  return "AMAN";
}

function priorityForScore(score: number): AiPriority {
  if (score >= 80) return "kritis";
  if (score >= 60) return "tinggi";
  if (score >= 30) return "sedang";
  return "rendah";
}

export function scoreAsset(asset: ScoringAsset): ScoreResult {
  const details: ScoreDetail[] = [];
  const dataQualityWarnings: string[] = [];
  let score = 0;
  const recommendations = new Set<AiRecommendationType>();
  const purchaseDate = asset.purchaseDate
    ? typeof asset.purchaseDate === "string"
      ? new Date(asset.purchaseDate)
      : asset.purchaseDate
    : null;
  const assetAge = purchaseDate && !Number.isNaN(purchaseDate.getTime()) ? differenceInYears(new Date(), purchaseDate) : 0;
  const repairCount = asset.serviceRecords?.length || 0;
  const repairCost = sumRepairCost(asset);

  const add = (factor: string, scoreImpact: number, message: string, recommendation?: AiRecommendationType) => {
    score += scoreImpact;
    details.push({ factor, scoreImpact, message });
    if (recommendation) recommendations.add(recommendation);
  };

  if (assetAge > 5) add("Umur aset", 30, "Umur aset lebih dari 5 tahun.", "GANTI_PERANGKAT");
  if (isOldProcessor(asset.processor)) add("Processor", 25, "Processor terdeteksi generasi lama atau tidak sesuai standar.", "UPGRADE_PROCESSOR");
  if (parseRamGb(asset.ram) > 0 && parseRamGb(asset.ram) < 8) add("RAM", 20, "Kapasitas RAM kurang dari 8 GB.", "UPGRADE_RAM");
  if (isHdd(asset.storage)) add("Storage", 15, "Media penyimpanan masih HDD.", "UPGRADE_STORAGE");
  const warranty = warrantyState(asset.warrantyEndDate);
  if (warranty === "EXPIRED") add("Garansi", 10, "Masa garansi aset sudah habis.", undefined);
  if (warranty === "UNKNOWN") dataQualityWarnings.push("Tanggal akhir garansi belum tersedia; faktor garansi tidak menambah skor.");
  if (!purchaseDate || Number.isNaN(purchaseDate.getTime())) {
    dataQualityWarnings.push("Tanggal pembelian belum tersedia atau tidak valid; faktor umur aset tidak menambah skor.");
  }
  if (repairCount > 3) add("Frekuensi perbaikan", 25, "Jumlah perbaikan lebih dari 3 kali.", "GANTI_PERANGKAT");
  if (repairCost > 1000000) add("Biaya perbaikan", 20, "Total biaya perbaikan lebih dari Rp1.000.000.", "GANTI_PERANGKAT");
  if (asset.conditionStatus === "RUSAK_BERAT") add("Kondisi", 20, "Kondisi aset rusak berat.", "GANTI_PERANGKAT");
  if (asset.conditionStatus === "LAYAK_GANTI") add("Kondisi", 30, "Aset sudah ditandai layak ganti.", "GANTI_PERANGKAT");
  if (isOldOs(asset.operatingSystem)) add("Sistem operasi", 15, "Sistem operasi lama terdeteksi.", "UPDATE_OS");

  const cappedScore = Math.min(100, score);
  return {
    score: cappedScore,
    scoreStatus: statusForScore(cappedScore),
    priority: priorityForScore(cappedScore),
    recommendationTypes: Array.from(recommendations),
    details,
    dataQualityWarnings
  };
}

import { createHash } from "crypto";

export function createAssetInputHash(
  asset: ScoringAsset & { id?: string },
  score: ScoreResult,
  options: {
    ruleVersion?: string;
    promptVersion?: string;
    provider?: string;
    model?: string;
  } = {}
): string {
  const repairCount = asset.serviceRecords?.length || 0;
  const repairCost = sumRepairCost(asset);

  const payload = {
    assetId: (asset as any).id || asset.assetCode,
    assetCode: asset.assetCode,
    processor: asset.processor || "",
    ram: asset.ram || "",
    storage: asset.storage || "",
    operatingSystem: asset.operatingSystem || "",
    conditionStatus: asset.conditionStatus,
    lifecycleStatus: asset.lifecycleStatus,
    warrantyEndDate: asset.warrantyEndDate ? new Date(asset.warrantyEndDate).toISOString().slice(0, 10) : "",
    repairCount,
    repairCost,
    score: score.score,
    scoreStatus: score.scoreStatus,
    recommendationTypes: [...score.recommendationTypes].sort(),
    details: score.details.map((d) => `${d.factor}:${d.scoreImpact}`).join("|"),
    ruleVersion: options.ruleVersion || "1.0.0",
    promptVersion: options.promptVersion || "1.0.0",
    provider: options.provider || "default",
    model: options.model || "default"
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function generateRuleEngineOutput(asset: ScoringAsset, score: ScoreResult) {
  const reasons = score.details.map((detail) => detail.message).join(" ");
  const technicalRecommendation =
    score.scoreStatus === "PRIORITAS_PENGGANTIAN"
      ? "Prioritaskan penggantian perangkat."
      : score.scoreStatus === "DIREKOMENDASIKAN_UPGRADE"
        ? `Rencanakan upgrade komponen: ${score.recommendationTypes.join(", ") || "komponen utama"}.`
        : score.scoreStatus === "PERLU_DIPANTAU"
          ? "Pantau perangkat melalui maintenance berkala."
          : "Perangkat dalam kondisi aman untuk digunakan.";

  return {
    ruleSummary: `${asset.assetCode} - ${asset.assetName} memperoleh skor ${score.score}/100 (${score.scoreStatus}).`,
    technicalRecommendation,
    priority: score.priority,
    recommendationTypes: score.recommendationTypes,
    ruleReason: reasons || "Tidak ada faktor risiko signifikan terdeteksi.",
    nextAction:
      score.score >= 60
        ? "Masukkan aset ke rencana evaluasi anggaran IT tahun depan."
        : "Lanjutkan monitoring dan maintenance berkala."
  };
}

export function fallbackAiExplanation(asset: ScoringAsset, score: ScoreResult) {
  const rule = generateRuleEngineOutput(asset, score);

  return {
    summary: rule.ruleSummary,
    recommendation: rule.technicalRecommendation,
    priority: score.priority,
    recommendedActions: score.recommendationTypes,
    reason: rule.ruleReason,
    nextYearPlan: rule.nextAction
  };
}
