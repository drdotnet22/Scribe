import { orderGroups } from "../../shared/outputs.ts";
import { usDate } from "../../shared/invoice.ts";
import { DocHeader, Text } from "./bits.tsx";
import type { DocProps } from "./InvoiceDoc.tsx";

/** Order form for finished doors, drawer fronts and end panels. */
export function DoorOrderDoc({ job, onEdit }: DocProps) {
  const ro = !onEdit;
  const parsed = job.cutlist?.parsed;
  const groups = parsed ? orderGroups(parsed) : [];
  const setOrder = (k: "supplier" | "date" | "notes", v: string) => onEdit?.((j) => { j.order[k] = v; });

  return (
    <div className="doc">
      <DocHeader />
      <div className="dtitle">FINISHED DOOR &amp; DRAWER FRONT ORDER</div>
      <div className="two">
        <div className="frame">
          <label className="fr"><b>Supplier:</b>
            <div className="grow"><Text value={job.order.supplier} ro={ro} onChange={(v) => setOrder("supplier", v)} /></div></label>
          <label className="fr"><b>Order date:</b>
            <div className="grow"><Text type="date" value={ro ? usDate(job.order.date) : job.order.date} ro={ro}
              onChange={(v) => setOrder("date", v)} /></div></label>
        </div>
        <div className="frame">
          <div className="fr"><b>Job:</b><span>{job.title}{(job.cutlist?.revision ?? 1) > 1 && <> · Revision {job.cutlist!.revision}</>}</span></div>
          <div className="fr"><b>Customer:</b><span>{job.invoice.name}</span></div>
        </div>
      </div>

      {!groups.length && (
        <div className="empty-doc">
          No doors or drawer fronts yet. Import a cutlist on the Cutlist tab.
        </div>
      )}

      {groups.map((g) => (
        <div className="grp" key={g.key}>
          <div className="gh">
            <div className="l1">
              <span>{g.heading.toUpperCase()}</span>
              <small>{g.pieces} piece{g.pieces === 1 ? "" : "s"} · {g.sqft.toFixed(2)} sq ft</small>
            </div>
            <div className="l2">
              Style: {g.style}{g.frameMaterial && <> · Stiles &amp; rails: {g.frameMaterial}</>}
              {g.panelMaterial && <> · Panel: {g.panelMaterial}</>}
            </div>
          </div>
          <table className="t">
            <colgroup>
              <col style={{ width: ".55in" }} /><col style={{ width: "1in" }} /><col style={{ width: "1in" }} />
              {g.showHinge && <col style={{ width: ".8in" }} />}<col />
            </colgroup>
            <thead>
              <tr>
                <th className="c">Qty</th><th>Width</th><th>Height</th>
                {g.showHinge && <th>Hinge</th>}<th>Cabinet</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i}>
                  <td className="c">{r.qty}</td><td>{r.w}</td><td>{r.h}</td>
                  {g.showHinge && <td>{r.hinge}</td>}<td>{r.refs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="notes sec">
        <div className="title">NOTES TO SUPPLIER</div>
        {ro
          ? <div className="body" style={{ minHeight: ".6in" }}>{job.order.notes}</div>
          : <textarea aria-label="Notes to supplier" style={{ minHeight: ".8in" }} value={job.order.notes}
              onChange={(e) => setOrder("notes", e.target.value)} />}
      </div>
    </div>
  );
}
