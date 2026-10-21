// Deciding what to do when a job's note exists both in Scribe and in Joplin.

export type NoteAction =
  | { kind: "same" }       // already identical: just record it
  | { kind: "push" }       // only Scribe changed: send the text to Joplin
  | { kind: "adopt" }      // only Joplin changed: Scribe takes Joplin's text
  | { kind: "conflict" };  // both changed: Scribe's text is kept, Joplin's is saved as a copy

/**
 * `base` is the text both sides last agreed on.
 * Joplin's text is never written into Scribe by the server; Scribe's page does that and saves it,
 * so a later sync finds both sides equal. Nothing is lost if that page was closed in between.
 */
export function reconcileNote(local: string, remote: string, base: string): NoteAction {
  if (local === remote) return { kind: "same" };
  if (remote === base) return { kind: "push" };
  if (local === base) return { kind: "adopt" };
  return { kind: "conflict" };
}

/** Every job's note lives in this one notebook in Joplin. */
export const JOB_NOTEBOOK = "Scribe job notes";
/** The Joplin note for a job is named after the job. */
export const noteTitleFor = (jobTitle: string) => jobTitle.trim() || "Untitled job";
