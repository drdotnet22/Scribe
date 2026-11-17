import { useState } from "react";
import { GripVertical } from "lucide-react";
import type { Job, PlyEditGroup, PlyRow } from "../../shared/types.ts";
import { blankPlyRow, plywoodCsv, plywoodEditable, plywoodTotals } from "../../shared/outputs.ts";
import { issueList, plyRowIssues, tidyMeasure } from "../../shared/validate.ts";
import { PlywoodDoc } from "../docs/PlywoodDoc.tsx";

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  flush: () => Promise<void>;
}

const cell: React.CSSProperties = { width: "100%", padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit", minWidth: 0 };
const bad: React.CSSProperties = { borderColor: "var(--danger)", background: "#fff1f0" };
const grip: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 2, border: 0, background: "transparent", color: "var(--muted, #888)", cursor: "grab" };

interface Spot { gi: number; ri: number }

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
  /** Moves a row, within its material or into another. `to` is the index it is inserted before, counted before the move. */
  const moveRow = (from: Spot, to: Spot) => edit((x) => {
    const [row] = x[from.gi].rows.splice(from.ri, 1);
    const at = from.gi === to.gi && to.ri > from.ri ? to.ri - 1 : to.ri;
    x[to.gi].rows.splice(at, 0, row);
  });

  // Dragging: which row is held, and where it would drop (before row ri of material gi).
  const [held, setHeld] = useState<Spot | null>(null);
  const [drop, setDrop] = useState<Spot | null>(null);
  const endDrag = () => { setHeld(null); setDrop(null); };
  const overRow = (gi: number, ri: number) => (e: React.DragEvent<HTMLTableRowElement>) => {
    if (!held) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const box = e.currentTarget.getBoundingClientRect();
    const at = e.clientY > box.top + box.height / 2 ? ri + 1 : ri;
    if (drop?.gi !== gi || drop.ri !== at) setDrop({ gi, ri: at });
  };
  const dropRow = (e: React.DragEvent) => {
    e.preventDefault();
    if (held && drop && !(held.gi === drop.gi && (drop.ri === held.ri || drop.ri === held.ri + 1))) moveRow(held, drop);
    endDrag();
  };
  const dropLine = (gi: number, ri: number): React.CSSProperties => {
    if (!drop || drop.gi !== gi) return {};
    if (drop.ri === ri) return { boxShadow: "inset 0 2px 0 var(--accent)" };
    if (drop.ri === ri + 1 && ri === groups[gi].rows.length - 1) return { boxShadow: "inset 0 -2px 0 var(--accent)" };
    return {};
  };

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

  /** Saves CSV text as a file. The byte order mark lets Excel read the text correctly. */
  const download = (groupsToSave: PlyEditGroup[], suffix: string) => {
    const name = `${job.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "Job"} - ${suffix.replace(/[\\/:*?"<>|]+/g, "-")}.csv`;
    const url = URL.createObjectURL(new Blob(["\uFEFF", plywoodCsv(groupsToSave)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <main className="page no-print" style={{ maxWidth: 1000 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Plywood cutlist</h1>
          <div className="row">
            <button className="btn" disabled={problems.length > 0 || !groups.length} onClick={print}>Print</button>
            <button className="btn" disabled={problems.length > 0 || !groups.length} onClick={() => download(groups, "Plywood cutlist")}>Download CSV</button>
            <button className="btn primary" disabled={problems.length > 0 || !groups.length} onClick={pdf}>Open PDF</button>
          </div>
        </div>
        <p className="muted">
          {pieces} piece{pieces === 1 ? "" : "s"} in {groups.length} material{groups.length === 1 ? "" : "s"} ·{" "}
          {edited ? "Edited by hand. A revised cutlist will not change it." : job.cutlist ? "From the cutlist" : "No cutlist, add materials and parts by hand"}.
          {" "}Change any size or quantity, add parts, or remove what you do not need. Print, PDF and CSV use this list.
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
              <button className="btn" disabled={!!issues[gi].name || issues[gi].rows.some((i) => Object.values(i).some(Boolean))}
                onClick={() => download([grp], grp.material.trim())}>CSV</button>
              <button className={`btn danger${sure === gi ? " sure" : ""}`} onClick={() => confirm(gi, () => edit((x) => { x.splice(gi, 1); }))}>
                {sure === gi ? "Click again to remove" : "Remove material"}
              </button>
            </div>
            <table className="plain" style={{ maxWidth: 900 }}>
              <thead><tr><th style={{ width: 28 }} /><th style={{ width: 70 }}>Qty</th><th style={{ width: 120 }}>Width</th><th style={{ width: 120 }}>Length</th><th>Part</th><th>Cabinets</th><th style={{ width: 44 }} /></tr></thead>
              <tbody>
                {grp.rows.map((r, ri) => (
                  <tr key={ri} onDragOver={overRow(gi, ri)} onDrop={dropRow}
                    style={{ ...dropLine(gi, ri), ...(held?.gi === gi && held.ri === ri ? { opacity: 0.4 } : {}) }}>
                    <td style={{ padding: "5px 0" }}>
                      <button type="button" draggable style={grip} title="Drag to reorder, or use the arrow keys"
                        aria-label={`Move row ${ri + 1}, ${g(gi)}. Use the up and down arrow keys.`}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", "");
                          const tr = e.currentTarget.closest("tr");
                          if (tr) e.dataTransfer.setDragImage(tr, 14, tr.offsetHeight / 2);
                          setHeld({ gi, ri });
                        }}
                        onDragEnd={endDrag}
                        onKeyDown={(e) => {
                          const up = e.key === "ArrowUp", down = e.key === "ArrowDown";
                          if (!up && !down) return;
                          e.preventDefault();
                          const tr = e.currentTarget.closest("tr");
                          if (up && ri > 0) moveRow({ gi, ri }, { gi, ri: ri - 1 });
                          else if (down && ri < grp.rows.length - 1) moveRow({ gi, ri }, { gi, ri: ri + 2 });
                          else return;
                          // Keep focus on the handle as the row moves.
                          requestAnimationFrame(() => ((up ? tr?.previousElementSibling : tr?.nextElementSibling)?.querySelector("button[draggable]") as HTMLElement | null)?.focus());
                        }}>
                        <GripVertical size={16} aria-hidden />
                      </button>
                    </td>
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
