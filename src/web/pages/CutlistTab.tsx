import { useEffect, useRef, useState } from "react";
import type { CutlistComparison, Job } from "../../shared/types.ts";
import { personName } from "../../shared/cutlist.ts";
import { cutlistVars, materialsIn, orderGroups, plywoodGroups } from "../../shared/outputs.ts";
import { api } from "../api.ts";

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  replace: (j: Job) => void;
  flush: () => Promise<void>;
}

const KIND = { added: "Added", removed: "Removed", changed: "Changed" } as const;
const niceNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Shows what a new cutlist would change. Nothing is replaced until you approve. */
function Review({ job, text, cmp, onApprove, onCancel, busy, label }: {
  job: Job; text: string; cmp: CutlistComparison; onApprove: () => void; onCancel: () => void; busy: boolean; label: string;
}) {
  const areas = [...new Set(cmp.changes.map((c) => c.area))];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);
  return (
    <div ref={ref} className="card review" style={{ marginTop: 14, borderColor: "var(--purple)" }}>
      <h2 style={{ fontSize: 15, marginTop: 0 }}>{label}</h2>
      {cmp.identical && <p>This is the same as the current cutlist. Nothing would change.</p>}
      {cmp.notes.map((n, i) => <p key={i} style={{ margin: "4px 0" }}>{n}</p>)}
      {areas.map((area) => (
        <div key={area} style={{ marginTop: 10 }}>
          <b>{area}</b>
          <table className="plain">
            <tbody>
              {cmp.changes.filter((c) => c.area === area).map((c, i) => (
                <tr key={i} className={`chg ${c.kind}`}>
                  <td style={{ width: 80 }}>{KIND[c.kind]}</td>
                  <td>{c.item}</td>
                  <td className="n">{c.kind === "changed" ? `${c.from} → ${c.to}` : c.kind === "added" ? `+${c.to}` : `−${c.from}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!!cmp.vars.length && (
        <div style={{ marginTop: 10 }}>
          <b>Invoice formula numbers that change</b>
          <table className="plain"><tbody>
            {cmp.vars.map((v) => (
              <tr key={v.name}><td><code className="var">{v.name}</code></td><td className="n">{niceNum(v.from)} → {niceNum(v.to)}</td></tr>
            ))}
          </tbody></table>
          <p className="muted" style={{ margin: "4px 0 0" }}>Amounts on the invoice that use these names will update. Check them after approving.</p>
        </div>
      )}
      {!!cmp.warnings.length && (
        <p className="error-text">The new file has {cmp.warnings.length} line(s) that were not understood.</p>
      )}
      <p className="muted" style={{ marginBottom: 0 }}>
        The current cutlist (revision {cmp.currentRevision}) is kept in the version history, so you can go back.
      </p>
      <div className="row" style={{ marginTop: 10 }}>
        {!cmp.identical && (
          <button className="btn primary" disabled={busy} onClick={onApprove}>
            {busy ? "Applying…" : `Approve changes (revision ${cmp.currentRevision + 1})`}
          </button>
        )}
        <button className="btn" onClick={onCancel}>{cmp.identical ? "Close" : "Cancel, keep current"}</button>
      </div>
      <span hidden>{job.id}{text.length}</span>
    </div>
  );
}

function ImportBox({ job, replace, flush, hasCutlist, pending, setPending }: Pick<Props, "job" | "replace" | "flush"> & {
  hasCutlist: boolean;
  pending: Pending | null;
  setPending: (p: Pending | null) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function read() {
    setBusy(true); setError("");
    try {
      if (!hasCutlist) {
        await flush();
        const fresh = await api.setCutlist(job.id, text);
        if (!fresh.invoice.name && fresh.cutlist) fresh.invoice.name = personName(fresh.cutlist.parsed.customer ?? "");
        replace(fresh);
        setText("");
      } else {
        await flush();
        setPending({ text, cmp: await api.compareCutlist(job.id, text), label: "Changes in the new cutlist" });
      }
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h2 style={{ fontSize: 15, marginTop: 0 }}>{hasCutlist ? "Import a revised cutlist" : "Import a cutlist"}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {hasCutlist
          ? "Choose the new text file or paste it. You will see exactly what changed and can approve or cancel."
          : "Choose the supplier's text file, or paste its contents."}
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        <input type="file" accept=".txt,text/plain" aria-label="Cutlist file"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setPending(null); } }} />
      </div>
      <textarea aria-label="Cutlist text" value={text} onChange={(e) => { setText(e.target.value); setPending(null); }}
        placeholder="Or paste the cutlist text here"
        style={{ width: "100%", minHeight: 120, font: "12px/1.3 ui-monospace, Menlo, Consolas, monospace",
          border: "1px solid var(--line)", borderRadius: 6, padding: 8 }} />
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={read}>
          {busy ? "Reading…" : hasCutlist ? "Compare with current" : "Read cutlist"}
        </button>
      </div>
    </div>
  );
}

interface Pending { text: string; cmp: CutlistComparison; label: string }

export function CutlistTab({ job, update, replace, flush }: Props) {
  const cut = job.cutlist;
  const [copied, setCopied] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  if (!cut) return (
    <main className="page">
      <h1>Cutlist</h1>
      <p className="muted">No cutlist for this job yet. Import one to build the door order, the plywood cutlist and the numbers for your invoice formulas.</p>
      <ImportBox job={job} replace={replace} flush={flush} hasCutlist={false} pending={null} setPending={() => {}} />
    </main>
  );

  const p = cut.parsed;
  const orders = orderGroups(p);
  const allMaterials = plywoodGroups(p, []);
  const vars = cutlistVars(p);
  const pieces = p.bodyParts.reduce((t, x) => t + x.qty, 0);

  const toggle = (material: string, on: boolean) => update((j) => {
    const set = new Set(j.cutlist!.hiddenMaterials);
    if (on) set.delete(material); else set.add(material);
    j.cutlist!.hiddenMaterials = [...set];
  });
  async function approve() {
    if (!pending) return;
    setApplying(true); setApplyError("");
    try { replace(await api.setCutlist(job.id, pending.text)); setPending(null); }
    catch (e) { setApplyError((e as Error).message); }
    setApplying(false);
  }
  async function compareOld(raw: string, revision: number) {
    setApplyError("");
    try { await flush(); setPending({ text: raw, cmp: await api.compareCutlist(job.id, raw), label: `Going back to revision ${revision}` }); }
    catch (e) { setApplyError((e as Error).message); }
  }
  const copy = async (name: string) => {
    try { await navigator.clipboard.writeText(name); setCopied(name); setTimeout(() => setCopied(""), 1500); } catch { /* select by hand */ }
  };

  return (
    <main className="page">
      <h1>Cutlist</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Revision {cut.revision ?? 1} · {p.customer ? `${p.customer} · ` : ""}{p.room ? `${p.room.name} · ` : ""}{p.cabinetCount} cabinet rows · {pieces} cabinet parts
      </p>

      {pending && <Review job={job} text={pending.text} cmp={pending.cmp} label={pending.label} busy={applying} onApprove={approve} onCancel={() => setPending(null)} />}
      {applyError && <p className="error-text" role="alert">{applyError}</p>}

      <div className="tiles" style={{ marginTop: 14 }}>
        {orders.map((g) => (
          <div className="tile" key={g.key}><b>{g.pieces}</b><span>{g.heading} · {g.sqft.toFixed(1)} sq ft</span></div>
        ))}
        <div className="tile"><b>{allMaterials.length}</b><span>materials with cut parts</span></div>
      </div>

      {!!p.warnings.length && (
        <div className="card" style={{ borderColor: "var(--danger)", marginBottom: 14 }}>
          <b className="error-text">Some lines were not understood</b>
          <ul>{p.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Plywood cutlist: materials to include</h2>
        <div className="checks">
          {materialsIn(p).map((m) => {
            const g = allMaterials.find((x) => x.material === m);
            return (
              <label key={m}>
                <input type="checkbox" checked={!cut.hiddenMaterials.includes(m)} onChange={(e) => toggle(m, e.target.checked)} />
                <span>{m} <span className="muted">· {g?.pieces ?? 0} pcs</span></span>
              </label>
            );
          })}
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Parts with no material ("Undefined Material") are left out by default. Drawer boxes and pull-outs are listed under their own materials.
        </p>
        {job.plywood && (
          <p className="error-text" style={{ marginBottom: 0 }}>
            The plywood cutlist has been edited by hand, so these choices no longer change it. Use "Start over from the cutlist" on the Plywood cutlist tab to use them again.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Numbers you can use in invoice formulas</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Type a name into any amount on the invoice, for example <code className="var">=doors_sqft*27.5</code>. Click a name to copy it.
        </p>
        <table className="plain">
          <tbody>
            {Object.entries(vars).map(([k, v]) => (
              <tr key={k}>
                <td><code className="var" onClick={() => copy(k)} title="Click to copy">{k}</code>{copied === k && <span className="muted"> copied</span>}</td>
                <td className="n">{Number.isInteger(v) ? v : v.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Original cutlist text</summary>
        <pre className="raw">{cut.raw}</pre>
      </details>

      {!!cut.history?.length && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Earlier versions</h2>
          <table className="plain"><tbody>
            {cut.history.map((h) => (
              <tr key={h.revision}>
                <td>Revision {h.revision}</td>
                <td className="muted">{new Date(h.imported).toLocaleDateString()}</td>
                <td className="n"><button className="btn" onClick={() => compareOld(h.raw, h.revision)}>Compare / go back to this</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      <ImportBox job={job} replace={replace} flush={flush} hasCutlist pending={pending} setPending={setPending} />
    </main>
  );
}
