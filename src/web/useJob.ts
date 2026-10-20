import { useCallback, useEffect, useRef, useState } from "react";
import type { Job } from "../shared/types.ts";
import { api } from "./api.ts";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Loads one job, keeps edits in memory, and saves them shortly after you stop typing. */
export function useJob(id: string | undefined) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [save, setSave] = useState<SaveState>("idle");
  const latest = useRef<Job | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);

  const flush = useCallback(async (keepalive = false) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    setSave("saving");
    try { await api.save(latest.current, keepalive); setSave(dirty.current ? "dirty" : "saved"); }
    catch { dirty.current = true; setSave("error"); }
  }, []);

  useEffect(() => {
    latest.current = null; dirty.current = false;
    setJob(null); setError(""); setSave("idle");
    if (!id) return;
    let cancelled = false;
    api.get(id).then((j) => { if (!cancelled) { latest.current = j; setJob(j); } })
      .catch((e) => { if (!cancelled) setError(e.message); });
    const onHide = () => { void flush(true); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      void flush(true);
    };
  }, [id, flush]);

  /** Change the job: `edit` gets a copy to modify. */
  const update = useCallback((edit: (j: Job) => void) => {
    if (!latest.current) return;
    const next = structuredClone(latest.current);
    edit(next);
    latest.current = next;
    dirty.current = true;
    setJob(next);
    setSave("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }, [flush]);

  /** Replace the whole job with one the server already saved. */
  const replace = useCallback((j: Job) => { latest.current = j; dirty.current = false; setJob(j); setSave("saved"); }, []);

  /** Forget unsaved edits (used right before deleting the job). */
  const discard = useCallback(() => {
    dirty.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  return { job, error, save, update, replace, flush, discard };
}
