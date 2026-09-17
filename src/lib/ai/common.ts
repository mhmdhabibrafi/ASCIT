import type { ScoreResult, ScoringAsset } from "@/lib/ai/scoring-engine";
import { prisma } from "@/lib/prisma";
import { differenceInYears } from "date-fns";

export type AiPriorityLevel = "rendah" | "sedang" | "tinggi" | "kritis";

export type AiExplanation = {
  summary: string;
  recommendation: string;
  priority: AiPriorityLevel;
  recommendedActions: string[];
  reason: string;
  operationalImpact?: string;
  replacementJustification?: string;
  nextYearPlan: string;
};

export type AiProviderResult =
  | { ok: true; data: AiExplanation }
  | { ok: false; error: string };

export const PRIORITIES: AiPriorityLevel[] = ["rendah", "sedang", "tinggi", "kritis"];

export const SYSTEM_MESSAGE = "Anda adalah AI Decision Support ASCIT untuk inventaris IT rumah sakit. Jawab secara formal, teknis, dan ringkas dalam JSON.";

export let lastWorkingUrl: string | null = null;
export function setLastWorkingUrl(url: string | null) {
  lastWorkingUrl = url;
}

export function cleanContent(content: string) {
  return content
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
}

export function extractJsonCandidate(content: string) {
  const cleaned = cleanContent(content);
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  return first >= 0 && last >= 0 ? cleaned.slice(first, last + 1) : cleaned;
}

export function decodeJsonString(value: string) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\n/g, " ").trim();
  }
}

export function readStringField(content: string, key: keyof AiExplanation) {
  const closed = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i").exec(content);
  if (closed?.[1]) return decodeJsonString(closed[1]).trim();

  const open = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]+?)(?:",\\s*"\\w+"\\s*:|\\n\\s*[,}]|$)`, "i").exec(content);
  if (open?.[1]) return decodeJsonString(open[1].replace(/[,}]\s*$/, "")).trim();
  return "";
}

export function readActions(content: string, fallback: string[]) {
  const match = /"recommendedActions"\s*:\s*\[([\s\S]*?)\]/i.exec(content);
  if (!match?.[1]) return fallback;
  const values = Array.from(match[1].matchAll(/"((?:\\.|[^"\\])*)"/g))
    .map((item) => decodeJsonString(item[1]).trim())
    .filter(Boolean);
  return values.length ? values : fallback;
}

export function readPriority(content: string, fallback: AiPriorityLevel): AiPriorityLevel {
  const match = /"priority"\s*:\s*"([^"]+)"/i.exec(content);
  const value = match?.[1]?.toLowerCase() as AiPriorityLevel;
  return PRIORITIES.includes(value) ? value : fallback;
}

export function normalizeExplanation(value: unknown, asset: ScoringAsset, score: ScoreResult, providerName: string = "AI"): AiExplanation {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallbackActions = score.recommendationTypes.map((item) => String(item));
  const priority = PRIORITIES.includes(String(data.priority).toLowerCase() as AiPriorityLevel)
    ? (String(data.priority).toLowerCase() as AiPriorityLevel)
    : score.priority;

  return {
    summary: String(data.summary || `${asset.assetCode} - ${asset.assetName} dianalisis oleh ${providerName} dengan skor ${score.score}.`).trim(),
    recommendation: String(data.recommendation || "Gunakan rekomendasi teknis bersama skor ASCIT.").trim(),
    priority,
    recommendedActions: Array.isArray(data.recommendedActions)
      ? data.recommendedActions.map((item) => String(item).trim()).filter(Boolean)
      : fallbackActions,
    reason: String(data.reason || `${providerName} memberikan penjelasan naratif.`).trim(),
    operationalImpact: data.operationalImpact ? String(data.operationalImpact).trim() : undefined,
    replacementJustification: data.replacementJustification ? String(data.replacementJustification).trim() : undefined,
    nextYearPlan: String(data.nextYearPlan || "Masukkan aset ke evaluasi berkala tahun depan.").trim()
  };
}

