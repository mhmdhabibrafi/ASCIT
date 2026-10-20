import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, hasSessionPermission, forbidden, requestIp } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { createAuditLog } from "@/lib/audit";
import pkg from "../../../../../package.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function updater(endpoint: string, body?: object) {
  const home = process.env.ASCIT_UPDATE_HOME || path.join(process.cwd(), ".local/updater");
  const { token } = JSON.parse(await readFile(path.join(home, "client.json"), "utf8"));
  return fetch(`http://127.0.0.1:4319/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(endpoint === "check" ? 130000 : 5000)
  });
}

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();
  try {
    const result = await updater("status");
    return NextResponse.json(await result.json(), { status: result.status });
  } catch {
    return NextResponse.json({
      ready: false, version: process.env.ASCIT_RELEASE_VERSION || pkg.version, phase: "unconfigured",
      message: "Layanan pembaruan belum aktif. Administrator server perlu menyelesaikan setup Windows."
    });
  }
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();
  // Same-origin POST only: prevents cross-site requests to a privileged local updater.
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("host") || new URL(request.url).host;
  let sameOrigin = false;
  try {
    const source = new URL(origin || "");
    sameOrigin = ["http:", "https:"].includes(source.protocol) && source.host === requestHost;
  } catch {}
  if (!sameOrigin) {
    return NextResponse.json({ error: "Origin tidak diizinkan." }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (!["check", "install"].includes(body.action) ||
      (body.action === "install" && (typeof body.version !== "string" || !/^\d+\.\d+\.\d+$/.test(body.version)))) {
      return NextResponse.json({ error: "Permintaan pembaruan tidak valid." }, { status: 400 });
    }
    if (body.action === "install") {
      await createAuditLog({
        session, action: "REQUEST_SYSTEM_UPDATE", module: "Pengaturan",
        description: `Permintaan pembaruan ASCIT ke versi ${body.version}.`, ipAddress: requestIp(request)
      });
    }
    const result = await updater(body.action, body.action === "install" ? { version: body.version } : {});
    return NextResponse.json(await result.json(), { status: result.status });
  } catch {
    return NextResponse.json({ error: "Layanan pembaruan tidak dapat dihubungi. Coba kembali atau periksa layanan di server." }, { status: 503 });
  }
}
