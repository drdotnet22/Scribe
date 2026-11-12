import { chromium, type Browser } from "playwright-core";
import { INTERNAL_HEADER, internalToken } from "./auth.ts";

// PDFs are made by opening the same print page you see in the app in a headless browser,
// so the PDF always matches the screen.
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  return browser;
}

export async function renderPdf(url: string): Promise<Buffer> {
  const b = await getBrowser();
  // The token lets this browser past sign-in; it never leaves this process.
  const ctx = await b.newContext({ extraHTTPHeaders: { [INTERNAL_HEADER]: internalToken } });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction("window.__printReady === true", null, { timeout: 20_000 });
    await page.emulateMedia({ media: "print" });
    return await page.pdf({ format: "Letter", printBackground: true, preferCSSPageSize: true });
  } finally {
    await ctx.close();
  }
}

export async function closeBrowser() {
  await browser?.close().catch(() => {});
  browser = null;
}
