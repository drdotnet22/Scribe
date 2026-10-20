import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, jobsRepo, settingsRepo } from "./db.ts";
import { startBackups } from "./backup.ts";
import { buildDrawerForm } from "./drawerForm.ts";
import { buildDoorForm } from "./doorForm.ts";
import { closeBrowser, renderPdf } from "./pdf.ts";
import { parseCutlist, personName } from "../shared/cutlist.ts";
import { hiddenByDefault, materialsIn } from "../shared/outputs.ts";
import { carriedHidden, compareCutlists } from "../shared/diff.ts";
import { blankDoorOrder, blankDrawerOrder, blankJob } from "../shared/invoice.ts";
import type { Job } from "../shared/types.ts";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = resolve(process.env.DATA_DIR ?? "./data");
const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = process.env.WEB_DIR ? resolve(process.env.WEB_DIR) : join(here, "web");

const db = openDb(DATA_DIR);
const jobs = jobsRepo(db);
const settings = settingsRepo(db);
const app = Fastify({ logger: { level: "info" }, bodyLimit: 10 * 1024 * 1024 });

startBackups(db, jobs, DATA_DIR, (m) => app.log.info(m));

/* ---------- jobs ---------- */

app.get("/api/health", async () => ({ ok: true }));
app.get("/api/jobs", async () => jobs.list());

app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
  const job = jobs.get(req.params.id);
  return job ?? reply.code(404).send({ error: "Job not found" });
});

/** Put a cutlist on the job. An earlier one is kept in the history and its materials choices carry over. */
function attachCutlist(job: Job, text: string) {
  const parsed = parseCutlist(text);
  const old = job.cutlist;
  const now = Date.now();
  job.cutlist = {
    raw: text, parsed, imported: now,
    revision: old ? (old.revision ?? 1) + 1 : 1,
    hiddenMaterials: old
      ? carriedHidden(old.hiddenMaterials, old.parsed, parsed)
      : materialsIn(parsed).filter(hiddenByDefault),
    history: old ? [{ revision: old.revision ?? 1, imported: old.imported ?? job.created, raw: old.raw }, ...(old.history ?? [])] : [],
  };
  return parsed;
}

const looksEmpty = (p: ReturnType<typeof parseCutlist>) => !p.bodyParts.length && !p.sections.some((s) => s.rows.length);

app.post<{ Body: { title?: string; cutlistText?: string } }>("/api/jobs", async (req, reply) => {
  const { title = "", cutlistText } = req.body ?? {};
  const job = blankJob(randomUUID(), title.trim());
  if (cutlistText?.trim()) {
    const parsed = attachCutlist(job, cutlistText);
    if (looksEmpty(parsed)) {
      return reply.code(422).send({ error: "That file does not look like a cutlist. No parts were found." });
    }
    job.invoice.name = personName(parsed.customer);
    if (!job.title) {
      const surname = (parsed.customer ?? "").split(",")[0].trim();
      job.title = [surname, parsed.room?.name].filter(Boolean).join(" - ");
    }
  }
  if (!job.title) return reply.code(400).send({ error: "Give the job a name." });
  jobs.save(job);
  return job;
});

app.put<{ Params: { id: string }; Body: Job }>("/api/jobs/:id", async (req, reply) => {
  const body = req.body;
  if (!body || body.id !== req.params.id || typeof body.title !== "string" || !body.invoice) {
    return reply.code(400).send({ error: "Invalid job" });
  }
  const existing = jobs.get(req.params.id);
  if (!existing) return reply.code(404).send({ error: "Job not found" });
  body.created = existing.created;
  body.updated = Date.now();
  jobs.save(body);
  return { updated: body.updated };
});

app.delete<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) =>
  jobs.remove(req.params.id) ? { ok: true } : reply.code(404).send({ error: "Job not found" }));

/** Show what a new cutlist would change, without changing anything. */
app.post<{ Params: { id: string }; Body: { text?: string } }>("/api/jobs/:id/cutlist/compare", async (req, reply) => {
  const job = jobs.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  const parsed = parseCutlist(req.body?.text ?? "");
  if (looksEmpty(parsed)) return reply.code(422).send({ error: "That file does not look like a cutlist. No parts were found." });
  if (!job.cutlist) return reply.code(409).send({ error: "This job has no cutlist yet." });
  return compareCutlists(job.cutlist.parsed, job.cutlist.hiddenMaterials, parsed, job.cutlist.revision ?? 1);
});

app.post<{ Params: { id: string }; Body: { text?: string } }>("/api/jobs/:id/cutlist", async (req, reply) => {
  const job = jobs.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  const text = req.body?.text ?? "";
  const parsed = attachCutlist(job, text);
  if (looksEmpty(parsed)) {
    return reply.code(422).send({ error: "That file does not look like a cutlist. No parts were found." });
  }
  job.updated = Date.now();
  jobs.save(job);
  return job;
});

/* ---------- settings ---------- */

app.get("/api/settings", async () => settings.get());
app.put<{ Body: unknown }>("/api/settings", async (req) => settings.save(req.body));

/* ---------- drawer order form (.xlsx) ---------- */

app.get<{ Params: { id: string } }>("/api/jobs/:id/drawer-order.xlsx", async (req, reply) => {
  const job = jobs.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  try {
    const buf = await buildDrawerForm(job, job.drawerOrder ?? blankDrawerOrder(), settings.get());
    const name = `${job.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Job"} - Drawer order.xlsx`;
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
      .send(buf);
  } catch (e) {
    return reply.code(422).send({ error: (e as Error).message });
  }
});

app.get<{ Params: { id: string } }>("/api/jobs/:id/door-order.xlsx", async (req, reply) => {
  const job = jobs.get(req.params.id);
  if (!job) return reply.code(404).send({ error: "Job not found" });
  try {
    const buf = await buildDoorForm(job, job.doorOrder ?? blankDoorOrder());
    const name = `${job.title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Job"} - Door order.xlsx`;
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
      .send(buf);
  } catch (e) {
    return reply.code(422).send({ error: (e as Error).message });
  }
});

/* ---------- PDF ---------- */

const DOC_NAMES: Record<string, string> = { invoice: "Invoice", plywood: "Plywood cutlist" };

app.get<{ Params: { id: string; doc: string } }>("/api/jobs/:id/pdf/:doc", async (req, reply) => {
  const { id, doc } = req.params;
  const job = jobs.get(id);
  if (!job || !DOC_NAMES[doc]) return reply.code(404).send({ error: "Not found" });
  try {
    const pdf = await renderPdf(`http://127.0.0.1:${PORT}/print/${id}/${doc}`);
    const name = `${job.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "Job"} - ${DOC_NAMES[doc]}.pdf`;
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(name)}`)
      .send(pdf);
  } catch (e) {
    req.log.error(e);
    return reply.code(500).send({ error: "Could not make the PDF." });
  }
});

/* ---------- the web app ---------- */

if (existsSync(WEB_DIR)) {
  await app.register(fastifyStatic, { root: WEB_DIR });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith("/api/") ? reply.code(404).send({ error: "Not found" }) : reply.sendFile("index.html"));
}

const stop = async () => { await closeBrowser(); await app.close(); db.close(); process.exit(0); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

await app.listen({ port: PORT, host: "0.0.0.0" });
