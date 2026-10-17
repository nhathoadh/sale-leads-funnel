import type {
  SaleLeadGapBucket,
  SaleLeadStageSummary,
  SaleLeadTeamFilter,
  SaleLeadWorkableGapSummary,
} from "@/lib/sale-leads-funnel";

export interface HanoiFunnelStageInput {
  key: string;
  label: string;
  count: number;
}

export interface HanoiFunnelStage extends HanoiFunnelStageInput {
  percentFromPrevious: number;
  percentOfTotal: number;
}

export interface HanoiOverviewInput {
  totalLeads: number;
  soldCars: number;
  gmv: number;
  expectedRevenue: number;
}

export interface HanoiOverviewMetrics extends HanoiOverviewInput {
  averageSoldCarValue: number;
  averageRevenuePerCar: number;
  conversionRate: number;
}

export interface HanoiSpeedToCloseMetricInput {
  key: "lead_booking" | "lead_win" | "booking_win" | "lead_failed";
  label: string;
  cases: number;
  averageDays: number;
  medianDays: number;
  lastMonthAverageDays: number;
}

export interface HanoiSpeedToCloseMetric extends HanoiSpeedToCloseMetricInput {
  averageDeltaDays: number;
}

export interface HanoiSpeedToCloseSummary {
  totalClosedMilestones: number;
  metrics: HanoiSpeedToCloseMetric[];
}

export type HanoiDetailedSaleCycleMetricKey =
  | "lead_first_action"
  | "first_action_image"
  | "image_outreach"
  | "outreach_first_bid"
  | "first_bid_first_quote"
  | "first_quote_win"
  | "first_quote_failed";

export interface HanoiDetailedSaleCycleMetricInput {
  key: HanoiDetailedSaleCycleMetricKey;
  label: string;
  cases: number;
  averageHours: number;
  medianHours: number;
  previousAverageHours: number;
}

export interface HanoiDetailedSaleCycleMetric extends HanoiDetailedSaleCycleMetricInput {
  averageDeltaHours: number;
}

export interface HanoiDetailedSaleCycleSummary {
  totalMilestones: number;
  metrics: HanoiDetailedSaleCycleMetric[];
}

export type HanoiFailureReasonGroupKey = "worked" | "not_worked";

export interface HanoiFailureReasonInput {
  groupKey: HanoiFailureReasonGroupKey;
  reason: string | null;
  count: number;
}

export interface HanoiFailureReasonItem {
  reason: string;
  count: number;
  percentOfGroup: number;
}

export interface HanoiFailureReasonFunnel {
  key: HanoiFailureReasonGroupKey;
  label: string;
  total: number;
  reasons: HanoiFailureReasonItem[];
}

export interface HanoiDelayReasonInput {
  reason: string | null;
  count: number;
}

export interface HanoiDelayReasonItem {
  reason: string;
  count: number;
  percentOfTotal: number;
}

export interface HanoiDelayReasonChart {
  total: number;
  reasons: HanoiDelayReasonItem[];
}

export interface HanoiWorkStageChartStage {
  key: string;
  label: string;
  shortLabel: string;
  totalCount: number;
  workableCount: number;
  percentOfTotal: number;
  percentOfWorkable: number;
}

export interface HanoiWorkStageChart {
  totalLeads: number;
  workableLeads: number;
  stages: HanoiWorkStageChartStage[];
}

export interface HanoiWorkableGapSummaryBucket {
  key: SaleLeadGapBucket;
  label: string;
  count: number;
  percent: number;
}

export interface HanoiWorkableGapChart {
  total: number;
  buckets: HanoiWorkableGapSummaryBucket[];
}

export interface HanoiWorkablePieSlice extends HanoiWorkableGapSummaryBucket {
  color: string;
  startPercent: number;
  endPercent: number;
}

export interface HanoiDailyLeadQualityInput {
  day: string;
  hasImages?: boolean;
  workStage?: string | null;
  qualified?: string | null;
}

