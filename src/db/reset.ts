/** Deletes the local embedded database. Refuses to run against a hosted one. */
import fs from "node:fs";
import path from "node:path";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL is set. Refusing to reset a hosted database.");
  process.exit(1);
}
fs.rmSync(path.join(process.cwd(), ".data"), { recursive: true, force: true });
console.log("Local database removed.");
