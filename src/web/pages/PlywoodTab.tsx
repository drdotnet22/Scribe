import { useState } from "react";
import type { Job, PlyEditGroup, PlyRow } from "../../shared/types.ts";
import { blankPlyRow, plywoodEditable, plywoodTotals } from "../../shared/outputs.ts";
import { issueList, plyRowIssues, tidyMeasure } from "../../shared/validate.ts";
import { PlywoodDoc } from "../docs/PlywoodDoc.tsx";

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  flush: () => Promise<void>;
}

const cell: React.CSSProperties = { width: "100%", padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit", minWidth: 0 };
const bad: React.CSSProperties = { borderColor: "var(--danger)", background: "#fff1f0" };

/** The plywood cutlist: starts from the cutlist, and every material and part can be changed, added or removed. */
export function PlywoodTab({ job, update, flush }: Props) {
  const groups = plywoodEditable(job);
  const totals = plywoodTotals(groups);
  const edited = !!job.plywood;
  const [sure, setSure] = useState<"" | "reset" | number>("");

  const issues = groups.map((g) => ({ name: g.material.trim() ? undefined : "Give the material a name.", rows: g.rows.map(plyRowIssues) }));
  const problems = groups.flatMap((g, gi) => [
    ...(issues[gi].name ? [`${g.material || `Material ${gi + 1}`}: ${issues[gi].name}`] : []),
    ...issueList(issues[gi].rows, { qty: "Quantity", w: "Width", l: "Length" }).map((m) => `${g.material.trim() || `Material ${gi + 1}`}, ${m}`),
  ]);
  const pieces = totals.reduce((t, g) => t + g.pieces, 0);

  /** Any change turns the list into a hand-edited copy. */
  const edit = (change: (g: PlyEditGroup[]) => void) =>
    update((j) => {
      const next = structuredClone(plywoodEditable(j));
      change(next);
      j.plywood = { groups: next };
    });
  const setRow = (gi: number, ri: number, patch: Partial<PlyRow>) => edit((g) => { g[gi].rows[ri] = { ...g[gi].rows[ri], ...patch }; });
  const confirm = (what: "reset" | number, run: () => void) => {
    if (sure !== what) { setSure(what); setTimeout(() => setSure(""), 4000); return; }
    setSure(""); run();
  };

  const size = (gi: number, ri: number, key: "w" | "l", label: string) => {
    const msg = issues[gi].rows[ri][key];
    return (
      <input aria-label={`${label}, ${g(gi)} row ${ri + 1}`} aria-invalid={!!msg} title={msg} style={{ ...cell, ...(msg ? bad : {}) }}
        value={groups[gi].rows[ri][key]}
        onChange={(e) => setRow(gi, ri, { [key]: e.target.value })}
        onBlur={(e) => { const t = tidyMeasure(e.target.value); if (t !== e.target.value) setRow(gi, ri, { [key]: t }); }} />
    );
  };
  const g = (gi: number) => groups[gi].material.trim() || `material ${gi + 1}`;

  const print = async () => { await flush(); window.print(); };
  const pdf = async () => {
    await flush();
    const url = `/api/jobs/${job.id}/pdf/plywood`;
    if (!window.open(url, "_blank")) window.location.href = url;
  };

  return (
    <>
      <main className="page no-print" style={{ maxWidth: 1000 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Plywood cutlist</h1>
          <div className="row">
            <button className="btn" disabled={problems.length > 0 || !groups.length} onClick={print}>Print</button>
            <button className="btn primary" disabled={problems.length > 0 || !groups.length} onClick={pdf}>Open PDF</button>
          </div>
        </div>
        <p className="muted">
          {pieces} piece{pieces === 1 ? "" : "s"} in {groups.length} material{groups.length === 1 ? "" : "s"} ·{" "}
          {edited ? "Edited by hand. A revised cutlist will not change it." : job.cutlist ? "From the cutlist" : "No cutlist, add materials and parts by hand"}.
          {" "}Change any size or quantity, add parts, or remove what you do not need. Print and PDF use this list.
        </p>

        {!!problems.length && (
          <ul className="error-text" role="alert" style={{ margin: "0 0 12px", paddingLeft: 18 }}>
            {problems.map((m) => <li key={m}>{m}</li>)}
          </ul>
        )}

        {!groups.length && <p className="muted">No materials yet. Add one below{job.cutlist ? "" : ", or import a cutlist on the Cutlist tab"}.</p>}

        {groups.map((grp, gi) => (
          <div className="card" style={{ marginBottom: 14 }} key={gi}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" }}>
              <input aria-label={`Material name, ${gi + 1}`} aria-invalid={!!issues[gi].name} title={issues[gi].name}
                style={{ ...cell, width: 280, fontWeight: 700, ...(issues[gi].name ? bad : {}) }} value={grp.material} placeholder="Material, such as 3/4 Maple VC"
                onChange={(e) => edit((x) => { x[gi].material = e.target.value; })} />
              <span className="muted">{totals[gi].pieces} piece{totals[gi].pieces === 1 ? "" : "s"} · {totals[gi].sqft.toFixed(1)} sq ft net</span>
              <button className={`btn danger${sure === gi ? " sure" : ""}`} onClick={() => confirm(gi, () => edit((x) => { x.splice(gi, 1); }))}>
                {sure === gi ? "Click again to remove" : "Remove material"}
              </button>
            </div>
            <table className="plain" style={{ maxWidth: 900 }}>
              <thead><tr><th style={{ width: 70 }}>Qty</th><th style={{ width: 120 }}>Width</th><th style={{ width: 120 }}>Length</th><th>Part</th><th>Cabinets</th><th style={{ width: 44 }} /></tr></thead>
              <tbody>
                {grp.rows.map((r, ri) => (
                  <tr key={ri}>
                    <td>
                      <input type="number" min={1} step={1} aria-label={`Quantity, ${g(gi)} row ${ri + 1}`} aria-invalid={!!issues[gi].rows[ri].qty} title={issues[gi].rows[ri].qty}
                        style={{ ...cell, ...(issues[gi].rows[ri].qty ? bad : {}) }} value={r.qty}
                        onChange={(e) => setRow(gi, ri, { qty: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    </td>
                    <td>{size(gi, ri, "w", "Width")}</td>
                    <td>{size(gi, ri, "l", "Length")}</td>
                    <td><input aria-label={`Part, ${g(gi)} row ${ri + 1}`} style={cell} value={r.part} onChange={(e) => setRow(gi, ri, { part: e.target.value })} /></td>
                    <td><input aria-label={`Cabinets, ${g(gi)} row ${ri + 1}`} style={cell} value={r.refs} onChange={(e) => setRow(gi, ri, { refs: e.target.value })} /></td>
                    <td><button className="btn" aria-label={`Remove row ${ri + 1}, ${g(gi)}`} title="Remove this part" onClick={() => edit((x) => { x[gi].rows.splice(ri, 1); })}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!grp.rows.length && <p className="muted">No parts.</p>}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => edit((x) => { x[gi].rows.push(blankPlyRow()); })}>Add part</button>
            </div>
          </div>
        ))}

        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" onClick={() => edit((x) => { x.push({ material: "", rows: [blankPlyRow()] }); })}>Add material</button>
          {job.cutlist && (
            <button className={`btn${sure === "reset" ? " danger sure" : ""}`} onClick={() => confirm("reset", () => update((j) => { delete j.plywood; }))}>
              {sure === "reset" ? "Click again to discard my edits" : "Start over from the cutlist"}
            </button>
          )}
        </div>
      </main>

      {/* What Print and the PDF use: the same list, laid out as a page. */}
      <div className="workspace print-only"><div className="sheet"><PlywoodDoc job={job} vars={{}} /></div></div>
    </>
  );
}