export interface HanoiDailyLeadIntakeInput {
  day: string;
  leadId: string;
}

export interface HanoiDailyHumanMessageInput {
  messageDay: string;
  leadCreatedDay: string;
  leadId: string;
}

export interface HanoiDailyZaloCallInput {
  day: string;
  leadId: string;
  minutes: number;
}

export interface HanoiDailyWinInput {
  day: string;
  count: number;
}

export interface HanoiDailyLeadIntakePoint {
  day: string;
  count: number;
}

export interface HanoiDailyHumanMessageMixPoint {
  day: string;
  newLeadCount: number;
  existingLeadCount: number;
  total: number;
}

export interface HanoiDailyZaloCallPoint {
  day: string;
  totalMinutes: number;
  uniqueLeadCount: number;
}

export interface HanoiDailyLeadQualityPoint {
  day: string;
  total: number;
  strongQualified: number;
  weakQualified: number;
  nonQualified: number;
  undefinedQualified: number;
}

export interface HanoiDailyWinPoint {
  day: string;
  count: number;
}

export type HanoiSaleRow = HanoiFunnelResponse["byUser"][number];
export type HanoiSaleSortKey =
  | "displayName"
  | "totalLeads"
  | "leadsWithImages"
  | "imageRate"
  | "inspectionBookings"
  | "inspectionRate"
  | "wins"
  | "conversionRate";
export type HanoiSortDirection = "asc" | "desc";

export interface HanoiFunnelResponse {
  filters: {
    from: string;
    to: string;
    team: SaleLeadTeamFilter;
    pic: string[];
  };
  overview: HanoiOverviewMetrics;
  speedToClose: HanoiSpeedToCloseSummary;
  detailedSaleCycle: HanoiDetailedSaleCycleSummary;
  workStageChart: HanoiWorkStageChart;
  workableGapChart: HanoiWorkableGapChart;
  snapshotMeta?: {
    source: "snapshot" | "empty";
    rows: number;
    computedAt: string | null;
  };
  totalFunnel: HanoiFunnelStage[];
  cohortFunnel: HanoiFunnelStage[];
  targetFunnel: HanoiFunnelStage[];
  dailyLeadIntake: HanoiDailyLeadIntakePoint[];
  dailyHumanMessageMix: HanoiDailyHumanMessageMixPoint[];
  dailyZaloCalls: HanoiDailyZaloCallPoint[];
  leadQualityByDay: HanoiDailyLeadQualityPoint[];
  winCasesByDay: HanoiDailyWinPoint[];
  failureReasons: HanoiFailureReasonFunnel[];
  delayReasons: HanoiDelayReasonChart;
  byUser: Array<{
    userId: string;
    userName: string;
    displayName: string;
    isDeactivated: boolean;
    totalLeads: number;
    leadsWithImages: number;
    inspectionBookings: number;
    wins: number;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAP_BUCKETS: HanoiWorkableGapSummaryBucket[] = [
  { key: "lt5", label: "<5%", count: 0, percent: 0 },
  { key: "5_10", label: "5-10%", count: 0, percent: 0 },
  { key: "gt10", label: ">10%", count: 0, percent: 0 },
  { key: "no_price", label: "Chưa có giá", count: 0, percent: 0 },
];
const WORKABLE_GAP_COLORS: Record<SaleLeadGapBucket, string> = {
  lt5: "#38bdf8",
  "5_10": "#34d399",
  gt10: "#fbbf24",
  no_price: "#94a3b8",
};
const WORKABLE_STAGE_KEYS = new Set(["need_price_source", "need_quote", "follow_up_after_quote"]);
const failureReasonGroups: Array<{ key: HanoiFailureReasonGroupKey; label: string }> = [
  { key: "worked", label: "Lead đã làm việc (có ảnh)" },
  { key: "not_worked", label: "Lead chưa làm việc" },
];
const speedMetricDefinitions: Array<Pick<HanoiSpeedToCloseMetricInput, "key" | "label">> = [
  { key: "lead_booking", label: "Lead → Booking" },
  { key: "lead_win", label: "Lead → Win" },
  { key: "booking_win", label: "Booking → Win" },
  { key: "lead_failed", label: "Lead → Failed" },
];
const detailedSaleCycleDefinitions: Array<Pick<HanoiDetailedSaleCycleMetricInput, "key" | "label">> = [
  { key: "lead_first_action", label: "Lead → First action" },
  { key: "first_action_image", label: "First action → Có ảnh" },
  { key: "image_outreach", label: "Có ảnh → Chào dealer" },
  { key: "outreach_first_bid", label: "Chào dealer → Lấy giá" },
  { key: "first_bid_first_quote", label: "Lấy giá → Trả giá lần 1" },
  { key: "first_quote_win", label: "Trả giá lần 1 → Thành công" },
  { key: "first_quote_failed", label: "Trả giá lần 1 → Thất bại" },
];

export const LEAD_FAILED_SPEED_EXCLUDED_REASONS = [
  "dealer/cò",
  "khách ghost",
  "số không đúng",
  "khác",
];

export function normalizeHanoiFunnelTeamFilter(value: string | null | undefined): SaleLeadTeamFilter {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[-_ ]/g, "");
  return normalized === "HCM" ? "HCM" : "HANOI";
}

export function normalizeHanoiFunnelDateInput(value: string | null, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  return value;
}

export function parseHanoiFunnelPicFilter(value: string | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => UUID_RE.test(item));
}

