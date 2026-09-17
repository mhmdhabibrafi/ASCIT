import { askOllama } from "@/lib/ai/Ollama";
import { getAiCache, setAiCache } from "@/lib/ai/cache";
import { scoreAsset, createAssetInputHash } from "@/lib/ai/scoring-engine";
import { prisma } from "@/lib/prisma";

const CONCURRENCY_LIMIT = Number(process.env.AI_WORKER_CONCURRENCY || 1);
const MAX_ATTEMPTS = 3;
const LOCK_TIMEOUT_MINUTES = 5;
const STUCK_JOB_CHECK_INTERVAL_MS = 60_000;
let lastStuckJobCheckAt = 0;

function calculateExponentialBackoff(attempts: number): Date {
  const now = new Date();
  let delaySeconds = 30;
  if (attempts === 1) delaySeconds = 30; // 30s
  else if (attempts === 2) delaySeconds = 120; // 2m
  else delaySeconds = 300; // 5m

  return new Date(now.getTime() + delaySeconds * 1000);
}

function isRetryableError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("connection refused") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed") ||
    lower.includes("429") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("network")
  );
}

export async function releaseStuckJobs(): Promise<number> {
  const now = Date.now();
  if (now - lastStuckJobCheckAt < STUCK_JOB_CHECK_INTERVAL_MS) return 0;
  lastStuckJobCheckAt = now;

  const fiveMinutesAgo = new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60 * 1000);
  try {
    const stuck = await prisma.aiAnalysisJob.updateMany({
      where: {
        status: "PROCESSING",
        lockedAt: { lt: fiveMinutesAgo }
      },
      data: {
        status: "PENDING",
        lockedAt: null,
        error: "Unlocked from crash / lock timeout."
      }
    });
    return stuck.count;
  } catch (error) {
    console.error("Failed to release stuck jobs:", error);
    return 0;
  }
}

