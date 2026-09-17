import type { Prisma, AnalysisMode } from "@prisma/client";
import { generateRuleEngineOutput, createAssetInputHash, qualifiesForAi, scoreAsset } from "@/lib/ai/scoring-engine";
import { generateExecutiveSummary } from "@/lib/ai/executive-summary";
import { processAllPendingJobs } from "@/lib/ai/worker";
import { prisma } from "@/lib/prisma";
import { nextRunCode } from "@/lib/utils";

const AI_RULE_CHUNK_SIZE = Number(process.env.AI_RULE_CHUNK_SIZE || 100);
const AI_MAX_ASSETS_PER_RUN = Number(process.env.AI_MAX_ASSETS_PER_RUN || 50);

export type RunOptions = {
  createdById?: string;
  year?: number;
  unitId?: string;
  categoryId?: string;
  mode?: AnalysisMode | "FAST" | "RECOMMENDED" | "FULL";
  useAi?: boolean;
  forceAiRegenerate?: boolean;
  limit?: number;
};

export async function runAiAssetAnalysis(options: RunOptions = {}) {
  const mode: AnalysisMode = (options.mode as AnalysisMode) || "FAST";
  const year = options.year || new Date().getFullYear();

  const where: Prisma.AssetWhereInput = {
    deletedAt: null,
    assetType: "IT",
    ...(options.unitId ? { unitId: options.unitId } : {}),
    ...(options.categoryId ? { categoryId: options.categoryId } : {})
  };

  // FULL mode cap check
  let takeLimit: number | undefined = undefined;
  if (mode === "FULL") {
    takeLimit = Math.min(options.limit || AI_MAX_ASSETS_PER_RUN, AI_MAX_ASSETS_PER_RUN);
  } else if (options.limit) {
    takeLimit = options.limit;
  }

  const assets = await prisma.asset.findMany({
    where,
    include: {
      unit: true,
      room: true,
      category: true,
      brand: true,
      vendor: true,
      serviceRecords: true
    },
    orderBy: { assetCode: "asc" },
    ...(takeLimit ? { take: takeLimit } : {})
  });

  const aiProviderName = "Ollama";
  let aiModelName = process.env.OLLAMA_MODEL || "qwen3:1.7b";
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "ai" } });
    if (row && row.value && typeof row.value === "object") {
      const val = row.value as any;
      if (!process.env.OLLAMA_MODEL && val.defaultModel) aiModelName = val.defaultModel;
    }
  } catch {}

  const run = await prisma.aiAnalysisRun.create({
    data: {
      runCode: nextRunCode("AI"),
      year,
      unitId: options.unitId,
      categoryId: options.categoryId,
      analysisMode: mode,
      totalAssets: assets.length,
      ruleCompletedCount: 0,
      aiQueuedCount: 0,
      aiCompletedCount: 0,
      aiFailedCount: 0,
      processedAssets: 0,
      status: "RUNNING_RULE_ENGINE",
      provider: mode === "FAST" ? "Rule Engine" : aiProviderName,
      model: mode === "FAST" ? "rule-engine-v1" : aiModelName,
      summary: `Menjalankan Mode ${mode} untuk ${assets.length} aset.`,
      createdById: options.createdById
    }
  });

  const ruleStartTime = Date.now();
  let criticalCount = 0;
  let queuedCount = 0;
  let ruleCompletedCount = 0;

  try {
    // Process assets in chunks
    for (let chunkStart = 0; chunkStart < assets.length; chunkStart += AI_RULE_CHUNK_SIZE) {
      // Check if run was stopped
      const currentRun = await prisma.aiAnalysisRun.findUnique({
        where: { id: run.id },
        select: { status: true }
      });

      if (currentRun?.status === "STOPPED") {
        return prisma.aiAnalysisRun.update({
          where: { id: run.id },
          data: {
            currentAsset: null,
            finishedAt: new Date(),
            summary: `Analisis dihentikan pengguna. ${ruleCompletedCount} aset selesai diolah Rule Engine.`
          },
          include: {
            recommendations: {
              include: { asset: { include: { unit: true, category: true, brand: true } }, details: true },
              orderBy: { score: "desc" }
            }
          }
        });
      }

      const chunk = assets.slice(chunkStart, chunkStart + AI_RULE_CHUNK_SIZE);
      const batchOperations = [];

      for (const asset of chunk) {
        const score = scoreAsset(asset);
        const ruleOutput = generateRuleEngineOutput(asset, score);
        const inputHash = createAssetInputHash(asset, score, { provider: aiProviderName, model: aiModelName });

        if (score.scoreStatus === "PRIORITAS_PENGGANTIAN") criticalCount += 1;

        // Determine if AI job should be queued
        const shouldQueueAi = qualifiesForAi(score.score, mode);

        // Save AiAssetRecommendation
        batchOperations.push(
          prisma.aiAssetRecommendation.create({
            data: {
              runId: run.id,
              assetId: asset.id,
              score: score.score,
              scoreStatus: score.scoreStatus,
              recommendationTypes: score.recommendationTypes,
              priority: ruleOutput.priority,
              ruleSummary: ruleOutput.ruleSummary,
              technicalRecommendation: ruleOutput.technicalRecommendation,
              summary: ruleOutput.ruleSummary,
              recommendation: ruleOutput.technicalRecommendation,
              reason: ruleOutput.ruleReason,
              nextYearPlan: ruleOutput.nextAction,
              openModelSucceeded: false,
              openModelErrorMessage: shouldQueueAi
                ? "Menunggu antrean AI..."
                : null,
              details: {
                create: score.details.map((detail) => ({
                  factor: detail.factor,
                  scoreImpact: detail.scoreImpact,
                  message: detail.message
                }))
              }
            }
          })
        );

        // Save AssetReplacementRecommendation
        batchOperations.push(
          prisma.assetReplacementRecommendation.create({
            data: {
              assetId: asset.id,
              score: score.score,
              status: score.scoreStatus,
              recommendationTypes: score.recommendationTypes,
              reason: ruleOutput.ruleReason,
              source: "RULE_ENGINE",
              year: run.year
            }
          })
        );

        // Queue AI Job if qualified
        if (shouldQueueAi) {
          let priorityVal = 3;
          if (score.score >= 80 || asset.conditionStatus === "LAYAK_GANTI") priorityVal = 1;
          else if (score.score >= 60 || asset.conditionStatus === "RUSAK_BERAT") priorityVal = 2;

          batchOperations.push(
            prisma.aiAnalysisJob.upsert({
              where: { runId_assetId: { runId: run.id, assetId: asset.id } },
              create: {
                runId: run.id,
                assetId: asset.id,
                status: "PENDING",
                priority: priorityVal,
                inputHash,
                provider: aiProviderName,
                model: aiModelName
              },
              update: {
                status: "PENDING",
                priority: priorityVal,
                inputHash
              }
            })
          );
          queuedCount += 1;
        }

        // Log Lifecycle
        batchOperations.push(
          prisma.assetLifecycleLog.create({
            data: {
              assetId: asset.id,
              status: asset.lifecycleStatus,
              description: `Analisis Rule Engine ${run.runCode}: skor ${score.score}, status ${score.scoreStatus}.`,
              createdById: options.createdById
            }
          })
        );

        ruleCompletedCount += 1;
      }

      // Execute entire chunk in a single database transaction
      await prisma.$transaction(batchOperations);

      // Update chunk progress
      await prisma.aiAnalysisRun.update({
        where: { id: run.id },
        data: {
          ruleCompletedCount,
          processedAssets: ruleCompletedCount,
          aiQueuedCount: queuedCount,
          summary: `Memproses Rule Engine: ${ruleCompletedCount} dari ${assets.length} aset.`
        }
      });
    }

    const ruleDurationMs = Date.now() - ruleStartTime;

    // Rule Engine complete
    await prisma.aiAnalysisRun.update({
      where: { id: run.id },
      data: {
        ruleCompletedAt: new Date(),
        durationMs: ruleDurationMs,
        status: queuedCount > 0 ? "PROCESSING_QUEUE" : "COMPLETED",
        finishedAt: queuedCount === 0 ? new Date() : null,
        summary: queuedCount > 0
          ? `Rule Engine selesai (${ruleDurationMs}ms). ${queuedCount} aset masuk antrean AI.`
          : `Analisis Rule Engine selesai secara instan (${ruleDurationMs}ms). ${criticalCount} aset kritis ditemukan.`
      }
    });

    // Executive Summary in RECOMMENDED or FULL mode
    if ((mode === "RECOMMENDED" || mode === "FULL") && assets.length > 0) {
      void generateExecutiveSummary(run.id);
    }

    // Docker runs a dedicated queue worker. Inline processing is only a fallback
    // for deployments that explicitly do not run that worker.
    if (queuedCount > 0 && process.env.AI_INLINE_WORKER === "true") {
      void processAllPendingJobs().catch((err) => console.error("Worker trigger error:", err));
    }
  } catch (error) {
    await prisma.aiAnalysisRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        currentAsset: null,
        finishedAt: new Date(),
        summary: error instanceof Error ? `Analisis gagal: ${error.message}` : "Analisis gagal."
      }
    });
    throw error;
  }

  return prisma.aiAnalysisRun.findUnique({
    where: { id: run.id },
    include: {
      unit: true,
      category: true,
      recommendations: {
        include: {
          asset: { include: { unit: true, category: true, brand: true } },
          details: true
        },
        orderBy: { score: "desc" }
      },
      jobs: true
    }
  });
}
