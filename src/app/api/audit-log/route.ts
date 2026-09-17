import { NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";


export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.AUDIT_LOG_READ)) return forbidden();

  try {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: { name: true, email: true }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 300
    });

    return NextResponse.json({ data: logs });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
