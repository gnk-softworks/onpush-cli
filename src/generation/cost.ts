export interface DocumentCost {
  slug: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface CostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  documents: DocumentCost[];
}

export class CostTracker {
  private documents: DocumentCost[] = [];

  addDocumentCost(cost: DocumentCost): void {
    this.documents.push(cost);
  }

  getTotalCost(): number {
    return this.documents.reduce((sum, d) => sum + d.costUsd, 0);
  }

  isOverLimit(limit: number | null): boolean {
    if (limit === null) return false;
    return this.getTotalCost() > limit;
  }

  getSummary(): CostSummary {
    return {
      totalCostUsd: this.getTotalCost(),
      totalInputTokens: this.documents.reduce(
        (sum, d) => sum + d.inputTokens,
        0
      ),
      totalOutputTokens: this.documents.reduce(
        (sum, d) => sum + d.outputTokens,
        0
      ),
      totalDurationMs: this.documents.reduce(
        (sum, d) => sum + d.durationMs,
        0
      ),
      documents: [...this.documents],
    };
  }
}
