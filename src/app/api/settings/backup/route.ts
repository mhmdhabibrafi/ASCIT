import { execFile } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, hasSessionPermission } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { postgresEnvironment, postgresTool } from "@/lib/postgres-client";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "json";
  if (format === "status") {
    const probe = async (tool: "pg_dump" | "psql") => {
      try {
        await execFileAsync(postgresTool(tool), ["--version"], { timeout: 5000, windowsHide: true });
        return true;
      } catch { return false; }
    };
    const [sqlReady, psqlReady] = await Promise.all([probe("pg_dump"), probe("psql")]);
    const restoreEnabled = process.env.ALLOW_WEB_SQL_RESTORE === "true";
    return NextResponse.json({ sqlReady, restoreEnabled, restoreReady: restoreEnabled && psqlReady }, {
      headers: { "Cache-Control": "no-store" }
    });
  }
  if (!["sql", "json"].includes(format)) return NextResponse.json({ error: "Format ekspor tidak valid." }, { status: 400 });

  const dateStr = new Date().toISOString().replace(/T/, "_").replace(/\..+/, "").replace(/:/g, "-");
  
  if (format === "sql") {
    try {
      const connUrl = process.env.DATABASE_URL;
      if (!connUrl) {
        throw new Error("DATABASE_URL tidak terdefinisi di environment.");
      }

      const { stdout } = await execFileAsync(postgresTool("pg_dump"), [
        "-F", "p", "--clean", "--if-exists", "--inserts", "--no-owner", "--no-acl"
      ], {
        env: postgresEnvironment(connUrl),
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 64 * 1024 * 1024 // 64 MB max buffer
      });
      if (!stdout.trim()) throw new Error("Backup kosong.");

      return new NextResponse(stdout, {
        status: 200,
        headers: {
          "Content-Type": "application/sql",
          "Content-Disposition": `attachment; filename="ascit_backup_${dateStr}.sql"`,
          "Cache-Control": "no-store"
        }
      });
    } catch (error) {
      console.error("SQL Backup failed:", error instanceof Error ? error.name : "Unknown error");
      return NextResponse.json({ 
        error: "Gagal membuat backup SQL. Pastikan pg_dump terinstal dan dapat diakses."
      }, { status: 500 });
    }
  }

  // Fallback / default: JSON portable format
  try {
    const data = {
      backupMetadata: {
        exportedAt: new Date(),
        version: "1.1.0",
        system: "ASCIT"
      },
      roles: await prisma.role.findMany(),
      users: await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          roleId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      units: await prisma.unit.findMany(),
      rooms: await prisma.room.findMany(),
      categories: await prisma.assetCategory.findMany(),
      segments: await prisma.segment.findMany(),
      brands: await prisma.brand.findMany(),
      vendors: await prisma.vendor.findMany(),
      technicians: await prisma.technician.findMany(),
      assets: await prisma.asset.findMany(),
      serviceRecords: await prisma.serviceRecord.findMany(),
      mutations: await prisma.assetMutation.findMany(),
      auditLogs: await prisma.auditLog.findMany({ take: 500, orderBy: { createdAt: "desc" } }),
      systemSettings: await prisma.systemSetting.findMany()
    };

    const jsonStr = JSON.stringify(data, null, 2);
    return new NextResponse(jsonStr, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="ascit_backup_${dateStr}.json"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("JSON backup failed:", error);
    return NextResponse.json({
      error: "Gagal mengekspor data JSON."
    }, { status: 500 });
  }
}

export async function POST() {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SETTINGS_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: "security" } });
    let retentionDays = 365;
    if (row && row.value && typeof row.value === "object") {
      const val = row.value as any;
      if (val.auditRetentionDays) retentionDays = Number(val.auditRetentionDays);
    }

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: "PRUNE_AUDIT_LOG",
        module: "Pengaturan Sistem",
        description: `${deleted.count} log audit berumur lebih dari ${retentionDays} hari dibersihkan.`
      }
    });

    return NextResponse.json({
      success: true,
      message: `Pemeliharaan sukses. Sebanyak ${deleted.count} baris log audit yang berumur lebih dari ${retentionDays} hari telah dibersihkan.`,
      prunedCount: deleted.count,
      retentionDays
    });
  } catch (error) {
    console.error("Audit log maintenance failed:", error);
    return NextResponse.json({
      error: "Gagal melakukan pemeliharaan database."
    }, { status: 500 });
  }
}

