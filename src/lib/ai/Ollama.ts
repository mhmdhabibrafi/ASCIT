import type { ScoreResult, ScoringAsset } from "@/lib/ai/scoring-engine";
import {
  AiExplanation,
  AiProviderResult,
  getAiSettings,
  simplifyAssetData,
  buildAssetPrompt,
  SYSTEM_MESSAGE,
  buildRequestBody,
  messagesEndpoint,
  extractMessageText,
  errorMessage,
  parseAiJsonResponse,
  lastWorkingUrl,
  setLastWorkingUrl
} from "./common";

export type OllamaExplanation = AiExplanation;
export type OllamaResult = AiProviderResult;

export async function askOllama(asset: ScoringAsset, score: ScoreResult): Promise<OllamaResult> {
  let baseUrl = process.env.OLLAMA_BASE_URL || "http://ollama:11434/api";
  let model = process.env.OLLAMA_MODEL || "qwen3:1.7b";
  let maxTokens = Number(process.env.OLLAMA_MAX_TOKENS || 512);
  let timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);
  let temperature = 0.1;

  const aiSettings = await getAiSettings();
  if (!process.env.OLLAMA_TIMEOUT_MS && aiSettings.apiTimeoutSeconds) timeoutMs = aiSettings.apiTimeoutSeconds * 1000;
  if (!process.env.OLLAMA_MAX_TOKENS && aiSettings.maxTokens) maxTokens = aiSettings.maxTokens;
  if (typeof aiSettings.temperature === "number") temperature = aiSettings.temperature;
  if (!process.env.OLLAMA_BASE_URL && aiSettings.baseUrl) baseUrl = aiSettings.baseUrl;
  if (!process.env.OLLAMA_MODEL && aiSettings.defaultModel) model = aiSettings.defaultModel;

  // A response contains only six short JSON fields. Capping output prevents a
  // stale 2048/8192-token setting from making local inference unnecessarily slow.
  const hardMaxTokens = Number(process.env.OLLAMA_MAX_OUTPUT_TOKENS || 512);
  maxTokens = Math.max(128, Math.min(maxTokens, Number.isFinite(hardMaxTokens) ? hardMaxTokens : 512));

  const simplifiedAsset = simplifyAssetData(asset);
  const prompt = buildAssetPrompt(simplifiedAsset, score);

  const candidateBaseUrls = Array.from(
    new Set([
      baseUrl,
      ...(lastWorkingUrl && lastWorkingUrl.includes("11434") ? [lastWorkingUrl] : []),
      "http://127.0.0.1:11434/api",
      "http://localhost:11434/api",
      "http://172.17.0.1:11434/api",
      "http://ollama:11434/api"
    ])
  ).filter(Boolean);

  let response: Response | null = null;
  let lastError: Error | null = null;
  let workingBaseUrl = baseUrl;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 45000);

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  for (const url of candidateBaseUrls) {
    try {
      const endpoint = messagesEndpoint(url);
      
      const body = buildRequestBody(url, model, SYSTEM_MESSAGE, prompt, temperature, maxTokens);
      
      console.log(`[Ollama] Trying endpoint ${endpoint} with model=${model}...`);
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers,
        body: JSON.stringify(body)
      });

      if (res.ok || res.status < 500) {
        response = res;
        workingBaseUrl = url;
        setLastWorkingUrl(url);
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[Ollama] Failed to connect to ${url}: ${lastError.message}`);
    }
  }

  clearTimeout(timeout);

  if (!response) {
    if (lastError && (lastError.name === "AbortError" || (lastError as any).cause?.name === "AbortError")) {
      return { ok: false, error: `AI timeout setelah ${Number.isFinite(timeoutMs) ? timeoutMs : 120000} ms.` };
    }
    return { ok: false, error: lastError?.message || "Tidak dapat terhubung ke server AI (Ollama)." };
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const msg = errorMessage(response.status, payload);
    console.error(`[Ollama] Error ${response.status} from ${workingBaseUrl}: ${msg}`);
    return { ok: false, error: msg };
  }

  const content = extractMessageText(payload);
  if (!content) {
    return { ok: false, error: "AI API tidak mengembalikan konten." };
  }

  console.log(`[Ollama] Success for ${asset.assetCode} via ${workingBaseUrl}`);
  return { ok: true, data: parseAiJsonResponse(content, asset, score, "AI") };
}
