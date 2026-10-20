import type { InvoiceData, Job, Line } from "../../shared/types.ts";
import { fmt, num, type Vars } from "../../shared/calc.ts";
import { totals, usDate } from "../../shared/invoice.ts";
import { Amount, DocHeader, Text } from "./bits.tsx";

export interface DocProps {
  job: Job;
  vars: Vars;
  /** Present on screen (editable). Absent when printing. */
  onEdit?: (edit: (j: Job) => void) => void;
}

type TextKey = "name" | "address" | "email" | "phone" | "wood" | "finish" | "doorStyle" | "pulls" | "notes" | "terms" | "date";

export function InvoiceDoc({ job, vars, onEdit }: DocProps) {
  const inv = job.invoice;
  const ro = !onEdit;
  const t = totals(inv, vars);
  const edit = (fn: (i: InvoiceData) => void) => onEdit?.((j) => fn(j.invoice));
  const field = (k: TextKey) => ({
    value: String(inv[k] ?? ""), ro,
    onChange: (v: string) => edit((i) => { (i as unknown as Record<string, string>)[k] = v; }),
  });

  const lines = (kind: "cabinets" | "accessories") => {
    const list: Line[] = inv[kind];
    const numbered = kind === "cabinets";
    const accTotal = list.reduce((s, r) => s + num(r.a, vars), 0);
    return (
      <div>
        <table className="t">
          <thead>
            <tr>
              {numbered && <th className="num" />}
              <th>{numbered ? "CABINETS" : "ACCESSORIES"}</th>
              <th className="amt r">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={i}>
                {numbered && <td className="num">#{i + 1}</td>}
                <td className="in">
                  {!ro && (
                    <button className="x no-print" aria-label={`Remove row ${i + 1}`} title="Remove row"
                      onClick={() => edit((x) => { x[kind].splice(i, 1); if (!x[kind].length) x[kind].push({ d: "", a: "" }); })}>×</button>
                  )}
                  <Text value={r.d} ro={ro} label="Description"
                    onChange={ro ? undefined : (v) => edit((x) => { x[kind][i].d = v; })} />
                </td>
                <td className="amt in">
                  <Amount raw={r.a} vars={vars} ro={ro} onChange={ro ? undefined : (v) => edit((x) => { x[kind][i].a = v; })} />
                </td>
              </tr>
            ))}
            {!numbered && (
              <tr className="total"><td>Total Accessories</td><td className="amt">{fmt(accTotal)}</td></tr>
            )}
          </tbody>
        </table>
        {!ro && (
          <button className="link addrow no-print"
            onClick={() => edit((x) => { x[kind].push({ d: "", a: "" }); })}>
            {numbered ? "+ Add cabinet" : "+ Add accessory"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="doc">
      <DocHeader />
      <div className="dateline">
        <span>Date:</span>
        <Text type="date" label="Invoice date" bold {...field("date")}
          value={ro ? usDate(inv.date) : inv.date} />
      </div>

      <div className="two">
        <div className="frame">
          <div className="fr title">CUSTOMER</div>
          <label className="fr"><b>Name:</b><div className="grow"><Text bold {...field("name")} /></div></label>
          <label className="fr"><b>Address:</b><div className="grow"><Text bold {...field("address")} /></div></label>
          <label className="fr"><b>Email:</b><div className="grow"><Text bold {...field("email")} /></div></label>
          <label className="fr"><b>Phone:</b><div className="grow"><Text bold {...field("phone")} /></div></label>
        </div>
        <div className="frame">
          <div className="fr title">JOB SPECS</div>
          <label className="fr">Wood:<div className="grow"><Text {...field("wood")} /></div></label>
          <label className="fr">Finish:<div className="grow"><Text {...field("finish")} /></div></label>
          <label className="fr">Door style:<div className="grow"><Text {...field("doorStyle")} /></div></label>
          <label className="fr">Pulls:<div className="grow"><Text {...field("pulls")} /></div></label>
        </div>
      </div>

      <div className="two sec">
        {lines("cabinets")}
        {lines("accessories")}
      </div>

      <div className="recapwrap sec">
        <div>
          <div className="recap">
            <div className="rt">TOTAL COST RECAP</div>
            <div className="rl"><span>TOTAL CABINETS:</span><span>{fmt(t.cab)}</span></div>
            <div className="rl"><span>ACCESSORIES:</span><span>{fmt(t.acc)}</span></div>
            {inv.recap.map((r, i) => (
              <div className="rl" key={i}>
                {!ro && (
                  <button className="x no-print" aria-label="Remove line" title="Remove line"
                    onClick={() => edit((x) => { x.recap.splice(i, 1); })}>×</button>
                )}
                <span>
                  <Text value={r.label} ro={ro} label="Line label" placeholder="Line label"
                    onChange={ro ? undefined : (v) => edit((x) => { x.recap[i].label = v; })} />
                </span>
                <span>
                  <Amount raw={r.a} vars={vars} ro={ro} onChange={ro ? undefined : (v) => edit((x) => { x.recap[i].a = v; })} />
                </span>
              </div>
            ))}
            <div className="rl"><span>SUBTOTAL:</span><span>{fmt(t.sub)}</span></div>
            <div className="rl"><span>Installation</span>
              <span><Amount raw={inv.installation} vars={vars} ro={ro} label="Installation"
                onChange={ro ? undefined : (v) => edit((x) => { x.installation = v; })} /></span></div>
            <div className="rl gt"><span>Grand Total</span><span>{fmt(t.grand)}</span></div>
            <div className="rl"><span>Amount Paid:</span>
              <span><Amount raw={inv.paid} vars={vars} ro={ro} label="Amount paid"
                onChange={ro ? undefined : (v) => edit((x) => { x.paid = v; })} /></span></div>
            <div className="rl bal"><span>Balance</span><span>{fmt(t.bal)}</span></div>
          </div>
          {!ro && (
            <button className="link addrow no-print" onClick={() => edit((x) => { x.recap.push({ label: "", a: "" }); })}>
              + Add line
            </button>
          )}
        </div>
        <div className="notes">
          <div className="title">NOTES</div>
          {ro
            ? <div className="body">{inv.notes}</div>
            : <textarea aria-label="Notes" value={inv.notes} onChange={(e) => edit((x) => { x.notes = e.target.value; })} />}
        </div>
      </div>

      <div className="terms"><Text bold {...field("terms")} /></div>
    </div>
  );
}
