import { NextRequest, NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession, requestIp, validateRoomInUnit } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const include = {
  asset: true,
  fromUnit: true,
  fromRoom: true,
  toUnit: true,
  toRoom: true,
  oldResponsibleUser: { select: { id: true, name: true } },
  newResponsibleUser: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } }
};

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.MUTATION_READ)) return forbidden();

  try {
    const data = await prisma.assetMutation.findMany({
      include,
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.MUTATION_CREATE)) return forbidden();

  const body = await request.json();
  if (body.mutationDate && isNaN(new Date(body.mutationDate).getTime())) {
    return NextResponse.json({ error: "Format mutationDate tidak valid." }, { status: 400 });
  }
  
  try {
    const asset = await prisma.asset.findUnique({ where: { id: body.assetId } });
    if (!asset) return NextResponse.json({ error: "Aset tidak ditemukan." }, { status: 404 });
    if (!asset.unitId || !asset.roomId) {
      return NextResponse.json({ error: "Aset belum memiliki Unit atau Ruangan asal. Harap atur lokasi aset terlebih dahulu." }, { status: 400 });
    }
  if (!body.toUnitId || !body.toRoomId || !body.reason) {
    return NextResponse.json({ error: "Unit tujuan, ruangan tujuan, dan alasan wajib diisi." }, { status: 400 });
  }
  if (!(await validateRoomInUnit(body.toRoomId, body.toUnitId))) {
    return NextResponse.json({ error: "Ruangan tujuan tidak terdaftar pada unit tujuan." }, { status: 400 });
  }

  const fromUnitId = asset.unitId;
  const fromRoomId = asset.roomId;

  const mutation = await prisma.$transaction(async (tx) => {
    const mut = await tx.assetMutation.create({
      data: {
        assetId: asset.id,
        fromUnitId,
        fromRoomId,
        toUnitId: body.toUnitId,
        toRoomId: body.toRoomId,
        oldResponsibleUserId: asset.responsibleUserId,
        newResponsibleUserId: body.newResponsibleUserId || undefined,
        mutationDate: body.mutationDate ? new Date(body.mutationDate) : new Date(),
        reason: body.reason,
        approvalStatus: "DISETUJUI",
        approvedById: session.user.id,
        approvedAt: new Date(),
        createdById: session.user.id,
        notes: body.notes || undefined
      },
      include
    });

    await tx.asset.update({
      where: { id: asset.id },
      data: {
        unitId: body.toUnitId,
        roomId: body.toRoomId,
        responsibleUserId: body.newResponsibleUserId || asset.responsibleUserId,
        lifecycleStatus: "DIPINDAHKAN",
        lifecycleLogs: {
          create: {
            status: "DIPINDAHKAN",
            description: `Mutasi: ${body.reason}`,
            createdById: session.user.id
          }
        }
      }
    });

    return mut;
  });

  await createAuditLog({
    session,
    action: "CREATE_MUTATION",
    module: "Mutasi Aset",
    description: `Mutasi ${asset.assetCode} dicatat secara langsung.`,
    ipAddress: requestIp(request)
  });

    return NextResponse.json({ data: mutation }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
