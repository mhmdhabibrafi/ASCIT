import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { postgresEnvironment, postgresTool } from "@/lib/postgres-client";

export const dynamic = "force-dynamic";
const MAX_SQL_BYTES = 128 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (process.env.ALLOW_WEB_SQL_RESTORE !== "true") {
    return NextResponse.json({ error: "Restore SQL melalui web dinonaktifkan pada server ini." }, { status: 403 });
  }
  if (request.headers.get("x-ascit-confirm") !== "RESTORE-SQL-BACKUP") {
    return NextResponse.json({ error: "Konfirmasi restore tidak valid." }, { status: 400 });
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".sql")) return NextResponse.json({ error: "Pilih file backup SQL." }, { status: 400 });
  if (file.size > MAX_SQL_BYTES) return NextResponse.json({ error: "File SQL maksimal 128 MB." }, { status: 413 });

  const dir = await mkdtemp(path.join(tmpdir(), "ascit-sql-"));
  const sqlPath = path.join(dir, "backup.sql");
  try {
    await writeFile(sqlPath, Buffer.from(await file.arrayBuffer()));
    const sourceUrl = process.env.DATABASE_URL;
    if (!sourceUrl) throw new Error("DATABASE_URL belum dikonfigurasi.");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(postgresTool("psql"), ["--no-psqlrc", "--single-transaction", "--file", sqlPath, "--set", "ON_ERROR_STOP=1"], {
        env: postgresEnvironment(sourceUrl), windowsHide: true, stdio: ["ignore", "ignore", "pipe"]
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr = (stderr + chunk.toString()).slice(-2000); });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-2000) || `psql gagal dengan kode ${code}`)));
    });
    return NextResponse.json({ success: true, message: "Backup SQL berhasil dipulihkan. Muat ulang aplikasi." });
  } catch (error) {
    console.error("[settings/import-sql] Restore gagal", error);
    return NextResponse.json({ error: "Restore SQL gagal. Periksa format backup dan log server." }, { status: 400 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
