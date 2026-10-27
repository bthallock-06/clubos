import { openDb } from "./client";

async function main() {
  const handle = await openDb();
  await handle.migrate();
  await handle.close();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
