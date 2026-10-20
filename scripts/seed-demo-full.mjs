import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import QRCode from 'qrcode';
import { appEnv } from './local-config.mjs';

// Additive demo fixtures; rerunning preserves existing records and passwords.
const prisma = new PrismaClient({ datasourceUrl: appEnv.DATABASE_URL });
const models = Prisma.dmmf.datamodel.models.map(m => m.name[0].toLowerCase() + m.name.slice(1));
const hash = row => createHash('sha256').update(JSON.stringify(row)).digest('hex');
const marker = 'DEMO-FULL-2026';
const now = new Date();
const day = offset => new Date(now.getTime() + offset * 86400000);
try {
  await prisma.$transaction(async p => {
    const before = {};
    for (const model of models) before[model] = new Map((await p[model].findMany()).map(row => [row.id, hash(row)]));
    if (!(await p.auditLog.findFirst({ where: { action: marker } }))) {
      const admin = await p.user.findUniqueOrThrow({ where: { email: 'admin@ascit.local' } });
      const rooms = await p.room.findMany({ orderBy: { code: 'asc' } });
      const categories = await p.assetCategory.findMany({ orderBy: { code: 'asc' } });
      const vendors = await p.vendor.findMany({ orderBy: { name: 'asc' } });
      const brands = await p.brand.findMany({ orderBy: { name: 'asc' } });
      assert(rooms.length > 1 && categories.length && vendors.length && brands.length);
      const segments = [];
      for (const [code, name] of [['DEMO-OPS', 'Operasional Demo'], ['DEMO-INFRA', 'Infrastruktur Demo'], ['DEMO-MOBILE', 'Perangkat Mobile Demo']]) {
        segments.push(await p.segment.upsert({ where: { code }, update: {}, create: { code, name } }));
      }
      const run = await p.aiAnalysisRun.create({ data: {
        runCode: marker, year: now.getFullYear() + 1, totalAssets: 22,
        processedAssets: 22, ruleCompletedCount: 22, status: 'COMPLETED',
        provider: 'DEMO_SIMULATION', model: 'dummy-no-inference',
        summary: 'Data dummy simulasi untuk demonstrasi seluruh modul, bukan hasil inferensi AI.',
        finishedAt: now, ruleCompletedAt: now, createdById: admin.id
      } });
      const lifecycle = ['PENGADAAN', 'PENERIMAAN', 'INSTALASI', 'AKTIF', 'DIPINDAHKAN', 'DIPINJAM', 'MAINTENANCE', 'DALAM_PERBAIKAN', 'RUSAK', 'LAYAK_GANTI', 'DIHAPUS'];
      for (let i = 0; i < 22; i++) {
        const room = rooms[i % rooms.length];
        const destination = rooms[(i + 1) % rooms.length];
        const assetCode = `${marker}-${String(i + 1).padStart(3, '0')}`;
        const status = lifecycle[i % lifecycle.length];
        const condition = status === 'DIHAPUS' ? 'DIHAPUS' : status === 'LAYAK_GANTI' ? 'LAYAK_GANTI' : status === 'RUSAK' ? 'RUSAK_BERAT' : status === 'DALAM_PERBAIKAN' ? 'RUSAK_RINGAN' : 'BAIK';
        const asset = await p.asset.create({ data: {
          assetCode, assetName: `Perangkat ${i < 11 ? 'IT' : 'Vendor'} Demo ${status}`,
          assetType: i < 11 ? 'IT' : 'VENDOR', categoryId: categories[i % categories.length].id,
          brandId: brands[i % brands.length].id, vendorId: vendors[i % vendors.length].id,
          unitId: room.unitId, roomId: room.id, segmentId: segments[i % segments.length].id,
          responsibleUserId: admin.id, createdById: admin.id, model: `Model Demo ${i + 1}`,
          serialNumber: assetCode, qrToken: assetCode,
          qrCodeUrl: await QRCode.toDataURL(`${appEnv.NEXTAUTH_URL}/public/assets/${assetCode}`),
          purchaseDate: day(-365 * (1 + i % 7)), purchasePrice: 3500000 + i * 500000,
          invoiceNumber: `INV-${assetCode}`, warrantyStartDate: day(-365),
          warrantyEndDate: day(i % 3 === 0 ? -30 : i % 3 === 1 ? 14 : 365),
          conditionStatus: condition, lifecycleStatus: status,
          notes: 'Data dummy tambahan untuk demonstrasi. Bukan inventaris nyata.',
          lifecycleLogs: { create: { status, description: 'Simulasi siklus hidup aset demo.', createdById: admin.id } }
        } });
        await p.serviceRecord.create({ data: {
          assetId: asset.id, type: i % 2 ? 'CORRECTIVE' : 'PREVENTIVE',
          status: i % 3 === 0 ? 'TERJADWAL' : i % 3 === 1 ? 'SEDANG_DIKERJAKAN' : 'SELESAI',
          scheduledDate: day(i % 3 === 0 ? 7 : -7), completedDate: i % 3 === 2 ? day(-1) : null,
          technicianName: 'Teknisi Simulasi Demo', symptoms: 'Simulasi pemeriksaan perangkat',
          actionTaken: i % 3 === 2 ? 'Pembersihan dan pengujian fungsi selesai (dummy).' : null,
          cost: i % 3 === 2 ? 150000 : 0, notes: marker, createdById: admin.id
        } });
        await p.assetMutation.create({ data: {
          assetId: asset.id, fromUnitId: room.unitId, fromRoomId: room.id,
          toUnitId: destination.unitId, toRoomId: destination.id,
          mutationDate: now, reason: 'Simulasi permintaan pemindahan perangkat.',
          approvalStatus: i % 2 ? 'DIBATALKAN' : 'MENUNGGU', notes: marker, createdById: admin.id
        } });
        const score = 10 + (i % 10) * 10;
        const scoreStatus = score >= 80 ? 'PRIORITAS_PENGGANTIAN' : score >= 60 ? 'DIREKOMENDASIKAN_UPGRADE' : score >= 30 ? 'PERLU_DIPANTAU' : 'AMAN';
        const recommendationTypes = [score >= 80 ? 'GANTI_PERANGKAT' : score >= 60 ? 'UPGRADE_RAM' : 'PANTAU_PERANGKAT'];
        const reason = 'Simulasi dummy penilaian usia, kondisi, dan riwayat servis; bukan analisis AI nyata.';
        await p.assetReplacementRecommendation.create({ data: { assetId: asset.id, score, status: scoreStatus, recommendationTypes, reason, source: 'DEMO_SIMULATION', year: now.getFullYear() + 1 } });
        await p.aiAssetRecommendation.create({ data: {
          runId: run.id, assetId: asset.id, score, scoreStatus, recommendationTypes,
          priority: score >= 80 ? 'kritis' : score >= 60 ? 'tinggi' : score >= 30 ? 'sedang' : 'rendah',
          summary: `SIMULASI DUMMY: skor ${score}/100.`, reason,
          recommendation: score >= 80 ? 'Simulasi usulan penggantian.' : 'Simulasi pemeliharaan atau upgrade.',
          nextYearPlan: 'Contoh rencana anggaran perangkat periode berikutnya.',
          provider: 'DEMO_SIMULATION', model: 'dummy-no-inference', openModelSucceeded: false,
          details: { create: { factor: 'Faktor simulasi', scoreImpact: score, message: reason } }
        } });
      }
      await p.auditLog.create({ data: { userId: admin.id, action: marker, module: 'System', description: 'Menambahkan 22 aset dummy, servis, mutasi, dan rekomendasi simulasi tanpa mengubah data lama.' } });
    }
    for (const model of models) {
      const after = new Map((await p[model].findMany()).map(row => [row.id, hash(row)]));
      for (const [id, value] of before[model]) assert.equal(after.get(id), value, `Existing ${model} changed: ${id}`);
      console.log(`${model}: ${before[model].size} -> ${after.size}`);
    }
    assert.equal(await p.asset.count({ where: { assetCode: { startsWith: marker } } }), 22);
    console.log('PASS: all existing rows unchanged; complete demo fixtures present.');
  }, { timeout: 60000 });
} finally {
  await prisma.$disconnect();
}
