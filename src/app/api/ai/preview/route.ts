import { NextRequest, NextResponse } from "next/server";
import type { AnalysisMode, Prisma } from "@prisma/client";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { AI_MODE_SCORE_THRESHOLDS, qualifiesForAi, scoreAsset } from "@/lib/ai/scoring-engine";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.AI_ANALYZE)) return forbidden();

  const modeParam = request.nextUrl.searchParams.get("mode");
  const mode: AnalysisMode = modeParam === "FULL" || modeParam === "RECOMMENDED" ? modeParam : "FAST";
  const unitId = request.nextUrl.searchParams.get("unitId") || undefined;
  const categoryId = request.nextUrl.searchParams.get("categoryId") || undefined;
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 0);
  const maxFullAssets = Math.max(1, Number(process.env.AI_MAX_ASSETS_PER_RUN || 50));
  const take = mode === "FULL"
    ? Math.min(requestedLimit > 0 ? requestedLimit : maxFullAssets, maxFullAssets)
    : requestedLimit > 0 ? Math.min(requestedLimit, 1000) : undefined;

  const where: Prisma.AssetWhereInput = {
    deletedAt: null,
    assetType: "IT",
    ...(unitId ? { unitId } : {}),
    ...(categoryId ? { categoryId } : {})
  };

  try {
    const [matchingCount, assets, recentDurations, queuePending, queueProcessing] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        select: {
          id: true,
          assetCode: true,
          assetName: true,
          purchaseDate: true,
          processor: true,
          ram: true,
          storage: true,
          operatingSystem: true,
          conditionStatus: true,
          lifecycleStatus: true,
          warrantyEndDate: true,
          serviceRecords: { select: { cost: true } }
        },
        orderBy: { assetCode: "asc" },
        ...(take ? { take } : {})
      }),
      prisma.aiAnalysisJob.findMany({
        where: { status: "COMPLETED", inferenceDurationMs: { not: null } },
        select: { inferenceDurationMs: true },
        orderBy: { completedAt: "desc" },
        take: 30
      }),
      prisma.aiAnalysisJob.count({ where: { status: "PENDING" } }),
      prisma.aiAnalysisJob.count({ where: { status: "PROCESSING" } })
    ]);

    const evaluated = assets.map((asset) => ({ asset, score: scoreAsset(asset) }));
    const eligible = evaluated.filter(({ score }) => qualifiesForAi(score.score, mode));
    const warningAssets = evaluated.filter(({ score }) => score.dataQualityWarnings.length > 0).length;
    const avgDurationMs = recentDurations.length
      ? Math.round(recentDurations.reduce((sum, row) => sum + (row.inferenceDurationMs || 0), 0) / recentDurations.length)
      : 0;

    return NextResponse.json({
      data: {
        mode,
        threshold: AI_MODE_SCORE_THRESHOLDS[mode],
        matchingAssets: matchingCount,
        assetsToEvaluate: assets.length,
        eligibleAiAssets: eligible.length,
        dataQualityWarningAssets: warningAssets,
        estimatedDurationMs: avgDurationMs ? eligible.length * avgDurationMs : null,
        avgInferenceDurationMs: avgDurationMs || null,
        queueAhead: queuePending + queueProcessing,
        capped: Boolean(take && matchingCount > assets.length),
        sample: eligible.slice(0, 5).map(({ asset, score }) => ({
          id: asset.id,
          assetCode: asset.assetCode,
          assetName: asset.assetName,
          score: score.score,
          status: score.scoreStatus
        }))
      }
    });
  } catch {
    return NextResponse.json({ error: "Preview analisis belum dapat dibuat." }, { status: 500 });
  }
}
