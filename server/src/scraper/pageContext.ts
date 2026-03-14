import { JSDOM } from "jsdom";
import type { PageContext } from "@/shared/types.js";
import {
  extractAmazonMarketplaceProperties,
  extractEbayJsonLdProductProperties,
} from "@/lib/matching/ecommerce.js";

/**
 * Extract PageContext from HTML string.
 * Uses JSDOM for parsing; ecommerce extractors expect a Document-like object.
 */
export function extractPageContextFromHtml(
  html: string,
  url: string,
): PageContext {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const urlObj = new URL(url);
  const hostname = urlObj.hostname.toLowerCase();

  const getMetaContent = (selector: string): string =>
    (doc.querySelector(selector)?.getAttribute("content") || "").trim();

  const description = getMetaContent('meta[name="description"]');
  const metaTitle = getMetaContent('meta[name="title"]');
  const ogTitle = getMetaContent('meta[property="og:title"]');
  const ogDescription = getMetaContent('meta[property="og:description"]');

  const amazonMarketplaceProperties = extractAmazonMarketplaceProperties(
    doc as unknown as Document,
    hostname,
  );
  const ebayJsonLdMarketplaceProperties = extractEbayJsonLdProductProperties(
    doc as unknown as Document,
    hostname,
  );
  const marketplaceProperties =
    amazonMarketplaceProperties || ebayJsonLdMarketplaceProperties
      ? {
          ...(amazonMarketplaceProperties || {}),
          ...(ebayJsonLdMarketplaceProperties || {}),
        }
      : undefined;

  return {
    url,
    hostname,
    title: (doc.title || "").trim(),
    meta: {
      title: metaTitle,
      description,
      "og:title": ogTitle,
      "og:description": ogDescription,
    },
    marketplaceProperties,
  };
}
