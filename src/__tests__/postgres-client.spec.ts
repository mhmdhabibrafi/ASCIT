import { postgresEnvironment, postgresTool } from "@/lib/postgres-client";

test("Prisma schema parameters are not sent to PostgreSQL client tools", () => {
  const env = postgresEnvironment("postgresql://demo:p%40ss@127.0.0.1:5544/fixture?schema=public&options=-c%20client_encoding%3DUTF8");
  expect(env.PGHOST).toBe("127.0.0.1");
  expect(env.PGPORT).toBe("5544");
  expect(env.PGDATABASE).toBe("fixture");
  expect(env.PGPASSWORD).toBe("p@ss");
  expect(env.PGOPTIONS).toBe("-c client_encoding=UTF8");
  expect(env).not.toHaveProperty("schema");
});
test("client tools retain SSL mode and reject non-PostgreSQL URLs", () => {
  expect(postgresEnvironment("postgres://demo:pass@db/fixture?sslmode=require").PGSSLMODE).toBe("require");
  expect(() => postgresEnvironment("https://example.com")).toThrow();
});
test("explicit psql and dump paths are honored", () => {
  const previousDump = process.env.PG_DUMP_PATH;
  const previousPsql = process.env.PSQL_PATH;
  try {
    process.env.PG_DUMP_PATH = "test-tools/pg_dump";
    process.env.PSQL_PATH = "test-tools/psql";
    expect(postgresTool("pg_dump")).toBe("test-tools/pg_dump");
    expect(postgresTool("psql")).toBe("test-tools/psql");
  } finally {
    if (previousDump === undefined) delete process.env.PG_DUMP_PATH; else process.env.PG_DUMP_PATH = previousDump;
    if (previousPsql === undefined) delete process.env.PSQL_PATH; else process.env.PSQL_PATH = previousPsql;
  }
});
