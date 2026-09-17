import type { NextRequest } from "next/server";

export function requestOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || (forwardedHost?.includes("localhost") ? "http" : "https");
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}
