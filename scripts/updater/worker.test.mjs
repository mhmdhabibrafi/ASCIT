// Isolated integration: real Windows processes/files, fixture web/backup and fixture GitHub.
// Never connects to the application's PostgreSQL or modifies the workspace installation.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, mkdir, writeFile, readFile, copyFile, access, rename } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

test("Windows worker stages an update, preserves uploads, blocks concurrency and restores a failed release", { skip: process.platform !== "win32", timeout: 180000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ascit-worker-test-"));
  const home = path.join(root, "updater");
  const initial = path.join(root, "initial");
  const engine = path.join(home, "engine");
  await mkdir(engine, { recursive: true });
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of ["worker.mjs", "extract.ps1"]) await copyFile(path.join(sourceDir, name), path.join(engine, name));
  await writeFile(path.join(engine, "core.mjs"), `
    import {readFile} from 'node:fs/promises';
    import {releaseInfo} from ${JSON.stringify(new URL("./core.mjs", import.meta.url).href)};
    export {newer, verifyDigest, activateVersion} from ${JSON.stringify(new URL("./core.mjs", import.meta.url).href)};
    export async function latest(current) {return releaseInfo(JSON.parse(await readFile(${JSON.stringify(path.join(root, "release.json"))},'utf8')),current);}
    export async function github() {return new Response(await readFile(${JSON.stringify(path.join(root, "release.zip"))}));}
  `);
  const nextScript = `
    if(process.env.ASCIT_RELEASE_VERSION==='1.2.0') process.exit(1);
    const http=require('node:http');
    http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({status:'healthy'}));})
      .listen(Number(process.argv[process.argv.indexOf('-p')+1]),'127.0.0.1');
  `;
  const installScript = `
    import {mkdirSync,writeFileSync} from 'node:fs';
    mkdirSync('node_modules/next/dist/bin',{recursive:true});
    mkdirSync('node_modules/prisma/build',{recursive:true});
    writeFileSync('node_modules/next/dist/bin/next',${JSON.stringify(nextScript)});
    writeFileSync('node_modules/prisma/build/index.js','process.exit(0)');
  `;
  async function fixture(directory, version) {
    await mkdir(path.join(directory, "prisma"), { recursive: true });
    await mkdir(path.join(directory, "public"), { recursive: true });
    await writeFile(path.join(directory, "prisma/schema.prisma"), "// identical fixture schema");
    await writeFile(path.join(directory, "public/keep.txt"), "static fixture");
    const pkg = { name: "ascit", version, scripts: { postinstall: "node fixture.mjs", build: 'node -e "process.exit(0)"' } };
    await writeFile(path.join(directory, "package.json"), JSON.stringify(pkg));
    await writeFile(path.join(directory, "package-lock.json"), JSON.stringify({
      name: "ascit", version, lockfileVersion: 3, requires: true, packages: { "": { name: "ascit", version, hasInstallScript: true } }
    }));
    await writeFile(path.join(directory, "fixture.mjs"), installScript);
  }
  await fixture(initial, "1.0.0");
  assert.equal(spawnSync(process.execPath, ["fixture.mjs"], { cwd: initial, windowsHide: true }).status, 0);
  await mkdir(path.join(initial, "public/uploads"));
  await writeFile(path.join(initial, "public/uploads/preserved.txt"), "original data");
  const backupExe = path.join(root, "backup-fixture.exe");
  const compile = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `
    Add-Type -TypeDefinition 'using System; using System.IO; public class BackupFixture { public static void Main(string[] args) { File.WriteAllText(args[Array.IndexOf(args, "-f")+1], "fixture backup only"); } }' -OutputAssembly $env:TEST_BACKUP_EXE -OutputType ConsoleApplication
  `], { env: { ...process.env, TEST_BACKUP_EXE: backupExe }, encoding: "utf8", windowsHide: true });
  assert.equal(compile.status, 0, compile.stderr);
  await writeFile(path.join(home, "config.json"), JSON.stringify({
    initialDirectory: initial, initialVersion: "1.0.0", port: 3198, token: "test-token-only",
    pgDumpPath: backupExe, embeddedDatabase: false, env: { DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/fixture" }
  }));
  async function release(version) {
    const directory = path.join(root, `source-${version}`);
    await fixture(directory, version);
    const archive = path.join(root, `release-${version}.zip`);
    const pack = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Compress-Archive -Path (Join-Path $env:TEST_SOURCE '*') -DestinationPath $env:TEST_ARCHIVE"],
    { env: { ...process.env, TEST_SOURCE: directory, TEST_ARCHIVE: archive }, encoding: "utf8", windowsHide: true });
    assert.equal(pack.status, 0, pack.stderr);
    const bytes = await readFile(archive);
    await writeFile(path.join(root, "release.zip"), bytes);
    await writeFile(path.join(root, "release.json"), JSON.stringify({
      tag_name: `v${version}`, assets: [{ name: "ascit-windows-source.zip", id: 1, size: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` }]
    }));
  }
  const worker = spawn(process.execPath, [path.join(engine, "worker.mjs"), home], { windowsHide: true, stdio: "pipe" });
  let output = "";
  worker.stdout.on("data", (data) => output += data);
  worker.stderr.on("data", (data) => output += data);
  const call = (endpoint, body, token = "test-token-only") => fetch(`http://127.0.0.1:4319/${endpoint}`, {
    method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000)
  });
  async function waitFor(predicate) {
    for (let i = 0; i < 120; i++) {
      if (worker.exitCode !== null) throw new Error(output);
      try { const state = await (await call("status")).json(); if (predicate(state)) return state; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Worker timeout: ${output}\n${await readFile(path.join(home, "worker.log"), "utf8")}`);
  }
  try {
    await waitFor((state) => state.ready);
    assert.equal((await call("status", null, "wrong-token")).status, 403);
    await release("1.1.0");
    assert.equal((await call("check", {})).status, 200);
    const checked = await (await call("status")).json();
    assert.ok(Number.isFinite(Date.parse(checked.checkedAt)));
    assert.equal(checked.backupReady, true);
    await rename(backupExe, `${backupExe}.unavailable`);
    assert.equal((await (await call("status")).json()).backupReady, false);
    assert.equal((await call("install", { version: "1.1.0" })).status, 400);
    await rename(`${backupExe}.unavailable`, backupExe);
    assert.equal((await call("install", { version: "1.1.0" })).status, 202);
    assert.equal((await call("install", { version: "1.1.0" })).status, 409);
    const first = await waitFor((state) => !state.busy && ["success", "failed"].includes(state.phase));
    assert.equal(first.phase, "success", first.error);
    assert.equal(first.version, "1.1.0");
    const persisted = JSON.parse(await readFile(path.join(home, "state.json"), "utf8"));
    assert.equal(await readFile(persisted.backup, "utf8"), "fixture backup only");
    assert.equal(await readFile(path.join(persisted.current, "public/uploads/preserved.txt"), "utf8"), "original data");
    await release("1.2.0");
    assert.equal((await call("install", { version: "1.2.0" })).status, 202);
    const failed = await waitFor((state) => !state.busy && state.phase === "failed");
    assert.equal(failed.version, "1.1.0");
    assert.match(failed.error, /dipulihkan/);
    assert.equal((await fetch("http://127.0.0.1:3198/api/health")).status, 200);
    await access(path.join(initial, "public/uploads/preserved.txt"));
  } finally {
    spawnSync("taskkill.exe", ["/PID", String(worker.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  }
});
