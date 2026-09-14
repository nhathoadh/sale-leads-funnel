import { describe, expect, it } from "vitest";

import {
  SALE_LEAD_STAGE_CONFIG,
  calculateGapPercent,
  classifySaleLeadStage,
  filterSaleLeadRows,
  getSaleLeadActionFlags,
  getOrderedSaleLeadFilterFacets,
  getGapBucket,
  getSaleLeadFilterCounts,
  getSaleLeadFilterFacets,
  getQuoteTimestamps,
  getSaleLeadStageTone,
  extractSaleTextQuoteTimestamps,
  extractSaleTextQuoteEvents,
  hasQuotedAfter,
  hasVehicleImagesFromSources,
  summarizeDealerBids,
  type SaleLeadClassifierInput,
  type SaleLeadFilterableRow,
} from "@/lib/sale-leads-funnel";

function lead(overrides: Partial<SaleLeadClassifierInput> = {}): SaleLeadClassifierInput {
  return {
    crmStage: "NEGOTIATION",
    firstPaymentDate: null,
    hasZaloChat: true,
    customerMessageCount: 2,
    hasEnoughImages: true,
    inInspectionRegion: true,
    hasInspectionBooking: false,
    isInspected: false,
    latestInspectionAt: null,
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
  saleTextQuoteTs: [],
    saleTextQuotePrices: [],
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

  it("treats outbound Zalo text price offers as quote timestamps", () => {
    expect(
      getQuoteTimestamps(
        lead({
          saleTextQuoteTs: ["2026-08-20T02:10:33.273Z"],
        }),
      ),
    ).toEqual(["2026-08-20T02:10:33.273Z"]);
  });
});

describe("extractSaleTextQuoteTimestamps", () => {
  it("extracts quote-like outbound Zalo price messages without counting relative price comments", () => {
    expect(
      extractSaleTextQuoteTimestamps([
        {
          created_at: "2026-08-20T02:02:03.249Z",
          content: "Em tìm được khách thiện chí mua cao hơn mấy bên khác 50-70tr rùi ạ.",
        },
        {
          created_at: "2026-08-20T02:10:33.273Z",
          content: "Dạ mặt bằng chung các bên mua họ đang trả quanh 1t2-1t220, em có khách mua được 1t270tr ạ",
        },
      ]),
    ).toEqual(["2026-08-20T02:10:33.273Z"]);
  });

  it("extracts post-inspection low-price customer offer messages", () => {
    expect(
      extractSaleTextQuoteTimestamps([
        {
          created_at: "2026-09-12T04:05:00.389Z",
          content: "Dạ như hôm qua khách có báo là 100tr là họ thiện chí đi xem xe chị rồi.",
        },
      ]),
    ).toEqual(["2026-09-12T04:05:00.389Z"]);
  });

  it("extracts post-inspection market price ranges without an explicit unit", () => {
    expect(
      extractSaleTextQuoteTimestamps([
        {
          created_at: "2026-08-30T08:14:07.712Z",
          content: "xe mình dòng này trên thị trường đang bán khoảng từ 550-600 nè anh",
        },
      ]),
    ).toEqual(["2026-08-30T08:14:07.712Z"]);
  });
});

