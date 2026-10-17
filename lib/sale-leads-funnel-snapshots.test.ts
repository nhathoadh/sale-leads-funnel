import { describe, expect, it } from "vitest";

import { buildSaleLeadSnapshotSummaries } from "@/lib/sale-leads-funnel-snapshots";

describe("sale lead funnel snapshots", () => {
  it("builds stage and workable gap summaries from cached snapshot rows", () => {
    const summaries = buildSaleLeadSnapshotSummaries([
      { workStage: "need_contact", gapBucket: "no_price", hasImages: false },
      { workStage: "need_price_source", gapBucket: "no_price", hasImages: true },
      { workStage: "need_quote", gapBucket: "lt5", hasImages: true },
      { workStage: "follow_up_after_quote", gapBucket: "gt10", hasImages: true },
      { workStage: "failed", gapBucket: "5_10", hasImages: true },
    ]);

    expect(summaries.stageSummary.total).toBe(5);
    expect(summaries.stageSummary.stages.map((stage) => [stage.key, stage.count, stage.workableCount])).toContainEqual([
      "need_price_source",
      1,
      1,
    ]);
    expect(summaries.stageSummary.stages.map((stage) => [stage.key, stage.count, stage.workableCount])).toContainEqual([
      "need_quote",
      1,
      1,
    ]);
    expect(summaries.stageSummary.stages.map((stage) => [stage.key, stage.count, stage.workableCount])).toContainEqual([
      "follow_up_after_quote",
      1,
      1,
    ]);
    expect(summaries.stageSummary.workableTotal).toBe(3);
    expect(summaries.workableGapSummary).toEqual({
      total: 3,
      buckets: [
        { key: "lt5", label: "<5%", count: 1, percent: 33.33 },
        { key: "5_10", label: "5-10%", count: 0, percent: 0 },
        { key: "gt10", label: ">10%", count: 1, percent: 33.33 },
        { key: "no_price", label: "Chưa có giá", count: 1, percent: 33.33 },
      ],
    });
  });
});