function toOneDecimal(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : 0;
}

function normalizeReason(reason: string | null): string {
  const value = reason?.trim();
  return value ? value : "Chưa có lý do";
}

function parseJsonObject(value: unknown): unknown {
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  const timeMatch = trimmed.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const totalSeconds = Number(timeMatch[1] ?? 0) * 3600 + Number(timeMatch[2] ?? 0) * 60 + Number(timeMatch[3] ?? 0);
  return totalSeconds > 0 ? totalSeconds : null;
}

function findZaloCallDurationSeconds(value: unknown): number | null {
  const parsedValue = typeof value === "string" ? parseJsonObject(value) : value;
  if (!parsedValue || typeof parsedValue !== "object") return null;

  if (Array.isArray(parsedValue)) {
    for (const item of parsedValue) {
      const nested = findZaloCallDurationSeconds(item);
      if (nested !== null) return nested;
    }
    return null;
  }

  for (const [key, item] of Object.entries(parsedValue)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("duration") || normalizedKey.includes("calltime") || normalizedKey.includes("call_time")) {
      const parsed = parseDurationSeconds(item);
      if (parsed !== null) return parsed;
    }
    const nested = findZaloCallDurationSeconds(item);
    if (nested !== null) return nested;
  }

  return null;
}

export function parseHanoiZaloCallMinutes(content: unknown): number {
  const seconds = findZaloCallDurationSeconds(parseJsonObject(content));
  return seconds !== null ? seconds / 60 : 0;
}

function dateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];

  const days: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(cursor.toISOString().slice(0, 10));
  }
  return days;
}

export function buildHanoiOverviewMetrics(input: HanoiOverviewInput): HanoiOverviewMetrics {
  return {
    ...input,
    averageSoldCarValue: input.soldCars > 0 ? input.gmv / input.soldCars : 0,
    averageRevenuePerCar: input.soldCars > 0 ? input.expectedRevenue / input.soldCars : 0,
    conversionRate: input.totalLeads > 0 ? Number(((input.soldCars / input.totalLeads) * 100).toFixed(2)) : 0,
  };
}

