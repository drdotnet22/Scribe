import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cleanSettings, type AppSettings, type DoorDefaults } from "../../shared/settings.ts";
import { api } from "../api.ts";
import { Topbar } from "../components.tsx";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 13 }}><span className="muted">{label}</span>{children}</label>;
}

const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 };

export function SettingsPage() {
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [width, setWidth] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => { setDraft(s); setWidth(String(s.bottom38OverWidth)); }).catch((e) => setError(e.message));
  }, []);

  const door = (patch: Partial<DoorDefaults>) => { setDraft((d) => d && { ...d, doorDefaults: { ...d.doorDefaults, ...patch } }); setStatus(""); };
  const dd = draft?.doorDefaults;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setStatus(""); setError("");
    const n = Number(width);
    if (!Number.isFinite(n) || n <= 0 || n >= 200) { setError("Enter a width in inches, such as 20."); return; }
    try {
      const s = await api.saveSettings(cleanSettings({ ...draft, bottom38OverWidth: n }));
      setDraft(s); setWidth(String(s.bottom38OverWidth)); setStatus("Saved.");
    } catch (err) { setError((err as Error).message); }
  }

  const input = (value: string, onChange: (v: string) => void) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} disabled={!draft} />
  );

  return (
    <>
      <Topbar />
      <main className="page">
        <h1>Settings</h1>
        <form onSubmit={save}>
          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>Drawer order</h2>
            <label htmlFor="b38" style={{ display: "block", marginBottom: 6 }}>
              Tick the 3/8" bottom box on drawers and pull-outs wider than (inches)
            </label>
            <input id="b38" inputMode="decimal" style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6 }}
              value={width} onChange={(e) => { setWidth(e.target.value); setStatus(""); }} disabled={!draft} />
            <p className="muted" style={{ marginBottom: 0 }}>
              Applies to drawers and pull-outs read from a cutlist. A job whose drawer list you have edited by hand keeps its own ticks. Use "Start over from the cutlist" on the Drawer order tab to apply a new setting.
            </p>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, marginTop: 0 }}>Door order defaults</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Filled into the door order form of every new job. You can still change them on each job. Jobs that already exist keep what they have.
            </p>

            <h3 style={{ fontSize: 13, margin: "12px 0 8px" }}>Contact</h3>
            <div style={grid}>
              <Field label="Contact name">{input(dd?.contactName ?? "", (v) => door({ contactName: v }))}</Field>
              <Field label="Address">{input(dd?.address ?? "", (v) => door({ address: v }))}</Field>
              <Field label="City / state / zip">{input(dd?.cityStateZip ?? "", (v) => door({ cityStateZip: v }))}</Field>
              <Field label="Phone">{input(dd?.phone ?? "", (v) => door({ phone: v }))}</Field>
              <Field label="Fax or email">{input(dd?.email ?? "", (v) => door({ email: v }))}</Field>
            </div>

            <h3 style={{ fontSize: 13, margin: "16px 0 8px" }}>Door specs</h3>
            <div style={grid}>
              <Field label="Wood species">{input(dd?.species ?? "", (v) => door({ species: v }))}</Field>
              <Field label="Door style">{input(dd?.doorStyle ?? "", (v) => door({ doorStyle: v }))}</Field>
              <Field label="Inside edge profile">{input(dd?.insideEdge ?? "", (v) => door({ insideEdge: v }))}</Field>
              <Field label="Panel profile">{input(dd?.panelProfile ?? "", (v) => door({ panelProfile: v }))}</Field>
              <Field label="Outside edge profile">{input(dd?.outsideEdge ?? "", (v) => door({ outsideEdge: v }))}</Field>
              <Field label="Drawer style">{input(dd?.drawerStyle ?? "", (v) => door({ drawerStyle: v }))}</Field>
            </div>
            <div className="checks" style={{ marginTop: 12 }}>
              <label>
                <input type="checkbox" checked={dd?.euroHinges ?? true} disabled={!draft} onChange={(e) => door({ euroHinges: e.target.checked })} />
                <span>Drill for Euro hinges</span>
              </label>
            </div>
          </div>

          <div className="row">
            <button className="btn primary" disabled={!draft}>Save settings</button>
            <span role="status" className="muted">{status}</span>
            {error && <span className="error-text" role="alert">{error}</span>}
          </div>
        </form>
        <p><Link to="/">Back to jobs</Link></p>
      </main>
    </>
  );
}
