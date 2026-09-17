import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import QRCode from "qrcode";
import { requestOrigin } from "@/lib/request-origin";
export async function POST(req: NextRequest) {
  try {
    const { session, response } = await requireSession();
    if (response) return response;
    if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();

    const assets = await prisma.asset.findMany({
      select: { id: true, assetName: true, assetCode: true }
    });

    const uniqueCodes = new Set<string>(assets.map(a => a.assetCode));
    
    function getUniqueCode(name: string) {
      let initials = name.trim().split(/\s+/).map(w => w[0].toUpperCase()).join("").slice(0,3);
      if (!initials) initials = "AST";
      
      const year = new Date().getFullYear();
      let random = Math.floor(1000 + Math.random() * 9000);
      let code = `IT-${initials}-${year}-${random}`;
      
      while (uniqueCodes.has(code)) {
        random = Math.floor(1000 + Math.random() * 9000);
        code = `IT-${initials}-${year}-${random}`;
      }
      
      uniqueCodes.add(code);
      return code;
    }

    const updatesData = await Promise.all(assets.map(async (asset) => {
      const newCode = getUniqueCode(asset.assetName);
      const qrToken = `ASCIT-${newCode}`;
      const publicUrl = `${requestOrigin(req)}/public/assets/${encodeURIComponent(qrToken)}`;
      const qrCodeUrl = await QRCode.toDataURL(publicUrl, { width: 600, margin: 1, errorCorrectionLevel: "H" });
      
      return { id: asset.id, newCode, qrToken, qrCodeUrl };
    }));

    const updates = updatesData.map(data => prisma.asset.update({
      where: { id: data.id },
      data: { assetCode: data.newCode, qrToken: data.qrToken, qrCodeUrl: data.qrCodeUrl }
    }));

    await prisma.$transaction(updates);

    await createAuditLog({
      session,
      action: "REBUILD_ASSET_CODES",
      module: "Asset",
      description: `Rebuilt ${assets.length} asset codes to new format.`
    });

    return NextResponse.json({ success: true, count: assets.length });
  } catch (error) {
    console.error("Failed to rebuild asset codes:", error);
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
