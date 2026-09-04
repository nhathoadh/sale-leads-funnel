import { describe, expect, it } from "vitest";

import {
  calculateGapPercent,
  classifySaleLeadStage,
  getQuoteTimestamps,
  hasQuotedAfter,
  type SaleLeadClassifierInput,
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

  it("excludes terminal CRM stages from active work stages", () => {
    expect(classifySaleLeadStage(lead({ crmStage: "FAILED" }))).toBe(null);
    expect(classifySaleLeadStage(lead({ crmStage: "DEPOSIT_PAID" }))).toBe(null);
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
});
