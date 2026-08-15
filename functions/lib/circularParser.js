"use strict";

const cheerio = require("cheerio");

// Link text must look like an actual circular/order/notification, not just
// any nav link on the page.
const CIRCULAR_KEYWORD_RE =
  /circular|order|notification|instruction|guideline|पत्र|आदेश|अधिसूचना|परिपत्र/i;

// A trailing/leading 4-digit year or a dd-mm-yyyy / dd/mm/yyyy style date
// close to the link text is a strong signal this is a dated document link,
// not a generic menu item.
const DATE_HINT_RE = /\b(20\d{2})\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "shall", "will",
  "have", "has", "are", "was", "were", "into", "regarding", "under",
  "haryana", "department", "govt", "government", "office", "dated",
]);

function significantWords(text) {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

/** Jaccard-style overlap ratio between two short word sets, 0..1. */
function overlapRatio(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Extract candidate circular/order links from a source page's HTML using
 * generic heuristics (see comment above). Returns at most 20 candidates.
 */
function parseCircularsFromHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const candidates = [];
  const seen = new Set();

  $("a[href]").each((_, el) => {
    if (candidates.length >= 20) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text || text.length < 8 || text.length > 300) return;
    if (!CIRCULAR_KEYWORD_RE.test(text) && !DATE_HINT_RE.test(text)) return;
    if (!CIRCULAR_KEYWORD_RE.test(text)) return; // require the keyword, date alone is too weak

    const href = $(el).attr("href");
    if (!href) return;
    let absoluteUrl;
    try {
      absoluteUrl = new URL(href, sourceUrl).toString();
    } catch {
      return;
    }
    if (seen.has(absoluteUrl)) return;
    seen.add(absoluteUrl);

    candidates.push({ title: text, url: absoluteUrl });
  });

  return candidates;
}

module.exports = {
  CIRCULAR_KEYWORD_RE,
  DATE_HINT_RE,
  STOPWORDS,
  significantWords,
  overlapRatio,
  parseCircularsFromHtml,
};