export function buildHanoiFunnelStages(stages: HanoiFunnelStageInput[]): HanoiFunnelStage[] {
  const total = stages[0]?.count ?? 0;

  return stages.map((stage, index) => {
    const denominator = index === 0 ? stage.count : stages[index - 1]?.count ?? 0;

    return {
      ...stage,
      percentFromPrevious: denominator > 0 ? Number(((stage.count / denominator) * 100).toFixed(2)) : 0,
      percentOfTotal: total > 0 ? Number(((stage.count / total) * 100).toFixed(2)) : 0,
    };
  });
}

export function buildHanoiSpeedToCloseMetrics(rows: HanoiSpeedToCloseMetricInput[]): HanoiSpeedToCloseSummary {
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const orderedRows = speedMetricDefinitions.map((definition) => ({
    ...definition,
    cases: 0,
    averageDays: 0,
    medianDays: 0,
    lastMonthAverageDays: 0,
    ...rowsByKey.get(definition.key),
  }));

  return {
    totalClosedMilestones: orderedRows.reduce((sum, row) => sum + row.cases, 0),
    metrics: orderedRows.map((row) => {
      const averageDays = toOneDecimal(row.averageDays);
      const lastMonthAverageDays = toOneDecimal(row.lastMonthAverageDays);

      return {
        ...row,
        averageDays,
        medianDays: toOneDecimal(row.medianDays),
        lastMonthAverageDays,
        averageDeltaDays: toOneDecimal(averageDays - lastMonthAverageDays),
      };
    }),
  };
}

export function buildHanoiDetailedSaleCycle(rows: HanoiDetailedSaleCycleMetricInput[]): HanoiDetailedSaleCycleSummary {
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  const orderedRows = detailedSaleCycleDefinitions.map((definition) => ({
    ...definition,
    cases: 0,
    averageHours: 0,
    medianHours: 0,
    previousAverageHours: 0,
    ...rowsByKey.get(definition.key),
  }));

  return {
    totalMilestones: orderedRows.reduce((sum, row) => sum + row.cases, 0),
    metrics: orderedRows.map((row) => {
      const averageHours = toOneDecimal(row.averageHours);
      const previousAverageHours = toOneDecimal(row.previousAverageHours);

      return {
        ...row,
        averageHours,
        medianHours: toOneDecimal(row.medianHours),
        previousAverageHours,
        averageDeltaHours: toOneDecimal(averageHours - previousAverageHours),
      };
    }),
  };
}

export function formatHanoiCycleDuration(hours: number) {
  if (!Number.isFinite(hours) || hours === 0) return "0h";
  const sign = hours < 0 ? "-" : "";
  const absoluteHours = Math.abs(hours);
  if (absoluteHours < 24) return `${sign}${toOneDecimal(absoluteHours)}h`;
  return `${sign}${toOneDecimal(absoluteHours / 24)}d`;
}

export function buildHanoiWorkStageChart(summary: {
  total: number;
  stages: Array<{ key: string; label: string; shortLabel: string; count: number }>;
}): HanoiWorkStageChart {
  const stages = summary.stages.map((stage) => {
    const totalCount = Number(stage.count ?? 0);
    const workableCount = WORKABLE_STAGE_KEYS.has(stage.key) ? totalCount : 0;
    return {
      key: stage.key,
      label: stage.label,
      shortLabel: stage.shortLabel,
      totalCount,
      workableCount,
      percentOfTotal: summary.total > 0 ? (totalCount / summary.total) * 100 : 0,
      percentOfWorkable: 0,
    };
  });
  const workableLeads = stages.reduce((sum, stage) => sum + stage.workableCount, 0);

  return {
    totalLeads: Number(summary.total ?? 0),
    workableLeads,
    stages: stages.map((stage) => ({
      ...stage,
      percentOfWorkable: workableLeads > 0 ? (stage.workableCount / workableLeads) * 100 : 0,
    })),
  };
}

