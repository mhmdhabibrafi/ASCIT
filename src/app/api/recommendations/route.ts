import { NextRequest, NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.ASSET_READ)) return forbidden();

  try {
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10), 100);
    const unitId = searchParams.get("unitId");
    const categoryId = searchParams.get("categoryId");
    const status = searchParams.get("status");
    const minScore = searchParams.get("minScore");
    const search = searchParams.get("search");

    const where: any = { asset: { assetType: "IT" } };
    
    if (status) {
      where.scoreStatus = status;
    }
    
    if (minScore) {
      where.score = { gte: parseInt(minScore, 10) };
    }

    if (unitId || categoryId || search) {
      if (unitId) where.asset.unitId = unitId;
      if (categoryId) where.asset.categoryId = categoryId;
      if (search) {
        where.asset.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { assetCode: { contains: search, mode: 'insensitive' } }
        ];
      }
    }

    const total = await prisma.assetReplacementRecommendation.count({ where });
    const data = await prisma.assetReplacementRecommendation.findMany({
      where,
      include: {
        asset: {
          include: { unit: true, room: true, category: true, brand: true }
        }
      },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return NextResponse.json({ 
      data, 
      pagination: { 
        page, 
        pageSize, 
        total, 
        totalPages: Math.ceil(total / pageSize) 
      } 
    });
  } catch (error) {
    return NextResponse.json({ error: "Terjadi kesalahan internal server" }, { status: 500 });
  }
}
