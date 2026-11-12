import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The whole sign-in flow against a tiny fake OpenID Connect provider.

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

let idp: FastifyInstance, issuer = "";
/** Who the fake provider signs in next. */
let account: Record<string, unknown> = {};
const codes = new Map<string, { nonce: string; challenge: string; clientId: string }>();

async function startIdp() {
  idp = Fastify();
  idp.get("/.well-known/openid-configuration", async () => ({
    issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
    end_session_endpoint: `${issuer}/logout`, response_types_supported: ["code"], subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"],
  }));
  idp.get("/jwks", async () => ({ keys: [jwk] }));
  idp.get<{ Querystring: Record<string, string> }>("/authorize", async (req, reply) => {
    const q = req.query;
    const code = `code-${codes.size}`;
    codes.set(code, { nonce: q.nonce, challenge: q.code_challenge, clientId: q.client_id });
    return reply.redirect(`${q.redirect_uri}?code=${code}&state=${encodeURIComponent(q.state)}`);
  });
  idp.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_r, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(body as string))));
  idp.post<{ Body: Record<string, string> }>("/token", async (req, reply) => {
    const c = codes.get(req.body.code);
    const pkceOk = c && createHash("sha256").update(req.body.code_verifier ?? "").digest("base64url") === c.challenge;
    if (!c || !pkceOk || req.body.client_secret !== "s3cret") return reply.code(400).send({ error: "invalid_grant" });
    codes.delete(req.body.code);
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: "RS256", kid: "k1", typ: "JWT" });
    const body = b64({ iss: issuer, aud: c.clientId, iat: now, exp: now + 300, nonce: c.nonce, ...account });
    const sig = sign("sha256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url");
    return { access_token: "at", token_type: "Bearer", expires_in: 300, id_token: `${head}.${body}.${sig}` };
  });
  await idp.listen({ port: 0, host: "127.0.0.1" });
  const addr = idp.server.address();
  issuer = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
}

let app: FastifyInstance, internalToken = "", dataDir = "";
before(async () => {
  await startIdp();
  dataDir = mkdtempSync(join(tmpdir(), "scribe-auth-"));
  Object.assign(process.env, {
    OIDC_ISSUER: issuer, OIDC_CLIENT_ID: "scribe", OIDC_CLIENT_SECRET: "s3cret",
    APP_URL: "https://scribe.test:5877", AUTH_ALLOWED_USER: "me@example.com",
  });
  const auth = await import("../src/server/auth.ts");
  internalToken = auth.internalToken;
  app = Fastify();
  assert.equal(auth.setupAuth(app, dataDir), true);
  app.get("/api/jobs", async (req) => ({ user: req.user?.name ?? null }));
  app.get("/print/x", async () => "print page");
  app.setNotFoundHandler(async () => "index.html"); // how the server serves the web app
  await app.ready();
});
after(async () => { await app?.close(); await idp?.close(); rmSync(dataDir, { recursive: true, force: true }); });

const cookiesOf = (res: { headers: Record<string, unknown> }) =>
  ([] as string[]).concat((res.headers["set-cookie"] as string | string[] | undefined) ?? []);
const cookieValue = (res: { headers: Record<string, unknown> }, name: string) =>
  cookiesOf(res).find((c) => c.startsWith(`${name}=`))?.split(";")[0];

/** Go through the whole sign-in as `who`; returns the callback response. */
async function signIn(who: Record<string, unknown>, returnTo = "/jobs/1/invoice") {
  account = who;
  const login = await app.inject(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  assert.equal(login.statusCode, 302);
  const authorize = new URL(login.headers.location as string);
  assert.equal(authorize.origin, issuer);
  assert.equal(authorize.searchParams.get("redirect_uri"), "https://scribe.test:5877/auth/callback");
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  const back = await fetch(authorize, { redirect: "manual" });
  const callback = new URL(back.headers.get("location")!);
  return app.inject({ url: callback.pathname + callback.search, headers: { cookie: cookieValue(login, "scribe_login")! } });
}

test("everything needs a session", async () => {
  assert.equal((await app.inject("/api/jobs")).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/jobs" })).statusCode, 401);
  const page = await app.inject("/jobs/1/invoice?x=1");
  assert.equal(page.statusCode, 302);
  assert.equal(page.headers.location, "/auth/login?returnTo=%2Fjobs%2F1%2Finvoice%3Fx%3D1");
});

test("the web app's catch-all is guarded too", async () => {
  const res = await app.inject("/assets/index.js");
  assert.equal(res.statusCode, 302);
  assert.notEqual(res.body, "index.html");
});

test("the allowed user signs in and stays signed in with the cookie", async () => {
  const res = await signIn({ sub: "u1", email: "Me@Example.com", email_verified: true, name: "Ryan" });
  assert.equal(res.statusCode, 302, res.body);
  assert.equal(res.headers.location, "/jobs/1/invoice");
  const session = cookieValue(res, "scribe_session")!;
  const set = cookiesOf(res).find((c) => c.startsWith("scribe_session="))!;
  assert.match(set, /HttpOnly/); assert.match(set, /Secure/); assert.match(set, /SameSite=Lax/); assert.match(set, /Max-Age=2592000/);
  const api = await app.inject({ url: "/api/jobs", headers: { cookie: session } });
  assert.equal(api.statusCode, 200);
  assert.deepEqual(api.json(), { user: "Ryan" });
});

test("matching by username works too", async () => {
  const res = await signIn({ sub: "u2", preferred_username: "me@example.com" });
  assert.equal(res.statusCode, 302);
});

test("another account is refused", async () => {
  const res = await signIn({ sub: "u9", email: "someone@else.com", email_verified: true });
  assert.equal(res.statusCode, 403);
  assert.equal(cookieValue(res, "scribe_session"), undefined);
});

test("an unverified email does not count", async () => {
  const res = await signIn({ sub: "u3", email: "me@example.com", email_verified: false });
  assert.equal(res.statusCode, 403);
});

test("a tampered cookie is refused", async () => {
  const res = await signIn({ sub: "u1", email: "me@example.com", name: "Ryan" });
  const [body, sig] = cookieValue(res, "scribe_session")!.split("=")[1].split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), name: "Eve" })).toString("base64url");
  assert.equal((await app.inject({ url: "/api/jobs", headers: { cookie: `scribe_session=${forged}.${sig}` } })).statusCode, 401);
});

test("a callback without the login cookie is refused", async () => {
  assert.equal((await app.inject("/auth/callback?code=x&state=y")).statusCode, 400);
});

test("returnTo cannot point to another site", async () => {
  const res = await signIn({ sub: "u1", email: "me@example.com" }, "//evil.example/x");
  assert.equal(res.headers.location, "/");
});

test("the PDF renderer gets in with the internal token only", async () => {
  assert.equal((await app.inject({ url: "/print/x", headers: { "x-scribe-internal": internalToken } })).statusCode, 200);
  assert.equal((await app.inject({ url: "/print/x", headers: { "x-scribe-internal": "x".repeat(internalToken.length) } })).statusCode, 302);
});

test("sign out clears the cookie and ends the provider session", async () => {
  const res = await app.inject("/auth/logout");
  assert.match(cookiesOf(res).join(), /scribe_session=; Path=\/; Max-Age=0/);
  const to = new URL(res.headers.location as string);
  assert.equal(to.origin + to.pathname, `${issuer}/logout`);
  assert.equal(to.searchParams.get("post_logout_redirect_uri"), "https://scribe.test:5877/auth/signed-out");
});
