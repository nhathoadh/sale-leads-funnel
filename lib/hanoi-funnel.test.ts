import { describe, expect, it } from "vitest";

import {
  buildHanoiDelayReasonChart,
  buildHanoiDailyLeadCharts,
  buildHanoiDailyZaloCallChart,
  buildHanoiDailyLeadIntakeChart,
  buildHanoiDailyHumanMessageMixChart,
  buildHanoiFailureReasonFunnels,
  buildHanoiFunnelStages,
  buildHanoiOverviewMetrics,
  buildHanoiDetailedSaleCycle,
  buildHanoiSpeedToCloseMetrics,
  buildHanoiSummaryCharts,
  formatHanoiCycleDuration,
  parseHanoiZaloCallMinutes,
  buildHanoiWorkablePieGradient,
  buildHanoiWorkablePieSlices,
  buildHanoiWorkableGapChart,
  normalizeHanoiFunnelDateInput,
  normalizeHanoiFunnelTeamFilter,
  parseHanoiFunnelPicFilter,
  sortHanoiSaleRows,
} from "@/lib/hanoi-funnel";

describe("hanoi funnel filters", () => {
  it("defaults team filter to HANOI and only accepts the CRM team names", () => {
    expect(normalizeHanoiFunnelTeamFilter(null)).toBe("HANOI");
    expect(normalizeHanoiFunnelTeamFilter("hanoi")).toBe("HANOI");
    expect(normalizeHanoiFunnelTeamFilter("HCM")).toBe("HCM");
    expect(normalizeHanoiFunnelTeamFilter("ha-noi")).toBe("HANOI");
    expect(normalizeHanoiFunnelTeamFilter("unknown")).toBe("HANOI");
  });

  it("keeps only UUIDs from the PIC filter", () => {
    expect(
      parseHanoiFunnelPicFilter(
        "7bd43409-dbeb-43c6-8d8b-481a4515cad7, bad, 81d3ae9c-75f1-4f6d-bc9c-a849a64b0cea",
      ),
    ).toEqual(["7bd43409-dbeb-43c6-8d8b-481a4515cad7", "81d3ae9c-75f1-4f6d-bc9c-a849a64b0cea"]);
  });

  it("falls back when date input is not yyyy-mm-dd", () => {
    expect(normalizeHanoiFunnelDateInput("2026-09-13", "2026-09-01")).toBe("2026-09-13");
    expect(normalizeHanoiFunnelDateInput("13/09/2026", "2026-09-01")).toBe("2026-09-01");
  });
});

