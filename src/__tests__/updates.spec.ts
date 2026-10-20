import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/system/updates/route";
import { requireSession, hasSessionPermission } from "@/lib/api";
import { createAuditLog } from "@/lib/audit";
import { readFile } from "node:fs/promises";

jest.mock("@/lib/api", () => ({
  requireSession: jest.fn(), hasSessionPermission: jest.fn(),
  forbidden: () => NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  requestIp: () => null
}));
jest.mock("@/lib/audit", () => ({ createAuditLog: jest.fn() }));
jest.mock("node:fs/promises", () => ({ readFile: jest.fn() }));

const fetchMock = jest.fn();
const originalFetch = global.fetch;
const request = (body: object, origin = "http://localhost:3000") => new NextRequest("http://localhost:3000/api/system/updates", {
  method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body)
});
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  (requireSession as jest.Mock).mockResolvedValue({ session: { user: { id: "test-admin" } }, response: null });
  (hasSessionPermission as jest.Mock).mockReturnValue(true);
  (readFile as jest.Mock).mockResolvedValue(JSON.stringify({ token: "server-only-token" }));
  (createAuditLog as jest.Mock).mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(NextResponse.json({ accepted: true }, { status: 202 }));
});
afterAll(() => { global.fetch = originalFetch; });

test("unauthenticated and non-admin requests cannot reach the updater", async () => {
  (requireSession as jest.Mock).mockResolvedValueOnce({ response: new NextResponse(null, { status: 401 }) });
  expect((await GET()).status).toBe(401);
  (hasSessionPermission as jest.Mock).mockReturnValue(false);
  expect((await POST(request({ action: "install", version: "1.1.0" }))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
test("cross-origin update and injected version are rejected before audit or process access", async () => {
  expect((await POST(request({ action: "install", version: "1.1.0" }, "https://other.example"))).status).toBe(403);
  expect((await POST(request({ action: "install", version: "../cmd" }))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(createAuditLog).not.toHaveBeenCalled();
});
test("authorized install is audited and sent only to the fixed loopback endpoint", async () => {
  const response = await POST(request({ action: "install", version: "1.1.0", url: "https://other.example" }));
  expect(response.status).toBe(202);
  expect(createAuditLog).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4319/install", expect.objectContaining({
    method: "POST", body: JSON.stringify({ version: "1.1.0" }),
    headers: expect.objectContaining({ Authorization: "Bearer server-only-token" })
  }));
  expect(JSON.stringify(await response.json())).not.toContain("server-only-token");
});
test("LAN Host is accepted even when Next uses an internal localhost request URL", async () => {
  const req = new NextRequest("http://localhost:3000/api/system/updates", {
    method: "POST", headers: { origin: "http://192.168.1.10:3000", host: "192.168.1.10:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "check" })
  });
  expect((await POST(req)).status).toBe(202);
  expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:4319/check", expect.anything());
});
test("missing service reports unconfigured without leaking filesystem or credentials", async () => {
  (readFile as jest.Mock).mockRejectedValue(new Error("sensitive path"));
  const result = await (await GET()).json();
  expect(result.ready).toBe(false);
  expect(JSON.stringify(result)).not.toContain("sensitive path");
});
