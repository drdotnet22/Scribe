import type { CutlistComparison, Job, JobSummary } from "../shared/types.ts";
import type { AppSettings } from "../shared/settings.ts";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    let msg = `Something went wrong (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSettings: () => call<AppSettings>("/api/settings"),
  saveSettings: (s: AppSettings) => call<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  list: () => call<JobSummary[]>("/api/jobs"),
  get: (id: string) => call<Job>(`/api/jobs/${id}`),
  create: (title: string, cutlistText?: string) =>
    call<Job>("/api/jobs", { method: "POST", body: JSON.stringify({ title, cutlistText }) }),
  save: (job: Job, keepalive = false) =>
    call<{ updated: number }>(`/api/jobs/${job.id}`, { method: "PUT", body: JSON.stringify(job), keepalive }),
  remove: (id: string) => call<{ ok: true }>(`/api/jobs/${id}`, { method: "DELETE" }),
  setCutlist: (id: string, text: string) =>
    call<Job>(`/api/jobs/${id}/cutlist`, { method: "POST", body: JSON.stringify({ text }) }),
  compareCutlist: (id: string, text: string) =>
    call<CutlistComparison>(`/api/jobs/${id}/cutlist/compare`, { method: "POST", body: JSON.stringify({ text }) }),
};

export interface SheetInfo { id: string; jobId: string; name: string; updated: number }

async function raw(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `Something went wrong (${res.status})`;
    try { msg = (await res.json()).error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res;
}

/** Spreadsheets are exchanged as raw .xlsx bytes. */
export const sheetsApi = {
  list: (jobId: string) => call<SheetInfo[]>(`/api/jobs/${jobId}/sheets`),
  create: async (jobId: string, name: string, bytes: Uint8Array): Promise<SheetInfo> =>
    (await raw(`/api/jobs/${jobId}/sheets?name=${encodeURIComponent(name)}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit,
    })).json(),
  load: async (sid: string): Promise<Uint8Array> => new Uint8Array(await (await raw(`/api/sheets/${sid}/file`)).arrayBuffer()),
  save: async (sid: string, bytes: Uint8Array, keepalive = false): Promise<void> => {
    await raw(`/api/sheets/${sid}/file`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit, keepalive });
  },
  rename: (sid: string, name: string) => call<SheetInfo>(`/api/sheets/${sid}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (sid: string) => call<{ ok: true }>(`/api/sheets/${sid}`, { method: "DELETE" }),
  downloadUrl: (sid: string) => `/api/sheets/${sid}/download`,
};
