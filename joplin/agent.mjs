// Runs next to the Joplin client. Scribe talks to this, never to Joplin directly:
//   POST /sync   run one sync with the Joplin Server and wait for it to finish
//   /api/...     Joplin's own API (the token is added here, so Scribe never needs it)
//   GET /health  is the API up
import http from "node:http";
import { spawn } from "node:child_process";

const PORT = Number(process.env.AGENT_PORT ?? 41186);
const API = `http://127.0.0.1:${process.env.JOPLIN_API_PORT ?? 41184}`;
const TOKEN = process.env.JOPLIN_API_TOKEN ?? "";
const PROFILE = process.env.JOPLIN_PROFILE ? ["--profile", process.env.JOPLIN_PROFILE] : [];
const SYNC_TIMEOUT_MS = Number(process.env.SYNC_TIMEOUT_MS ?? 90_000);

/** Syncs run one at a time, in the order they were asked for. */
let chain = Promise.resolve();
function sync() {
  const run = () => new Promise((resolve) => {
    const child = spawn("joplin", [...PROFILE, "sync"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, SYNC_TIMEOUT_MS);
    child.on("close", () => {
      clearTimeout(timer);
      const lines = out.split("\n").map((l) => l.trim()).filter(Boolean);
      // Joplin does not set a failing exit code, so look for its "Completed" line.
      if (/Completed:/.test(out) && !/\b(error|failed)\b/i.test(lines.filter((l) => !/^Completed:|^Downloading|^Starting|^Synchronisation/.test(l)).join(" "))) {
        resolve({ ok: true, output: lines.at(-1) ?? "" });
      } else {
        const why = lines.filter((l) => !/^Synchronisation target|^Starting/.test(l)).slice(-3).join(" ");
        resolve({ ok: false, error: why || "The Joplin Server did not answer in time." });
      }
    });
  });
  const result = chain.then(run);
  chain = result.then(() => undefined);
  return result;
}

const readBody = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
});
const send = (res, status, body, type = "application/json") => { res.writeHead(status, { "Content-Type": type }); res.end(body); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://agent");
    if (url.pathname === "/health") {
      const up = await fetch(`${API}/ping`).then((r) => r.ok).catch(() => false);
      return send(res, up ? 200 : 503, JSON.stringify({ ok: up }));
    }
    if (url.pathname === "/sync" && req.method === "POST") {
      const r = await sync();
      return send(res, r.ok ? 200 : 502, JSON.stringify(r));
    }
    if (url.pathname.startsWith("/api/")) {
      const target = new URL(url.pathname.slice(4) + url.search, API);
      target.searchParams.set("token", TOKEN);
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
      const r = await fetch(target, { method: req.method, headers: body ? { "Content-Type": req.headers["content-type"] ?? "application/json" } : {}, body });
      return send(res, r.status, Buffer.from(await r.arrayBuffer()), r.headers.get("content-type") ?? "application/json");
    }
    send(res, 404, JSON.stringify({ error: "Not found" }));
  } catch (e) {
    send(res, 502, JSON.stringify({ error: String(e?.message ?? e) }));
  }
});
server.listen(PORT, "0.0.0.0", () => console.log(`Joplin agent listening on ${PORT}`));

// If Joplin's own API stops answering, exit so Docker restarts the container.
let misses = 0;
setInterval(async () => {
  const up = await fetch(`${API}/ping`).then((r) => r.ok).catch(() => false);
  misses = up ? 0 : misses + 1;
  if (misses >= 6) { console.error("Joplin API is not answering; exiting"); process.exit(1); }
}, 10_000).unref();
