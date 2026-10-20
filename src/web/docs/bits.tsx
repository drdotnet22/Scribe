import { useState } from "react";
import logo from "../assets/logo.png";
import { BUSINESS } from "../../shared/business.ts";
import { calc, display, isFormula, type Vars } from "../../shared/calc.ts";

export function DocHeader() {
  return (
    <div className="dhead">
      <img className="logo" src={logo} alt={BUSINESS.name} />
      <div className="biz">
        {BUSINESS.lines.map((l, i) => <div key={i} className={l.includes("@") ? "mail" : undefined}>{l}</div>)}
      </div>
    </div>
  );
}

interface TextProps {
  value: string; onChange?: (v: string) => void; ro?: boolean; bold?: boolean;
  type?: string; label?: string; placeholder?: string;
}
/** A text box on screen, plain text when printing. */
export function Text({ value, onChange, ro, bold, type = "text", label, placeholder }: TextProps) {
  if (ro || !onChange) return <span className="v" style={bold ? { fontWeight: 700 } : undefined}>{value}</span>;
  return (
    <input
      type={type} value={value} placeholder={placeholder} aria-label={label} autoComplete="off"
      style={bold ? { fontWeight: 700 } : undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

interface AmountProps { raw: string; vars: Vars; onChange?: (v: string) => void; ro?: boolean; label?: string }
/**
 * Shows the result of a formula; click it to see and edit the formula itself.
 * A purple corner marks cells that hold a formula.
 */
export function Amount({ raw, vars, onChange, ro, label = "Amount" }: AmountProps) {
  const [focus, setFocus] = useState(false);
  const r = calc(raw, vars);
  const formula = !focus && isFormula(raw, vars);
  const bad = !focus && !!r.err && !!String(raw).trim();
  if (ro || !onChange) return <span className="v amount">{display(raw, vars)}</span>;
  return (
    <input
      className={`amount${formula ? " f" : ""}${bad ? " bad" : ""}`}
      inputMode="decimal" autoComplete="off" aria-label={label}
      value={focus ? raw : display(raw, vars)}
      title={bad ? r.err : formula ? raw : undefined}
      onFocus={(e) => { setFocus(true); const el = e.target; requestAnimationFrame(() => el.select()); }}
      onBlur={() => setFocus(false)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
