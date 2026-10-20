import type { ReactNode } from "react";
import type { DrawerOrderState, Job } from "../../shared/types.ts";
import { blankDrawerOrder } from "../../shared/invoice.ts";
import { drawerRows, drawerSpecies } from "../../shared/outputs.ts";

const CAPACITY = 21; // rows on the supplier's form

interface Props {
  job: Job;
  update: (edit: (j: Job) => void) => void;
  flush: () => Promise<void>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 13 }}><span className="muted">{label}</span>{children}</label>;
}

function Pick<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

export function DrawerTab({ job, update, flush }: Props) {
  const d = job.drawerOrder ?? blankDrawerOrder();
  const set = (patch: Partial<DrawerOrderState>) => update((j) => { j.drawerOrder = { ...(j.drawerOrder ?? blankDrawerOrder()), ...patch }; });
  const parsed = job.cutlist?.parsed;
  const rows = parsed ? drawerRows(parsed, d.includePullouts) : [];
  const boxes = rows.reduce((t, r) => t + r.qty, 0);
  const tooMany = rows.length > CAPACITY;
  const url = `/api/jobs/${job.id}/drawer-order.xlsx`;

  return (
    <main className="page">
      <h1>Drawer order</h1>
      <p className="muted" style={{ marginTop: -8 }}>
        Fills in the supplier's drawer order form from the cutlist. The finished drawer boxes are not on the plywood cutlist.
      </p>

      {!parsed && <p>Import a cutlist on the Cutlist tab first.</p>}

      {parsed && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>Form choices</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
              <Field label={`Species (blank uses ${drawerSpecies(parsed) || "nothing"} from the cutlist)`}>
                <input value={d.species} onChange={(e) => set({ species: e.target.value })} />
              </Field>
              <Field label="Thickness">
                <Pick value={d.thickness} onChange={(v) => set({ thickness: v })} options={[{ v: "1/2", label: '1/2"' }, { v: "5/8", label: '5/8"' }]} />
              </Field>
              <Field label="Drawer grade">
                <Pick value={d.grade} onChange={(v) => set({ grade: v })} options={[
                  { v: "Cabinet Plus+", label: "Cabinet Plus+" }, { v: "Furniture Grade", label: "Furniture Grade" },
                  { v: "Commercial Standard", label: "Commercial Standard" }]} />
              </Field>
              <Field label="Top edge">
                <Pick value={d.topEdge} onChange={(v) => set({ topEdge: v })} options={[
                  { v: "", label: "None" }, { v: "Bullnose", label: "Bullnose" }, { v: "Hand Radius", label: "Hand Radius" }]} />
              </Field>
              <Field label="Front drill">
                <Pick value={d.frontDrill} onChange={(v) => set({ frontDrill: v })} options={[
                  { v: "", label: "None" }, { v: "Slab Drill", label: "Slab Drill" }, { v: "Corner Drill", label: "Corner Drill" }]} />
              </Field>
              <Field label="Bottom groove position">
                <Pick value={d.groove} onChange={(v) => set({ groove: v })} options={[
                  { v: "", label: "None" }, { v: "Undermount", label: 'Undermount Prep (1/2" bottom)' },
                  { v: "Sidemount 1/2", label: 'Sidemount (1/2" bottom)' }, { v: "Sidemount 1/4", label: 'Sidemount (1/4" bottom)' }]} />
              </Field>
              <Field label="Date ordered">
                <input type="date" value={d.dateOrdered} onChange={(e) => set({ dateOrdered: e.target.value })} />
              </Field>
              <Field label="Date requested">
                <input type="date" value={d.dateRequested} onChange={(e) => set({ dateRequested: e.target.value })} />
              </Field>
              <Field label="Delivery method">
                <input value={d.delivery} onChange={(e) => set({ delivery: e.target.value })} />
              </Field>
            </div>
            <div className="checks" style={{ marginTop: 12 }}>
              <label><input type="checkbox" checked={d.clearCoat} onChange={(e) => set({ clearCoat: e.target.checked })} /><span>Clear coat</span></label>
              <label><input type="checkbox" checked={d.includePullouts} onChange={(e) => set({ includePullouts: e.target.checked })} /><span>Include pull-outs (marked "Pull-out" in comments)</span></label>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 15, marginTop: 0 }}>{boxes} drawer box{boxes === 1 ? "" : "es"} in {rows.length} row{rows.length === 1 ? "" : "s"}</h2>
            {tooMany && (
              <p className="error-text" role="alert">
                The form has room for {CAPACITY} rows and this job needs {rows.length}. Turn off pull-outs or split the order.
              </p>
            )}
            {!rows.length && <p className="muted">No drawer boxes were found in this cutlist.</p>}
            {!!rows.length && (
              <table className="plain">
                <thead>
                  <tr><th>Qty</th><th>Height</th><th>Width</th><th>Depth</th><th>Front (H x L)</th><th>Comments</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}><td>{r.qty}</td><td>{r.height}</td><td>{r.width}</td><td>{r.depth}</td><td>{r.front}</td><td>{r.note}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              {tooMany || !rows.length
                ? <button className="btn primary" disabled>Download xlsx</button>
                : <a className="btn primary" href={url} download onClick={async (e) => {
                    e.preventDefault(); await flush(); window.location.href = url;
                  }}>Download xlsx</a>}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
