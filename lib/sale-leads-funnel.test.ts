import { describe, expect, it } from "vitest";

import {
  SALE_LEAD_STAGE_CONFIG,
  calculateGapPercent,
  classifySaleLeadStage,
  filterSaleLeadRows,
  getGapBucket,
  getSaleLeadFilterCounts,
  getSaleLeadFilterFacets,
  getQuoteTimestamps,
  hasQuotedAfter,
  summarizeDealerBids,
  type SaleLeadClassifierInput,
  type SaleLeadFilterableRow,
} from "@/lib/sale-leads-funnel";

function lead(overrides: Partial<SaleLeadClassifierInput> = {}): SaleLeadClassifierInput {
  return {
    crmStage: "NEGOTIATION",
    hasZaloChat: true,
    customerMessageCount: 2,
    hasEnoughImages: true,
    inInspectionRegion: true,
    hasInspectionBooking: false,
    isInspected: false,
    highestBid: 420_000_000,
    preInspectionBidCount: 1,
    postInspectionBidCount: 0,
    latestPreInspectionBidAt: "2026-09-01T03:00:00.000Z",
    latestPostInspectionBidAt: null,
    quoteTs: [],
    priceVucarOfferedAt: null,
    priceVucarOffered: null,
    agentPricingEvents: null,
    saleCompletedCallTs: [],
    ...overrides,
  };
}

describe("getQuoteTimestamps", () => {
  it("treats classifier quote_ts as the primary quote source", () => {
    expect(getQuoteTimestamps(lead({ quoteTs: ["2026-09-01T04:00:00.000Z"] }))).toEqual([
      "2026-09-01T04:00:00.000Z",
    ]);
  });

  it("does not mark a terminal won deal as quoted by itself", () => {
    expect(getQuoteTimestamps(lead({ crmStage: "COMPLETED", quoteTs: [] }))).toEqual([]);
  });

  it("falls back to summary and agent pricing event timestamps", () => {
    expect(
      getQuoteTimestamps(
        lead({
          priceVucarOfferedAt: "2026-09-01T05:00:00.000Z",
          agentPricingEvents: {
            vo_at: "2026-09-01T06:00:00.000Z",
            events: [{ type: "T_agent_vucar_offer_subsequent", at: "2026-09-01T07:00:00.000Z" }],
          },
        }),
      ),
    ).toEqual([
      "2026-09-01T05:00:00.000Z",
      "2026-09-01T06:00:00.000Z",
      "2026-09-01T07:00:00.000Z",
    ]);
  });

  it("treats successful outbound sale calls as quote timestamps", () => {
    expect(
      getQuoteTimestamps(
        lead({
          saleCompletedCallTs: ["2026-09-01T04:00:00.000Z"],
        }),
      ),
    ).toEqual(["2026-09-01T04:00:00.000Z"]);
  });
});

describe("hasQuotedAfter", () => {
  it("requires a quote timestamp after the bid timestamp", () => {
    expect(
      hasQuotedAfter(["2026-09-01T04:00:00.000Z"], "2026-09-01T03:00:00.000Z"),
    ).toBe(true);
    expect(
      hasQuotedAfter(["2026-09-01T02:00:00.000Z"], "2026-09-01T03:00:00.000Z"),
    ).toBe(false);
  });
});

