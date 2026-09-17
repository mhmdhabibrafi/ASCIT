import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Permission } from "@/lib/permissions";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
export async function POST(request: NextRequest) {
  const { session, response } = await requireSession(); if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();
  if (process.env.ALLOW_WEB_DATABASE_CLEAR !== "true") {
    return NextResponse.json({ error: "Pembersihan database melalui web dinonaktifkan pada server ini." }, { status: 403 });
  }
  if (request.headers.get("x-ascit-confirm") !== "CLEAR-OPERATIONAL-DATA") {
    return NextResponse.json({ error: "Konfirmasi operasi tidak valid." }, { status: 400 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Hapus tabel anak terlebih dahulu agar foreign key PostgreSQL tetap valid.
      const d = await tx.aiRecommendationDetail.deleteMany();
      const r = await tx.aiAssetRecommendation.deleteMany();
      const rr = await tx.assetReplacementRecommendation.deleteMany();
      const l = await tx.assetLifecycleLog.deleteMany();
      const n = await tx.notificationRead.deleteMany();
      const s = await tx.serviceRecord.deleteMany();
      const m = await tx.assetMutation.deleteMany();
      const ar = await tx.aiAnalysisRun.deleteMany();
      const a = await tx.asset.deleteMany();
      const audit = await tx.auditLog.deleteMany();
      return { assets: a.count, serviceRecords: s.count, mutations: m.count, auditLogs: audit.count, notifications: n.count, lifecycleLogs: l.count, recommendations: r.count + rr.count, recommendationDetails: d.count, aiRuns: ar.count };
    });
    await prisma.auditLog.create({ data: { userId: session.user.id, action: "CLEAR_DATABASE", module: "Pengaturan Sistem", description: `Database operasional dibersihkan (${result.assets} aset, ${result.serviceRecords} service record, ${result.mutations} mutasi).` } });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[settings/clear] gagal membersihkan database", error);
    return NextResponse.json({ error: "Database gagal dibersihkan." }, { status: 500 });
  }
}
