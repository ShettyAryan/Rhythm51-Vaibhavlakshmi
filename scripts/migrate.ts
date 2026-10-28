/** Applies pending database migrations: `npm run db:migrate`. */
import { getDb } from "../lib/db";
import { migrate } from "../lib/db/migrate";

async function main() {
  const db = await getDb(); // getDb() migrates on first connect
  const ran = await migrate(db);
  console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database schema is up to date.");
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
