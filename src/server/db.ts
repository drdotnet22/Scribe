import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Job, JobSummary } from "../shared/types.ts";
import { cleanSettings, type AppSettings } from "../shared/settings.ts";

/**
 * Storage: one SQLite file. Each job is stored as one JSON document plus a few
 * plain columns for the list screen. When the data grows real relations (suppliers,
 * orders, parts) we can move those into their own tables.
 */
export function openDb(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "gcw.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id       TEXT PRIMARY KEY,
      title    TEXT NOT NULL,
      customer TEXT NOT NULL DEFAULT '',
      created  INTEGER NOT NULL,
      updated  INTEGER NOT NULL,
      data     TEXT NOT NULL
    )`);
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  return db;
}
export type Db = ReturnType<typeof openDb>;

export function jobsRepo(db: Db) {
  const listStmt = db.prepare("SELECT id, title, customer, updated FROM jobs ORDER BY updated DESC");
  const getStmt = db.prepare("SELECT data FROM jobs WHERE id = ?");
  const allStmt = db.prepare("SELECT data FROM jobs ORDER BY updated DESC");
  const upsert = db.prepare(`
    INSERT INTO jobs (id, title, customer, created, updated, data)
    VALUES (@id, @title, @customer, @created, @updated, @data)
    ON CONFLICT(id) DO UPDATE SET title=@title, customer=@customer, updated=@updated, data=@data`);
  const del = db.prepare("DELETE FROM jobs WHERE id = ?");

  return {
    list: () => listStmt.all() as JobSummary[],
    get: (id: string): Job | undefined => {
      const row = getStmt.get(id) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as Job) : undefined;
    },
    all: (): Job[] => (allStmt.all() as { data: string }[]).map((r) => JSON.parse(r.data) as Job),
    save: (job: Job) => {
      upsert.run({
        id: job.id, title: job.title, customer: job.invoice?.name ?? "",
        created: job.created, updated: job.updated, data: JSON.stringify(job),
      });
    },
    remove: (id: string) => del.run(id).changes > 0,
  };
}
export type JobsRepo = ReturnType<typeof jobsRepo>;

export function settingsRepo(db: Db) {
  const get = db.prepare("SELECT value FROM settings WHERE key = 'app'");
  const put = db.prepare("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  return {
    get: (): AppSettings => {
      const row = get.get() as { value: string } | undefined;
      try { return cleanSettings(row ? JSON.parse(row.value) : {}); } catch { return cleanSettings({}); }
    },
    save: (s: unknown): AppSettings => { const clean = cleanSettings(s); put.run(JSON.stringify(clean)); return clean; },
  };
}
export type SettingsRepo = ReturnType<typeof settingsRepo>;
