import { describe, expect, it } from "vitest";

import { buildSaleDailyTasks, getSaleDailyTaskSummary, type SaleDailyTaskLead } from "@/lib/sale-daily-tasks";

function dailyLead(overrides: Partial<SaleDailyTaskLead> = {}): SaleDailyTaskLead {
  return {
    leadId: "lead-1",
    carId: "car-1",
    leadName: "Nguyen Van A",
    phone: "0900000000",
    picId: "pic-1",
    picName: "Joyboy",
    carName: "Toyota Camry 2020",
    location: "TP.HCM",
    createdAt: "2026-09-07T02:00:00.000Z",
    workStage: "need_quote",
    gapBucket: "lt5",
    gapPercent: 3,
    gapAmount: 15_000_000,
    priceCustomer: 500_000_000,
    highestBid: 485_000_000,
    highestDealerName: "Dealer A",
    hasImages: true,
    inspected: false,
    booked: false,
    underTwoBids: false,
    hotLead: false,
    dealerBidDealerCount: 2,
    lastTouchAt: "2026-09-06T03:00:00.000Z",
    lastSaleAt: null,
    lastCustomerAt: "2026-09-06T03:00:00.000Z",
    latestPreInspectionBidAt: "2026-09-07T02:30:00.000Z",
    latestPostInspectionBidAt: null,
    quoteTimestamps: [],
    priceCustomerLabel: "500M",
    highestBidLabel: "485M",
    gapLabel: "15M · 3.0%",
    ...overrides,
  };
}

describe("buildSaleDailyTasks", () => {
  it("builds one task per lead in the requested operating order", () => {
    const tasks = buildSaleDailyTasks(
      [
        dailyLead({
          leadId: "post",
          carId: "post-car",
          workStage: "need_post_inspection_quote",
          inspected: true,
          latestPostInspectionBidAt: "2026-09-07T02:00:00.000Z",
        }),
        dailyLead({
          leadId: "under-two",
          carId: "under-two-car",
          workStage: "need_price_source",
          underTwoBids: true,
          dealerBidDealerCount: 1,
        }),
        dailyLead({
          leadId: "follow",
          carId: "follow-car",
          workStage: "follow_up_after_quote",
          quoteTimestamps: ["2026-09-06T02:00:00.000Z"],
          lastCustomerAt: "2026-09-06T04:00:00.000Z",
        }),
        dailyLead({
          leadId: "quote",
          carId: "quote-car",
          workStage: "need_quote",
          dealerBidDealerCount: 3,
          latestPreInspectionBidAt: "2026-09-07T01:30:00.000Z",
        }),
      ],
      { now: "2026-09-07T05:00:00.000Z", businessDate: "2026-09-07" },
    );

    expect(tasks.map((task) => task.type)).toEqual([
      "follow_up_low_gap_quote",
      "price_under_two_bids",
      "quote_two_plus_bids",
      "post_inspection_quote",
    ]);
  });

  it("marks SLA overdue when the task due time is already past", () => {
    const [task] = buildSaleDailyTasks(
      [
        dailyLead({
          workStage: "need_post_inspection_quote",
          inspected: true,
          latestPostInspectionBidAt: "2026-09-06T03:00:00.000Z",
        }),
      ],
      { now: "2026-09-07T05:00:00.000Z", businessDate: "2026-09-07" },
    );

    expect(task.status).toBe("overdue");
    expect(task.priority).toBe("P0");
  });

  it("keeps same-day sale touches as completed signals for daily tracking", () => {
    const [task] = buildSaleDailyTasks(
      [
        dailyLead({
          workStage: "follow_up_after_quote",
          quoteTimestamps: ["2026-09-06T02:00:00.000Z"],
          lastSaleAt: "2026-09-07T03:00:00.000Z",
        }),
      ],
      { now: "2026-09-07T05:00:00.000Z", businessDate: "2026-09-07" },
    );

    expect(task.status).toBe("completed_signal");
    expect(getSaleDailyTaskSummary([task])).toMatchObject({
      total: 1,
      completedSignal: 1,
      open: 0,
    });
  });
});