describe("classifySaleLeadStage", () => {
  it("puts leads without mapped Zalo chat into the no-zalo funnel", () => {
    expect(classifySaleLeadStage(lead({ hasZaloChat: false }))).toBe("no_zalo");
  });

  it("puts Zalo leads without customer messages into need-contact", () => {
    expect(classifySaleLeadStage(lead({ customerMessageCount: 0 }))).toBe("need_contact");
  });

  it("asks for images once the customer has replied but images are incomplete", () => {
    expect(classifySaleLeadStage(lead({ hasEnoughImages: false }))).toBe("need_images");
  });

  it("asks for a price source before booking inspection when no dealer bid exists", () => {
    expect(
      classifySaleLeadStage(lead({ highestBid: null, preInspectionBidCount: 0 })),
    ).toBe("need_price_source");
  });

  it("asks sales to quote after a fresh pre-inspection bid", () => {
    expect(classifySaleLeadStage(lead())).toBe("need_quote");
  });

  it("asks sales to book inspection after a pre-inspection quote in an inspection region", () => {
    expect(
      classifySaleLeadStage(
        lead({
          quoteTs: ["2026-09-01T04:00:00.000Z"],
        }),
      ),
    ).toBe("need_inspection_booking");
  });

  it("asks sales to book inspection after a successful sale call quote", () => {
    expect(
      classifySaleLeadStage(
        lead({
          saleCompletedCallTs: ["2026-09-01T04:00:00.000Z"],
        }),
      ),
    ).toBe("need_inspection_booking");
  });

  it("asks sales to quote again after a post-inspection bid", () => {
    expect(
      classifySaleLeadStage(
        lead({
          isInspected: true,
          hasInspectionBooking: true,
          postInspectionBidCount: 1,
          latestPostInspectionBidAt: "2026-09-02T03:00:00.000Z",
          quoteTs: ["2026-09-01T04:00:00.000Z"],
        }),
      ),
    ).toBe("need_post_inspection_quote");
  });

  it("moves quoted active leads to follow-up after quote", () => {
    expect(
      classifySaleLeadStage(
        lead({
          inInspectionRegion: false,
          quoteTs: ["2026-09-01T04:00:00.000Z"],
        }),
      ),
    ).toBe("follow_up_after_quote");
  });

  it("puts failed leads into the failed funnel before any other stage", () => {
    expect(classifySaleLeadStage(lead({ crmStage: "FAILED", hasEnoughImages: false }))).toBe("failed");
  });

  it("puts delayed leads into the delayed funnel unless they already failed", () => {
    expect(classifySaleLeadStage(lead({ intention: "DELAY" } as Partial<SaleLeadClassifierInput>))).toBe("delayed");
    expect(
      classifySaleLeadStage(lead({ crmStage: "FAILED", intention: "DELAY" } as Partial<SaleLeadClassifierInput>)),
    ).toBe("failed");
  });

  it("still excludes won and deposited CRM stages from active work stages", () => {
    expect(classifySaleLeadStage(lead({ crmStage: "DEPOSIT_PAID" }))).toBe(null);
    expect(classifySaleLeadStage(lead({ crmStage: "COMPLETED" }))).toBe(null);
  });
});

describe("sale lead stage config", () => {
  it("orders operational stages before delayed, failed, and no-zalo buckets", () => {
    expect(SALE_LEAD_STAGE_CONFIG.map((stage) => stage.key)).toEqual([
      "need_contact",
      "need_images",
      "need_price_source",
      "need_quote",
      "need_inspection_booking",
      "need_post_inspection_quote",
      "follow_up_after_quote",
      "delayed",
      "failed",
      "no_zalo",
    ]);
  });
});

describe("summarizeDealerBids", () => {
  it("anchors a repeated highest pre-inspection bid at the first time that price appeared", () => {
    expect(
      summarizeDealerBids([
        {
          price: 150_000_000,
          version: 1,
          created_at: "2026-08-31T03:28:03.926156Z",
          dealer_name: "Dealer A",
          is_interested: true,
        },
        {
          price: 150_000_000,
          version: 1,
          created_at: "2026-08-31T04:24:01.817324Z",
          dealer_name: "Dealer A",
          is_interested: true,
        },
      ]),
    ).toMatchObject({
      highestBid: 150_000_000,
      validDealerBidDealerCount: 1,
      preInspectionBidCount: 2,
      latestPreInspectionBidAt: "2026-08-31T03:28:03.926156Z",
    });
  });
});

