import { useEffect, useState, type ReactNode } from "react";
import type { DoorOrderState, Job, SizeLine } from "../../shared/types.ts";
import { blankDoorOrder } from "../../shared/invoice.ts";
import { DEFAULT_SETTINGS, type AppSettings } from "../../shared/settings.ts";
import { api } from "../api.ts";
import { issueList, sizeLineIssues, tidyMeasure } from "../../shared/validate.ts";
import { blankSizeLine, DOOR_FORM_ROWS, doorLines, doorTableRows } from "../../shared/outputs.ts";

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  flush: () => Promise<void>;
}

type ListKey = "doors" | "fronts" | "endPanels";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 13 }}><span className="muted">{label}</span>{children}</label>;
}

const cell: React.CSSProperties = { width: "100%", padding: "4px 6px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit", minWidth: 0 };

export function DoorTab({ job, update, flush }: Props) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => { api.getSettings().then(setSettings).catch(() => { /* built-in defaults are fine */ }); }, []);
  const d = job.doorOrder ?? blankDoorOrder(settings.doorDefaults);
  const lines = doorLines(job, job.doorOrder);
  const [sure, setSure] = useState<ListKey | "">("");
  const url = `/api/jobs/${job.id}/door-order.xlsx`;

  const set = (patch: Partial<DoorOrderState>) => update((j) => { j.doorOrder = { ...(j.doorOrder ?? blankDoorOrder(settings.doorDefaults)), ...patch }; });
  const editList = (key: ListKey, change: (r: SizeLine[]) => void) =>
    update((j) => {
      const order = j.doorOrder ?? blankDoorOrder(settings.doorDefaults);
      const next = structuredClone(doorLines(j, order)[key]);
      change(next);
      j.doorOrder = { ...order, [key]: next };
    });
  const reset = (key: ListKey) => {
    if (sure !== key) { setSure(key); setTimeout(() => setSure(""), 4000); return; }
    setSure("");
    update((j) => { if (j.doorOrder) delete j.doorOrder[key]; });
  };

  const leftRows = doorTableRows(lines.doors.length, lines.endPanels.length);
  const leftTooMany = leftRows > DOOR_FORM_ROWS;
  const rightTooMany = lines.fronts.length > DOOR_FORM_ROWS;
  const total = (k: ListKey) => lines[k].reduce((t, r) => t + (Number(r.qty) || 0), 0);

  const issues = { doors: lines.doors.map(sizeLineIssues), endPanels: lines.endPanels.map(sizeLineIssues), fronts: lines.fronts.map(sizeLineIssues) };
  const problems = (k: ListKey) => issueList(issues[k], { qty: "Quantity", width: "Width", height: "Height" });
  const invalidCount = (["doors", "endPanels", "fronts"] as ListKey[]).reduce((t, k) => t + problems(k).length, 0);
  const bad: React.CSSProperties = { borderColor: "var(--danger)", background: "#fff1f0" };

  const text = (k: ListKey, key: "width" | "height" | "note", i: number, label: string) => {
    const msg = key === "note" ? undefined : issues[k][i][key];
    return (
      <input aria-label={`${label}, ${k} row ${i + 1}`} style={{ ...cell, ...(msg ? bad : {}) }} value={lines[k][i][key]}
        aria-invalid={!!msg} title={msg}
        onChange={(e) => editList(k, (r) => { r[i] = { ...r[i], [key]: e.target.value }; })}
        onBlur={key === "note" ? undefined : (e) => {
          const tidy = tidyMeasure(e.target.value);
          if (tidy !== e.target.value) editList(k, (r) => { r[i] = { ...r[i], [key]: tidy }; });
        }} />
    );
  };

  const section = (k: ListKey, title: string, help: string) => {
    const rows = lines[k];
    const edited = !!d[k];
    return (
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, margin: 0 }}>{title}: {total(k)} in {rows.length} row{rows.length === 1 ? "" : "s"}</h2>
          <span className="muted">{edited ? "Edited by hand" : job.cutlist ? "From the cutlist" : "Add rows by hand"}</span>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{help}</p>
        <table className="plain" style={{ maxWidth: 760 }}>
          <thead><tr><th style={{ width: 70 }}>Qty</th><th>Width</th><th>Height</th><th>Comments</th><th style={{ width: 44 }} /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input type="number" min={1} step={1} aria-label={`Quantity, ${k} row ${i + 1}`} style={{ ...cell, ...(issues[k][i].qty ? bad : {}) }} value={r.qty}
                    aria-invalid={!!issues[k][i].qty} title={issues[k][i].qty}
                    onChange={(e) => editList(k, (x) => { x[i] = { ...x[i], qty: e.target.value === "" ? 0 : Number(e.target.value) }; })} />
                </td>
                <td>{text(k, "width", i, "Width")}</td>
                <td>{text(k, "height", i, "Height")}</td>
                <td>{text(k, "note", i, "Comments")}</td>
                <td><button className="btn" aria-label={`Remove ${k} row ${i + 1}`} title="Remove this row" onClick={() => editList(k, (x) => { x.splice(i, 1); })}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="muted">None.</p>}
        {!!problems(k).length && <ul className="error-text" role="alert" style={{ margin: "8px 0 0", paddingLeft: 18 }}>{problems(k).map((m) => <li key={m}>{m}</li>)}</ul>}
        <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => editList(k, (x) => { x.push(blankSizeLine()); })}>Add row</button>
          {job.cutlist && (
            <button className={`btn${sure === k ? " danger sure" : ""}`} onClick={() => reset(k)}>
              {sure === k ? "Click again to discard my edits" : "Start over from the cutlist"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="page" style={{ maxWidth: 1000 }}>
      <h1>Door order</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Fills in the supplier's door order form. Door specs and contact details start from your defaults in Settings. Sizes start from the cutlist, and you can change any of them.
      </p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Order</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
          <Field label="This is a">
            <select value={d.type} onChange={(e) => set({ type: e.target.value as DoorOrderState["type"] })}>
              <option value="quote">Quote only</option>
              <option value="order">Order</option>
            </select>
          </Field>
          <Field label="Purchase order no."><input value={d.po} onChange={(e) => set({ po: e.target.value })} /></Field>
          <Field label="Date"><input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Date required"><input type="date" value={d.dateRequired} onChange={(e) => set({ dateRequired: e.target.value })} /></Field>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, marginTop: 0 }}>Door specs</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
          <Field label="Wood species"><input value={d.species} onChange={(e) => set({ species: e.target.value })} /></Field>
          <Field label="Door style"><input value={d.doorStyle} onChange={(e) => set({ doorStyle: e.target.value })} /></Field>
          <Field label="Inside edge profile"><input value={d.insideEdge} onChange={(e) => set({ insideEdge: e.target.value })} /></Field>
          <Field label="Panel profile"><input value={d.panelProfile} onChange={(e) => set({ panelProfile: e.target.value })} /></Field>
          <Field label="Outside edge profile"><input value={d.outsideEdge} onChange={(e) => set({ outsideEdge: e.target.value })} /></Field>
          <Field label="Drawer style"><input value={d.drawerStyle} onChange={(e) => set({ drawerStyle: e.target.value })} /></Field>
        </div>
        <div className="checks" style={{ marginTop: 12 }}>
          <label><input type="checkbox" checked={d.euroHinges} onChange={(e) => set({ euroHinges: e.target.checked })} /><span>Drill for Euro hinges</span></label>
        </div>
      </div>

      <details className="card" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Contact details (optional, left blank on the form unless filled in)</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12, marginTop: 12 }}>
          <Field label="Contact name"><input value={d.contactName} onChange={(e) => set({ contactName: e.target.value })} /></Field>
          <Field label="Address"><input value={d.address} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="City / state / zip"><input value={d.cityStateZip} onChange={(e) => set({ cityStateZip: e.target.value })} /></Field>
          <Field label="Phone"><input value={d.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <Field label="Fax or email"><input value={d.email} onChange={(e) => set({ email: e.target.value })} /></Field>
        </div>
      </details>

      {section("doors", "Doors", 'Doors with no hinge get "No bore" in the comments.')}
      {section("endPanels", "End panels", "These go under their own shaded END PANELS row in the door table.")}
      {section("fronts", "Drawer fronts", "These fill the form's Drawer Size table.")}

      {(leftTooMany || rightTooMany) && (
        <p className="error-text" role="alert">
          {leftTooMany && <>The door table holds {DOOR_FORM_ROWS} rows and doors plus end panels (and the END PANELS label) need {leftRows}. </>}
          {rightTooMany && <>The drawer table holds {DOOR_FORM_ROWS} rows and you have {lines.fronts.length}. </>}
          Remove some rows or split the order.
        </p>
      )}

      <div className="row">
        {invalidCount > 0 && <span className="error-text" role="alert">Fix the {invalidCount} highlighted entr{invalidCount === 1 ? "y" : "ies"} above to download.</span>}
        {invalidCount > 0 || leftTooMany || rightTooMany || !(lines.doors.length + lines.fronts.length + lines.endPanels.length)
          ? <button className="btn primary" disabled>Download xlsx</button>
          : <a className="btn primary" href={url} download onClick={async (e) => {
              e.preventDefault(); await flush(); window.location.href = url;
            }}>Download xlsx</a>}
      </div>
    </main>
  );
}
