// Stable supervisor: copied outside versioned releases by setup.mjs.
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { readFile, writeFile, rename, mkdir, readdir, stat, symlink, access } from "node:fs/promises";
import { timingSafeEqual, randomUUID, createHash } from "node:crypto";
import { latest, github, verifyDigest, newer, activateVersion } from "./core.mjs";

const home = path.resolve(process.argv[2] || ".local/updater");
const config = JSON.parse(await readFile(path.join(home, "config.json"), "utf8"));
const stateFile = path.join(home, "state.json");
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
let state = await readJson(stateFile).catch((error) => {
  if (error.code !== "ENOENT") throw error;
  return { current: config.initialDirectory, version: config.initialVersion, phase: "idle" };
});
let child;
let busy = false;
let ready = false;
let writeQueue = Promise.resolve();
const backupReady = async () => Boolean(config.pgDumpPath) && await stat(config.pgDumpPath).then((file) => file.isFile(), () => false);
let stopping = false;
let databaseProcess;
const log = createWriteStream(path.join(home, "worker.log"), { flags: "a" });
const appEnvironment = () => ({ ...process.env, ...config.env, NODE_ENV: "production", ASCIT_UPDATE_HOME: home, ASCIT_RELEASE_VERSION: state.version });
function save(patch) {
  const write = writeQueue.then(async () => {
    const next = { ...state, ...patch, updatedAt: new Date().toISOString() };
    const temp = `${stateFile}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next, null, 2));
    await rename(temp, stateFile);
    state = next;
  });
  writeQueue = write.catch(() => {});
  return write;
}

function run(command, args, cwd, env = appEnvironment()) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.pipe(log, { end: false }); process.stderr.pipe(log, { end: false });
    const timer = setTimeout(() => {
      spawn("taskkill.exe", ["/PID", String(process.pid), "/T", "/F"], { windowsHide: true });
      reject(new Error("Proses melewati batas waktu 20 menit."));
    }, 1200000);
    process.on("error", (error) => { clearTimeout(timer); reject(error); });
    process.on("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${path.basename(command)} gagal (${code}); periksa worker.log di server.`)); });
  });
}
function startApp() {
  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(config.port)], {
    cwd: state.current, env: appEnvironment(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.on("error", (error) => log.write(`${error.message}\n`));
}
async function stopApp() {
  if (child?.exitCode === null) await run("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], home);
}
async function healthy() {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (child.exitCode !== null) throw new Error("Web berhenti sebelum siap.");
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.json()).status === "healthy") return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Pemeriksaan kesehatan versi baru gagal.");
}
async function fingerprint(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlink pada schema tidak diizinkan.");
    parts.push(entry.name, entry.isDirectory() ? await fingerprint(file) : createHash("sha256").update(await readFile(file)).digest("hex"));
  }
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}
async function install(expectedVersion) {
  const previous = { current: state.current, version: state.version };
  try {
    await save({ phase: "checking", message: "Memeriksa rilis GitHub.", error: null });
    const release = await latest(state.version, config.githubToken);
    if (release.version !== expectedVersion || !release.available || !release.installable) throw new Error("Rilis berubah atau paket belum siap. Periksa pembaruan lagi.");
    if (!config.pgDumpPath) throw new Error("PG_DUMP_PATH belum dikonfigurasi; backup wajib sebelum update.");
    await access(config.pgDumpPath);
    const directory = path.join(home, "releases", `${release.version}-${randomUUID()}`);
    await mkdir(path.dirname(directory), { recursive: true });
    await save({ phase: "downloading", message: `Mengunduh versi ${release.version}.` });
    if (release.size > 200 * 1024 * 1024) throw new Error("Paket terlalu besar.");
    const response = await github(`releases/assets/${release.assetId}`, config.githubToken, "application/octet-stream");
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 200 * 1024 * 1024) throw new Error("Unduhan melebihi batas.");
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    verifyDigest(buffer, release.digest);
    const archive = `${directory}.zip`;
    await writeFile(archive, buffer);
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", path.join(path.dirname(fileURLToPath(import.meta.url)), "extract.ps1"), "-Archive", archive, "-Destination", directory], home);
    const pkg = await readJson(path.join(directory, "package.json"));
    if (pkg.name !== "ascit" || pkg.version !== release.version) throw new Error("Identitas atau versi paket tidak cocok.");
    // shortcut: schema-changing releases require a maintenance deployment until migration rollback is supported.
    if (await fingerprint(path.join(directory, "prisma")) !== await fingerprint(path.join(state.current, "prisma"))) {
      throw new Error("Rilis mengubah schema/migrasi database. Perlu pembaruan terencana oleh administrator server.");
    }
    await save({ phase: "building", message: "Menyiapkan versi baru; web lama masih dapat digunakan." });
    const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    const candidateEnvironment = { ...appEnvironment(), ASCIT_RELEASE_VERSION: release.version };
    await run(process.execPath, [npmCli, "ci", "--include=dev"], directory, candidateEnvironment);
    await run(process.execPath, ["node_modules/prisma/build/index.js", "generate"], directory, candidateEnvironment);
    await run(process.execPath, [npmCli, "run", "build"], directory, candidateEnvironment);
    const uploads = path.join(config.initialDirectory, "public", "uploads");
    await mkdir(uploads, { recursive: true });
    await symlink(uploads, path.join(directory, "public", "uploads"), "junction");
    await save({ phase: "backup", message: "Membuat backup database sebelum pergantian versi." });
    const backupDir = path.join(home, "backups");
    await mkdir(backupDir, { recursive: true });
    const backup = path.join(backupDir, `${Date.now()}.dump`);
    const db = new URL(config.env.DATABASE_URL);
    await run(config.pgDumpPath, ["-Fc", "-f", backup], home, {
      ...appEnvironment(), PGHOST: db.hostname, PGPORT: db.port || "5432",
      PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password),
      PGDATABASE: decodeURIComponent(db.pathname.slice(1))
    });
    if ((await stat(backup)).size < 1) throw new Error("Backup kosong.");
    await save({ phase: "switching", message: "Mengaktifkan versi baru. Halaman akan tersambung kembali.", previous, backup });
    await activateVersion(previous, { current: directory, version: release.version }, {
      stop: stopApp,
      save: (next) => save({ ...next, phase: next.version === release.version ? "verifying" : "restoring", message: next.version === release.version ? "Memverifikasi layanan versi baru." : "Memulihkan versi sebelumnya." }),
      start: startApp, healthy
    });
    await save({ phase: "success", message: `Versi ${release.version} aktif. Muat ulang halaman.`, previous: null, latest: { ...release, available: false } });
  } catch (error) {
    await save({ phase: "failed", message: "Pembaruan gagal. Periksa keterangan di bawah.", error: String(error.message) });
  } finally { busy = false; }
}
function authenticated(req) {
  const supplied = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${config.token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
const server = http.createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
  if (!authenticated(req)) return send(403, { error: "Forbidden" });
  try {
    if (req.method === "GET" && req.url === "/status") return send(200, {
      ready, checkedAt: state.checkedAt || null, version: state.version, phase: state.phase, message: state.message,
      error: state.error, busy, backupReady: await backupReady(), latest: state.latest ? { ...state.latest, available: newer(state.latest.version, state.version) } : null
    });
    if (req.method === "POST" && !ready) return send(503, { error: "Layanan sedang disiapkan. Coba kembali setelah beberapa saat." });
    if (req.method === "POST" && req.url === "/check") {
      if (busy) return send(409, { error: "Pembaruan sedang berjalan." });
      const release = await latest(state.version, config.githubToken);
      if (busy) return send(409, { error: "Pembaruan sedang berjalan." });
      await save({ latest: release, checkedAt: new Date().toISOString() });
      return send(200, { latest: release });
    }
    if (req.method === "POST" && req.url === "/install") {
      if (busy) return send(409, { error: "Pembaruan sedang berjalan." });
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 1024) throw new Error("Permintaan terlalu besar."); }
      const { version } = JSON.parse(body);
      if (!newer(version, state.version) || !await backupReady()) throw new Error("Versi atau konfigurasi backup belum siap.");
      // Recheck after reading the body: another request may have acquired the update slot.
      if (busy) return send(409, { error: "Pembaruan sedang berjalan." });
      busy = true;
      send(202, { accepted: true });
      void install(version);
      return;
    }
    send(404, { error: "Not found" });
  } catch (error) { send(400, { error: error.message }); }
});
if (process.platform !== "win32") throw new Error("Updater ini khusus Windows.");
// Binding first also prevents a second supervisor from starting another app.
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(4319, "127.0.0.1", resolve); });
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", () => reject(new Error(`Port ${config.port} masih digunakan. Hentikan ASCIT lama sebelum menjalankan updater.`)));
  probe.listen(config.port, "127.0.0.1", () => probe.close(resolve));
});
if (config.embeddedDatabase) {
  databaseProcess = spawn(process.execPath, ["scripts/local.mjs", "database"], {
    cwd: config.initialDirectory, env: appEnvironment(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
  });
  databaseProcess.stdout.pipe(log, { end: false }); databaseProcess.stderr.pipe(log, { end: false });
  databaseProcess.on("error", (error) => log.write(`${error.message}\n`));
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (["switching", "verifying", "restoring", "failed"].includes(state.phase) && state.previous) {
  await save({ ...state.previous, previous: null, phase: "failed", message: "Pembaruan terputus; kembali ke versi sebelumnya." });
} else if (!["idle", "success", "failed"].includes(state.phase)) {
  await save({ phase: "failed", message: "Pembaruan sebelumnya terputus. Silakan periksa kembali." });
}
startApp();
await healthy();
ready = true;
setInterval(() => {
  if (!busy && !stopping && child?.exitCode !== null) startApp();
}, 5000);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
  stopping = true; await stopApp().catch(() => {});
  databaseProcess?.kill();
  process.exit(0);
});
