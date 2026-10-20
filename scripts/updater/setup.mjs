import path from "node:path";
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { appEnv, databaseUrl } from "../local-config.mjs";

if (process.platform !== "win32") throw new Error("Setup ini khusus Windows.");
const initialDirectory = process.cwd();
const home = path.resolve(process.env.ASCIT_UPDATE_HOME || ".local/updater");
await mkdir(path.join(home, "engine"), { recursive: true });
try {
  await access(path.join(home, "config.json"));
  throw new Error("Updater sudah dikonfigurasi. Konfigurasi lama tidak ditimpa.");
} catch (error) { if (error.code !== "ENOENT") throw error; }
const pkg = JSON.parse(await readFile("package.json", "utf8"));
// Persist only application configuration, never the full interactive shell environment.
const fileEnv = parseEnv(await readFile(".env", "utf8").catch(() => ""));
delete fileEnv.ASCIT_GITHUB_TOKEN;
const env = { ...fileEnv, ...Object.fromEntries(Object.entries(appEnv).filter(([key, value]) =>
  /^(DATABASE_URL|NEXTAUTH_|LOCAL_|POSTGRES_|OLLAMA_|PG_DUMP_PATH|PORT$)/.test(key) && value !== undefined
)) };
const config = {
  initialDirectory, initialVersion: pkg.version, port: Number(appEnv.PORT || 3000),
  token: randomBytes(32).toString("hex"), githubToken: process.env.ASCIT_GITHUB_TOKEN || "",
  pgDumpPath: process.env.PG_DUMP_PATH || "", env,
  embeddedDatabase: appEnv.DATABASE_URL === databaseUrl
};
for (const name of ["worker.mjs", "core.mjs", "extract.ps1"]) {
  await copyFile(path.join("scripts/updater", name), path.join(home, "engine", name));
}
await writeFile(path.join(home, "config.json"), JSON.stringify(config, null, 2), { flag: "wx" });
await writeFile(path.join(home, "client.json"), JSON.stringify({ token: config.token }), { flag: "wx" });
console.log(`Updater siap di ${home}. Hentikan web lama lalu jalankan: node "${path.join(home, "engine/worker.mjs")}" "${home}"`);
if (!config.pgDumpPath) console.log("Periksa pembaruan tersedia. Pemasangan dinonaktifkan sampai pgDumpPath dikonfigurasi.");
