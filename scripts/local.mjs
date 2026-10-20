import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import EmbeddedPostgres from "embedded-postgres";
import { appEnv, localDb } from "./local-config.mjs";

const action = process.argv[2] || "dev";
const postgres = new EmbeddedPostgres({
  databaseDir: localDb.databaseDir,
  port: localDb.port,
  user: localDb.user,
  password: localDb.password,
  authMethod: "scram-sha-256",
  persistent: true,
  onLog: () => {},
  onError: (message) => console.error(`[database] ${String(message).trim()}`),
});

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: appEnv,
      stdio: "inherit",
      shell: false,
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} dihentikan oleh ${signal}`));
      else if (code === 0) resolve();
      else reject(new Error(`${command} gagal dengan kode ${code}`));
    });
  });
}

async function ensureDatabase() {
  const existingClient = postgres.getPgClient(localDb.database, localDb.host);
  try {
    await existingClient.connect();
    await existingClient.query("SELECT 1");
    console.log(`[database] PostgreSQL lokal sudah aktif di ${localDb.host}:${localDb.port}/${localDb.database}`);
    return;
  } catch {
    // Belum aktif; cluster lokal akan diinisialisasi di bawah.
  } finally {
    await existingClient.end().catch(() => {});
  }

  if (!existsSync(path.join(localDb.databaseDir, "PG_VERSION"))) {
    await postgres.initialise();
  }
  await postgres.start();

  const client = postgres.getPgClient("postgres", localDb.host);
  await client.connect();
  try {
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [localDb.database]);
    if (result.rowCount === 0) {
      await client.query(`CREATE DATABASE "${localDb.database}"`);
    }
  } finally {
    await client.end();
  }
  console.log(`[database] PostgreSQL lokal siap di ${localDb.host}:${localDb.port}/${localDb.database}`);
}

async function setup({ generateClient = false } = {}) {
  await ensureDatabase();
  if (generateClient || !existsSync(path.join("node_modules", ".prisma", "client", "index.js"))) {
    await run(process.execPath, ["node_modules/prisma/build/index.js", "generate"]);
  } else {
    console.log("[prisma] Client sudah tersedia; generate dilewati agar aman saat aplikasi lain masih memakai DLL.");
  }
  await run(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  if (!process.argv.includes("--skip-seed")) {
    await run(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"]);
  }
  await run(process.execPath, ["scripts/db-health.mjs"]);
}

async function serve(mode) {
  await setup();
  const args = ["node_modules/next/dist/bin/next", mode === "dev" ? "dev" : "start"];
  if (mode === "dev") args.push("--turbo");
  console.log(`[app] Menjalankan ASCIT (${mode}) di ${appEnv.NEXTAUTH_URL}`);
  await run(process.execPath, args);
}

async function status() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: appEnv.DATABASE_URL, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    const result = await client.query("SELECT current_database() AS database, version() AS version");
    console.log(`[database] aktif: ${result.rows[0].database}`);
    console.log(`[database] ${result.rows[0].version}`);
  } catch {
    console.log("[database] tidak aktif");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  if (action === "setup") {
    await setup({ generateClient: true });
    await postgres.stop();
    console.log("[database] setup selesai; data tersimpan dan database dihentikan.");
  }
  else if (action === "dev" || action === "start") await serve(action);
  else if (action === "database") {
    await ensureDatabase();
    console.log("[database] Tekan Ctrl+C untuk menghentikan database lokal.");
    await new Promise(() => {});
  } else if (action === "status") await status();
  else if (action === "stop") {
    await postgres.stop();
    console.log("[database] dihentikan; data tetap tersimpan.");
  } else throw new Error(`Perintah lokal tidak dikenal: ${action}`);
}

main().catch((error) => {
  console.error(`\n[local]`, error);
  process.exitCode = 1;
});
