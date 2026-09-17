import type { AiPriority, AiRecommendationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AiCacheData = {
  summary: string;
  recommendation?: string;
  reason: string;
  aiReason?: string;
  operationalImpact?: string;
  replacementJustification?: string;
  nextYearPlan?: string;
  priority: AiPriority;
  recommendationTypes: AiRecommendationType[];
  provider?: string;
  model?: string;
  promptVersion?: string;
  ruleVersion?: string;
};

export async function getAiCache(
  assetId: string,
  inputHash: string,
  options: { forceAiRegenerate?: boolean; ttlDays?: number } = {}
): Promise<AiCacheData | null> {
  if (options.forceAiRegenerate) return null;

  try {
    const cached = await prisma.aiAnalysisCache.findUnique({
      where: { assetId_inputHash: { assetId, inputHash } }
    });

    if (!cached) return null;

    const ttlDays = options.ttlDays ?? cached.ttlDays ?? Number(process.env.AI_CACHE_TTL_DAYS || 30);
    const expirationDate = new Date(cached.createdAt);
    expirationDate.setDate(expirationDate.getDate() + ttlDays);

    if (new Date() > expirationDate) {
      return null;
    }

    return {
      summary: cached.summary,
      recommendation: cached.recommendation || undefined,
      reason: cached.reason,
      aiReason: cached.aiReason || cached.reason,
      operationalImpact: cached.operationalImpact || undefined,
      replacementJustification: cached.replacementJustification || undefined,
      nextYearPlan: cached.nextYearPlan || undefined,
      priority: cached.priority,
      recommendationTypes: cached.recommendationTypes,
      provider: cached.provider || undefined,
      model: cached.model || undefined,
      promptVersion: cached.promptVersion,
      ruleVersion: cached.ruleVersion
    };
  } catch (error) {
    console.error("AI Cache read error:", error);
    return null;
  }
}

export async function setAiCache(
  assetId: string,
  inputHash: string,
  data: AiCacheData & { ttlDays?: number }
): Promise<void> {
  try {
    const ttlDays = data.ttlDays ?? Number(process.env.AI_CACHE_TTL_DAYS || 30);
    await prisma.aiAnalysisCache.upsert({
      where: { assetId_inputHash: { assetId, inputHash } },
      create: {
        assetId,
        inputHash,
        summary: data.summary,
        recommendation: data.recommendation || "",
        reason: data.reason,
        aiReason: data.aiReason || data.reason,
        operationalImpact: data.operationalImpact,
        replacementJustification: data.replacementJustification,
        nextYearPlan: data.nextYearPlan,
        priority: data.priority,
        recommendationTypes: data.recommendationTypes,
        provider: data.provider,
        model: data.model,
        promptVersion: data.promptVersion || "1.0.0",
        ruleVersion: data.ruleVersion || "1.0.0",
        ttlDays
      },
      update: {
        summary: data.summary,
        recommendation: data.recommendation || "",
        reason: data.reason,
        aiReason: data.aiReason || data.reason,
        operationalImpact: data.operationalImpact,
        replacementJustification: data.replacementJustification,
        nextYearPlan: data.nextYearPlan,
        priority: data.priority,
        recommendationTypes: data.recommendationTypes,
        provider: data.provider,
        model: data.model,
        promptVersion: data.promptVersion || "1.0.0",
        ruleVersion: data.ruleVersion || "1.0.0",
        ttlDays,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error("AI Cache write error:", error);
  }
}

/**
 * Purge expired cache entries from the database.
 * Call this periodically (e.g., after each analysis run) to keep the cache table clean.
 */
export async function purgeExpiredCache(): Promise<number> {
  try {
    const allCached = await prisma.aiAnalysisCache.findMany({
      select: { id: true, createdAt: true, ttlDays: true }
    });

    const now = new Date();
    const expiredIds: string[] = [];

    for (const entry of allCached) {
      const ttl = entry.ttlDays ?? 30;
      const expiresAt = new Date(entry.createdAt);
      expiresAt.setDate(expiresAt.getDate() + ttl);
      if (now > expiresAt) {
        expiredIds.push(entry.id);
      }
    }

    if (expiredIds.length === 0) return 0;

    const result = await prisma.aiAnalysisCache.deleteMany({
      where: { id: { in: expiredIds } }
    });

    console.log(`[AI Cache] Purged ${result.count} expired cache entries.`);
    return result.count;
  } catch (error) {
    console.error("AI Cache purge error:", error);
    return 0;
  }
}

/**
 * Get cache statistics for monitoring.
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  expiredEntries: number;
  activeEntries: number;
}> {
  try {
    const allCached = await prisma.aiAnalysisCache.findMany({
      select: { createdAt: true, ttlDays: true }
    });

    const now = new Date();
    let expiredCount = 0;

    for (const entry of allCached) {
      const ttl = entry.ttlDays ?? 30;
      const expiresAt = new Date(entry.createdAt);
      expiresAt.setDate(expiresAt.getDate() + ttl);
      if (now > expiresAt) expiredCount++;
    }

    return {
      totalEntries: allCached.length,
      expiredEntries: expiredCount,
      activeEntries: allCached.length - expiredCount
    };
  } catch (error) {
    console.error("AI Cache stats error:", error);
    return { totalEntries: 0, expiredEntries: 0, activeEntries: 0 };
  }
}