export function buildHanoiWorkableGapChart(
  summary: HanoiWorkableGapChart | null | undefined,
): HanoiWorkableGapChart {
  const sourceBuckets = new Map((summary?.buckets ?? []).map((bucket) => [bucket.key, bucket]));

  return {
    total: Number(summary?.total ?? 0),
    buckets: GAP_BUCKETS.map((bucket) => {
      const source = sourceBuckets.get(bucket.key);
      return {
        key: bucket.key,
        label: source?.label ?? bucket.label,
        count: Number(source?.count ?? 0),
        percent: Number(source?.percent ?? 0),
      };
    }),
  };
}

export function buildHanoiSummaryCharts(input: {
  stageSummary: SaleLeadStageSummary | null | undefined;
  workableGapSummary: SaleLeadWorkableGapSummary | null | undefined;
}) {
  if (!input.stageSummary || !input.workableGapSummary) return null;

  return {
    stageChart: buildHanoiWorkStageChart(input.stageSummary),
    gapChart: buildHanoiWorkableGapChart(input.workableGapSummary),
  };
}

export function buildHanoiDailyLeadCharts(input: {
  from: string;
  to: string;
  leadRows: HanoiDailyLeadQualityInput[];
  winRows: HanoiDailyWinInput[];
}) {
  const days = dateRange(input.from, input.to);
  const leadByDay = new Map<string, HanoiDailyLeadQualityPoint>();
  const winByDay = new Map(input.winRows.map((row) => [row.day, Number(row.count ?? 0)]));

  for (const day of days) {
    leadByDay.set(day, {
      day,
      total: 0,
      strongQualified: 0,
      weakQualified: 0,
      nonQualified: 0,
      undefinedQualified: 0,
    });
  }

  for (const row of input.leadRows) {
    const point = leadByDay.get(row.day);
    if (!point) continue;

    point.total += 1;
    if (row.hasImages) {
      point.strongQualified += 1;
      continue;
    }
    if (row.workStage === "need_images") {
      point.weakQualified += 1;
      continue;
    }

    const qualified = String(row.qualified ?? "UNDEFINED_QUALIFIED").trim().toUpperCase();
    if (qualified === "NON_QUALIFIED" || qualified === "TEST") {
      point.nonQualified += 1;
    } else {
      point.undefinedQualified += 1;
    }
  }

  return {
    leadQualityByDay: days.map((day) => leadByDay.get(day)!),
    winCasesByDay: days.map((day) => ({ day, count: winByDay.get(day) ?? 0 })),
  };
}

export function buildHanoiDailyLeadIntakeChart(input: {
  from: string;
  to: string;
  rows: HanoiDailyLeadIntakeInput[];
}): HanoiDailyLeadIntakePoint[] {
  const days = dateRange(input.from, input.to);
  const leadsByDay = new Map(days.map((day) => [day, new Set<string>()]));

  for (const row of input.rows) {
    const dayLeads = leadsByDay.get(row.day);
    if (!dayLeads || !row.leadId) continue;
    dayLeads.add(row.leadId);
  }

  return days.map((day) => ({ day, count: leadsByDay.get(day)?.size ?? 0 }));
}

export function buildHanoiDailyHumanMessageMixChart(input: {
  from: string;
  to: string;
  rows: HanoiDailyHumanMessageInput[];
}): HanoiDailyHumanMessageMixPoint[] {
  const days = dateRange(input.from, input.to);
  const leadKindByDay = new Map<string, Map<string, "new" | "existing">>(
    days.map((day) => [day, new Map<string, "new" | "existing">()]),
  );

  for (const row of input.rows) {
    const dayLeads = leadKindByDay.get(row.messageDay);
    if (!dayLeads || !row.leadId) continue;
    const kind = row.leadCreatedDay === row.messageDay ? "new" : "existing";
    const currentKind = dayLeads.get(row.leadId);
    if (currentKind === "new") continue;
    dayLeads.set(row.leadId, kind);
  }

  return days.map((day) => {
    const dayLeads = leadKindByDay.get(day) ?? new Map<string, "new" | "existing">();
    let newLeadCount = 0;
    let existingLeadCount = 0;
    for (const kind of dayLeads.values()) {
      if (kind === "new") newLeadCount += 1;
      else existingLeadCount += 1;
    }
    return {
      day,
      newLeadCount,
      existingLeadCount,
      total: newLeadCount + existingLeadCount,
    };
  });
}

