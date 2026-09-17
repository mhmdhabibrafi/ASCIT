import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  const { id } = await params;

  try {
    const run = await prisma.aiAnalysisRun.findUnique({
      where: { id },
      include: {
        unit: true,
        category: true,
        recommendations: {
          include: {
            asset: {
              include: { unit: true, category: true, brand: true }
            },
            details: true
          },
          orderBy: { score: "desc" }
        },
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
        }
      }
    });

    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Compute job progress summary
    const jobSummary = {
      total: run.jobs.length,
      pending: run.jobs.filter(j => j.status === "PENDING").length,
      processing: run.jobs.filter(j => j.status === "PROCESSING").length,
      completed: run.jobs.filter(j => j.status === "COMPLETED").length,
      failed: run.jobs.filter(j => j.status === "FAILED").length,
      cancelled: run.jobs.filter(j => j.status === "CANCELLED").length,
      avgDurationMs: run.jobs.filter(j => j.inferenceDurationMs).length > 0
        ? Math.round(
            run.jobs
              .filter(j => j.inferenceDurationMs)
              .reduce((sum, j) => sum + (j.inferenceDurationMs || 0), 0) /
            run.jobs.filter(j => j.inferenceDurationMs).length
          )
        : null
    };

    return NextResponse.json({ data: { ...run, jobSummary } });
  } catch (error) {
    console.error("Failed to fetch run:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
