import { plywoodLines } from "../../shared/outputs.ts";
import { usDate } from "../../shared/invoice.ts";
import { BUSINESS } from "../../shared/business.ts";
import type { DocProps } from "./InvoiceDoc.tsx";

/** Plywood and other cut parts, grouped by material and thickness. */
export function PlywoodDoc({ job }: DocProps) {
  const cut = job.cutlist;
  const groups = plywoodLines(job);
  const total = groups.reduce((t, g) => t + g.pieces, 0);

  return (
    <div className="doc">
      <div style={{ textAlign: "center", fontWeight: 700, letterSpacing: ".08em" }}>{BUSINESS.name.toUpperCase()}</div>
      <div className="dtitle" style={{ marginTop: ".03in" }}>PLYWOOD CUTLIST</div>
      <div className="two">
        <div className="frame">
          <div className="fr"><b>Job:</b><span>{job.title}</span></div>
          <div className="fr"><b>Customer:</b><span>{job.invoice.name}</span></div>
        </div>
        <div className="frame">
          <div className="fr"><b>Date:</b><span>{usDate(job.invoice.date)}{(cut?.revision ?? 1) > 1 && <> · Revision {cut!.revision}</>}</span></div>
          <div className="fr"><b>Parts:</b><span>{total} pieces in {groups.length} material{groups.length === 1 ? "" : "s"}</span></div>
        </div>
      </div>

      {!groups.length && (
        <div className="empty-doc">No parts to show.</div>
      )}

      {groups.map((g, gi) => (
        <div className="grp" key={gi}>
          <div className="gh">
            <div className="l1">
              <span>{g.material}</span>
              <small>{g.pieces} piece{g.pieces === 1 ? "" : "s"} · {g.sqft.toFixed(1)} sq ft net</small>
            </div>
          </div>
          <table className="t">
            <colgroup>
              <col style={{ width: ".5in" }} /><col style={{ width: ".95in" }} /><col style={{ width: ".95in" }} />
              <col style={{ width: "1.6in" }} /><col />
            </colgroup>
            <thead>
              <tr><th className="c">Qty</th><th>Width</th><th>Length</th><th>Part</th><th>Cabinets</th></tr>
            </thead>
            <tbody>
              {g.rows.map((r, i) => (
                <tr key={i}>
                  <td className="c">{r.qty}</td><td>{r.w}</td><td>{r.l}</td><td>{r.part}</td>
                  <td style={{ fontSize: "8pt" }}>{r.refs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