describe("extractSaleTextQuoteEvents", () => {
  it("extracts quote prices in millions from outbound Zalo text", () => {
    expect(
      extractSaleTextQuoteEvents([
        {
          created_at: "2026-09-04T07:30:40.490Z",
          content:
            "chị oke về quy trình thì em làm việc thêm với khách mua về giá xem có dc giá tốt hơn ko, giá 550 hiện tại là giá tcao hơn mặt bằng chung của thị trường rồi, mặc dù nó là giá trước khi kiểm định xe",
        },
      ]),
    ).toEqual([{ at: "2026-09-04T07:30:40.490Z", price: 550_000_000 }]);
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

  it("does not ask for another quote when an older sale text quote is still above the latest bid", () => {
    expect(
      classifySaleLeadStage(
        lead({
          highestBid: 520_000_000,
          latestPreInspectionBidAt: "2026-09-07T10:48:23.741Z",
          saleTextQuoteTs: ["2026-09-04T07:30:40.490Z"],
          saleTextQuotePrices: [550_000_000],
        }),
      ),
    ).toBe("follow_up_after_quote");
  });

  it("asks for another quote when the latest bid beats the older quoted price", () => {
    expect(
      classifySaleLeadStage(
        lead({
          highestBid: 520_000_000,
          latestPreInspectionBidAt: "2026-09-07T10:48:23.741Z",
          saleTextQuoteTs: ["2026-09-04T07:30:40.490Z"],
          saleTextQuotePrices: [500_000_000],
        }),
      ),
    ).toBe("need_quote");
  });

  it("keeps quoted inspection-region leads in follow-up while flagging inspection booking as status", () => {
    const input = lead({
      quoteTs: ["2026-09-01T04:00:00.000Z"],
    });

    expect(classifySaleLeadStage(input)).toBe("follow_up_after_quote");
    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsInspectionBooking: true, needsPostInspectionQuote: false });
  });

  it("keeps sale-call quoted leads in follow-up while flagging inspection booking as status", () => {
    expect(
      classifySaleLeadStage(
        lead({
          saleCompletedCallTs: ["2026-09-01T04:00:00.000Z"],
        }),
      ),
    ).toBe("follow_up_after_quote");
  });

  it("moves leads quoted through outbound Zalo text past the need-quote stage", () => {
    expect(
      classifySaleLeadStage(
        lead({
          latestPreInspectionBidAt: "2026-08-20T01:00:00.000Z",
          saleTextQuoteTs: ["2026-08-20T02:10:33.273Z"],
        }),
      ),
    ).toBe("follow_up_after_quote");
  });

  it("keeps post-inspection leads in follow-up while flagging post-inspection quote as status", () => {
    const input = lead({
      isInspected: true,
      latestInspectionAt: "2026-09-02T02:00:00.000Z",
      hasInspectionBooking: true,
      postInspectionBidCount: 1,
      latestPostInspectionBidAt: "2026-09-02T03:00:00.000Z",
      quoteTs: ["2026-09-01T04:00:00.000Z"],
    });

    expect(classifySaleLeadStage(input)).toBe("follow_up_after_quote");
    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsInspectionBooking: false, needsPostInspectionQuote: true });
  });

  it("flags inspected leads for post-inspection quote even before a post-inspection dealer bid exists", () => {
    const input = lead({
      isInspected: true,
      latestInspectionAt: "2026-09-08T05:02:58.418Z",
      hasInspectionBooking: true,
      postInspectionBidCount: 0,
      latestPostInspectionBidAt: null,
      quoteTs: ["2026-09-08T03:08:49.792Z"],
    });

    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsInspectionBooking: false, needsPostInspectionQuote: true });
  });

  it("does not flag inspected leads after a quote sent after inspection", () => {
    const input = lead({
      isInspected: true,
      latestInspectionAt: "2026-09-08T05:02:58.418Z",
      hasInspectionBooking: true,
      postInspectionBidCount: 0,
      latestPostInspectionBidAt: null,
      quoteTs: ["2026-09-08T06:08:49.792Z"],
    });

    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsInspectionBooking: false, needsPostInspectionQuote: false });
  });

  it("uses a later post-inspection dealer bid as the post-inspection quote anchor", () => {
    const input = lead({
      isInspected: true,
      latestInspectionAt: "2026-09-08T05:02:58.418Z",
      hasInspectionBooking: true,
      postInspectionBidCount: 1,
      latestPostInspectionBidAt: "2026-09-08T07:00:00.000Z",
      quoteTs: ["2026-09-08T06:08:49.792Z"],
    });

    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsInspectionBooking: false, needsPostInspectionQuote: true });
  });

  it("does not treat a post-inspection sale call as a post-inspection text quote", () => {
    const input = lead({
      isInspected: true,
      latestInspectionAt: "2026-09-08T05:02:58.418Z",
      hasInspectionBooking: true,
      saleCompletedCallTs: ["2026-09-08T14:13:40.106Z"],
      quoteTs: [],
      saleTextQuoteTs: [],
    });

    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsInspectionBooking: false, needsPostInspectionQuote: true });
  });

  it("still flags failed or delayed inspected leads when they lack a post-inspection quote", () => {
    const base = {
      isInspected: true,
      latestInspectionAt: "2026-09-11T04:57:46.978Z",
      hasInspectionBooking: true,
      postInspectionBidCount: 0,
      latestPostInspectionBidAt: null,
      quoteTs: ["2026-09-10T05:04:50.093Z"],
    } satisfies Partial<SaleLeadClassifierInput>;

    expect(
      getSaleLeadActionFlags(lead({ ...base, crmStage: "FAILED" })),
    ).toMatchObject({ needsPostInspectionQuote: true });
    expect(
      getSaleLeadActionFlags(lead({ ...base, intention: "DELAY" })),
    ).toMatchObject({ needsPostInspectionQuote: true });
  });

  it("does not flag successful paid leads for post-inspection quote follow-up", () => {
    const input = lead({
      crmStage: "COMPLETED",
      firstPaymentDate: "2026-09-11T04:57:46.978Z",
      isInspected: true,
      latestInspectionAt: "2026-09-11T04:57:46.978Z",
      quoteTs: [],
    });

    expect(
      getSaleLeadActionFlags(input),
    ).toMatchObject({ needsPostInspectionQuote: false });
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

  it("puts successful paid leads into the success funnel before failed or delayed routing", () => {
    expect(
      classifySaleLeadStage(
        lead({
          crmStage: "COMPLETED",
          intention: "DELAY",
          firstPaymentDate: "2026-09-05T03:00:00.000Z",
          hasEnoughImages: false,
        } as Partial<SaleLeadClassifierInput>),
      ),
    ).toBe("success");
    expect(
      classifySaleLeadStage(
        lead({
          crmStage: "DEPOSIT_PAID",
          firstPaymentDate: "2026-09-05T03:00:00.000Z",
        } as Partial<SaleLeadClassifierInput>),
      ),
    ).toBe("success");
  });

  it("puts failed leads into the failed funnel before delayed leads", () => {
    expect(classifySaleLeadStage(lead({ crmStage: "FAILED", hasEnoughImages: false }))).toBe("failed");
  });

  it("puts delayed leads into the delayed funnel unless they already failed", () => {
    expect(classifySaleLeadStage(lead({ intention: "DELAY" } as Partial<SaleLeadClassifierInput>))).toBe("delayed");
    expect(
      classifySaleLeadStage(lead({ crmStage: "FAILED", intention: "DELAY" } as Partial<SaleLeadClassifierInput>)),
    ).toBe("failed");
  });

  it("does not put won or deposited CRM stages into success without first payment date", () => {
    expect(classifySaleLeadStage(lead({ crmStage: "DEPOSIT_PAID" }))).toBe(null);
    expect(classifySaleLeadStage(lead({ crmStage: "COMPLETED" }))).toBe(null);
  });
});

