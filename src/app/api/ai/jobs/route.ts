import { NextRequest, NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession, requestIp } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { scoreAsset, createAssetInputHash } from "@/lib/ai/scoring-engine";
import { processAllPendingJobs } from "@/lib/ai/worker";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.AI_ANALYZE)) return forbidden();

  try {
    const body = await request.json().catch(() => ({}));
    const { assetId, runId } = body;

    if (!assetId) {
      return NextResponse.json({ error: "Asset ID wajib diisi." }, { status: 400 });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: assetId, deletedAt: null },
      include: {
        unit: true,
        category: true,
        brand: true,
        vendor: true,
        serviceRecords: true
      }
    });

    if (!asset) {
      return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });
    }

    // Target run: provided runId or latest active/completed run
    let targetRunId = runId;
    if (!targetRunId) {
      const latestRun = await prisma.aiAnalysisRun.findFirst({
        orderBy: { createdAt: "desc" }
      });
      targetRunId = latestRun?.id;
    }

    if (!targetRunId) {
      return NextResponse.json({ error: "Belum ada analisis yang tersedia. Jalankan analisis terlebih dahulu." }, { status: 400 });
    }

    const aiProviderName = "Ollama";
    let aiModelName = process.env.OLLAMA_MODEL || "qwen3:1.7b";
    try {
      const row = await prisma.systemSetting.findUnique({ where: { key: "ai" } });
      if (!process.env.OLLAMA_MODEL && row && row.value && typeof row.value === "object") {
        const val = row.value as { defaultModel?: string };
        if (val.defaultModel) aiModelName = val.defaultModel;
      }
    } catch {}

    const score = scoreAsset(asset);
    const inputHash = createAssetInputHash(asset, score, { provider: aiProviderName, model: aiModelName });

    // Check if duplicate job is pending/processing
    const existingJob = await prisma.aiAnalysisJob.findFirst({
      where: {
        runId: targetRunId,
        assetId,
        status: { in: ["PENDING", "PROCESSING"] }
      }
    });

    if (existingJob) {
      return NextResponse.json({
        message: "Pekerjaan AI sudah berada dalam antrean.",
        job: existingJob
      });
    }

    const job = await prisma.aiAnalysisJob.upsert({
      where: { runId_assetId: { runId: targetRunId, assetId } },
      create: {
        runId: targetRunId,
        assetId,
        status: "PENDING",
        priority: 1, // Manual trigger gets top priority
        inputHash,
        provider: aiProviderName,
        model: aiModelName
      },
      update: {
        status: "PENDING",
        priority: 1,
        attempts: 0,
        error: null,
        errorMessage: null,
        errorCode: null,
        nextRetryAt: null,
        inputHash
      }
    });

    await prisma.aiAnalysisRun.update({
      where: { id: targetRunId },
      data: {
        status: "PROCESSING_QUEUE",
        aiQueuedCount: { increment: 1 }
      }
    });

    await createAuditLog({
      session,
      action: "AI_JOB_CREATED_MANUAL",
      module: "AI Decision Support",
      description: `Pekerjaan AI manual dibuat untuk aset ${asset.assetCode}.`,
      ipAddress: requestIp(request)
    });

    if (process.env.AI_INLINE_WORKER === "true") {
      void processAllPendingJobs().catch(() => {});
    }

    return NextResponse.json({ message: "Pekerjaan AI berhasil ditambahkan ke antrean.", job }, { status: 201 });
  } catch (error) {
    console.error("Failed to create AI job:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
