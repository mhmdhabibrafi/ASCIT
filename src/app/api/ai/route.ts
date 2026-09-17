import { NextRequest, NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession, requestIp } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { runAiAssetAnalysis } from "@/lib/ai/recommendation";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import type { AnalysisMode } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  const unitId = request.nextUrl.searchParams.get("unitId") || undefined;
  const categoryId = request.nextUrl.searchParams.get("categoryId") || undefined;
  const runId = request.nextUrl.searchParams.get("runId") || undefined;
  const year = request.nextUrl.searchParams.get("year");
  if (year && isNaN(Number(year))) {
    return NextResponse.json({ error: "Tahun tidak valid" }, { status: 400 });
  }

  try {
    const filterWhere = {
      ...(unitId ? { unitId } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(year ? { year: Number(year) } : {})
    };

    // Polling previously loaded five complete runs (including every job,
    // recommendation and service record) just to display one. Resolve the id
    // cheaply first, then hydrate only the selected run.
    const selected = runId ? await prisma.aiAnalysisRun.findFirst({
      where: { id: runId, ...filterWhere },
      select: { id: true }
    }) : await prisma.aiAnalysisRun.findFirst({
      where: {
        ...filterWhere,
        status: { in: ["RUNNING_RULE_ENGINE", "PROCESSING_QUEUE", "RUNNING"] }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    }) || (!runId ? await prisma.aiAnalysisRun.findFirst({
      where: {
        ...filterWhere,
        status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
        totalAssets: { gt: 0 }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    }) : null) || (!runId ? await prisma.aiAnalysisRun.findFirst({
      where: filterWhere,
      orderBy: { createdAt: "desc" },
      select: { id: true }
    }) : null);

    if (!selected) return NextResponse.json({ data: null });

    const latestRun = await prisma.aiAnalysisRun.findUnique({
      where: { id: selected.id },
      include: {
        unit: true,
        category: true,
        jobs: {
          select: {
            id: true,
            status: true,
            priority: true,
            attempts: true,
            error: true,
            errorMessage: true,
            inferenceDurationMs: true,
            assetId: true,
            startedAt: true,
            completedAt: true,
            updatedAt: true
          }
        },
        recommendations: {
          select: {
            id: true,
            score: true,
            scoreStatus: true,
            recommendationTypes: true,
            priority: true,
            recommendation: true,
            reason: true,
            nextYearPlan: true,
            aiSummary: true,
            aiReason: true,
            operationalImpact: true,
            replacementJustification: true,
            openModelSucceeded: true,
            openModelErrorMessage: true,
            asset: {
              select: {
                id: true,
                assetCode: true,
                assetName: true,
                processor: true,
                ram: true,
                storage: true,
                operatingSystem: true,
                unit: { select: { name: true } },
                category: { select: { name: true } },
                _count: { select: { serviceRecords: true } }
              }
            },
            details: { select: { id: true, factor: true, scoreImpact: true, message: true } }
          },
          orderBy: { score: "desc" }
        }
      }
    });

    return NextResponse.json({ data: latestRun });
  } catch (error) {
    console.error("GET /api/ai error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.AI_ANALYZE)) return forbidden();

  const limit = checkRateLimit(`ai-run:${session.user.id}`, 5, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan analisis AI. Silakan coba kembali nanti." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (body.year && isNaN(Number(body.year))) {
    return NextResponse.json({ error: "Tahun tidak valid" }, { status: 400 });
  }

  const mode: AnalysisMode = ["FAST", "RECOMMENDED", "FULL"].includes(body.mode) ? body.mode : "FAST";

  // Validate FULL mode constraints
  if (mode === "FULL") {
    const AI_MAX_ASSETS_PER_RUN = Number(process.env.AI_MAX_ASSETS_PER_RUN || 50);
    const hasFilter = Boolean(body.unitId || body.categoryId || body.limit);
    
    // Count matching assets
    const assetCount = await prisma.asset.count({
      where: {
        deletedAt: null,
        assetType: "IT",
        ...(body.unitId ? { unitId: body.unitId } : {}),
        ...(body.categoryId ? { categoryId: body.categoryId } : {})
      }
    });

    if (!hasFilter && assetCount > AI_MAX_ASSETS_PER_RUN) {
      return NextResponse.json(
        {
          error: `Mode FULL terbatas maksimal ${AI_MAX_ASSETS_PER_RUN} aset per eksekusi. Silakan pilih unit, kategori, atau batasi aset.`
        },
        { status: 400 }
      );
    }
  }

  try {
    const run = await runAiAssetAnalysis({
      createdById: session.user.id,
      year: body.year ? Number(body.year) : undefined,
      unitId: body.unitId || undefined,
      categoryId: body.categoryId || undefined,
      mode,
      useAi: body.useAi !== false,
      forceAiRegenerate: body.forceAiRegenerate === true,
      limit: body.limit ? Number(body.limit) : undefined
    });

    await createAuditLog({
      session,
      action: "AI_ANALYSIS_STARTED",
      module: "AI Decision Support",
      description: `Analisis Mode ${mode} (${run?.runCode}) dimulai untuk ${run?.totalAssets} aset.`,
      ipAddress: requestIp(request)
    });

    return NextResponse.json({ data: run }, { status: 201 });
  } catch (error) {
    console.error("POST /api/ai error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.AI_ANALYZE)) return forbidden();

  try {
    const activeRun = await prisma.aiAnalysisRun.findFirst({
      where: {
        status: { in: ["RUNNING_RULE_ENGINE", "PROCESSING_QUEUE", "RUNNING", "PENDING"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (!activeRun) {
      return NextResponse.json({ error: "Tidak ada analisis yang sedang berjalan." }, { status: 404 });
    }

    // Cancel all pending AI jobs for this run
    await prisma.aiAnalysisJob.updateMany({
      where: {
        runId: activeRun.id,
        status: { in: ["PENDING", "PROCESSING"] }
      },
      data: {
        status: "CANCELLED",
        error: "Dihentikan oleh pengguna."
      }
    });

    await prisma.aiAnalysisRun.update({
      where: { id: activeRun.id },
      data: {
        status: "STOPPED",
        finishedAt: new Date(),
        summary: `Analisis ${activeRun.runCode} dihentikan pengguna.`
      }
    });

    await createAuditLog({
      session,
      action: "AI_ANALYSIS_STOPPED",
      module: "AI Decision Support",
      description: `Analisis ${activeRun.runCode} dihentikan oleh pengguna.`,
      ipAddress: requestIp(request)
    });

    return NextResponse.json({ message: "Analisis dan antrean AI dihentikan." });
  } catch (error) {
    console.error("DELETE /api/ai error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
