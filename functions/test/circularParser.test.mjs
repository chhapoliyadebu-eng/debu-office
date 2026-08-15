import { describe, it, expect } from "vitest";
import { significantWords, overlapRatio, parseCircularsFromHtml } from "../lib/circularParser.js";

describe("parseCircularsFromHtml", () => {
  it("picks up links whose text contains a circular/order/notification keyword", () => {
    const html = `
      <html><body>
        <nav><a href="/home">Home</a> <a href="/about">About Us</a></nav>
        <ul>
          <li><a href="/circulars/2026/014">Revised guidelines for stage-carriage fare slabs - Circular 014/2026</a></li>
          <li><a href="/circulars/2026/013">Notification regarding depot transfer orders 08-2026</a></li>
          <li><a href="/misc/logo.png">Logo</a></li>
        </ul>
      </body></html>`;
    const result = parseCircularsFromHtml(html, "https://csharyana.gov.in/circulars");
    expect(result).toHaveLength(2);
    expect(result[0].title).toContain("Circular 014/2026");
    expect(result[0].url).toBe("https://csharyana.gov.in/circulars/2026/014");
  });

  it("ignores plain nav links with no circular-like keyword, even with a date", () => {
    const html = `<a href="/events/2026">Events 2026</a>`;
    const result = parseCircularsFromHtml(html, "https://csharyana.gov.in/circulars");
    expect(result).toHaveLength(0);
  });

  it("ignores links with no href, and skips duplicate URLs", () => {
    const html = `
      <a>Circular with no href</a>
      <a href="/circulars/1">Circular one - Order 2026</a>
      <a href="/circulars/1">Circular one - Order 2026 (repeated)</a>
    `;
    const result = parseCircularsFromHtml(html, "https://csharyana.gov.in/circulars");
    expect(result).toHaveLength(1);
  });

  it("resolves relative hrefs against the source URL", () => {
    const html = `<a href="../notices/circular-9.pdf">Circular 9 Notification</a>`;
    const result = parseCircularsFromHtml(html, "https://csharyana.gov.in/circulars/index.html");
    expect(result[0].url).toBe("https://csharyana.gov.in/notices/circular-9.pdf");
  });

  it("caps results at 20 candidates even if more links match", () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/c/${i}">Circular Order Notification ${i}</a>`).join("\n");
    const result = parseCircularsFromHtml(links, "https://csharyana.gov.in/circulars");
    expect(result).toHaveLength(20);
  });

  it("skips link text that is too short or absurdly long", () => {
    const html = `
      <a href="/a">Order</a>
      <a href="/b">${"Circular details ".repeat(30)}</a>
    `;
    const result = parseCircularsFromHtml(html, "https://csharyana.gov.in/circulars");
    expect(result).toHaveLength(0);
  });
});

describe("significantWords", () => {
  it("lowercases, strips punctuation, and drops stopwords/short words", () => {
    const words = significantWords("The Haryana Government Office Circular on Fare Revision, Dated 2026");
    expect(words.has("haryana")).toBe(false); // stopword
    expect(words.has("government")).toBe(false); // stopword
    expect(words.has("office")).toBe(false); // stopword
    expect(words.has("dated")).toBe(false); // stopword
    expect(words.has("on")).toBe(false); // too short (<=3 chars)
    expect(words.has("fare")).toBe(true);
    expect(words.has("revision")).toBe(true);
    expect(words.has("circular")).toBe(true);
  });

  it("returns an empty set for empty/undefined input", () => {
    expect(significantWords("").size).toBe(0);
    expect(significantWords(undefined).size).toBe(0);
  });
});

describe("overlapRatio", () => {
  it("returns 0 when either set is empty", () => {
    expect(overlapRatio(new Set(), new Set(["fare"]))).toBe(0);
    expect(overlapRatio(new Set(["fare"]), new Set())).toBe(0);
  });

  it("returns 1 when the smaller set is fully contained in the larger one", () => {
    const a = new Set(["fare", "revision"]);
    const b = new Set(["fare", "revision", "slab", "depot"]);
    expect(overlapRatio(a, b)).toBe(1);
  });

  it("returns a fraction for partial overlap", () => {
    const a = new Set(["fare", "revision"]);
    const b = new Set(["fare", "notification"]);
    expect(overlapRatio(a, b)).toBe(0.5);
  });

  it("returns 0 for completely disjoint sets", () => {
    const a = new Set(["fare"]);
    const b = new Set(["pension"]);
    expect(overlapRatio(a, b)).toBe(0);
  });
});
