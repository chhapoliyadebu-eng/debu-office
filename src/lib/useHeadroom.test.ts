import { describe, it, expect } from "vitest";
import { computeHeadroomVisibility } from "./useHeadroom";

describe("computeHeadroomVisibility", () => {
  it("stays visible while within the pinned-below zone near the top", () => {
    expect(computeHeadroomVisibility(0, 40, true, 8, 80)).toBe(true);
    expect(computeHeadroomVisibility(200, 79, false, 8, 80)).toBe(true); // scrolling back up into the zone
  });

  it("hides once scrolled down past the threshold, beyond the pinned zone", () => {
    const result = computeHeadroomVisibility(100, 130, true, 8, 80); // delta = 30, well past threshold=8
    expect(result).toBe(false);
  });

  it("shows immediately when scrolling up, even by a small amount past the threshold", () => {
    const result = computeHeadroomVisibility(300, 280, false, 8, 80); // delta = -20
    expect(result).toBe(true);
  });

  it("does not flicker for tiny movements within the threshold dead zone", () => {
    // delta = 3, threshold = 8 — too small to count as a deliberate scroll
    expect(computeHeadroomVisibility(300, 303, true, 8, 80)).toBe(true);
    expect(computeHeadroomVisibility(300, 303, false, 8, 80)).toBe(false);
  });

  it("a large downward jump followed by a small upward wobble keeps it hidden (no flicker)", () => {
    let visible = true;
    visible = computeHeadroomVisibility(100, 300, visible, 8, 80); // big scroll down
    expect(visible).toBe(false);
    visible = computeHeadroomVisibility(300, 298, visible, 8, 80); // tiny 2px wobble up
    expect(visible).toBe(false); // still hidden — 2px is inside the dead zone
  });

  it("respects custom threshold/pinnedBelow values", () => {
    expect(computeHeadroomVisibility(0, 150, true, 8, 200)).toBe(true); // still under a larger pinned zone
    expect(computeHeadroomVisibility(200, 250, true, 30, 0)).toBe(false); // delta=50 > custom threshold=30 → hides
  });
});
