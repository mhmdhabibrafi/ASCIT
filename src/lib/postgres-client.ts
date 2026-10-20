import path from "node:path";

export function postgresTool(name: "pg_dump" | "psql") {
  if (name === "pg_dump") return process.env.PG_DUMP_PATH || "pg_dump";
  return process.env.PSQL_PATH || (process.env.PG_DUMP_PATH
    ? path.join(path.dirname(process.env.PG_DUMP_PATH), process.platform === "win32" ? "psql.exe" : "psql")
    : "psql");
}

export function postgresEnvironment(connectionString: string) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("URL PostgreSQL tidak valid.");
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGCONNECT_TIMEOUT: "10",
    ...(url.searchParams.has("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode")! } : {}),
    ...(url.searchParams.has("options") ? { PGOPTIONS: url.searchParams.get("options")! } : {})
  };
}
