import { prisma } from "../src/lib/prisma";
import { askOllama } from "../src/lib/ai/Ollama";
import { scoreAsset } from "../src/lib/ai/scoring-engine";
import crypto from "crypto";

const CONCURRENCY = 5;
const POLL_INTERVAL = 3000;

let isShuttingDown = false;

function createInputHash(asset: any, score: any): string {
  const roundedScore = Math.round(score.score / 10) * 10;
  const repairCount = asset.serviceRecords?.length || 0;
  const repairCategory = repairCount > 3 ? "heavy" : repairCount > 0 ? "light" : "none";
  const ramValue = parseInt(String(asset.ram).match(/\d+/)?.[0] || "0");
  const ramCategory = ramValue >= 16 ? "16+" : ramValue >= 8 ? "8" : "low";

  return crypto.createHash("sha256").update(JSON.stringify({
    processor: (asset.processor || "").substring(0, 10).toLowerCase(),
    ramCategory,
    repairCategory,
    conditionStatus: asset.conditionStatus,
    riskScoreRange: roundedScore,
    factors: score.details.map((d: any) => d.factor).sort()
  })).digest("hex");
}

async function processJob(job: any) {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: job.assetId },
      include: {
        unit: true,
        room: true,
        category: true,
        brand: true,
        vendor: true,
        serviceRecords: true
      }
    });

    if (!asset) throw new Error("Asset not found");

    const score = scoreAsset(asset as any);
    const inputHash = createInputHash(asset, score);

    let aiResult;
    let fromCache = false;

    // Check cache
    const cached = await prisma.aiAnalysisCache.findUnique({
      where: { assetId_inputHash: { assetId: asset.id, inputHash } }
    });

    if (cached) {
      aiResult = {
        ok: true,
        data: {
          summary: cached.summary,
          recommendation: cached.recommendation,
          reason: cached.reason,
          nextYearPlan: cached.nextYearPlan,
          priority: cached.priority
        }
      };
      fromCache = true;
    } else {
      aiResult = await askOllama(asset as any, score);
    }

    if (!aiResult.ok) {
      throw new Error(aiResult.error || "Ollama failed to respond");
    }

    // Update the recommendation
    const existingRec = await prisma.aiAssetRecommendation.findFirst({
      where: { runId: job.runId, assetId: asset.id }
    });

    if (existingRec) {
      await prisma.aiAssetRecommendation.update({
        where: { id: existingRec.id },
        data: {
          summary: aiResult.data.summary || "",
          recommendation: aiResult.data.recommendation || "",
          reason: aiResult.data.reason || "",
          nextYearPlan: aiResult.data.nextYearPlan || "",
          priority: aiResult.data.priority || "sedang",
          openModelSucceeded: true,
          openModelErrorMessage: fromCache ? "Loaded dari Cache" : null
        }
      });
    }

    // Save to cache if not from cache
    if (!fromCache) {
      await prisma.aiAnalysisCache.upsert({
        where: { assetId_inputHash: { assetId: asset.id, inputHash } },
        create: {
          assetId: asset.id,
          inputHash,
          summary: aiResult.data.summary || "",
          recommendation: aiResult.data.recommendation || "",
          reason: aiResult.data.reason || "",
          nextYearPlan: aiResult.data.nextYearPlan || "",
          priority: aiResult.data.priority || "sedang",
          recommendationTypes: score.recommendationTypes
        },
        update: {}
      });
    }

    // Mark job as completed
    await prisma.aiAnalysisJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED", completedAt: new Date() }
    });

    // Update run progress
    const run = await prisma.aiAnalysisRun.update({
      where: { id: job.runId },
      data: {
        aiCompletedCount: { increment: 1 },
        summary: `AI memproses aset ${asset.assetCode} ${fromCache ? "(dari Cache)" : ""}`
      }
    });

    if (run.aiCompletedCount + run.aiFailedCount >= run.aiQueuedCount) {
      await prisma.aiAnalysisRun.update({
        where: { id: job.runId },
        data: { status: "COMPLETED", finishedAt: new Date(), summary: "Semua analisis AI selesai." }
      });
    }

    return true; // Job processed
  } catch (error: any) {
    console.error(`[Worker] Error processing job ${job.id}:`, error.message);
    
    // Fallback or retry logic
    const attempts = job.attempts + 1;
    if (attempts >= 3) {
      await prisma.aiAnalysisJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: error.message, attempts }
      });
      
      const run = await prisma.aiAnalysisRun.update({
        where: { id: job.runId },
        data: { aiFailedCount: { increment: 1 } }
      });

      if (run.aiCompletedCount + run.aiFailedCount >= run.aiQueuedCount) {
        await prisma.aiAnalysisRun.update({
          where: { id: job.runId },
          data: { status: "COMPLETED", finishedAt: new Date(), summary: "Analisis selesai dengan beberapa kegagalan AI." }
        });
      }
    } else {
      await prisma.aiAnalysisJob.update({
        where: { id: job.id },
        data: { status: "PENDING", error: error.message, attempts }
      });
    }

    return true; // We processed something, even if it failed
  }
}

async function processNextJobs() {
  const jobs = await prisma.aiAnalysisJob.findMany({
    where: { status: "PENDING" },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }], // lower number = higher priority
    take: CONCURRENCY
  });

  if (jobs.length === 0) {
    return false; // No jobs found
  }

  // Mark as processing
  await prisma.aiAnalysisJob.updateMany({
    where: { id: { in: jobs.map(j => j.id) } },
    data: { status: "PROCESSING", startedAt: new Date() }
  });

  await Promise.allSettled(jobs.map(processJob));
  return true;
}

async function startWorker() {
  console.log(`[Worker] Started listening for AiAnalysisJobs with concurrency ${CONCURRENCY}`);
  
  // Reset stuck jobs
  await prisma.aiAnalysisJob.updateMany({
    where: { status: "PROCESSING" },
    data: { status: "PENDING" }
  });

  while (!isShuttingDown) {
    try {
      const processed = await processNextJobs();
      if (!processed) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      }
    } catch (e) {
      console.error("[Worker] Critical loop error:", e);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  console.log("[Worker] Shutting down gracefully...");
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => {
  console.log("Received SIGINT. Initiating graceful shutdown...");
  isShuttingDown = true;
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM. Initiating graceful shutdown...");
  isShuttingDown = true;
});

startWorker();
