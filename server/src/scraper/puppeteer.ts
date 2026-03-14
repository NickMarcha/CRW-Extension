import puppeteer, { type Browser } from "puppeteer";
import { extractPageContextFromHtml } from "./pageContext.js";
import type { PageContext } from "@/shared/types.js";

const PAGE_TIMEOUT_MS = 20000;

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browser;
}

export async function fetchPageContext(url: string): Promise<PageContext> {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: PAGE_TIMEOUT_MS,
    });

    const html = await page.content();
    return extractPageContextFromHtml(html, url);
  } finally {
    await page.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
