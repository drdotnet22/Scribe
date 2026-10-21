// Talks to the Joplin container (see joplin/agent.mjs). Everything here is optional: with no JOPLIN_URL, Scribe works on its own.
import type { JoplinLinksRepo } from "./db.ts";
import { notebookTitle, reconcileNote } from "../shared/noteSync.ts";

const BASE = (process.env.JOPLIN_URL ?? "").replace(/\/+$/, "");
export const joplinEnabled = BASE !== "";

/** The few things Scribe needs from Joplin. A fake one is used in tests. */
export interface JoplinClient {
  sync(): Promise<void>;
  createFolder(title: string): Promise<string>;
  renameFolder(id: string, title: string): Promise<void>;
  folderExists(id: string): Promise<boolean>;
  createNote(folderId: string, title: string, body: string): Promise<string>;
  /** null when the note is gone (deleted, or in Joplin's trash). */
  getNote(id: string): Promise<{ body: string } | null>;
  putNote(id: string, body: string): Promise<void>;
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

export const joplinClient: JoplinClient = {
  async sync() {
    const res = await request("/sync", { method: "POST" }, 150_000);
    if (!res.ok) {
      let msg = "Joplin could not sync.";
      try { msg = `Joplin could not sync: ${(await res.json()).error}`; } catch { /* keep default */ }
      throw new Error(msg);
    }
  },
  async createFolder(title) { return (await api<{ id: string }>("/folders", "POST", { title }))!.id; },
  async renameFolder(id, title) { await api(`/folders/${id}`, "PUT", { title }); },
  async folderExists(id) {
    const f = await api<{ deleted_time?: number }>(`/folders/${id}?fields=id,deleted_time`);
    return !!f && !f.deleted_time;
  },
  async createNote(folderId, title, body) { return (await api<{ id: string }>("/notes", "POST", { title, body, parent_id: folderId }))!.id; },
  async getNote(id) {
    const n = await api<{ body: string; deleted_time: number }>(`/notes/${id}?fields=id,body,deleted_time`);
    return n && !n.deleted_time ? { body: n.body } : null;
  },
  async putNote(id, body) { await api(`/notes/${id}`, "PUT", { body }); },
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
  const link = links.get(job.id);
  if (link?.state === "missing") return { status: "missing", text };

  await client.sync(); // fetch whatever changed in Joplin

  const wanted = notebookTitle(job.title);
  if (!link) {
    if (!text.trim()) return { status: "idle", text };
    const folderId = await client.createFolder(wanted);
    const noteId = await client.createNote(folderId, "Notes", text);
    links.set({ jobId: job.id, folderId, noteId, base: text, folderTitle: wanted, state: "ok" });
    await client.sync();
    return { status: "linked", text, action: "created" };
  }

  const note = await client.getNote(link.noteId);
  if (!note) { links.set({ ...link, state: "missing" }); return { status: "missing", text }; }

  let changedJoplin = false;
  if (link.folderTitle !== wanted) {
    await client.renameFolder(link.folderId, wanted);
    links.set({ ...link, folderTitle: wanted });
    changedJoplin = true;
  }

  const action = reconcileNote(text, note.body, link.base);
  let resolved = text;
  let done: NoteSyncResult["action"] = "same";
  if (action.kind === "same") {
    if (link.base !== text) links.set({ ...link, base: text, folderTitle: wanted });
  } else if (action.kind === "push") {
    await client.putNote(link.noteId, text);
    links.set({ ...link, base: text, folderTitle: wanted });
    changedJoplin = true; done = "pushed";
  } else if (action.kind === "adopt") {
    resolved = note.body; done = "adopted"; // the page saves it; the next sync then finds both sides equal
  } else {
    await client.createNote(link.folderId, `Notes - Joplin version ${stamp()}`, note.body);
    await client.putNote(link.noteId, text);
    links.set({ ...link, base: text, folderTitle: wanted });
    changedJoplin = true; done = "conflict";
  }
  if (changedJoplin) await client.sync(); // send our changes on to the Joplin Server
  return { status: "linked", text: resolved, action: done };
}

/**
 * After the note was deleted in Joplin: make a new, empty note in the same notebook if it is still there
 * (the next sync fills it with Scribe's text), otherwise forget the link so a fresh notebook is made.
 */
export async function relinkJobNote(client: JoplinClient, links: JoplinLinksRepo, jobId: string): Promise<void> {
  const link = links.get(jobId);
  if (!link) return;
  if (await client.folderExists(link.folderId)) {
    const noteId = await client.createNote(link.folderId, "Notes", "");
    links.set({ ...link, noteId, base: "", state: "ok" });
  } else {
    links.remove(jobId);
  }
}