export function buildHanoiDailyZaloCallChart(input: {
  from: string;
  to: string;
  rows: HanoiDailyZaloCallInput[];
}): HanoiDailyZaloCallPoint[] {
  const days = dateRange(input.from, input.to);
  const minutesByDay = new Map(days.map((day) => [day, 0]));
  const leadsByDay = new Map(days.map((day) => [day, new Set<string>()]));

  for (const row of input.rows) {
    if (!minutesByDay.has(row.day) || !row.leadId || row.minutes <= 0) continue;
    minutesByDay.set(row.day, (minutesByDay.get(row.day) ?? 0) + row.minutes);
    leadsByDay.get(row.day)?.add(row.leadId);
  }

  return days.map((day) => ({
    day,
    totalMinutes: toOneDecimal(minutesByDay.get(day) ?? 0),
    uniqueLeadCount: leadsByDay.get(day)?.size ?? 0,
  }));
}

export function buildHanoiWorkablePieSlices(chart: HanoiWorkableGapChart): HanoiWorkablePieSlice[] {
  let cursor = 0;

  return chart.buckets.map((bucket) => {
    const slicePercent = chart.total > 0 ? Number(((bucket.count / chart.total) * 100).toFixed(2)) : 0;
    const startPercent = cursor;
    const endPercent = Number((cursor + slicePercent).toFixed(2));
    cursor = endPercent;

    return {
      ...bucket,
      percent: slicePercent,
      color: WORKABLE_GAP_COLORS[bucket.key] ?? "#94a3b8",
      startPercent,
      endPercent,
    };
  });
}

export function buildHanoiWorkablePieGradient(slices: HanoiWorkablePieSlice[]): string {
  const visibleSlices = slices.filter((slice) => slice.count > 0 && slice.endPercent > slice.startPercent);

  if (visibleSlices.length === 0) {
    return "conic-gradient(#e2e8f0 0% 100%)";
  }

  return `conic-gradient(${visibleSlices
    .map((slice) => `${slice.color} ${slice.startPercent}% ${slice.endPercent}%`)
    .join(", ")})`;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function saleSortValue(row: HanoiSaleRow, key: HanoiSaleSortKey): string | number {
  switch (key) {
    case "displayName":
      return row.displayName;
    case "imageRate":
      return ratio(row.leadsWithImages, row.totalLeads);
    case "inspectionRate":
      return ratio(row.inspectionBookings, row.totalLeads);
    case "conversionRate":
      return ratio(row.wins, row.totalLeads);
    default:
      return row[key];
  }
}

export function sortHanoiSaleRows(
  rows: HanoiSaleRow[],
  sort: { key: HanoiSaleSortKey; direction: HanoiSortDirection },
): HanoiSaleRow[] {
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const leftValue = saleSortValue(left, sort.key);
    const rightValue = saleSortValue(right, sort.key);

    if (typeof leftValue === "string" && typeof rightValue === "string") {
      return leftValue.localeCompare(rightValue, "vi") * direction;
    }

    if (leftValue === rightValue) {
      return left.displayName.localeCompare(right.displayName, "vi");
    }

    return ((leftValue as number) - (rightValue as number)) * direction;
  });
}