describe("hasVehicleImagesFromSources", () => {
  it("does not treat paper-only uploads as vehicle images for stage routing", () => {
    const hasVehicleImages = hasVehicleImagesFromSources({
      additionalImages: { paper: [{ url: "https://example.com/dang-kiem.jpg" }], outside: [] },
      customerZaloImageCount: 0,
      summaryHadImage: false,
    });

    expect(hasVehicleImages).toBe(false);
    expect(classifySaleLeadStage(lead({ hasEnoughImages: hasVehicleImages }))).toBe("need_images");
  });

  it("lets a lead move past image collection when the car image exists in storage", () => {
    const hasVehicleImages = hasVehicleImagesFromSources({
      additionalImages: { paper: [], outside: [{ url: "https://example.com/car.jpg" }] },
      customerZaloImageCount: 0,
      summaryHadImage: false,
    });

    expect(hasVehicleImages).toBe(true);
    expect(classifySaleLeadStage(lead({ hasEnoughImages: hasVehicleImages }))).toBe("need_quote");
  });

  it("lets a lead move past image collection when the customer sent a Zalo image", () => {
    const hasVehicleImages = hasVehicleImagesFromSources({
      additionalImages: { paper: [] },
      customerZaloImageCount: 1,
      summaryHadImage: false,
    });

    expect(hasVehicleImages).toBe(true);
    expect(classifySaleLeadStage(lead({ hasEnoughImages: hasVehicleImages }))).toBe("need_quote");
  });
});

