import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true });

const port = Number.parseInt(process.env.LOCAL_DB_PORT || "5432", 10);
const user = process.env.POSTGRES_USER || "ascit";
const password = process.env.POSTGRES_PASSWORD || "ascit-local";
const database = process.env.POSTGRES_DB || "ascit";

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("LOCAL_DB_PORT harus berupa port yang valid.");
}

for (const [name, value] of Object.entries({ POSTGRES_USER: user, POSTGRES_DB: database })) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${name} hanya boleh berisi huruf, angka, dan garis bawah.`);
  }
}

export const localDb = {
  databaseDir: path.resolve(".local", "postgres"),
  host: "127.0.0.1",
  port,
  user,
  password,
  database,
};

export const databaseUrl =
  `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
  `@${localDb.host}:${port}/${encodeURIComponent(database)}?schema=public&options=-c%20client_encoding%3DUTF8`;

export const appEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL || databaseUrl,
  NEXTAUTH_URL: process.env.LOCAL_NEXTAUTH_URL || "http://localhost:3000",
};
