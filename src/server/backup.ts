import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db, JobsRepo } from "./db.ts";

const KEEP_DAYS = 30;
const stamp = () => new Date().toISOString().slice(0, 10);

/** Writes a copy of the database and a readable JSON export once a day. */
export async function backupNow(db: Db, jobs: JobsRepo, dataDir: string, log: (m: string) => void) {
  const dir = join(dataDir, "backups");
  mkdirSync(dir, { recursive: true });
  const day = stamp();
  await db.backup(join(dir, `gcw-${day}.db`));
  writeFileSync(join(dir, `jobs-${day}.json`), JSON.stringify(jobs.all(), null, 2));
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
  }
  log(`backup written for ${day}`);
}

/** Runs a backup at start-up and again whenever the date changes. */
export function startBackups(db: Db, jobs: JobsRepo, dataDir: string, log: (m: string) => void) {
  let last = "";
  const tick = async () => {
    if (stamp() === last) return;
    try { await backupNow(db, jobs, dataDir, log); last = stamp(); }
    catch (e) { log(`backup failed: ${(e as Error).message}`); }
  };
  void tick();
  setInterval(tick, 60 * 60 * 1000).unref();
}