describe("sale lead stage config", () => {
  it("orders operational stages before delayed, failed, success, and no-zalo buckets", () => {
    expect(SALE_LEAD_STAGE_CONFIG.map((stage) => stage.key)).toEqual([
      "need_contact",
      "need_images",
      "need_price_source",
      "need_quote",
      "follow_up_after_quote",
      "delayed",
      "failed",
      "success",
      "no_zalo",
    ]);
  });

  it("gives every stage a soft pastel badge tone", () => {
    for (const stage of SALE_LEAD_STAGE_CONFIG) {
      const tone = getSaleLeadStageTone(stage.key);
      expect(tone.badgeClass).toContain("bg-");
      expect(tone.badgeClass).toContain("border-");
    }

    expect(getSaleLeadStageTone("need_contact").badgeClass).toContain("bg-sky-50");
    expect(getSaleLeadStageTone("failed").badgeClass).toContain("bg-rose-50");
    expect(getSaleLeadStageTone("success").badgeClass).toContain("bg-lime-50");
    expect(getSaleLeadStageTone("no_zalo").badgeClass).toContain("bg-slate-50");
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
    { workStage: "need_contact", gapBucket: "lt5", hasImages: false, inspected: false, noHumanTouch: true, underTwoBids: false, hotLead: false, needsInspectionBooking: false, needsPostInspectionQuote: false },
    { workStage: "need_images", gapBucket: "no_price", hasImages: true, inspected: false, noHumanTouch: false, underTwoBids: false, hotLead: false, needsInspectionBooking: true, needsPostInspectionQuote: false },
    { workStage: "need_quote", gapBucket: "5_10", hasImages: true, inspected: true, noHumanTouch: false, underTwoBids: true, hotLead: true, needsInspectionBooking: false, needsPostInspectionQuote: true },
    { workStage: "follow_up_after_quote", gapBucket: "lt5", hasImages: true, inspected: true, noHumanTouch: false, underTwoBids: false, hotLead: true, needsInspectionBooking: false, needsPostInspectionQuote: false },
    { workStage: "failed", gapBucket: "gt10", hasImages: false, inspected: false, noHumanTouch: true, underTwoBids: true, hotLead: false, needsInspectionBooking: false, needsPostInspectionQuote: false },
    { workStage: "success", gapBucket: "lt5", hasImages: true, inspected: true, noHumanTouch: false, underTwoBids: false, hotLead: false, needsInspectionBooking: false, needsPostInspectionQuote: false },
    { workStage: "delayed", gapBucket: "no_price", hasImages: false, inspected: false, noHumanTouch: false, underTwoBids: false, hotLead: false, needsInspectionBooking: false, needsPostInspectionQuote: false },
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
    expect(filterSaleLeadRows(rows, { noImages: true })).toEqual([rows[0], rows[4], rows[6]]);
    expect(filterSaleLeadRows(rows, { noHumanTouch: true })).toEqual([rows[0], rows[4]]);
    expect(filterSaleLeadRows(rows, { underTwoBids: true })).toEqual([rows[2], rows[4]]);
    expect(filterSaleLeadRows(rows, { hotLead: true })).toEqual([rows[2], rows[3]]);
    expect(filterSaleLeadRows(rows, { needsInspectionBooking: true })).toEqual([rows[1]]);
    expect(filterSaleLeadRows(rows, { needsPostInspectionQuote: true })).toEqual([rows[2]]);
  });

  it("counts filter buttons from the full unfiltered row set", () => {
    expect(getSaleLeadFilterCounts(rows)).toEqual({
      total: 7,
      stages: {
        failed: 1,
        delayed: 1,
        success: 1,
        need_contact: 1,
        need_images: 1,
        need_price_source: 0,
        need_quote: 1,
        follow_up_after_quote: 1,
        no_zalo: 0,
      },
      gaps: {
        lt5: 3,
        "5_10": 1,
        gt10: 1,
        no_price: 2,
      },
      hasImages: 4,
      noImages: 3,
      inspected: 3,
      noHumanTouch: 2,
      underTwoBids: 2,
      hotLead: 2,
      needsInspectionBooking: 1,
      needsPostInspectionQuote: 1,
    });
  });

  it("recounts stages and gaps only against the selected status filters", () => {
    expect(getSaleLeadFilterFacets(rows, { hasImages: true })).toMatchObject({
      total: 4,
      stages: {
        need_contact: 0,
        need_images: 1,
        need_price_source: 0,
        need_quote: 1,
        follow_up_after_quote: 1,
        delayed: 0,
        failed: 0,
        success: 1,
        no_zalo: 0,
      },
      gaps: {
        lt5: 2,
        "5_10": 1,
        gt10: 0,
        no_price: 1,
      },
      status: {
        hasImages: 4,
        noImages: 3,
        inspected: 3,
        noHumanTouch: 2,
        underTwoBids: 2,
        hotLead: 2,
        needsInspectionBooking: 1,
        needsPostInspectionQuote: 1,
      },
    });
  });

  it("does not let selected stage or gap filters change the sidebar counts", () => {
    expect(getSaleLeadFilterFacets(rows, { gaps: ["lt5"] })).toMatchObject({
      total: 7,
      stages: {
        need_contact: 1,
        need_images: 1,
        need_price_source: 0,
        need_quote: 1,
        follow_up_after_quote: 1,
        delayed: 1,
        failed: 1,
        success: 1,
        no_zalo: 0,
      },
      gaps: {
        lt5: 3,
        "5_10": 1,
        gt10: 1,
        no_price: 2,
      },
      status: {
        hasImages: 4,
        noImages: 3,
        inspected: 3,
        noHumanTouch: 2,
        underTwoBids: 2,
        hotLead: 2,
        needsInspectionBooking: 1,
        needsPostInspectionQuote: 1,
      },
    });

    expect(getSaleLeadFilterFacets(rows, { stages: ["need_quote"] })).toMatchObject({
      total: 7,
      gaps: {
        lt5: 3,
        "5_10": 1,
        gt10: 1,
        no_price: 2,
      },
      status: {
        hasImages: 4,
        noImages: 3,
        inspected: 3,
        noHumanTouch: 2,
        underTwoBids: 2,
        hotLead: 2,
      },
    });
  });

  it("applies selected filters only forward according to the click order", () => {
    expect(
      getOrderedSaleLeadFilterFacets(rows, {
        filters: {
          hasImages: true,
          gaps: ["lt5"],
          stages: ["follow_up_after_quote"],
        },
        order: ["status:hasImages", "gap:lt5", "stage:follow_up_after_quote"],
      }),
    ).toMatchObject({
      groupTotals: {
        status: 7,
        stages: 2,
        gaps: 4,
      },
      status: {
        hasImages: 4,
        inspected: 3,
      },
      gaps: {
        lt5: 2,
        "5_10": 1,
        gt10: 0,
        no_price: 1,
      },
      stages: {
        need_quote: 0,
        follow_up_after_quote: 1,
        success: 1,
      },
    });

    expect(
      getOrderedSaleLeadFilterFacets(rows, {
        filters: {
          hasImages: true,
          gaps: ["lt5"],
          stages: ["follow_up_after_quote"],
        },
        order: ["status:hasImages", "stage:follow_up_after_quote", "gap:lt5"],
      }),
    ).toMatchObject({
      groupTotals: {
        status: 7,
        stages: 4,
        gaps: 1,
      },
      status: {
        hasImages: 4,
        inspected: 3,
      },
      stages: {
        need_quote: 1,
        follow_up_after_quote: 1,
        success: 1,
      },
      gaps: {
        lt5: 1,
        "5_10": 0,
        gt10: 0,
        no_price: 0,
      },
    });
  });
});
