import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { requestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { forbidden, hasSessionPermission, requireSession, requestIp, validateRoomInUnit } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { masterDataCache } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const assetSchema = z.object({
  assetCode: z.string().optional().nullable(),
  assetName: z.string().min(2),
  assetType: z.enum(["IT", "VENDOR"]).default("IT"),
  categoryId: z.string().optional().nullable(),
  segmentId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  vendorId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  responsibleUserId: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  ipAddress: z.string().optional().nullable(),
  macAddress: z.string().optional().nullable(),
  operatingSystem: z.string().optional().nullable(),
  processor: z.string().optional().nullable(),
  ram: z.string().optional().nullable(),
  storage: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  purchasePrice: z.coerce.number().optional().default(0),
  invoiceNumber: z.string().optional().nullable(),
  warrantyStartDate: z.string().optional().nullable(),
  warrantyEndDate: z.string().optional().nullable(),
  conditionStatus: z.string().default("BAIK"),
  lifecycleStatus: z.string().default("AKTIF"),
  photoUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const assetListSelect = {
  id: true,
  assetCode: true,
  assetName: true,
  assetType: true,
  categoryId: true,
  segmentId: true,
  brandId: true,
  vendorId: true,
  unitId: true,
  roomId: true,
  responsibleUserId: true,
  model: true,
  serialNumber: true,
  ipAddress: true,
  macAddress: true,
  operatingSystem: true,
  processor: true,
  ram: true,
  storage: true,
  purchaseDate: true,
  purchasePrice: true,
  invoiceNumber: true,
  warrantyStartDate: true,
  warrantyEndDate: true,
  conditionStatus: true,
  lifecycleStatus: true,
  qrToken: true,
  photoUrl: true,
  notes: true,
  category: {
    select: { id: true, name: true, code: true }
  },
  segment: {
    select: { id: true, name: true }
  },
  brand: {
    select: { id: true, name: true }
  },
  vendor: {
    select: { id: true, name: true }
  },
  unit: {
    select: { id: true, name: true, code: true }
  },
  room: {
    select: { id: true, name: true, code: true, unitId: true }
  },
  responsibleUser: {
    select: { id: true, name: true, email: true }
  }
} as const;



export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search")?.trim();
  const categoryId = searchParams.get("categoryId") || undefined;
  const unitId = searchParams.get("unitId") || undefined;
  const roomId = searchParams.get("roomId") || undefined;
  const segmentId = searchParams.get("segmentId") || undefined;
  const conditionStatus = searchParams.get("conditionStatus") || undefined;
  const lifecycleStatus = searchParams.get("lifecycleStatus") || undefined;
  const assetTypeParam = searchParams.get("assetType");
  const hasIp = searchParams.get("hasIp") === "true";
  const requestedPage = Math.max(1, Number(searchParams.get("page") || 1));
  const requestedLimit = Number(searchParams.get("limit") || 0);
  const pageLimit = requestedLimit > 0 ? Math.min(Math.max(1, requestedLimit), 200) : null;

  let assetTypeFilter: "IT" | "VENDOR" | undefined;
  if (assetTypeParam === "VENDOR") {
    assetTypeFilter = "VENDOR";
  } else if (assetTypeParam === "ALL") {
    assetTypeFilter = undefined;
  } else {
    assetTypeFilter = "IT";
  }

  try {
    // Filter segmen di seluruh daftar aset mengikuti subnet IP yang juga dipakai
    // Monitoring IP: "SEGMEN N" berarti 192.168.N.1-254. Ini membuat aset IT
    // dan vendor tetap sinkron meskipun segmentId lama belum diisi dengan benar.
    let segmentIpPrefix: string | undefined;
    if (segmentId) {
      const selectedSegment = await prisma.segment.findUnique({
        where: { id: segmentId },
        select: { name: true }
      });
      const segmentOctet = selectedSegment?.name.match(/\d+/)?.[0];
      if (segmentOctet) segmentIpPrefix = `192.168.${Number(segmentOctet)}.`;
    }

    const where: Prisma.AssetWhereInput = {
        deletedAt: null,
        ...(hasIp ? { ipAddress: { not: null, notIn: ["", "-"] } } : {}),
        ...(assetTypeFilter ? { assetType: assetTypeFilter as never } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(unitId ? { unitId } : {}),
        ...(roomId ? { roomId } : {}),
        ...(segmentId
          ? segmentIpPrefix
            ? { ipAddress: { startsWith: segmentIpPrefix } }
            : { segmentId }
          : {}),
        ...(conditionStatus ? { conditionStatus: conditionStatus as never } : {}),
        ...(lifecycleStatus ? { lifecycleStatus: lifecycleStatus as never } : {}),
        ...(search
          ? {
              OR: [
                { assetCode: { contains: search, mode: "insensitive" } },
                { assetName: { contains: search, mode: "insensitive" } },
                { serialNumber: { contains: search, mode: "insensitive" } },
                { ipAddress: { contains: search, mode: "insensitive" } },
                { macAddress: { contains: search, mode: "insensitive" } },
                { qrToken: { contains: search, mode: "insensitive" } },
                { unit: { name: { contains: search, mode: "insensitive" } } },
                { room: { name: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {})
      };
    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
      where,
      select: assetListSelect,
      orderBy: { assetCode: "asc" },
      ...(pageLimit ? { skip: (requestedPage - 1) * pageLimit, take: pageLimit } : {})
    }),
      pageLimit ? prisma.asset.count({ where }) : Promise.resolve(0)
    ]);

    return NextResponse.json({
      data: assets,
      ...(pageLimit ? { pagination: { page: requestedPage, limit: pageLimit, total, totalPages: Math.ceil(total / pageLimit) } } : {})
    });
  } catch (error) {
    console.error("Gagal memuat daftar aset:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_CREATE)) return forbidden();

  const parsed = assetSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Data aset belum valid", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const assetType = data.assetType || "IT";
  
  if (data.roomId && data.unitId) {
    if (!(await validateRoomInUnit(data.roomId, data.unitId))) {
      return NextResponse.json({ error: "Ruangan tidak terdaftar pada unit yang dipilih." }, { status: 400 });
    }
  }
  
  if (data.purchaseDate && isNaN(new Date(data.purchaseDate).getTime())) {
    return NextResponse.json({ error: "Format purchaseDate tidak valid." }, { status: 400 });
  }

  let formattedIp: string | null = data.ipAddress ? data.ipAddress.trim() : null;
  if (!formattedIp || formattedIp === "-" || formattedIp.toLowerCase() === "dhcp") {
    formattedIp = null;
  }

  if (formattedIp) {
    const existingIpAsset = await prisma.asset.findFirst({
      where: {
        ipAddress: formattedIp,
        deletedAt: null
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

  const categoryId = data.categoryId || undefined;
  const brandId = data.brandId || undefined;
  const vendorId = data.vendorId || undefined;
  const unitId = data.unitId || undefined;
  const roomId = data.roomId || undefined;
  let assetCode = data.assetCode?.trim();
  if (!assetCode) {
    let initials = data.assetName.trim().split(/\s+/).map((w: string) => w[0].toUpperCase()).join("").slice(0, 3);
    if (!initials) initials = "AST";
    const year = new Date().getFullYear();
    let random = Math.floor(1000 + Math.random() * 9000);
    const codePrefix = assetType === "VENDOR" ? "VND" : "IT";
    assetCode = `${codePrefix}-${initials}-${year}-${random}`;
    
    // Attempt to ensure uniqueness (basic)
    let existing = await prisma.asset.findUnique({ where: { assetCode } });
    while (existing) {
      random = Math.floor(1000 + Math.random() * 9000);
      assetCode = `${codePrefix}-${initials}-${year}-${random}`;
      existing = await prisma.asset.findUnique({ where: { assetCode } });
    }
  }

  const qrToken = `ASCIT-${assetCode}`;
  const qrCodeUrl = await QRCode.toDataURL(`${requestOrigin(request)}/public/assets/${encodeURIComponent(qrToken)}`, { width: 600, margin: 1, errorCorrectionLevel: "H" });

  try {
    const asset = await prisma.asset.create({
      data: {
        assetCode,
        assetName: data.assetName,
        assetType: assetType as never,
        categoryId,
        segmentId: data.segmentId || undefined,
        brandId,
        vendorId,
        unitId,
        roomId,
        responsibleUserId: data.responsibleUserId || undefined,
        model: data.model || undefined,
        serialNumber: data.serialNumber || undefined,
        ipAddress: formattedIp,
        macAddress: data.macAddress || undefined,
        operatingSystem: data.operatingSystem || undefined,
        processor: data.processor || undefined,
        ram: data.ram || undefined,
        storage: data.storage || undefined,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        purchasePrice: data.purchasePrice,
        invoiceNumber: data.invoiceNumber || undefined,
        warrantyStartDate: data.warrantyStartDate ? new Date(data.warrantyStartDate) : undefined,
        warrantyEndDate: data.warrantyEndDate ? new Date(data.warrantyEndDate) : undefined,
        conditionStatus: data.conditionStatus as never,
        lifecycleStatus: data.lifecycleStatus as never,
        qrToken,
        qrCodeUrl,
        photoUrl: data.photoUrl || undefined,
        notes: data.notes || undefined,
        createdById: session.user.id,
        lifecycleLogs: {
          create: {
            status: data.lifecycleStatus as never,
            description: "Aset dibuat melalui form ASCIT.",
            createdById: session.user.id
          }
        }
      },
      select: assetListSelect
    });

    await createAuditLog({
      session,
      action: "CREATE_ASSET",
      module: assetType === "VENDOR" ? "Data Asset Vendor" : "Data Aset IT",
      description: `${asset.assetCode} - ${asset.assetName} dibuat.`,
      ipAddress: requestIp(request)
    });

    masterDataCache.invalidateAll();

    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal membuat aset." },
      { status: 400 }
    );
  }
}
