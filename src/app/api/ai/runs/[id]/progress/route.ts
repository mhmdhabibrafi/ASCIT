import { NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  const { id } = await params;
  const run = await prisma.aiAnalysisRun.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      totalAssets: true,
      processedAssets: true,
      ruleCompletedCount: true,
      aiQueuedCount: true,
      aiCompletedCount: true,
      aiFailedCount: true,
      cacheHitCount: true,
      cacheMissCount: true,
      summary: true,
      finishedAt: true,
      jobs: {
        select: {
          id: true,
          assetId: true,
          status: true,
          priority: true,
          attempts: true,
          error: true,
          errorMessage: true,
          inferenceDurationMs: true,
          startedAt: true,
          completedAt: true,
          updatedAt: true,
          asset: { select: { assetCode: true, assetName: true } }
        },
        orderBy: [{ status: "desc" }, { priority: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!run) return NextResponse.json({ error: "Run AI tidak ditemukan." }, { status: 404 });
  return NextResponse.json({ data: run }, { headers: { "Cache-Control": "no-store" } });
}
