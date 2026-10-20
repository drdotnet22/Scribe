import type { CutlistComparison, Job, JobSummary } from "../shared/types.ts";

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
