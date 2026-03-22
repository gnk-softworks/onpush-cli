import { CostTracker, type DocumentCost } from "../cost.js";

function makeCost(overrides: Partial<DocumentCost> = {}): DocumentCost {
  return {
    slug: "test-doc",
    costUsd: 0.01,
    inputTokens: 1000,
    outputTokens: 500,
    durationMs: 5000,
    ...overrides,
  };
}

describe("CostTracker", () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe("getTotalCost", () => {
    it("returns 0 with no documents", () => {
      expect(tracker.getTotalCost()).toBe(0);
    });

    it("returns cost of single document", () => {
      tracker.addDocumentCost(makeCost({ costUsd: 0.05 }));
      expect(tracker.getTotalCost()).toBe(0.05);
    });

    it("accumulates costs from multiple documents", () => {
      tracker.addDocumentCost(makeCost({ costUsd: 0.01 }));
      tracker.addDocumentCost(makeCost({ costUsd: 0.02 }));
      tracker.addDocumentCost(makeCost({ costUsd: 0.03 }));
      expect(tracker.getTotalCost()).toBeCloseTo(0.06);
    });
  });

  describe("isOverLimit", () => {
    it("returns false when limit is null", () => {
      tracker.addDocumentCost(makeCost({ costUsd: 100 }));
      expect(tracker.isOverLimit(null)).toBe(false);
    });

    it("returns false when under limit", () => {
      tracker.addDocumentCost(makeCost({ costUsd: 0.5 }));
      expect(tracker.isOverLimit(1.0)).toBe(false);
    });

    it("returns true when over limit", () => {
      tracker.addDocumentCost(makeCost({ costUsd: 1.5 }));
      expect(tracker.isOverLimit(1.0)).toBe(true);
    });

    it("returns false at exact limit (uses > not >=)", () => {
      tracker.addDocumentCost(makeCost({ costUsd: 1.0 }));
      expect(tracker.isOverLimit(1.0)).toBe(false);
    });
  });

  describe("getSummary", () => {
    it("returns zero totals with no documents", () => {
      const summary = tracker.getSummary();
      expect(summary.totalCostUsd).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.totalDurationMs).toBe(0);
      expect(summary.documents).toEqual([]);
    });

    it("returns correct totals for multiple documents", () => {
      tracker.addDocumentCost(
        makeCost({
          costUsd: 0.01,
          inputTokens: 1000,
          outputTokens: 500,
          durationMs: 3000,
        })
      );
      tracker.addDocumentCost(
        makeCost({
          costUsd: 0.02,
          inputTokens: 2000,
          outputTokens: 1000,
          durationMs: 5000,
        })
      );

      const summary = tracker.getSummary();
      expect(summary.totalCostUsd).toBeCloseTo(0.03);
      expect(summary.totalInputTokens).toBe(3000);
      expect(summary.totalOutputTokens).toBe(1500);
      expect(summary.totalDurationMs).toBe(8000);
    });

    it("returns a copy of documents array", () => {
      tracker.addDocumentCost(makeCost());
      const summary1 = tracker.getSummary();
      const summary2 = tracker.getSummary();
      expect(summary1.documents).not.toBe(summary2.documents);
      expect(summary1.documents).toEqual(summary2.documents);
    });

    it("includes per-document data", () => {
      tracker.addDocumentCost(
        makeCost({ slug: "arch", costUsd: 0.05 })
      );
      const summary = tracker.getSummary();
      expect(summary.documents).toHaveLength(1);
      expect(summary.documents[0].slug).toBe("arch");
      expect(summary.documents[0].costUsd).toBe(0.05);
    });
  });
});
