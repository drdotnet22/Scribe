import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as oidc from "openid-client";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Sign-in with any standard OpenID Connect provider (Pocket ID, Authentik, Keycloak, Google, ...).
// Single user: after the provider signs you in, the account must match AUTH_ALLOWED_USER (when set).
// Every route is behind this, except the /auth/* pages that do the signing in.
// The session is a signed cookie, so nothing is stored on the server and it survives restarts.

export interface AuthUser { sub: string; name: string }
declare module "fastify" { interface FastifyRequest { user?: AuthUser } }

const SESSION_COOKIE = "scribe_session";
const LOGIN_COOKIE = "scribe_login";
const LOGIN_TTL = 10 * 60; // seconds to finish signing in at the provider
/** Sent by the PDF renderer (headless Chromium inside this process) so it can open the print pages. */
export const INTERNAL_HEADER = "x-scribe-internal";
export const internalToken = randomBytes(32).toString("base64url");

interface AuthConfig {
  issuer: string; clientId: string; clientSecret: string; appUrl: URL;
  allowedUser: string; scopes: string; sessionDays: number; secret: Buffer;
}

function readConfig(dataDir: string): AuthConfig | null {
  const env = process.env;
  if (env.AUTH_DISABLED === "true") return null;
  const issuer = env.OIDC_ISSUER?.trim() ?? "";
  const clientId = env.OIDC_CLIENT_ID?.trim() ?? "";
  const appUrl = env.APP_URL?.trim() ?? "";
  const missing = [!issuer && "OIDC_ISSUER", !clientId && "OIDC_CLIENT_ID", !appUrl && "APP_URL"].filter(Boolean);
  if (missing.length) {
    throw new Error(`Sign-in is not set up: missing ${missing.join(", ")}. Set them (see the README), or set AUTH_DISABLED=true to run without sign-in.`);
  }
  const sessionDays = Number(env.SESSION_DAYS ?? 30);
  return {
    issuer, clientId, clientSecret: env.OIDC_CLIENT_SECRET?.trim() ?? "",
    appUrl: new URL(appUrl.replace(/\/+$/, "") + "/"),
    allowedUser: env.AUTH_ALLOWED_USER?.trim() ?? "",
    scopes: env.OIDC_SCOPES?.trim() || "openid profile email",
    sessionDays: Number.isFinite(sessionDays) && sessionDays > 0 ? sessionDays : 30,
    secret: sessionSecret(dataDir),
  };
}

/** SESSION_SECRET if given, otherwise a random one kept in the data folder so sessions survive restarts. */
function sessionSecret(dataDir: string): Buffer {
  if (process.env.SESSION_SECRET) return Buffer.from(process.env.SESSION_SECRET);
  const file = join(dataDir, "session-secret");
  if (existsSync(file)) return Buffer.from(readFileSync(file, "utf8").trim());
  const s = randomBytes(48).toString("base64url");
  writeFileSync(file, s, { mode: 0o600 });
  return Buffer.from(s);
}

/* ---------- signed cookies ---------- */

