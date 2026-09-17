import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { forbidden, hasSessionPermission, requireSession, requestIp } from "@/lib/api";
import { normalizePermissions, PERMISSION_GROUPS, Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import { ensureDefaultMasterData } from "@/lib/master-data-service";
import { prisma } from "@/lib/prisma";


export const dynamic = "force-dynamic";

const modelMap = {
  units: prisma.unit,
  rooms: prisma.room,
  categories: prisma.assetCategory,
  segments: prisma.segment,
  brands: prisma.brand,
  vendors: prisma.vendor,
  technicians: prisma.technician,
  operatingSystems: prisma.operatingSystem
} as const;

const activeUserSelect = {
  id: true,
  email: true,
  name: true,
  roleId: true,
  role: true,
  isActive: true
} as const;

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;

  try {
    const [roles, users, units, rooms, categories, segments, brands, vendors, technicians, operatingSystems] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } }),
      prisma.user.findMany({ where: { isActive: true }, select: activeUserSelect, orderBy: { name: "asc" } }),
      prisma.unit.findMany({ include: { _count: { select: { rooms: true, assets: true } } }, orderBy: { name: "asc" } }),
      prisma.room.findMany({ include: { unit: true, _count: { select: { assets: true } } }, orderBy: { name: "asc" } }),
      prisma.assetCategory.findMany({ include: { _count: { select: { assets: true } } }, orderBy: { name: "asc" } }),
      prisma.segment.findMany({ include: { _count: { select: { assets: true } } }, orderBy: { name: "asc" } }),
      prisma.brand.findMany({ include: { _count: { select: { assets: true } } }, orderBy: { name: "asc" } }),
      prisma.vendor.findMany({ include: { _count: { select: { assets: true } } }, orderBy: { name: "asc" } }),
      prisma.technician.findMany({ orderBy: { name: "asc" } }),
      prisma.operatingSystem.findMany({ orderBy: { name: "asc" } })
    ]);

    return NextResponse.json({
      roles: roles.map((role) => ({ ...role, permissions: normalizePermissions(role.permissions, role.name) })),
      permissionGroups: PERMISSION_GROUPS,
      users,
      units,
      rooms,
      categories,
      segments,
      brands,
      vendors,
      technicians,
      operatingSystems,

      conditions: ["BAIK", "DIHAPUS", "LAYAK_GANTI", "RUSAK_BERAT", "RUSAK_RINGAN"],
      lifecycleStatuses: [
        "AKTIF",
        "DALAM_PERBAIKAN",
        "DIHAPUS",
        "DIPINDAHKAN",
        "DIPINJAM",
        "INSTALASI",
        "LAYAK_GANTI",
        "MAINTENANCE",
        "PENERIMAAN",
        "PENGADAAN",
        "RUSAK"
      ],
      mutationStatuses: ["DIBATALKAN", "DISETUJUI", "DITOLAK", "MENUNGGU"]
    });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  const body = await request.json();
  if (body.type === "roles") {
    if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();
    const name = normalizeRoleName(body.name);
    if (!name) return NextResponse.json({ error: "Nama role wajib diisi dan minimal 2 karakter." }, { status: 400 });
    const permissions = normalizePermissions([...(Array.isArray(body.permissions) ? body.permissions : []), Permission.VISIBILITY_CONFIGURED]);
    try {
      const role = await prisma.role.create({
        data: { name, description: cleanText(body.description), permissions },
        include: { _count: { select: { users: true } } }
      });
      await createAuditLog({ session, action: "CREATE_ROLE", module: "Hak Akses", description: `Role ${role.name} dibuat dengan ${permissions.length} izin.`, ipAddress: requestIp(request) });
      return NextResponse.json({ data: { ...role, permissions } }, { status: 201 });
    } catch (error) {
      return errorResponse(error, "Nama role tersebut sudah digunakan.");
    }
  }
  if (!hasSessionPermission(session, Permission.MASTER_DATA_CREATE)) return forbidden();
  if (body.action === "ensureDefaults") {
    const summary = await ensureDefaultMasterData();
    await createAuditLog({
      session,
      action: "ENSURE_MASTER_DATA",
      module: "Master Data",
      description: "Referensi master data standar ASCIT dilengkapi.",
      ipAddress: requestIp(request)
    });
    return NextResponse.json({ data: summary });
  }

  const type = body.type as keyof typeof modelMap;
  if (!modelMap[type]) return NextResponse.json({ error: "Tipe master data tidak valid." }, { status: 400 });

  try {
    const data = buildPayload(type, body);
    const item = await (modelMap[type] as never as { create(args: { data: Record<string, unknown> }): Promise<unknown> }).create({ data });
    await createAuditLog({
      session,
      action: "CREATE_MASTER_DATA",
      module: "Master Data",
      description: `${type} ditambahkan: ${body.name}.`,
      ipAddress: requestIp(request)
    });
    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  const body = await request.json();
  if (body.type === "roles") {
    if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();
    if (!body.id) return NextResponse.json({ error: "ID role wajib diisi." }, { status: 400 });
    const currentRole = await prisma.role.findUnique({ where: { id: body.id }, select: { name: true } });
    if (!currentRole) return NextResponse.json({ error: "Role tidak ditemukan." }, { status: 404 });
    if (currentRole.name === "SUPER_ADMIN") {
      return NextResponse.json({ error: "Hak akses Super Admin dikunci untuk mencegah sistem kehilangan administrator." }, { status: 400 });
    }
    const permissions = normalizePermissions([...(Array.isArray(body.permissions) ? body.permissions : []), Permission.VISIBILITY_CONFIGURED]);
    const name = body.name === undefined ? currentRole.name : normalizeRoleName(body.name);
    if (!name) return NextResponse.json({ error: "Nama role wajib diisi dan minimal 2 karakter." }, { status: 400 });
    const role = await prisma.role.update({ where: { id: body.id }, data: { name, description: cleanText(body.description), permissions } });
    await createAuditLog({ session, action: "UPDATE_ROLE_PERMISSIONS", module: "Hak Akses", description: `Hak akses role ${role.name} diperbarui (${permissions.length} izin).`, ipAddress: requestIp(request) });
    return NextResponse.json({ data: { ...role, permissions } });
  }
  if (!hasSessionPermission(session, Permission.MASTER_DATA_UPDATE)) return forbidden();
  const type = body.type as keyof typeof modelMap;
  if (!modelMap[type]) return NextResponse.json({ error: "Tipe master data tidak valid." }, { status: 400 });
  if (!body.id) return NextResponse.json({ error: "ID master data wajib diisi." }, { status: 400 });

  try {
    const data = buildPayload(type, body);
    const item = await (
      modelMap[type] as never as { update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown> }
    ).update({ where: { id: body.id }, data });

    await createAuditLog({
      session,
      action: "UPDATE_MASTER_DATA",
      module: "Master Data",
      description: `${type} diperbarui: ${body.name}.`,
      ipAddress: requestIp(request)
    });

    return NextResponse.json({ data: item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.MASTER_DATA_DELETE)) return forbidden();

  const body = await request.json();
  if (body.type === "roles") {
    if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();
    if (!body.id) return NextResponse.json({ error: "ID role wajib diisi." }, { status: 400 });
    const role = await prisma.role.findUnique({ where: { id: body.id }, include: { _count: { select: { users: true } } } });
    if (!role) return NextResponse.json({ error: "Role tidak ditemukan." }, { status: 404 });
    if (role.name === "SUPER_ADMIN") return NextResponse.json({ error: "Role Super Admin tidak dapat dihapus." }, { status: 400 });
    if (role._count.users > 0) return NextResponse.json({ error: `Role masih digunakan oleh ${role._count.users} pengguna. Pindahkan role pengguna terlebih dahulu.` }, { status: 400 });
    await prisma.role.delete({ where: { id: role.id } });
    await createAuditLog({ session, action: "DELETE_ROLE", module: "Hak Akses", description: `Role ${role.name} dihapus.`, ipAddress: requestIp(request) });
    return NextResponse.json({ success: true });
  }
  const type = body.type as keyof typeof modelMap;
  if (!modelMap[type]) return NextResponse.json({ error: "Tipe master data tidak valid." }, { status: 400 });
  if (!body.id) return NextResponse.json({ error: "ID master data wajib diisi." }, { status: 400 });

  try {
    await (modelMap[type] as never as { delete(args: { where: { id: string } }): Promise<unknown> }).delete({ where: { id: body.id } });
    await createAuditLog({
      session,
      action: "DELETE_MASTER_DATA",
      module: "Master Data",
      description: `${type} dihapus: ${body.name || body.id}.`,
      ipAddress: requestIp(request)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeRoleName(value: unknown) {
  const name = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return name.length >= 2 ? name.slice(0, 50) : null;
}

function autoCode(value: unknown) {
  const name = String(value || "").trim();
  const base = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 6)
    .toUpperCase() || "REF";
  return `${base}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function normalizeCode(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
}

function buildPayload(type: keyof typeof modelMap, body: Record<string, unknown>) {
  const name = cleanText(body.name);
  if (!name) throw new Error("Nama wajib diisi.");

  if (type === "rooms") {
    const unitId = cleanText(body.unitId);
    if (!unitId) throw new Error("Unit wajib dipilih.");
    return {
      name,
      code: normalizeCode(body.code) || autoCode(name),
      unitId,
      description: cleanText(body.description)
    };
  }

  if (type === "vendors") {
    return {
      name,
      contact: cleanText(body.contact),
      phone: cleanText(body.phone),
      email: cleanText(body.email),
      address: cleanText(body.address)
    };
  }

  if (type === "technicians") {
    return {
      name,
      phone: cleanText(body.phone),
      specialty: cleanText(body.specialty),
      isActive: body.isActive === undefined ? true : Boolean(body.isActive)
    };
  }

  if (type === "brands" || type === "operatingSystems") {
    return {
      name,
      description: cleanText(body.description)
    };
  }

  return {
    name,
    code: normalizeCode(body.code) || autoCode(name),
    description: cleanText(body.description)
  };
}

function errorResponse(error: unknown, duplicateMessage = "Data dengan nama atau kode tersebut sudah ada.") {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: duplicateMessage }, { status: 400 });
    }
    if (error.code === "P2003") {

      return NextResponse.json({ error: "Data masih dipakai oleh modul lain." }, { status: 400 });
    }
    if (error.code === "P2025") {
      return NextResponse.json({ error: "Data tidak ditemukan." }, { status: 404 });
    }
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message || "Gagal menyimpan master data." },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: "Gagal menyimpan master data." }, { status: 400 });
}
