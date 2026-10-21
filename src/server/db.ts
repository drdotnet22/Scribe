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
  // Spreadsheets live in their own table as .xlsx files, so saving a job never re-sends them.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sheets (
      id      TEXT PRIMARY KEY,
      job_id  TEXT NOT NULL,
      name    TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL,
      data    BLOB NOT NULL
    )`);
  db.exec("CREATE INDEX IF NOT EXISTS sheets_job ON sheets (job_id)");
  // Which Joplin note belongs to which job, and the text both sides last agreed on.
  db.exec(`
    CREATE TABLE IF NOT EXISTS joplin_links (
      job_id       TEXT PRIMARY KEY,
      folder_id    TEXT NOT NULL,
      note_id      TEXT NOT NULL,
      base         TEXT NOT NULL,
      folder_title TEXT NOT NULL,
      state        TEXT NOT NULL DEFAULT 'ok'
    )`);
  if (!(db.prepare("PRAGMA table_info(joplin_links)").all() as { name: string }[]).some((c) => c.name === "note_title")) {
    db.exec("ALTER TABLE joplin_links ADD COLUMN note_title TEXT NOT NULL DEFAULT ''");
  }
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

export interface SheetInfo { id: string; jobId: string; name: string; updated: number }

/** Spreadsheets for a job: each one is a whole .xlsx file. */
export function sheetsRepo(db: Db) {
  const list = db.prepare("SELECT id, job_id AS jobId, name, updated FROM sheets WHERE job_id = ? ORDER BY created");
  const info = db.prepare("SELECT id, job_id AS jobId, name, updated FROM sheets WHERE id = ?");
  const data = db.prepare("SELECT data FROM sheets WHERE id = ?");
  const insert = db.prepare("INSERT INTO sheets (id, job_id, name, created, updated, data) VALUES (?, ?, ?, ?, ?, ?)");
  const setData = db.prepare("UPDATE sheets SET data = ?, updated = ? WHERE id = ?");
  const setName = db.prepare("UPDATE sheets SET name = ?, updated = ? WHERE id = ?");
  const del = db.prepare("DELETE FROM sheets WHERE id = ?");
  const delJob = db.prepare("DELETE FROM sheets WHERE job_id = ?");
  return {
    list: (jobId: string) => list.all(jobId) as SheetInfo[],
    info: (id: string) => info.get(id) as SheetInfo | undefined,
    data: (id: string) => (data.get(id) as { data: Buffer } | undefined)?.data,
    add: (id: string, jobId: string, name: string, bytes: Buffer) => { const now = Date.now(); insert.run(id, jobId, name, now, now, bytes); },
    saveData: (id: string, bytes: Buffer) => setData.run(bytes, Date.now(), id).changes > 0,
    rename: (id: string, name: string) => setName.run(name, Date.now(), id).changes > 0,
    remove: (id: string) => del.run(id).changes > 0,
    removeForJob: (jobId: string) => { delJob.run(jobId); },
  };
}
export type SheetsRepo = ReturnType<typeof sheetsRepo>;

/** folderTitle is the notebook the note was last put in; noteTitle is the note's name in Joplin. */
export interface JoplinLink { jobId: string; folderId: string; noteId: string; base: string; folderTitle: string; noteTitle: string; state: "ok" | "missing" }

export function joplinLinksRepo(db: Db) {
  const get = db.prepare("SELECT job_id AS jobId, folder_id AS folderId, note_id AS noteId, base, folder_title AS folderTitle, note_title AS noteTitle, state FROM joplin_links WHERE job_id = ?");
  const put = db.prepare(`INSERT INTO joplin_links (job_id, folder_id, note_id, base, folder_title, note_title, state) VALUES (@jobId, @folderId, @noteId, @base, @folderTitle, @noteTitle, @state)
    ON CONFLICT(job_id) DO UPDATE SET folder_id=@folderId, note_id=@noteId, base=@base, folder_title=@folderTitle, note_title=@noteTitle, state=@state`);
  const del = db.prepare("DELETE FROM joplin_links WHERE job_id = ?");
  return {
    get: (jobId: string) => get.get(jobId) as JoplinLink | undefined,
    set: (link: JoplinLink) => { put.run(link); },
    remove: (jobId: string) => { del.run(jobId); },
  };
}
export type JoplinLinksRepo = ReturnType<typeof joplinLinksRepo>;