export function explanationFromLooseText(content: string, asset: ScoringAsset, score: ScoreResult, providerName: string = "AI"): AiExplanation {
  const cleaned = cleanContent(content);
  const fallbackActions = score.recommendationTypes.map((item) => String(item));
  const plainText = cleaned
    .replace(/[{}]/g, " ")
    .replace(/"\w+"\s*:/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    summary: readStringField(cleaned, "summary") || `${asset.assetCode} - ${asset.assetName} dianalisis oleh ${providerName} dengan skor ${score.score}.`,
    recommendation: readStringField(cleaned, "recommendation") || `Gunakan penjelasan ${providerName} sebagai dasar tindak lanjut aset.`,
    priority: readPriority(cleaned, score.priority),
    recommendedActions: readActions(cleaned, fallbackActions),
    reason: readStringField(cleaned, "reason") || plainText.slice(0, 500) || `${providerName} memberikan penjelasan naratif.`,
    operationalImpact: readStringField(cleaned, "operationalImpact") || undefined,
    replacementJustification: readStringField(cleaned, "replacementJustification") || undefined,
    nextYearPlan: readStringField(cleaned, "nextYearPlan") || "Masukkan aset ke evaluasi berkala tahun depan."
  };
}

export function parseAiJsonResponse(content: string, asset: ScoringAsset, score: ScoreResult, providerName: string = "AI"): AiExplanation {
  try {
    return normalizeExplanation(JSON.parse(extractJsonCandidate(content)), asset, score, providerName);
  } catch {
    return explanationFromLooseText(content, asset, score, providerName);
  }
}

