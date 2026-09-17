import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { requestOrigin } from "@/lib/request-origin";
import { forbidden, hasSessionPermission, requireSession, requestIp, validateRoomInUnit } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { masterDataCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";


const include = {
  category: true,
  segment: true,
  brand: true,
  vendor: true,
  unit: true,
  room: true,
  responsibleUser: {
    select: { id: true, name: true, email: true }
  },
  lifecycleLogs: {
    orderBy: { createdAt: "desc" as const }
  },
  mutations: {
    include: { fromUnit: true, fromRoom: true, toUnit: true, toRoom: true },
    orderBy: { createdAt: "desc" as const }
  },
  serviceRecords: {
    orderBy: { createdAt: "desc" as const }
  },

  aiRecommendations: {
    include: { details: true, run: true },
    orderBy: { createdAt: "desc" as const }
  }
};

async function resolveAsset(id: string) {
  return prisma.asset.findFirst({
    where: {
      deletedAt: null,
      OR: [{ id }, { assetCode: id }, { qrToken: id }]
    },
    include
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  const { id } = await context.params;
  try {
    const asset = await resolveAsset(decodeURIComponent(id));
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });
    const publicUrl = `${requestOrigin(request)}/public/assets/${encodeURIComponent(asset.qrToken)}`;
    return NextResponse.json({ data: { ...asset, qrCodeUrl: await QRCode.toDataURL(publicUrl, { width: 600, margin: 1, errorCorrectionLevel: "H" }) } });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_UPDATE)) return forbidden();

  const { id } = await context.params;
  const current = await resolveAsset(decodeURIComponent(id));
  if (!current) return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });

  const body = await request.json();
  
  if (body.purchaseDate && isNaN(new Date(body.purchaseDate).getTime())) {
    return NextResponse.json({ error: "Format purchaseDate tidak valid." }, { status: 400 });
  }
  if (body.purchasePrice !== undefined && body.purchasePrice !== "" && isNaN(Number(body.purchasePrice))) {
    return NextResponse.json({ error: "Format purchasePrice tidak valid." }, { status: 400 });
  }

  const nextUnitId = Object.prototype.hasOwnProperty.call(body, "unitId") ? (body.unitId || null) : current.unitId;
  const nextRoomId = Object.prototype.hasOwnProperty.call(body, "roomId") ? (body.roomId || null) : current.roomId;
  if (nextRoomId && nextUnitId) {
    if (!(await validateRoomInUnit(nextRoomId, nextUnitId))) {
      return NextResponse.json({ error: "Ruangan tidak terdaftar pada unit yang dipilih." }, { status: 400 });
    }
  }

  const rawIpProp = Object.prototype.hasOwnProperty.call(body, "ipAddress") ? body.ipAddress : current.ipAddress;
  let formattedIp: string | null = typeof rawIpProp === "string" ? rawIpProp.trim() : null;
  if (!formattedIp || formattedIp === "-" || formattedIp.toLowerCase() === "dhcp") {
    formattedIp = null;
  }

  if (formattedIp) {
    const existingIpAsset = await prisma.asset.findFirst({
      where: {
        ipAddress: formattedIp,
        deletedAt: null,
        id: { not: current.id }
      },
      select: {
        assetCode: true,
        assetName: true
      }
    });

    if (existingIpAsset) {
      return NextResponse.json(
        { error: `IP Address ${formattedIp} sudah digunakan oleh aset ${existingIpAsset.assetCode} (${existingIpAsset.assetName}).` },
        { status: 400 }
      );
    }
  }

  const assetCode = body.assetCode || current.assetCode;
  const purchaseDate = Object.prototype.hasOwnProperty.call(body, "purchaseDate")
    ? body.purchaseDate
      ? new Date(body.purchaseDate)
      : null
    : current.purchaseDate;
  const shouldRegenerateQr = assetCode !== current.assetCode;
  const qrToken = shouldRegenerateQr ? `ASCIT-${assetCode}` : current.qrToken;
  const qrCodeUrl = shouldRegenerateQr
    ? await QRCode.toDataURL(`${requestOrigin(request)}/public/assets/${encodeURIComponent(qrToken)}`, { width: 600, margin: 1, errorCorrectionLevel: "H" })
    : current.qrCodeUrl;

  // ponytail: helper — if key is in body, use body value (even null/""); otherwise keep current
  const pick = (key: string, fallback: unknown) =>
    Object.prototype.hasOwnProperty.call(body, key) ? (body[key] || null) : fallback;

  try {
    const asset = await prisma.asset.update({
      where: { id: current.id },
      data: {
        assetCode,
        assetName: body.assetName || current.assetName,
        categoryId: pick("categoryId", current.categoryId),
        segmentId: pick("segmentId", current.segmentId),
        brandId: pick("brandId", current.brandId),
        vendorId: pick("vendorId", current.vendorId),
        unitId: nextUnitId,
        roomId: nextRoomId,
        responsibleUserId: pick("responsibleUserId", current.responsibleUserId),
        model: pick("model", current.model),
        serialNumber: pick("serialNumber", current.serialNumber),
        ipAddress: formattedIp,
        macAddress: pick("macAddress", current.macAddress),
        operatingSystem: pick("operatingSystem", current.operatingSystem),
        processor: pick("processor", current.processor),
        ram: pick("ram", current.ram),
        storage: pick("storage", current.storage),
        purchaseDate,
        purchasePrice: body.purchasePrice === "" ? undefined : Number(body.purchasePrice ?? current.purchasePrice),
        invoiceNumber: pick("invoiceNumber", current.invoiceNumber),
        warrantyStartDate: Object.prototype.hasOwnProperty.call(body, "warrantyStartDate")
          ? body.warrantyStartDate ? new Date(body.warrantyStartDate) : null
          : current.warrantyStartDate,
        warrantyEndDate: Object.prototype.hasOwnProperty.call(body, "warrantyEndDate")
          ? body.warrantyEndDate ? new Date(body.warrantyEndDate) : null
          : current.warrantyEndDate,
        conditionStatus: body.conditionStatus || current.conditionStatus,
        lifecycleStatus: body.lifecycleStatus || current.lifecycleStatus,
        qrToken,
        qrCodeUrl,
        photoUrl: pick("photoUrl", current.photoUrl),
        notes: pick("notes", current.notes),
        lifecycleLogs: {
          create: {
            status: body.lifecycleStatus || current.lifecycleStatus,
            description: "Aset diperbarui melalui form ASCIT.",
            createdById: session.user.id
          }
        }
      },
      include
    });

    await createAuditLog({
      session,
      action: "UPDATE_ASSET",
      module: "Data Aset IT",
      description: `${asset.assetCode} - ${asset.assetName} diperbarui.`,
      ipAddress: requestIp(request)
    });

    masterDataCache.invalidateAll();

    return NextResponse.json({ data: asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal memperbarui aset." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_DELETE)) return forbidden();

  try {
    const { id } = await context.params;
    const current = await resolveAsset(decodeURIComponent(id));
    if (!current) return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });

  const asset = await prisma.asset.update({
    where: { id: current.id },
    data: {
      deletedAt: new Date(),
      conditionStatus: "DIHAPUS",
      lifecycleStatus: "DIHAPUS",
      lifecycleLogs: {
        create: {
          status: "DIHAPUS",
          description: "Aset dihapus secara soft delete.",
          createdById: session.user.id
        }
      }
    }
  });

  await createAuditLog({
    session,
    action: "DELETE_ASSET",
    module: "Data Aset IT",
    description: `${asset.assetCode} - ${asset.assetName} dihapus soft delete.`,
    ipAddress: requestIp(request)
  });

    masterDataCache.invalidateAll();

    return NextResponse.json({ data: asset });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
