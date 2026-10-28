/**
 * Resets the isolated end-to-end test database (DATA_DIR, default .data-test)
 * and seeds the demo project plus a test admin. Never points at real data:
 * it refuses to run unless DATA_DIR ends with "-test".
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dataDir = process.env.DATA_DIR ?? ".data-test";
if (!/-test$/.test(path.basename(dataDir)) || process.env.DATABASE_URL) {
  console.error("e2e-prepare only runs against an embedded DATA_DIR ending in -test.");
  process.exit(1);
}
rmSync(path.resolve(dataDir), { recursive: true, force: true });
const res = spawnSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/seed.ts"], {
  stdio: "inherit",
  env: { ...process.env, DATA_DIR: dataDir },
});
process.exit(res.status ?? 1);
