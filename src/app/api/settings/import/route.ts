import { NextRequest, NextResponse } from "next/server";
import { hasSessionPermission, requireSession, requestIp } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { Permission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "File impor maksimal 15 MB." }, { status: 413 });
  }

  try {
    const body = await request.json();
    const backup = body.backup;
    validateBackup(backup);
    const summary = summarize(backup);
    if (body.preview === true) return NextResponse.json({ data: summary });

    await prisma.$transaction(async (tx) => {
      const availableAssetIds = new Set<string>();
      const unitIds = new Map<string, string>();
      const categoryIds = new Map<string, string>();
      const segmentIds = new Map<string, string>();
      const brandIds = new Map<string, string>();
      const vendorIds = new Map<string, string>();
      const roomIds = new Map<string, string>();
      for (const row of rows(backup.roles)) {
        const data = pick(row, ["name", "description", "permissions"]);
        const name = String(row.name || "").trim();
        if (!name) throw new Error("Terdapat role tanpa nama yang valid.");
        // Role.name adalah unique dan ID backup bisa berasal dari database lain.
        // Cari berdasarkan nama agar impor tidak bentrok dengan role bawaan lokal.
        await tx.role.upsert({ where: { name }, create: { id: id(row), name, ...data } as never, update: data as never });
      }
      for (const row of rows(backup.units)) {
        const data = pick(row, ["name", "code", "description"]);
        const record = await tx.unit.upsert({ where: { name: String(row.name).trim() }, create: { id: id(row), ...data } as never, update: data as never });
        unitIds.set(id(row), record.id);
      }
      for (const row of rows(backup.categories)) {
        const data = pick(row, ["name", "code", "description"]);
        const record = await tx.assetCategory.upsert({ where: { name: String(row.name).trim() }, create: { id: id(row), ...data } as never, update: data as never });
        categoryIds.set(id(row), record.id);
      }
      for (const row of rows(backup.segments)) {
        const data = pick(row, ["name", "code", "description"]);
        const record = await tx.segment.upsert({ where: { name: String(row.name).trim() }, create: { id: id(row), ...data } as never, update: data as never });
        segmentIds.set(id(row), record.id);
      }
      for (const row of rows(backup.brands)) {
        const data = pick(row, ["name", "description"]);
        const record = await tx.brand.upsert({ where: { name: String(row.name).trim() }, create: { id: id(row), ...data } as never, update: data as never });
        brandIds.set(id(row), record.id);
      }
      for (const row of rows(backup.vendors)) {
        const data = pick(row, ["name", "contact", "phone", "email", "address"]);
        const record = await tx.vendor.upsert({ where: { name: String(row.name).trim() }, create: { id: id(row), ...data } as never, update: data as never });
        vendorIds.set(id(row), record.id);
      }
      for (const row of rows(backup.technicians)) {
        const data = pick(row, ["name", "phone", "specialty", "isActive"]);
        await tx.technician.upsert({ where: { id: id(row) }, create: { id: id(row), ...data } as never, update: data as never });
      }
      for (const row of rows(backup.rooms)) {
        const data = pick(row, ["name", "code", "unitId", "description"]);
        data.unitId = unitIds.get(String(row.unitId)) || row.unitId;
        const record = await tx.room.upsert({ where: { unitId_name: { unitId: String(data.unitId), name: String(row.name).trim() } }, create: { id: id(row), ...data } as never, update: data as never });
        roomIds.set(id(row), record.id);
      }
      for (const row of rows(backup.systemSettings)) {
        const data = pick(row, ["key", "value", "description"]);
        await tx.systemSetting.upsert({ where: { key: String(row.key) }, create: data as never, update: pick(row, ["value", "description"]) as never });
      }
      for (const row of rows(backup.assets)) {
        const data = pick(row, [
          "assetCode", "assetName", "categoryId", "brandId", "vendorId", "unitId", "roomId", "segmentId", "responsibleUserId",
          "model", "serialNumber", "ipAddress", "macAddress", "operatingSystem", "processor", "ram", "storage", "purchasePrice",
          "invoiceNumber", "conditionStatus", "lifecycleStatus", "qrToken", "qrCodeUrl", "photoUrl", "notes", "createdById"
        ]);
        data.categoryId = row.categoryId ? (categoryIds.get(String(row.categoryId)) || String(row.categoryId)) : null;
        data.brandId = row.brandId ? (brandIds.get(String(row.brandId)) || String(row.brandId)) : null;
        data.vendorId = row.vendorId ? (vendorIds.get(String(row.vendorId)) || String(row.vendorId)) : null;
        data.unitId = row.unitId ? (unitIds.get(String(row.unitId)) || String(row.unitId)) : null;
        data.roomId = row.roomId ? (roomIds.get(String(row.roomId)) || String(row.roomId)) : null;
        if (data.segmentId) data.segmentId = segmentIds.get(String(data.segmentId)) || null;
        // User backup tidak diimpor (demi keamanan credential), jadi relasi
        // user opsional tidak boleh membawa ID yang tidak ada di database lokal.
        data.responsibleUserId = null;
        data.createdById = null;
        for (const field of ["purchaseDate", "warrantyStartDate", "warrantyEndDate", "deletedAt"]) {
          data[field] = optionalDate(row[field]);
        }
        await tx.asset.upsert({ where: { id: id(row) }, create: { id: id(row), ...data } as never, update: data as never });
        availableAssetIds.add(id(row));
      }
      for (const row of rows(backup.serviceRecords)) {
        if (!availableAssetIds.has(String(row.assetId))) continue;
        const data = pick(row, ["assetId", "type", "status", "technicianName", "symptoms", "actionTaken", "replacedComponents", "checklist", "cost", "notes", "createdById"]);
        data.createdById = null;
        data.scheduledDate = optionalDate(row.scheduledDate);
        data.completedDate = optionalDate(row.completedDate);
        await tx.serviceRecord.upsert({ where: { id: id(row) }, create: { id: id(row), ...data } as never, update: data as never });
      }
      for (const row of rows(backup.mutations)) {
        if (!availableAssetIds.has(String(row.assetId))) continue;
        const data = pick(row, ["assetId", "fromUnitId", "fromRoomId", "toUnitId", "toRoomId", "oldResponsibleUserId", "newResponsibleUserId", "reason", "approvalStatus", "approvedById", "notes", "createdById"]);
        data.mutationDate = requiredDate(row.mutationDate, "Tanggal mutasi");
        data.approvedAt = optionalDate(row.approvedAt);
        data.oldResponsibleUserId = null;
        data.newResponsibleUserId = null;
        data.approvedById = null;
        data.createdById = null;
        await tx.assetMutation.upsert({ where: { id: id(row) }, create: { id: id(row), ...data } as never, update: data as never });
      }
    }, { timeout: 30_000 });

    await createAuditLog({ session, action: "IMPORT_PORTABLE_DATA", module: "Pengaturan", description: `Impor JSON selesai: ${summary.total} data diproses.`, ipAddress: requestIp(request) });
    return NextResponse.json({ success: true, data: summary, message: `${summary.total} data berhasil diproses tanpa menimpa password pengguna.` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impor data gagal dan seluruh perubahan dibatalkan." }, { status: 400 });
  }
}

function validateBackup(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Format JSON backup tidak valid.");
  const data = value as Record<string, unknown>;
  const requiredCollections = ["roles", "units", "rooms", "brands", "vendors", "technicians", "assets", "serviceRecords", "mutations", "systemSettings"];
  if (!data.backupMetadata || requiredCollections.some((key) => !Array.isArray(data[key]))) {
    throw new Error("Backup portable tidak valid atau tidak memiliki koleksi data utama yang diperlukan.");
  }
}

function summarize(backup: Record<string, unknown>) {
  const keys = ["roles", "units", "rooms", "categories", "segments", "brands", "vendors", "technicians", "assets", "serviceRecords", "mutations", "systemSettings"];
  const counts = Object.fromEntries(keys.map((key) => [key, rows(backup[key]).length]));
  return { counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), skippedUsers: rows(backup.users).length };
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row))) : [];
}

function id(row: Record<string, unknown>) {
  const value = String(row.id || "").trim();
  if (!value) throw new Error("Terdapat data tanpa ID yang valid.");
  return value;
}

function pick(row: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(fields.filter((field) => row[field] !== undefined).map((field) => [field, sanitizeValue(row[field])]));
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Backup lama dapat memuat lone-surrogate/NUL yang ditolak PostgreSQL UTF-8.
    return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uD800-\uDFFF]/g, "�");
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item)]));
  return value;
}

function optionalDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`Tanggal impor tidak valid: ${String(value)}`);
  return date;
}

function requiredDate(value: unknown, label: string) {
  const date = optionalDate(value);
  if (!date) throw new Error(`${label} wajib tersedia dalam backup.`);
  return date;
}
