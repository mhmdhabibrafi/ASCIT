import { NextRequest, NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession, requestIp } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { processAllPendingJobs } from "@/lib/ai/worker";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.AI_MANAGE) && !hasSessionPermission(session, Permission.AI_ANALYZE)) {
    return forbidden();
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { jobId, runId } = body;

    if (jobId) {
      const job = await prisma.aiAnalysisJob.findUnique({
        where: { id: jobId },
        include: { run: true }
      });

      if (!job) {
        return NextResponse.json({ error: "Pekerjaan AI tidak ditemukan." }, { status: 404 });
      }

      await prisma.aiAnalysisJob.update({
        where: { id: jobId },
        data: {
          status: "PENDING",
          attempts: 0,
          error: null,
          errorMessage: null,
          errorCode: null,
          nextRetryAt: null,
          lockedAt: null
        }
      });

      await prisma.aiAnalysisRun.update({
        where: { id: job.runId },
        data: { status: "PROCESSING_QUEUE" }
      });

      await createAuditLog({
        session,
        action: "AI_JOB_RETRY",
        module: "AI Decision Support",
        description: `Retry pekerjaan AI ${job.id} dipicu.`,
        ipAddress: requestIp(request)
      });

      if (process.env.AI_INLINE_WORKER === "true") {
        void processAllPendingJobs().catch(() => {});
      }

      return NextResponse.json({ message: "Pekerjaan AI berhasil didaftarkan ulang ke antrean." });
    }

    if (runId) {
      const failedJobs = await prisma.aiAnalysisJob.findMany({
        where: { runId, status: "FAILED" }
      });

      if (!failedJobs.length) {
        return NextResponse.json({ message: "Tidak ada pekerjaan AI yang gagal untuk di-retry." });
      }

      await prisma.aiAnalysisJob.updateMany({
        where: { runId, status: "FAILED" },
        data: {
          status: "PENDING",
          attempts: 0,
          error: null,
          errorMessage: null,
          errorCode: null,
          nextRetryAt: null,
          lockedAt: null
        }
      });

      await prisma.aiAnalysisRun.update({
        where: { id: runId },
        data: { status: "PROCESSING_QUEUE" }
      });

      await createAuditLog({
        session,
        action: "AI_RUN_RETRY_FAILED",
        module: "AI Decision Support",
        description: `${failedJobs.length} pekerjaan AI yang gagal di-retry untuk run ${runId}.`,
        ipAddress: requestIp(request)
      });

      if (process.env.AI_INLINE_WORKER === "true") {
        void processAllPendingJobs().catch(() => {});
      }

      return NextResponse.json({ message: `${failedJobs.length} pekerjaan AI yang gagal berhasil didaftarkan ulang.` });
    }

    return NextResponse.json({ error: "jobId atau runId wajib diisi." }, { status: 400 });
  } catch (error) {
    console.error("Failed to retry AI job:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
