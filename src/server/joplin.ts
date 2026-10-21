// Talks to the Joplin container (see joplin/agent.mjs). Everything here is optional: with no JOPLIN_URL, Scribe works on its own.
import type { JoplinLinksRepo } from "./db.ts";
import { JOB_NOTEBOOK, noteTitleFor, reconcileNote } from "../shared/noteSync.ts";

const BASE = (process.env.JOPLIN_URL ?? "").replace(/\/+$/, "");
export const joplinEnabled = BASE !== "";

/** The few things Scribe needs from Joplin. A fake one is used in tests. */
export interface JoplinClient {
  sync(): Promise<void>;
  /** The top-level notebook with this name (made if it does not exist). */
  ensureFolder(title: string): Promise<string>;
  createNote(folderId: string, title: string, body: string): Promise<string>;
  /** null when the note is gone (deleted, or in Joplin's trash). */
  getNote(id: string): Promise<{ body: string } | null>;
  putNote(id: string, body: string): Promise<void>;
  updateNote(id: string, change: { title?: string; folderId?: string }): Promise<void>;
  folderIsEmpty(id: string): Promise<boolean>;
  deleteFolder(id: string): Promise<void>;
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  try {
    return await fetch(BASE + path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error("Scribe could not reach the Joplin container.");
  }
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T | null> {
  const res = await request(`/api${path}`, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Joplin said no (${res.status}).`);
  return (await res.json()) as T;
}

export async function joplinReachable(): Promise<boolean> {
  if (!joplinEnabled) return false;
  try { return (await request("/health", {}, 3000)).ok; } catch { return false; }
}

// Two jobs asking for the notebook at once must not make it twice.
let folderLock: Promise<unknown> = Promise.resolve();

export const joplinClient: JoplinClient = {
  async sync() {
    const res = await request("/sync", { method: "POST" }, 150_000);
    if (!res.ok) {
      let msg = "Joplin could not sync.";
      try { msg = `Joplin could not sync: ${(await res.json()).error}`; } catch { /* keep default */ }
      throw new Error(msg);
    }
  },
  ensureFolder(title) {
    const run = async () => {
      for (let page = 1; page < 50; page++) {
        const r = await api<{ items: { id: string; title: string; parent_id: string; deleted_time?: number }[]; has_more: boolean }>(
          `/folders?fields=id,title,parent_id,deleted_time&page=${page}`);
        const found = r?.items.find((f) => f.title === title && !f.parent_id && !f.deleted_time);
        if (found) return found.id;
        if (!r?.has_more) break;
      }
      return (await api<{ id: string }>("/folders", "POST", { title }))!.id;
    };
    const result = folderLock.catch(() => undefined).then(run);
    folderLock = result;
    return result;
  },
  async createNote(folderId, title, body) { return (await api<{ id: string }>("/notes", "POST", { title, body, parent_id: folderId }))!.id; },
  async getNote(id) {
    const n = await api<{ body: string; deleted_time: number }>(`/notes/${id}?fields=id,body,deleted_time`);
    return n && !n.deleted_time ? { body: n.body } : null;
  },
  async putNote(id, body) { await api(`/notes/${id}`, "PUT", { body }); },
  async updateNote(id, change) {
    await api(`/notes/${id}`, "PUT", { ...(change.title !== undefined ? { title: change.title } : {}), ...(change.folderId ? { parent_id: change.folderId } : {}) });
  },
  async folderIsEmpty(id) {
    const r = await api<{ items: unknown[] }>(`/folders/${id}/notes?fields=id&limit=1`);
    return !!r && r.items.length === 0;
  },
  async deleteFolder(id) { await api(`/folders/${id}`, "DELETE"); },
};

export interface NoteSyncResult {
  /** idle: nothing to do yet. linked: in step with Joplin. missing: the note was deleted in Joplin. */
  status: "idle" | "linked" | "missing";
  /** The text Scribe's page should now show. */
  text: string;
  /** What happened: created the note, took Joplin's edits, kept Scribe's text (and saved Joplin's as a copy), or nothing new. */
  action?: "created" | "pushed" | "adopted" | "conflict" | "same";
}

const stamp = () => new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

/** Bring one job's note and its Joplin note into step. `text` is what Scribe's page currently shows. */
export async function syncJobNote(
  client: JoplinClient, links: JoplinLinksRepo, job: { id: string; title: string }, text: string,
): Promise<NoteSyncResult> {
  let link = links.get(job.id);
  if (link?.state === "missing") return { status: "missing", text };

  await client.sync(); // fetch whatever changed in Joplin

  const title = noteTitleFor(job.title);
  if (!link) {
    if (!text.trim()) return { status: "idle", text };
    const folderId = await client.ensureFolder(JOB_NOTEBOOK);
    const noteId = await client.createNote(folderId, title, text);
    links.set({ jobId: job.id, folderId, noteId, base: text, folderTitle: JOB_NOTEBOOK, noteTitle: title, state: "ok" });
    await client.sync();
    return { status: "linked", text, action: "created" };
  }

  const note = await client.getNote(link.noteId);
  if (!note) { links.set({ ...link, state: "missing" }); return { status: "missing", text }; }

  let changedJoplin = false;

  // Notes made by the first version were one per notebook ("<job> - Scribe", note "Notes"): move them into the shared notebook.
  if (link.folderTitle !== JOB_NOTEBOOK) {
    const oldFolder = link.folderId;
    const folderId = await client.ensureFolder(JOB_NOTEBOOK);
    await client.updateNote(link.noteId, { folderId, title });
    link = { ...link, folderId, folderTitle: JOB_NOTEBOOK, noteTitle: title };
    links.set(link);
    try { if (await client.folderIsEmpty(oldFolder)) await client.deleteFolder(oldFolder); } catch { /* leave the old notebook */ }
    changedJoplin = true;
  }

  // The job was renamed.
  if (link.noteTitle !== title) {
    await client.updateNote(link.noteId, { title });
    link = { ...link, noteTitle: title };
    links.set(link);
    changedJoplin = true;
  }

  const action = reconcileNote(text, note.body, link.base);
  let resolved = text;
  let done: NoteSyncResult["action"] = "same";
  if (action.kind === "same") {
    if (link.base !== text) links.set({ ...link, base: text });
  } else if (action.kind === "push") {
    await client.putNote(link.noteId, text);
    links.set({ ...link, base: text });
    changedJoplin = true; done = "pushed";
  } else if (action.kind === "adopt") {
    resolved = note.body; done = "adopted"; // the page saves it; the next sync then finds both sides equal
  } else {
    await client.createNote(link.folderId, `${title} - Joplin version ${stamp()}`, note.body);
    await client.putNote(link.noteId, text);
    links.set({ ...link, base: text });
    changedJoplin = true; done = "conflict";
  }
  if (changedJoplin) await client.sync(); // send our changes on to the Joplin Server
  return { status: "linked", text: resolved, action: done };
}

/**
 * After the note was deleted in Joplin: make a new, empty note for the job in the shared notebook
 * (the next sync fills it with Scribe's text).
 */
export async function relinkJobNote(client: JoplinClient, links: JoplinLinksRepo, job: { id: string; title: string }): Promise<void> {
  const link = links.get(job.id);
  if (!link) return;
  const folderId = await client.ensureFolder(JOB_NOTEBOOK);
  const title = noteTitleFor(job.title);
  const noteId = await client.createNote(folderId, title, "");
  links.set({ ...link, folderId, noteId, base: "", folderTitle: JOB_NOTEBOOK, noteTitle: title, state: "ok" });
}