export function buildHanoiFailureReasonFunnels(
  rows: HanoiFailureReasonInput[],
  topN = 8,
): HanoiFailureReasonFunnel[] {
  return failureReasonGroups.map((group) => {
    const groupedReasons = new Map<string, number>();

    rows
      .filter((row) => row.groupKey === group.key)
      .forEach((row) => {
        const reason = normalizeReason(row.reason);
        groupedReasons.set(reason, (groupedReasons.get(reason) ?? 0) + row.count);
      });

    const sortedReasons = Array.from(groupedReasons, ([reason, count]) => ({ reason, count })).sort(
      (left, right) => right.count - left.count || left.reason.localeCompare(right.reason, "vi"),
    );
    const visibleLimit = Math.max(1, topN);
    const visibleReasons =
      sortedReasons.length > visibleLimit ? sortedReasons.slice(0, visibleLimit - 1) : sortedReasons;
    const otherCount =
      sortedReasons.length > visibleLimit
        ? sortedReasons.slice(visibleLimit - 1).reduce((sum, item) => sum + item.count, 0)
        : 0;
    const reasons =
      otherCount > 0 ? [...visibleReasons, { reason: "Khác", count: otherCount }] : visibleReasons;
    const total = reasons.reduce((sum, item) => sum + item.count, 0);

    return {
      ...group,
      total,
      reasons: reasons.map((item) => ({
        ...item,
        percentOfGroup: total > 0 ? Number(((item.count / total) * 100).toFixed(2)) : 0,
      })),
    };
  });
}

export function buildHanoiDelayReasonChart(rows: HanoiDelayReasonInput[], topN = 8): HanoiDelayReasonChart {
  const groupedReasons = new Map<string, number>();

  rows.forEach((row) => {
    const reason = normalizeReason(row.reason);
    groupedReasons.set(reason, (groupedReasons.get(reason) ?? 0) + row.count);
  });

  const sortedReasons = Array.from(groupedReasons, ([reason, count]) => ({ reason, count })).sort(
    (left, right) => right.count - left.count || left.reason.localeCompare(right.reason, "vi"),
  );
  const visibleLimit = Math.max(1, topN);
  const visibleReasons =
    sortedReasons.length > visibleLimit ? sortedReasons.slice(0, visibleLimit - 1) : sortedReasons;
  const otherCount =
    sortedReasons.length > visibleLimit
      ? sortedReasons.slice(visibleLimit - 1).reduce((sum, item) => sum + item.count, 0)
      : 0;
  const reasons =
    otherCount > 0 ? [...visibleReasons, { reason: "Khác", count: otherCount }] : visibleReasons;
  const total = reasons.reduce((sum, item) => sum + item.count, 0);

  return {
    total,
    reasons: reasons.map((item) => ({
      ...item,
      percentOfTotal: total > 0 ? Number(((item.count / total) * 100).toFixed(2)) : 0,
    })),
  };
}

export function buildHanoiTotalFunnel(counts: {
  totalLeads: number;
  contactedLeads: number;
  leadsWithImages: number;
  inspectionBookings: number;
  carviewBookings: number;
  wins: number;
  failedLeads: number;
}): HanoiFunnelStage[] {
  return buildHanoiFunnelStages([
    { key: "total", label: "total", count: counts.totalLeads },
    { key: "contacted", label: "da_lien_he", count: counts.contactedLeads },
    { key: "image", label: "co_anh", count: counts.leadsWithImages },
    { key: "inspection", label: "kiem_dinh", count: counts.inspectionBookings },
    { key: "carview", label: "carview", count: counts.carviewBookings },
    { key: "win", label: "win", count: counts.wins },
    { key: "failed", label: "failed", count: counts.failedLeads },
  ]);
}

export function buildHanoiTargetFunnel(counts: {
  targetLeads: number;
  targetLeadsWithImages: number;
  targetInspectionBookings: number;
}): HanoiFunnelStage[] {
  return buildHanoiFunnelStages([
    { key: "target", label: "total_target", count: counts.targetLeads },
    { key: "target_image", label: "co_anh_target", count: counts.targetLeadsWithImages },
    { key: "target_inspection", label: "kiem_dinh_target", count: counts.targetInspectionBookings },
  ]);
}