export function messagesEndpoint(baseUrl: string) {
  if (baseUrl.includes("11434")) {
    return `${baseUrl.replace(/\/$/, "")}/chat`;
  }
  if (baseUrl.includes("openai") || baseUrl.includes("groq") || baseUrl.includes("/v1")) {
    return `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  }
  return `${baseUrl.replace(/\/$/, "")}/messages`;
}

export function extractMessageText(payload: any) {
  if (payload.message?.content) {
    return payload.message.content.trim();
  }
  if (payload.choices && payload.choices[0]?.message?.content) {
    return payload.choices[0].message.content.trim();
  }
  return payload.content
    ?.filter((item: any) => item.type === "text" || item.text)
    .map((item: any) => item.text || "")
    .join("\n")
    .trim();
}

export function errorMessage(status: number, payload: unknown) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: { message?: string; type?: string } }).error;
    if (error?.message) return `${error.type ? error.type + ": " : ""}${error.message}`;
  }
  return `AI API gagal dengan status ${status}.`;
}

export function simplifyAssetData(asset: ScoringAsset) {
  return {
    kode: asset.assetCode,
    nama: asset.assetName,
    kategori: (asset as any).category?.name || (asset as any).category || "Umum",
    unit: (asset as any).unit?.name || "Umum",
    umurTahun: asset.purchaseDate ? differenceInYears(new Date(), new Date(asset.purchaseDate)) : 0,
    spesifikasi: {
      processor: asset.processor || "-",
      ram: asset.ram || "-",
      storage: asset.storage || "-",
      os: asset.operatingSystem || "-",
    },
    kondisi: asset.conditionStatus,
    lifecycle: asset.lifecycleStatus,
    garansiAktif: asset.warrantyEndDate ? new Date(asset.warrantyEndDate).getTime() > Date.now() : false,
    riwayatPerbaikan: {
      jumlah: asset.serviceRecords?.length || 0,
      totalBiaya: (asset.serviceRecords || []).reduce((sum, r) => sum + Number(r.cost || 0), 0)
    }
  };
}

export function buildAssetPrompt(simplifiedAsset: any, score: ScoreResult) {
  return `Evaluasi Aset IT (${simplifiedAsset.kode} - ${simplifiedAsset.nama}):
Unit: ${simplifiedAsset.unit}, Kategori: ${simplifiedAsset.kategori}, Umur: ${simplifiedAsset.umurTahun}th, Kondisi: ${simplifiedAsset.kondisi}
Hardware: Proc ${simplifiedAsset.spesifikasi.processor}, RAM ${simplifiedAsset.spesifikasi.ram}, Storage ${simplifiedAsset.spesifikasi.storage}, OS ${simplifiedAsset.spesifikasi.os}
Perbaikan: ${simplifiedAsset.riwayatPerbaikan.jumlah}x (Rp${simplifiedAsset.riwayatPerbaikan.totalBiaya}), Garansi Aktif: ${simplifiedAsset.garansiAktif}
Skor Risiko Rule Engine: ${score.score}/100, Prioritas: ${score.priority}, Rekomendasi: ${score.recommendationTypes.join(", ")}
Faktor Pemicu: ${score.details.map((d: any) => d.message).join("; ")}

ATURAN KETAT:
- Jangan menghitung ulang skor atau mengubah klasifikasi.
- Jawab dalam Bahasa Indonesia formal, ringkas, dan teknis.
- Kembalikan HANYA format JSON valid tanpa text pembuka/penutup, tanpa markdown block.
{
  "summary": "1 kalimat ringkas kondisi teknis aset.",
  "recommendation": "Tindakan teknis utama yang disarankan.",
  "reason": "Penjelasan singkat alasan teknis (maks 2 kalimat).",
  "operationalImpact": "Dampak terhadap operasional layanan rumah sakit.",
  "replacementJustification": "Justifikasi pengadaan atau upgrade perangkat.",
  "nextYearPlan": "Saran perlakuan 1 tahun ke depan."
}`;
}

export type AiSettings = {
  apiTimeoutSeconds?: number;
  maxTokens?: number;
  temperature?: number;
  baseUrl?: string;
  defaultModel?: string;
};

const AI_SETTINGS_CACHE_MS = 15_000;
let cachedAiSettings: { value: AiSettings; expiresAt: number } | null = null;

export async function getAiSettings(): Promise<AiSettings> {
  if (cachedAiSettings && cachedAiSettings.expiresAt > Date.now()) {
    return cachedAiSettings.value;
  }

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "ai" } });
    if (row && row.value && typeof row.value === "object") {
      const value = row.value as AiSettings;
      cachedAiSettings = { value, expiresAt: Date.now() + AI_SETTINGS_CACHE_MS };
      return value;
    }
  } catch (err) {
    console.warn("[AI] Failed to read AI settings from database:", err);
  }
  cachedAiSettings = { value: {}, expiresAt: Date.now() + AI_SETTINGS_CACHE_MS };
  return {};
}

export function buildRequestBody(baseUrl: string, model: string, systemMsg: string, prompt: string, temperature: number, maxTokens: number) {
  const isOllamaFormat = baseUrl.includes("11434");
  const isOpenAiFormat = !isOllamaFormat && (baseUrl.includes("openai") || baseUrl.includes("groq") || baseUrl.includes("/v1"));

  if (isOllamaFormat) {
    return {
      model,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt }
      ],
      stream: false,
      format: "json",
      // Qwen3 can spend most of its time on hidden reasoning. The ASCIT response
      // is a small, schema-constrained JSON object, so thinking is unnecessary.
      think: false,
      keep_alive: "30m",
      options: {
        temperature: Number.isFinite(temperature) ? temperature : 0.1,
        num_predict: Number.isFinite(maxTokens) ? maxTokens : 256,
        num_ctx: 2048,
        num_batch: 128
      }
    };
  }
  
  if (isOpenAiFormat) {
    return {
      model,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt }
      ],
      max_tokens: Number.isFinite(maxTokens) ? maxTokens : 256,
      temperature: Number.isFinite(temperature) ? temperature : 0.1,
      response_format: { type: "json_object" }
    };
  }

  return {
    model,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 256,
    system: systemMsg,
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: Number.isFinite(temperature) ? temperature : 0.1
  };
}
