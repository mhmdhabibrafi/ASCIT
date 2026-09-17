/**
 * OpenAPI JSON Route
 * GET /api/docs.json
 */

import { NextResponse } from "next/server";
import { forbidden, hasSessionPermission, requireSession } from "@/lib/api";
import { Permission } from "@/lib/permissions";
import { apiDocumentation } from "@/lib/swagger";

export async function GET() {
  const { session, response } = await requireSession();
  if (response) return response;
  if (!hasSessionPermission(session, Permission.SYSTEM_ADMIN)) return forbidden();

  return NextResponse.json(apiDocumentation);
}

export const dynamic = "force-dynamic";
