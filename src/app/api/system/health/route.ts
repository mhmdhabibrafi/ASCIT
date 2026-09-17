import { NextRequest, NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type DatabaseInfo = {
  databaseName: string;
  schemaName: string;
  serverTime: Date;
};

type OllamaRuntime = {
  reachable: boolean;
  responseTimeMs: number;
  loadedModels: Array<{ name: string; sizeBytes: number; sizeVramBytes: number; expiresAt?: string }>;
};

async function readOllamaRuntime(): Promise<OllamaRuntime> {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://ollama:11434/api").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}/ps`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error("Ollama unavailable");
    const payload = await response.json() as { models?: Array<{ name?: string; model?: string; size?: number; size_vram?: number; expires_at?: string }> };
    return {
      reachable: true,
      responseTimeMs: Math.round(performance.now() - startedAt),
      loadedModels: (payload.models || []).map((model) => ({
        name: model.name || model.model || "unknown",
        sizeBytes: Number(model.size || 0),
        sizeVramBytes: Number(model.size_vram || 0),
        expiresAt: model.expires_at
      }))
    };
  } catch {
    return { reachable: false, responseTimeMs: Math.round(performance.now() - startedAt), loadedModels: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SETTINGS_MANAGE) && !hasSessionPermission(session, Permission.AI_ANALYZE)) {
    return forbidden();
  }

  try {
    const summaryOnly = request.nextUrl.searchParams.get("summary") === "1";
    const [databaseInfo] = await prisma.$queryRaw<DatabaseInfo[]>`
      SELECT
        current_database() AS "databaseName",
        current_schema() AS "schemaName",
        now() AS "serverTime"
    `;

    if (summaryOnly) {
      return NextResponse.json({
        status: "ok",
        provider: "PostgreSQL",
        database: {
          name: databaseInfo?.databaseName ?? "unknown",
          schema: databaseInfo?.schemaName ?? "public",
          serverTime: databaseInfo?.serverTime ?? new Date()
        }
      });
    }

    const [assets, users, units, auditLogs, pendingJobs, processingJobs, completedJobs, failedJobs, oldestPending, latestRun, cacheStats, ollamaRuntime, completedInferenceDurations] = await Promise.all([
      prisma.asset.count({ where: { deletedAt: null } }),
      prisma.user.count(),
      prisma.unit.count(),
      prisma.auditLog.count(),
      prisma.aiAnalysisJob.count({ where: { status: "PENDING" } }),
      prisma.aiAnalysisJob.count({ where: { status: "PROCESSING" } }),
      prisma.aiAnalysisJob.count({ where: { status: "COMPLETED" } }),
      prisma.aiAnalysisJob.count({ where: { status: "FAILED" } }),
      prisma.aiAnalysisJob.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true }
      }),
      prisma.aiAnalysisRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: { status: true, provider: true, model: true, cacheHitCount: true, cacheMissCount: true, createdAt: true }
      }),
      prisma.aiAnalysisCache.count(),
      readOllamaRuntime(),
      prisma.aiAnalysisJob.findMany({
        where: { status: "COMPLETED", inferenceDurationMs: { not: null } },
        select: { inferenceDurationMs: true },
        orderBy: { completedAt: "desc" },
        take: 100
      })
    ]);

    const avgInferenceDurationMs = completedInferenceDurations.length
      ? Math.round(
          completedInferenceDurations.reduce((sum, j) => sum + (j.inferenceDurationMs || 0), 0) /
            completedInferenceDurations.length
        )
      : 0;

    let aiHealthStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    if (failedJobs > completedJobs && failedJobs > 5) {
      aiHealthStatus = "UNHEALTHY";
    } else if (failedJobs > 0 || processingJobs > 10) {
      aiHealthStatus = "DEGRADED";
    }
    if (!ollamaRuntime.reachable) aiHealthStatus = "UNHEALTHY";

    return NextResponse.json({
      status: "ok",
      provider: "PostgreSQL",
      database: {
        name: databaseInfo?.databaseName ?? "unknown",
        schema: databaseInfo?.schemaName ?? "public",
        serverTime: databaseInfo?.serverTime ?? new Date()
      },
      counts: {
        assets,
        users,
        units,
        auditLogs
      },
      aiMetrics: {
        healthStatus: aiHealthStatus,
        provider: latestRun?.provider || process.env.OLLAMA_BASE_URL || "Ollama",
        model: latestRun?.model || process.env.OLLAMA_MODEL || "qwen3:1.7b",
        latestRunStatus: latestRun?.status || null,
        runtime: ollamaRuntime,
        queue: {
          pending: pendingJobs,
          processing: processingJobs,
          completed: completedJobs,
          failed: failedJobs,
          oldestPendingCreatedAt: oldestPending?.createdAt || null
        },
        inference: {
          avgDurationMs: avgInferenceDurationMs
        },
        cache: {
          totalEntries: cacheStats,
          latestRunHitCount: latestRun?.cacheHitCount || 0,
          latestRunMissCount: latestRun?.cacheMissCount || 0
        }
      }
    });
  } catch (error) {
    console.error("System health check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        provider: "PostgreSQL",
        message: "Status sistem belum dapat dibaca."
      },
      { status: 503 }
    );
  }
}
