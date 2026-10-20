import { useEffect, useState, type ReactNode } from "react";
import type { DrawerLine, DrawerOrderState, Job } from "../../shared/types.ts";
import { blankDrawerOrder } from "../../shared/invoice.ts";
import { DEFAULT_SETTINGS, type AppSettings } from "../../shared/settings.ts";
import { api } from "../api.ts";
import { drawerLineIssues, issueList, tidyMeasure } from "../../shared/validate.ts";
import { blankDrawerLine, depthMatchesSlide, drawerLines, SLIDE_SIZES } from "../../shared/outputs.ts";

const CAPACITY = 21; // rows on the supplier's form

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  flush: () => Promise<void>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 13 }}><span className="muted">{label}</span>{children}</label>;
}

const cell: React.CSSProperties = { width: "100%", padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit", minWidth: 0 };

export function DrawerTab({ job, update, flush }: Props) {
  const d = job.drawerOrder ?? blankDrawerOrder();
  const [sure, setSure] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => { /* defaults are fine */ }); }, []);
  const edited = !!d.rows;
  const rows = drawerLines(job, job.drawerOrder, settings);
  const boxes = rows.reduce((t, r) => t + (Number(r.qty) || 0), 0);
  const tooMany = rows.length > CAPACITY;
  const badDepth = rows.map((r, i) => (depthMatchesSlide(r) ? -1 : i + 1)).filter((n) => n > 0);
  const url = `/api/jobs/${job.id}/drawer-order.xlsx`;
  const issues = rows.map(drawerLineIssues);
  const problems = issueList(issues, { qty: "Quantity", height: "Height", width: "Width", depth: "Depth", scallop: "Scallop sides to" });
  const bad: React.CSSProperties = { borderColor: "var(--danger)", background: "#fff1f0" };

  const setOrder = (patch: Partial<DrawerOrderState>) =>
    update((j) => { j.drawerOrder = { ...(j.drawerOrder ?? blankDrawerOrder()), ...patch }; });
  /** Any change to the rows turns the list into a hand-edited copy. */
  const editRows = (change: (r: DrawerLine[]) => void) =>
    update((j) => {
      const order = j.drawerOrder ?? blankDrawerOrder();
      const next = structuredClone(drawerLines(j, order, settings));
      change(next);
      j.drawerOrder = { ...order, rows: next };
    });
  const setRow = (i: number, patch: Partial<DrawerLine>) => editRows((r) => { r[i] = { ...r[i], ...patch }; });
  const reset = () => {
    if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; }
    setSure(false);
    update((j) => { if (j.drawerOrder) delete j.drawerOrder.rows; });
  };

  const text = (i: number, key: "height" | "width" | "depth" | "scallop" | "front" | "note", label: string, width?: number) => {
    const measure = key === "height" || key === "width" || key === "depth" || key === "scallop";
    const msg = measure ? issues[i][key] : undefined;
    return (
      <input aria-label={`${label}, row ${i + 1}`} aria-invalid={!!msg} title={msg}
        style={{ ...cell, width: width ?? "100%", ...(msg || (key === "depth" && !depthMatchesSlide(rows[i])) ? bad : {}) }} value={rows[i][key]}
        onChange={(e) => setRow(i, { [key]: e.target.value })}
        onBlur={measure ? (e) => { const t = tidyMeasure(e.target.value); if (t !== e.target.value) setRow(i, { [key]: t }); } : undefined} />
    );
  };
  const check = (i: number, key: "bottom38" | "pulloutNoScoop" | "pulloutScoop" | "ears" | "partsOnly" | "logo", label: string) => (
    <input type="checkbox" aria-label={`${label}, row ${i + 1}`} checked={rows[i][key]} onChange={(e) => setRow(i, { [key]: e.target.checked })} />
  );

  return (
    <main className="page" style={{ maxWidth: 1180 }}>
      <h1>Drawer order</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Fills in the supplier's drawer order form. Drawer sizes start from the cutlist; change any of them, or add and remove drawers.
        Depths are rounded up to the undermount slide sizes ({SLIDE_SIZES.join(", ")}). Pull-outs are the exception.
        Drawers wider than {settings.bottom38OverWidth}" get the 3/8" bottom box ticked (change this in Settings).
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Order details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
          <Field label="Date ordered">
            <input type="date" value={d.dateOrdered} onChange={(e) => setOrder({ dateOrdered: e.target.value })} />
          </Field>
          <Field label="Date requested">
            <input type="date" value={d.dateRequested} onChange={(e) => setOrder({ dateRequested: e.target.value })} />
          </Field>
          <Field label="Delivery method">
            <input value={d.delivery} onChange={(e) => setOrder({ delivery: e.target.value })} />
          </Field>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>The drawer specs (thickness, grade, edge and so on) always stay as the supplier's form ships. Species is Maple.</p>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>{boxes} drawer{boxes === 1 ? "" : "s"} in {rows.length} row{rows.length === 1 ? "" : "s"}</h2>
          <span className="muted">{edited ? "Edited by hand" : job.cutlist ? "From the cutlist" : "No cutlist, add drawers by hand"}</span>
        </div>
        {tooMany && (
          <p className="error-text" role="alert">
            The form has room for {CAPACITY} rows and this list has {rows.length}. Remove some rows or split the order.
          </p>
        )}

        {!!badDepth.length && (
          <p className="error-text" role="alert">
            Row{badDepth.length === 1 ? "" : "s"} {badDepth.join(", ")}: depth is not an undermount slide size ({SLIDE_SIZES.join(", ")}). Fix the depth, or tick a pullout box if it is a pull-out.
          </p>
        )}

        {!!problems.length && (
          <div className="error-text" role="alert">
            <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{problems.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table className="plain" style={{ minWidth: 1050 }}>
            <thead>
              <tr>
                <th>Qty</th><th>Height</th><th>Width</th><th>Depth</th>
                <th title='3/8" bottom'>3/8" btm</th><th title="Pullout with no scoop">Pullout</th><th title="Pullout with scoop">Pullout scoop</th>
                <th>Ears</th><th>Scallop sides to</th><th>Parts only</th><th>Logo</th><th>Front size</th><th>Comments</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ width: 56 }}>
                    <input type="number" min={1} step={1} aria-label={`Quantity, row ${i + 1}`} style={{ ...cell, ...(issues[i].qty ? bad : {}) }} value={r.qty}
                      aria-invalid={!!issues[i].qty} title={issues[i].qty}
                      onChange={(e) => setRow(i, { qty: e.target.value === "" ? 0 : Number(e.target.value) })} />
                  </td>
                  <td style={{ width: 84 }}>{text(i, "height", "Height")}</td>
                  <td style={{ width: 84 }}>{text(i, "width", "Width")}</td>
                  <td style={{ width: 84 }}>{text(i, "depth", "Depth")}</td>
                  <td className="c">{check(i, "bottom38", '3/8" bottom')}</td>
                  <td className="c">{check(i, "pulloutNoScoop", "Pullout with no scoop")}</td>
                  <td className="c">{check(i, "pulloutScoop", "Pullout with scoop")}</td>
                  <td className="c">{check(i, "ears", "Ears")}</td>
                  <td style={{ width: 84 }}>{text(i, "scallop", "Scallop sides to")}</td>
                  <td className="c">{check(i, "partsOnly", "Parts only")}</td>
                  <td className="c">{check(i, "logo", "Brand logo")}</td>
                  <td style={{ width: 110 }}>{text(i, "front", "Front size")}</td>
                  <td>{text(i, "note", "Comments")}</td>
                  <td>
                    <button className="btn" aria-label={`Remove row ${i + 1}`} title="Remove this drawer" onClick={() => editRows((x) => { x.splice(i, 1); })}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p className="muted">No drawers yet.</p>}

        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => editRows((x) => { x.push(blankDrawerLine()); })}>Add drawer</button>
          {job.cutlist && (
            <button className={`btn${sure ? " danger sure" : ""}`} onClick={reset}>
              {sure ? "Click again to discard my edits" : "Start over from the cutlist"}
            </button>
          )}
          {job.cutlist && !edited && (
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={d.includePullouts} onChange={(e) => setOrder({ includePullouts: e.target.checked })} />
              <span>Include pull-outs from the cutlist</span>
            </label>
          )}
          <span style={{ flex: 1 }} />
          {problems.length > 0 && <span className="error-text" role="alert">Fix the {problems.length} highlighted entr{problems.length === 1 ? "y" : "ies"} to download.</span>}
          {tooMany || problems.length > 0 || !rows.length
            ? <button className="btn primary" disabled>Download xlsx</button>
            : <a className="btn primary" href={url} download onClick={async (e) => {
                e.preventDefault(); await flush(); window.location.href = url;
              }}>Download xlsx</a>}
        </div>
        {edited && job.cutlist && (
          <p className="muted" style={{ marginBottom: 0 }}>
            This list is yours now. A revised cutlist will not change it. Use "Start over from the cutlist" to pick up the new sizes.
          </p>
        )}
      </div>
    </main>
  );
}