function signer(cfg: AuthConfig) {
  // Changing the provider, client or allowed user signs everyone out.
  const key = createHmac("sha256", cfg.secret).update(`${cfg.issuer}\n${cfg.clientId}\n${cfg.allowedUser}`).digest();
  const mac = (s: string) => createHmac("sha256", key).update(s).digest("base64url");
  return {
    seal(kind: string, data: object, ttlSeconds: number) {
      const body = Buffer.from(JSON.stringify({ ...data, k: kind, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
      return `${body}.${mac(body)}`;
    },
    open<T>(kind: string, value: string | undefined): (T & { exp: number }) | null {
      if (!value) return null;
      const [body, sig] = value.split(".");
      if (!body || !sig) return null;
      const want = Buffer.from(mac(body)), got = Buffer.from(sig);
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
      try {
        const data = JSON.parse(Buffer.from(body, "base64url").toString());
        return data.k === kind && typeof data.exp === "number" && data.exp > Date.now() / 1000 ? data : null;
      } catch { return null; }
    },
  };
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

function cookie(name: string, value: string, maxAge: number, secure: boolean, path = "/") {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/** Only same-site paths, so the login page cannot be used to send someone elsewhere. */
const safeReturnTo = (v: unknown) =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") && !v.startsWith("/auth/") ? v : "/";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function page(reply: FastifyReply, code: number, title: string, message: string, link?: { href: string; text: string }) {
  return reply.code(code).type("text/html; charset=utf-8").header("Cache-Control", "no-store").send(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scribe - ${escapeHtml(title)}</title>` +
    `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#222">` +
    `<h1 style="font-size:1.4rem">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>` +
    (link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a></p>` : "") + `</body>`);
}

/** Does this account match AUTH_ALLOWED_USER? Compared with the subject id, username or (verified) email. */
function matchesAllowed(allowed: string, claims: Record<string, unknown>) {
  if (!allowed) return true;
  const a = allowed.toLowerCase();
  const str = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : undefined);
  if (str(claims.sub) === a || str(claims.preferred_username) === a) return true;
  return str(claims.email) === a && claims.email_verified !== false;
}

/* ---------- setup ---------- */

/** Returns whether sign-in is on. */
export function setupAuth(app: FastifyInstance, dataDir: string): boolean {
  const cfg = readConfig(dataDir);
  if (!cfg) {
    app.log.warn("AUTH_DISABLED=true: Scribe is open to anyone who can reach it.");
    return false;
  }
  const { seal, open } = signer(cfg);
  const secure = cfg.appUrl.protocol === "https:";
  const sessionTtl = Math.round(cfg.sessionDays * 86400);
  const redirectUri = new URL("auth/callback", cfg.appUrl).href;
  if (!cfg.allowedUser) app.log.warn("AUTH_ALLOWED_USER is not set: any account your sign-in provider accepts can use Scribe.");

  // Look up the provider when first needed (and again after a failure), so Scribe starts even if it is down.
  let discovered: Promise<oidc.Configuration> | null = null;
  const provider = () => {
    discovered ??= oidc.discovery(
      new URL(cfg.issuer), cfg.clientId, undefined,
      cfg.clientSecret ? oidc.ClientSecretPost(cfg.clientSecret) : oidc.None(),
      cfg.issuer.startsWith("http://") ? { execute: [oidc.allowInsecureRequests] } : undefined,
    ).catch((e) => { discovered = null; throw e; });
    return discovered;
  };

  const startSession = (reply: FastifyReply, user: AuthUser) =>
    reply.header("Set-Cookie", cookie(SESSION_COOKIE, seal("s", user, sessionTtl), sessionTtl, secure));

  app.addHook("onRequest", async (req, reply) => {
    const path = req.url.split("?")[0];
    if (path.startsWith("/auth/")) return;

    // The PDF renderer runs in this process and opens http://127.0.0.1 directly.
    const internal = req.headers[INTERNAL_HEADER];
    if (typeof internal === "string" && internal.length === internalToken.length &&
        timingSafeEqual(Buffer.from(internal), Buffer.from(internalToken))) return;

    const s = open<AuthUser>("s", readCookie(req, SESSION_COOKIE));
    if (s) {
      req.user = { sub: s.sub, name: s.name };
      // Sliding session: renew once it is past half its life, so regular use never signs you out.
      if (s.exp - Date.now() / 1000 < sessionTtl / 2) startSession(reply, req.user);
      return;
    }
    if (!path.startsWith("/api/") && (req.method === "GET" || req.method === "HEAD")) {
      return reply.redirect(`/auth/login?returnTo=${encodeURIComponent(req.url)}`);
    }
    return reply.code(401).header("Cache-Control", "no-store").send({ error: "You are signed out. Reload the page to sign in again." });
  });

  app.get<{ Querystring: { returnTo?: string } }>("/auth/login", async (req, reply) => {
    let config: oidc.Configuration;
    try { config = await provider(); }
    catch (e) {
      req.log.error(e, "could not reach the sign-in provider");
      return page(reply, 502, "Cannot reach the sign-in provider", `Scribe could not contact ${cfg.issuer}. Check that it is running and try again.`,
        { href: req.url, text: "Try again" });
    }
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState(), nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri, scope: cfg.scopes, state, nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: "S256",
    });
    return reply
      .header("Set-Cookie", cookie(LOGIN_COOKIE, seal("l", { state, nonce, verifier, returnTo: safeReturnTo(req.query.returnTo) }, LOGIN_TTL), LOGIN_TTL, secure, "/auth/"))
      .header("Cache-Control", "no-store")
      .redirect(url.href);
  });

  app.get("/auth/callback", async (req, reply) => {
    const login = open<{ state: string; nonce: string; verifier: string; returnTo: string }>("l", readCookie(req, LOGIN_COOKIE));
    reply.header("Set-Cookie", cookie(LOGIN_COOKIE, "", 0, secure, "/auth/"));
    if (!login) return page(reply, 400, "Sign-in expired", "That sign-in took too long or was started in another tab.", { href: "/auth/login", text: "Sign in again" });

    let claims: Record<string, unknown>;
    try {
      const config = await provider();
      // Build the URL as the browser saw it (APP_URL), not as it reached us through the proxy.
      const tokens = await oidc.authorizationCodeGrant(config, new URL(req.url, cfg.appUrl), {
        pkceCodeVerifier: login.verifier, expectedState: login.state, expectedNonce: login.nonce, idTokenExpected: true,
      });
      claims = { ...tokens.claims() };
      // Some providers only put the email/username in userinfo.
      if (!matchesAllowed(cfg.allowedUser, claims) && config.serverMetadata().userinfo_endpoint) {
        claims = { ...(await oidc.fetchUserInfo(config, tokens.access_token, String(claims.sub))), ...claims };
      }
    } catch (e) {
      req.log.warn(e, "sign-in failed");
      return page(reply, 400, "Sign-in failed", (e as Error).message || "The sign-in provider did not accept the sign-in.", { href: "/auth/login", text: "Try again" });
    }

    if (!matchesAllowed(cfg.allowedUser, claims)) {
      req.log.warn({ sub: claims.sub, email: claims.email, username: claims.preferred_username }, "sign-in refused: not the allowed user");
      return page(reply, 403, "Not allowed", "This account is not allowed to use Scribe.", { href: "/auth/logout", text: "Sign out" });
    }
    const name = [claims.name, claims.preferred_username, claims.email, claims.sub].find((v) => typeof v === "string" && v) as string;
    req.log.info({ sub: claims.sub }, "signed in");
    // (Fastify adds to Set-Cookie rather than replacing it, so the login cookie is still cleared.)
    startSession(reply, { sub: String(claims.sub), name });
    return reply.redirect(login.returnTo);
  });

  app.get("/auth/logout", async (_req, reply) => {
    reply.header("Set-Cookie", cookie(SESSION_COOKIE, "", 0, secure)).header("Cache-Control", "no-store");
    // Also end the session at the provider when it supports that, so the next visit asks again.
    try {
      const config = await provider();
      if (config.serverMetadata().end_session_endpoint) {
        return reply.redirect(oidc.buildEndSessionUrl(config, { client_id: cfg.clientId, post_logout_redirect_uri: new URL("auth/signed-out", cfg.appUrl).href }).href);
      }
    } catch { /* provider unreachable: the local sign-out still happened */ }
    return reply.redirect("/auth/signed-out");
  });

  app.get("/auth/signed-out", async (_req, reply) => page(reply, 200, "Signed out", "You are signed out of Scribe.", { href: "/", text: "Sign in again" }));

  app.log.info({ issuer: cfg.issuer, redirectUri, allowedUser: cfg.allowedUser || "(anyone)" }, "sign-in is on");
  return true;
}
