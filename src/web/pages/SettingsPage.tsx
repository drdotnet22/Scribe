import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { DEFAULT_SETTINGS, type AppSettings } from "../../shared/settings.ts";
import { api } from "../api.ts";
import { Topbar } from "../components.tsx";

export function SettingsPage() {
  const [saved, setSaved] = useState<AppSettings | null>(null);
  const [width, setWidth] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => { setSaved(s); setWidth(String(s.bottom38OverWidth)); }).catch((e) => setError(e.message));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus(""); setError("");
    const n = Number(width);
    if (!Number.isFinite(n) || n <= 0 || n >= 200) { setError("Enter a width in inches, such as 20."); return; }
    try {
      const s = await api.saveSettings({ ...(saved ?? DEFAULT_SETTINGS), bottom38OverWidth: n });
      setSaved(s); setWidth(String(s.bottom38OverWidth)); setStatus("Saved.");
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <>
      <Topbar />
      <main className="page">
        <h1>Settings</h1>
        <form className="card" onSubmit={save}>
          <h2 style={{ fontSize: 15, marginTop: 0 }}>Drawer order</h2>
          <label htmlFor="b38" style={{ display: "block", marginBottom: 6 }}>
            Tick the 3/8" bottom box on drawers and pull-outs wider than (inches)
          </label>
          <div className="row">
            <input id="b38" inputMode="decimal" style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 6 }}
              value={width} onChange={(e) => { setWidth(e.target.value); setStatus(""); }} disabled={!saved && !error} />
            <button className="btn primary" disabled={!saved}>Save</button>
            <span role="status" className="muted">{status}</span>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Applies to drawers and pull-outs read from a cutlist. A job whose drawer list you have edited by hand keeps its own ticks. Use "Start over from the cutlist" on the Drawer order tab to apply a new setting.
          </p>
          {error && <p className="error-text" role="alert">{error}</p>}
        </form>
        <p><Link to="/">Back to jobs</Link></p>
      </main>
    </>
  );
}