export async function processNextJobBatch(batchSize: number = CONCURRENCY_LIMIT): Promise<number> {
  await releaseStuckJobs();

  const now = new Date();

  // Find pending jobs or failed retryable jobs
  const candidates = await prisma.aiAnalysisJob.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        {
          status: "FAILED",
          attempts: { lt: MAX_ATTEMPTS },
          nextRetryAt: { lte: now }
        }
      ],
      run: {
        status: { in: ["PROCESSING_QUEUE", "RULE_ENGINE_COMPLETED", "RUNNING_RULE_ENGINE"] }
      },
      asset: { assetType: "IT" }
    },
    include: {
      run: true,
      asset: {
        include: {
          unit: true,
          category: true,
          brand: true,
          vendor: true,
          serviceRecords: true
        }
      }
    },
    orderBy: [
      { priority: "asc" }, // 1 is highest priority
      { createdAt: "asc" }
    ],
    take: batchSize * 2
  });

  if (!candidates.length) return 0;

  // Filter out runs that are STOPPED
  const validCandidates = candidates.filter(
    (job) => job.run.status !== "STOPPED" && job.run.status !== "FAILED"
  );

  let processedCount = 0;

  for (const job of validCandidates.slice(0, batchSize)) {
    // Atomically lock job
    const locked = await prisma.aiAnalysisJob.updateMany({
      where: {
        id: job.id,
        status: { in: ["PENDING", "FAILED"] }
      },
      data: {
        status: "PROCESSING",
        lockedAt: new Date(),
        startedAt: new Date(),
        attempts: job.attempts + 1
      }
    });

    if (locked.count === 0) continue; // Locked by another worker

    const startTime = performance.now();
    const asset = job.asset;
    const score = scoreAsset(asset);

    // ASCIT berjalan dengan model lokal. Provider/model menjadi bagian hash agar
    // cache dari konfigurasi lama tidak tercampur dengan hasil Ollama saat ini.
    const provider = "Ollama";
    const model = process.env.OLLAMA_MODEL || job.run.model || "qwen3:1.7b";
    const inputHash = createAssetInputHash(asset, score, { provider, model });

    await prisma.aiAnalysisJob.update({
      where: { id: job.id },
      data: { inputHash, provider, model }
    });

    // Check Cache first
    const cached = await getAiCache(asset.id, inputHash);
    if (cached) {
      const durationMs = Math.round(performance.now() - startTime);

      await prisma.aiAssetRecommendation.updateMany({
        where: { runId: job.runId, assetId: job.assetId },
        data: {
          aiSummary: cached.summary,
          aiReason: cached.reason,
          operationalImpact: cached.operationalImpact || cached.reason,
          replacementJustification: cached.replacementJustification || cached.recommendation || "",
          nextYearPlan: cached.nextYearPlan,
          openModelSucceeded: true,
          openModelErrorMessage: null,
          provider: cached.provider || provider,
          model: cached.model || model,
          generatedAt: new Date()
        }
      });

      await prisma.aiAnalysisJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          inferenceDurationMs: durationMs,
          error: null,
          errorMessage: null
        }
      });

      await prisma.aiAnalysisRun.update({
        where: { id: job.runId },
        data: {
          aiCompletedCount: { increment: 1 },
          cacheHitCount: { increment: 1 }
        }
      });

      processedCount++;
      await checkAndUpdateRunCompletion(job.runId);
      continue;
    }

    // Cache Miss: Invoke AI Model
    const result = await askOllama(asset, score);

    const durationMs = Math.round(performance.now() - startTime);

    // A running Ollama request cannot be aborted from another container, but a
    // user cancellation must still prevent its late response from overwriting
    // the CANCELLED job/run state.
    const latestJobState = await prisma.aiAnalysisJob.findUnique({
      where: { id: job.id },
      select: { status: true }
    });
    if (latestJobState?.status === "CANCELLED") {
      processedCount++;
      continue;
    }

    if (result.ok) {
      const data = result.data;
      await prisma.aiAssetRecommendation.updateMany({
        where: { runId: job.runId, assetId: job.assetId },
        data: {
          aiSummary: data.summary,
          aiReason: data.reason,
          operationalImpact: data.operationalImpact || data.reason,
          replacementJustification: data.replacementJustification || data.recommendation,
          nextYearPlan: data.nextYearPlan,
          openModelSucceeded: true,
          openModelErrorMessage: null,
          provider,
          model,
          generatedAt: new Date()
        }
      });

      // Write to Cache
      await setAiCache(asset.id, inputHash, {
        summary: data.summary,
        recommendation: data.recommendation,
        reason: data.reason,
        aiReason: data.reason,
        operationalImpact: data.operationalImpact || data.reason,
        replacementJustification: data.replacementJustification || data.recommendation,
        nextYearPlan: data.nextYearPlan,
        priority: score.priority,
        recommendationTypes: score.recommendationTypes,
        provider,
        model
      });

      await prisma.aiAnalysisJob.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          inferenceDurationMs: durationMs,
          error: null,
          errorMessage: null
        }
      });

      await prisma.aiAnalysisRun.update({
        where: { id: job.runId },
        data: {
          aiCompletedCount: { increment: 1 },
          cacheMissCount: { increment: 1 }
        }
      });

      processedCount++;
    } else {
      const errorMsg = result.error;
      const retryable = isRetryableError(errorMsg);
      const attempts = job.attempts + 1;

      if (retryable && attempts < MAX_ATTEMPTS) {
        const nextRetryAt = calculateExponentialBackoff(attempts);
        await prisma.aiAnalysisJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            lockedAt: null,
            error: errorMsg,
            errorMessage: errorMsg,
            nextRetryAt
          }
        });
      } else {
        await prisma.aiAnalysisJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            error: errorMsg,
            errorMessage: errorMsg,
            errorCode: retryable ? "MAX_RETRIES_EXCEEDED" : "PERMANENT_ERROR"
          }
        });

        await prisma.aiAssetRecommendation.updateMany({
          where: { runId: job.runId, assetId: job.assetId },
          data: {
            openModelSucceeded: false,
            openModelErrorMessage: errorMsg
          }
        });

        await prisma.aiAnalysisRun.update({
          where: { id: job.runId },
          data: {
            aiFailedCount: { increment: 1 },
            cacheMissCount: { increment: 1 }
          }
        });
      }
    }

    await checkAndUpdateRunCompletion(job.runId);
  }

  return processedCount;
}

export async function checkAndUpdateRunCompletion(runId: string): Promise<void> {
  const run = await prisma.aiAnalysisRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      status: true,
      totalAssets: true,
      ruleCompletedCount: true,
      aiQueuedCount: true,
      aiCompletedCount: true,
      aiFailedCount: true
    }
  });

  if (!run || run.status === "STOPPED" || run.status === "FAILED") return;

  const pendingOrProcessing = await prisma.aiAnalysisJob.count({
    where: {
      runId,
      status: { in: ["PENDING", "PROCESSING"] }
    }
  });

  if (pendingOrProcessing === 0 && run.ruleCompletedCount >= run.totalAssets) {
    const finalStatus = run.aiFailedCount > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
    await prisma.aiAnalysisRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        aiCompletedAt: new Date(),
        finishedAt: new Date(),
        summary: `Analisis selesai (${run.ruleCompletedCount} rule engine, ${run.aiCompletedCount} AI selesai, ${run.aiFailedCount} AI gagal).`
      }
    });
  }
}

let isWorkerProcessing = false;

export async function processAllPendingJobs(maxItems: number = 50): Promise<number> {
  if (isWorkerProcessing) {
    return 0;
  }
  isWorkerProcessing = true;
  let totalProcessed = 0;
  try {
    while (totalProcessed < maxItems) {
      const count = await processNextJobBatch(1);
      if (count === 0) break;
      totalProcessed += count;
    }
  } finally {
    isWorkerProcessing = false;
  }
  return totalProcessed;
}
