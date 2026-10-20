import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { newer, versionParts, releaseInfo, verifyDigest, activateVersion } from "./core.mjs";

test("numeric stable versions reject downgrades, prereleases and path injection", () => {
  assert(newer("v1.10.0", "1.9.9"));
  assert(!newer("1.0.0", "1.0.0"));
  assert(!newer("1.0.0", "2.0.0"));
  for (const bad of ["../1.0.1", "1.0.1-beta", "01.0.0", "1.2", null]) assert.throws(() => versionParts(bad));
});
test("release without a verified Windows asset cannot install", () => {
  assert.equal(releaseInfo({ tag_name: "v1.1.0", assets: [] }, "1.0.0").installable, false);
  assert.throws(() => releaseInfo({ tag_name: "v1.1.0", prerelease: true }, "1.0.0"));
  const release = releaseInfo({ tag_name: "v1.1.0", assets: [{name:"ascit-windows-source.zip",id:1,digest:`sha256:${"a".repeat(64)}`}] }, "1.0.0");
  assert(release.available && release.installable);
});
test("tampered download fails before extraction or execution", () => {
  const buffer = Buffer.from("trusted release");
  const digest = `sha256:${createHash("sha256").update(buffer).digest("hex")}`;
  verifyDigest(buffer, digest);
  assert.throws(() => verifyDigest(Buffer.from("modified"), digest));
});

test("healthy activation switches once; failed health restores the old pointer before restart", async () => {
  const events = [];
  let active = "old";
  const operations = {
    stop: async () => events.push(`stop:${active}`),
    save: async (value) => { active = value; events.push(`save:${value}`); },
    start: () => events.push(`start:${active}`),
    healthy: async () => { if (active === "broken") throw new Error("bad health"); }
  };
  await activateVersion("old", "new", operations);
  assert.deepEqual(events, ["stop:old", "save:new", "start:new"]);
  events.length = 0;
  await assert.rejects(activateVersion("new", "broken", operations), /dipulihkan/);
  assert.equal(active, "new");
  assert.deepEqual(events, ["stop:new", "save:broken", "start:broken", "stop:broken", "save:new", "start:new"]);
});

test("failed restoration is reported, never marked successful", async () => {
  await assert.rejects(activateVersion("old", "new", {
    stop: async () => {}, save: async () => {}, start: () => {},
    healthy: async () => { throw new Error("offline"); }
  }), /pemulihan versi lama gagal/);
});
