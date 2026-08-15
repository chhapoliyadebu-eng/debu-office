import { describe, it, expect } from "vitest";
import { formatSize } from "./formatSize";

describe("formatSize", () => {
  it("formats bytes under 1 KB as-is", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(0)).toBe("0 B");
  });

  it("formats kilobytes with no decimal places", () => {
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(1536)).toBe("2 KB"); // rounds
  });

  it("formats megabytes with one decimal place", () => {
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("stays under the 25 MB attachment limit boundary correctly", () => {
    expect(formatSize(25 * 1024 * 1024)).toBe("25.0 MB");
  });
});