describe("calculateGapPercent", () => {
  it("calculates positive customer-vs-bid gap as a percentage of customer price", () => {
    expect(calculateGapPercent(500_000_000, 475_000_000)).toBe(5);
    expect(calculateGapPercent(500_000_000, 450_000_000)).toBe(10);
  });

  it("returns zero when the bid reaches or exceeds the customer price", () => {
    expect(calculateGapPercent(500_000_000, 510_000_000)).toBe(0);
  });

  it("groups full-price or above-price bids into the lt5 bucket", () => {
    expect(getGapBucket(500_000_000, 500_000_000)).toBe("lt5");
    expect(getGapBucket(500_000_000, 510_000_000)).toBe("lt5");
  });
});

describe("sale lead list filters", () => {
  const rows = [
    { workStage: "need_contact", gapBucket: "lt5", hasImages: false, inspected: false, noHumanTouch: true, underTwoBids: false },
    { workStage: "need_images", gapBucket: "no_price", hasImages: true, inspected: false, noHumanTouch: false, underTwoBids: false },
    { workStage: "need_quote", gapBucket: "5_10", hasImages: true, inspected: true, noHumanTouch: false, underTwoBids: true },
    { workStage: "follow_up_after_quote", gapBucket: "lt5", hasImages: true, inspected: true, noHumanTouch: false, underTwoBids: false },
    { workStage: "failed", gapBucket: "gt10", hasImages: false, inspected: false, noHumanTouch: true, underTwoBids: true },
    { workStage: "delayed", gapBucket: "no_price", hasImages: false, inspected: false, noHumanTouch: false, underTwoBids: false },
  ] as SaleLeadFilterableRow[];

  it("filters leads by images and inspection status in addition to stage and gap", () => {
    expect(
      filterSaleLeadRows(rows, {
        stages: ["need_quote", "follow_up_after_quote"],
        gaps: ["5_10", "lt5"],
        hasImages: true,
        inspected: true,
      }),
    ).toEqual([rows[2], rows[3]]);

    expect(filterSaleLeadRows(rows, { hasImages: true, inspected: false })).toEqual([rows[1]]);
    expect(filterSaleLeadRows(rows, { noHumanTouch: true })).toEqual([rows[0], rows[4]]);
    expect(filterSaleLeadRows(rows, { underTwoBids: true })).toEqual([rows[2], rows[4]]);
  });

  it("counts filter buttons from the full unfiltered row set", () => {
    expect(getSaleLeadFilterCounts(rows)).toEqual({
      total: 6,
      stages: {
        failed: 1,
        delayed: 1,
        need_contact: 1,
        need_images: 1,
        need_price_source: 0,
        need_quote: 1,
        need_inspection_booking: 0,
        need_post_inspection_quote: 0,
        follow_up_after_quote: 1,
        no_zalo: 0,
      },
      gaps: {
        lt5: 2,
        "5_10": 1,
        gt10: 1,
        no_price: 2,
      },
      hasImages: 3,
      inspected: 2,
      noHumanTouch: 2,
      underTwoBids: 2,
    });
  });

  it("recounts other filter groups against the currently selected filters", () => {
    expect(getSaleLeadFilterFacets(rows, { hasImages: true })).toMatchObject({
      total: 3,
      stages: {
        need_contact: 0,
        need_images: 1,
        need_price_source: 0,
        need_quote: 1,
        need_inspection_booking: 0,
        need_post_inspection_quote: 0,
        follow_up_after_quote: 1,
        delayed: 0,
        failed: 0,
        no_zalo: 0,
      },
      gaps: {
        lt5: 1,
        "5_10": 1,
        gt10: 0,
        no_price: 1,
      },
    });

    expect(getSaleLeadFilterFacets(rows, { gaps: ["lt5"] })).toMatchObject({
      total: 2,
      status: {
        hasImages: 1,
        inspected: 1,
        noHumanTouch: 1,
        underTwoBids: 0,
      },
    });
  });
});
