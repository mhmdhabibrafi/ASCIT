import { NextResponse } from "next/server";
import { scoreAsset } from "@/lib/ai/scoring-engine";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getAssetAge, getWarrantyInfo } from "@/lib/utils";


export const dynamic = "force-dynamic";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  try {
    const assets = await prisma.asset.findMany({
      where: { deletedAt: null, assetType: "IT" },
      include: {
        category: true,
        unit: true,
        room: true,
        serviceRecords: true
      },
      orderBy: { purchaseDate: "asc" }
    });

    return NextResponse.json({
      data: assets.map((asset) => ({
        ...asset,
        assetAge: getAssetAge(asset.purchaseDate),
        warrantyInfo: getWarrantyInfo(asset.warrantyEndDate),
        repairCount: asset.serviceRecords.length,
        recommendation: scoreAsset(asset)
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