describe("hanoi funnel metrics", () => {
  it("derives overview averages and conversion rate from totals", () => {
    expect(
      buildHanoiOverviewMetrics({
        totalLeads: 200,
        soldCars: 4,
        gmv: 2_000_000_000,
        expectedRevenue: 80_000_000,
      }),
    ).toEqual({
      totalLeads: 200,
      soldCars: 4,
      gmv: 2_000_000_000,
      expectedRevenue: 80_000_000,
      averageSoldCarValue: 500_000_000,
      averageRevenuePerCar: 20_000_000,
      conversionRate: 2,
    });
  });

  it("derives funnel percentages from the previous stage and total", () => {
    expect(
      buildHanoiFunnelStages([
        { key: "total", label: "Total", count: 100 },
        { key: "image", label: "Có ảnh", count: 40 },
        { key: "inspection", label: "Kiểm định", count: 10 },
      ]),
    ).toEqual([
      { key: "total", label: "Total", count: 100, percentFromPrevious: 100, percentOfTotal: 100 },
      { key: "image", label: "Có ảnh", count: 40, percentFromPrevious: 40, percentOfTotal: 40 },
      { key: "inspection", label: "Kiểm định", count: 10, percentFromPrevious: 25, percentOfTotal: 10 },
    ]);
  });

  it("keeps speed-to-close milestones ordered and fills missing rows", () => {
    expect(
      buildHanoiSpeedToCloseMetrics([
        {
          key: "lead_win",
          label: "Lead -> Win",
          cases: 4,
          averageDays: 36.24,
          medianDays: 8.84,
          lastMonthAverageDays: 9.22,
        },
      ]),
    ).toMatchObject({
      totalClosedMilestones: 4,
      metrics: [
        { key: "lead_booking", cases: 0 },
        {
          key: "lead_win",
          cases: 4,
          averageDays: 36.2,
          medianDays: 8.8,
          lastMonthAverageDays: 9.2,
          averageDeltaDays: 27,
        },
        { key: "booking_win", cases: 0 },
        { key: "lead_failed", cases: 0 },
      ],
    });
  });

  it("builds detailed sale cycle metrics in operational order and formats durations by hour or day", () => {
    expect(
      buildHanoiDetailedSaleCycle([
        {
          key: "first_action_image",
          label: "First action -> Có ảnh",
          cases: 12,
          averageHours: 16.24,
          medianHours: 4.84,
          previousAverageHours: 48,
        },
        {
          key: "first_quote_win",
          label: "Trả giá -> Win",
          cases: 3,
          averageHours: 96.2,
          medianHours: 74.2,
          previousAverageHours: 177.1,
        },
      ]),
    ).toMatchObject({
      totalMilestones: 15,
      metrics: [
        { key: "lead_first_action", cases: 0 },
        {
          key: "first_action_image",
          cases: 12,
          averageHours: 16.2,
          medianHours: 4.8,
          previousAverageHours: 48,
          averageDeltaHours: -31.8,
        },
        { key: "image_outreach", cases: 0 },
        { key: "outreach_first_bid", cases: 0 },
        { key: "first_bid_first_quote", cases: 0 },
        {
          key: "first_quote_win",
          cases: 3,
          averageHours: 96.2,
          medianHours: 74.2,
          previousAverageHours: 177.1,
          averageDeltaHours: -80.9,
        },
        { key: "first_quote_failed", cases: 0 },
      ],
    });
    expect(formatHanoiCycleDuration(4.84)).toBe("4.8h");
    expect(formatHanoiCycleDuration(50.4)).toBe("2.1d");
    expect(formatHanoiCycleDuration(-31.8)).toBe("-1.3d");
  });

  it("normalizes workable gap buckets in the dashboard order", () => {
    expect(
      buildHanoiWorkableGapChart({
        total: 10,
        buckets: [
          { key: "gt10", label: ">10%", count: 3, percent: 30 },
          { key: "lt5", label: "<5%", count: 2, percent: 20 },
        ],
      }),
    ).toEqual({
      total: 10,
      buckets: [
        { key: "lt5", label: "<5%", count: 2, percent: 20 },
        { key: "5_10", label: "5-10%", count: 0, percent: 0 },
        { key: "gt10", label: ">10%", count: 3, percent: 30 },
        { key: "no_price", label: "Chưa có giá", count: 0, percent: 0 },
      ],
    });
  });

  it("builds stage and gap charts from follow-up summaries without recalculating gap from all stages", () => {
    const charts = buildHanoiSummaryCharts({
      stageSummary: {
        total: 20,
        workableTotal: 7,
        stages: [
          {
            key: "need_contact",
            label: "Cần liên hệ",
            shortLabel: "Liên hệ",
            description: "",
            count: 4,
            workableCount: 0,
          },
          {
            key: "need_price_source",
            label: "Cần chào giá",
            shortLabel: "Chào giá",
            description: "",
            count: 3,
            workableCount: 3,
          },
          {
            key: "need_quote",
            label: "Cần trả giá",
            shortLabel: "Trả giá",
            description: "",
            count: 2,
            workableCount: 2,
          },
          {
            key: "follow_up_after_quote",
            label: "Follow up sau trả giá",
            shortLabel: "Follow up",
            description: "",
            count: 2,
            workableCount: 2,
          },
          {
            key: "failed",
            label: "Thất bại",
            shortLabel: "Thất bại",
            description: "",
            count: 9,
            workableCount: 0,
          },
        ],
      },
      workableGapSummary: {
        total: 7,
        buckets: [
          { key: "lt5", label: "<5%", count: 2, percent: 28.57 },
          { key: "5_10", label: "5-10%", count: 1, percent: 14.29 },
          { key: "gt10", label: ">10%", count: 3, percent: 42.86 },
          { key: "no_price", label: "Chưa có giá", count: 1, percent: 14.29 },
        ],
      },
    });
    expect(charts).not.toBeNull();

    expect(charts!.stageChart.stages.map((stage) => [stage.key, stage.totalCount])).toEqual([
      ["need_contact", 4],
      ["need_price_source", 3],
      ["need_quote", 2],
      ["follow_up_after_quote", 2],
      ["failed", 9],
    ]);
    expect(charts!.gapChart.total).toBe(7);
    expect(charts!.gapChart.buckets.map((bucket) => [bucket.key, bucket.count, bucket.percent])).toEqual([
      ["lt5", 2, 28.57],
      ["5_10", 1, 14.29],
      ["gt10", 3, 42.86],
      ["no_price", 1, 14.29],
    ]);
  });

  it("returns null when a follow-up summary is incomplete", () => {
    expect(
      buildHanoiSummaryCharts({
        stageSummary: null,
        workableGapSummary: {
          total: 0,
          buckets: [],
        },
      }),
    ).toBeNull();
  });

  it("builds daily lead quality and win charts across the full date range", () => {
    const charts = buildHanoiDailyLeadCharts({
      from: "2026-09-01",
      to: "2026-09-03",
      leadRows: [
        { day: "2026-09-01", hasImages: true, workStage: "need_quote", qualified: "NON_QUALIFIED" },
        { day: "2026-09-01", hasImages: false, workStage: "need_images", qualified: "NON_QUALIFIED" },
        { day: "2026-09-01", qualified: "NON_QUALIFIED" },
        { day: "2026-09-02", qualified: "TEST" },
        { day: "2026-09-02", qualified: "UNDEFINED_QUALIFIED" },
      ],
      winRows: [
        { day: "2026-09-01", count: 2 },
        { day: "2026-09-03", count: 1 },
      ],
    });

    expect(charts.leadQualityByDay).toEqual([
      {
        day: "2026-09-01",
        total: 3,
        strongQualified: 1,
        weakQualified: 1,
        nonQualified: 1,
        undefinedQualified: 0,
      },
      {
        day: "2026-09-02",
        total: 2,
        strongQualified: 0,
        weakQualified: 0,
        nonQualified: 1,
        undefinedQualified: 1,
      },
      {
        day: "2026-09-03",
        total: 0,
        strongQualified: 0,
        weakQualified: 0,
        nonQualified: 0,
        undefinedQualified: 0,
      },
    ]);
    expect(charts.winCasesByDay).toEqual([
      { day: "2026-09-01", count: 2 },
      { day: "2026-09-02", count: 0 },
      { day: "2026-09-03", count: 1 },
    ]);
  });

  it("builds daily lead intake from unique lead ids across the full date range", () => {
    expect(
      buildHanoiDailyLeadIntakeChart({
        from: "2026-09-01",
        to: "2026-09-03",
        rows: [
          { day: "2026-09-01", leadId: "lead-1" },
          { day: "2026-09-01", leadId: "lead-1" },
          { day: "2026-09-01", leadId: "lead-2" },
          { day: "2026-09-03", leadId: "lead-3" },
          { day: "2026-09-04", leadId: "lead-4" },
        ],
      }),
    ).toEqual([
      { day: "2026-09-01", count: 2 },
      { day: "2026-09-02", count: 0 },
      { day: "2026-09-03", count: 1 },
    ]);
  });

  it("builds daily human-message mix by unique lead id and lead age", () => {
    expect(
      buildHanoiDailyHumanMessageMixChart({
        from: "2026-09-01",
        to: "2026-09-03",
        rows: [
          { messageDay: "2026-09-01", leadCreatedDay: "2026-09-01", leadId: "lead-new-1" },
          { messageDay: "2026-09-01", leadCreatedDay: "2026-09-01", leadId: "lead-new-1" },
          { messageDay: "2026-09-01", leadCreatedDay: "2026-08-30", leadId: "lead-old-1" },
          { messageDay: "2026-09-02", leadCreatedDay: "2026-09-02", leadId: "lead-new-2" },
          { messageDay: "2026-09-02", leadCreatedDay: "2026-09-01", leadId: "lead-old-2" },
          { messageDay: "2026-09-04", leadCreatedDay: "2026-09-01", leadId: "outside-range" },
        ],
      }),
    ).toEqual([
      { day: "2026-09-01", newLeadCount: 1, existingLeadCount: 1, total: 2 },
      { day: "2026-09-02", newLeadCount: 1, existingLeadCount: 1, total: 2 },
      { day: "2026-09-03", newLeadCount: 0, existingLeadCount: 0, total: 0 },
    ]);
  });

  it("builds daily Zalo call minutes and unique called leads", () => {
    expect(
      buildHanoiDailyZaloCallChart({
        from: "2026-09-01",
        to: "2026-09-03",
        rows: [
          { day: "2026-09-01", leadId: "lead-1", minutes: 3.2 },
          { day: "2026-09-01", leadId: "lead-1", minutes: 2.3 },
          { day: "2026-09-01", leadId: "lead-2", minutes: 1 },
          { day: "2026-09-02", leadId: "lead-3", minutes: 0 },
          { day: "2026-09-04", leadId: "lead-4", minutes: 5 },
        ],
      }),
    ).toEqual([
      { day: "2026-09-01", totalMinutes: 6.5, uniqueLeadCount: 2 },
      { day: "2026-09-02", totalMinutes: 0, uniqueLeadCount: 0 },
      { day: "2026-09-03", totalMinutes: 0, uniqueLeadCount: 0 },
    ]);
  });

  it("parses Zalo call duration from nested bubble params", () => {
    expect(
      parseHanoiZaloCallMinutes(
        JSON.stringify({
          title: "sendBubbleMessage",
          description: "Cuộc gọi",
          action: "recommened.calltime",
          params: JSON.stringify({ duration: 139, isCaller: 1, calltype: 0 }),
        }),
      ),
    ).toBeCloseTo(139 / 60, 5);
    expect(
      parseHanoiZaloCallMinutes(
        JSON.stringify({
          title: "sendBubbleMessage",
          description: "Cuộc gọi",
          action: "recommened.misscall",
          params: JSON.stringify({ duration: 0, reason: 2 }),
        }),
      ),
    ).toBe(0);
  });

  it("builds pie slices for the workable lead gap chart", () => {
    const slices = buildHanoiWorkablePieSlices({
      total: 10,
      buckets: [
        { key: "lt5", label: "<5%", count: 2, percent: 20 },
        { key: "5_10", label: "5-10%", count: 3, percent: 30 },
        { key: "gt10", label: ">10%", count: 4, percent: 40 },
        { key: "no_price", label: "Chưa có giá", count: 1, percent: 10 },
      ],
    });

    expect(slices.map(({ key, startPercent, endPercent, color }) => ({ key, startPercent, endPercent, color }))).toEqual([
      { key: "lt5", startPercent: 0, endPercent: 20, color: "#38bdf8" },
      { key: "5_10", startPercent: 20, endPercent: 50, color: "#34d399" },
      { key: "gt10", startPercent: 50, endPercent: 90, color: "#fbbf24" },
      { key: "no_price", startPercent: 90, endPercent: 100, color: "#94a3b8" },
    ]);
    expect(buildHanoiWorkablePieGradient(slices)).toBe(
      "conic-gradient(#38bdf8 0% 20%, #34d399 20% 50%, #fbbf24 50% 90%, #94a3b8 90% 100%)",
    );
  });

  it("sorts sale comparison rows by numeric metrics and toggles direction", () => {
    const rows = [
      {
        userId: "1",
        userName: "a",
        displayName: "An",
        isDeactivated: false,
        totalLeads: 10,
        leadsWithImages: 8,
        inspectionBookings: 1,
        wins: 2,
      },
      {
        userId: "2",
        userName: "b",
        displayName: "Binh",
        isDeactivated: false,
        totalLeads: 20,
        leadsWithImages: 5,
        inspectionBookings: 6,
        wins: 1,
      },
      {
        userId: "3",
        userName: "c",
        displayName: "Cuong",
        isDeactivated: false,
        totalLeads: 5,
        leadsWithImages: 5,
        inspectionBookings: 2,
        wins: 0,
      },
    ];

    expect(sortHanoiSaleRows(rows, { key: "imageRate", direction: "desc" }).map((row) => row.displayName)).toEqual([
      "Cuong",
      "An",
      "Binh",
    ]);
    expect(sortHanoiSaleRows(rows, { key: "inspectionRate", direction: "asc" }).map((row) => row.displayName)).toEqual([
      "An",
      "Binh",
      "Cuong",
    ]);
  });

  it("groups failed and delayed reasons into compact charts", () => {
    expect(
      buildHanoiFailureReasonFunnels([
        { groupKey: "worked", reason: "Giá cao", count: 6 },
        { groupKey: "not_worked", reason: "", count: 4 },
      ]),
    ).toEqual([
      {
        key: "worked",
        label: "Lead đã làm việc (có ảnh)",
        total: 6,
        reasons: [{ reason: "Giá cao", count: 6, percentOfGroup: 100 }],
      },
      {
        key: "not_worked",
        label: "Lead chưa làm việc",
        total: 4,
        reasons: [{ reason: "Chưa có lý do", count: 4, percentOfGroup: 100 }],
      },
    ]);

    expect(
      buildHanoiDelayReasonChart([
        { reason: "Chờ giá tốt hơn", count: 6 },
        { reason: "", count: 4 },
      ]),
    ).toEqual({
      total: 10,
      reasons: [
        { reason: "Chờ giá tốt hơn", count: 6, percentOfTotal: 60 },
        { reason: "Chưa có lý do", count: 4, percentOfTotal: 40 },
      ],
    });
  });
});
