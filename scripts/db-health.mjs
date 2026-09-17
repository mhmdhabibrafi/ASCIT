import { Client } from "pg";
import { appEnv } from "./local-config.mjs";

const client = new Client({ connectionString: appEnv.DATABASE_URL, connectionTimeoutMillis: 3000 });

try {
  await client.connect();
  const [{ rows: migrations }, { rows: users }] = await Promise.all([
    client.query('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'),
    client.query('SELECT COUNT(*)::int AS count FROM "User"'),
  ]);
  console.log(`[database] sehat: ${migrations[0].count} migrasi, ${users[0].count} pengguna`);
} finally {
  await client.end().catch(() => {});
}
