import type { SaleLeadGapBucket, SaleLeadWorkStage } from "@/lib/sale-leads-funnel";

export type SaleDailyTaskType =
  | "follow_up_low_gap_quote"
  | "price_under_two_bids"
  | "quote_two_plus_bids"
  | "post_inspection_quote";

export type SaleDailyTaskStatus = "overdue" | "due_today" | "todo" | "completed_signal";
export type SaleDailyTaskPriority = "P0" | "P1" | "P2" | "P3";

export interface SaleDailyTaskLead {
  leadId: string;
  carId: string;
  leadName: string;
  phone: string | null;
  picId: string | null;
  picName: string;
  carName: string;
  location: string | null;
  createdAt: string;
  workStage: SaleLeadWorkStage;
  gapBucket: SaleLeadGapBucket;
  gapPercent: number | null;
  gapAmount: number | null;
  priceCustomer: number | null;
  highestBid: number | null;
  highestDealerName: string | null;
  hasImages: boolean;
  inspected: boolean;
  booked: boolean;
  underTwoBids: boolean;
  hotLead: boolean;
  dealerBidDealerCount: number;
  lastTouchAt: string | null;
  lastSaleAt?: string | null;
  lastCustomerAt?: string | null;
  latestPreInspectionBidAt?: string | null;
  latestPostInspectionBidAt?: string | null;
  quoteTimestamps: string[];
  priceCustomerLabel: string;
  highestBidLabel: string;
  gapLabel: string;
}

export interface SaleDailyTask {
  id: string;
  type: SaleDailyTaskType;
  typeLabel: string;
  actionLabel: string;
  priority: SaleDailyTaskPriority;
  status: SaleDailyTaskStatus;
  statusLabel: string;
  dueAt: string | null;
  slaLabel: string;
  reason: string;
  lead: SaleDailyTaskLead;
}

export interface SaleDailyTaskOptions {
  now?: string | Date;
  businessDate?: string;
}

export interface SaleDailyTaskSummary {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  completedSignal: number;
  byType: Record<SaleDailyTaskType, number>;
}

const MS_PER_HOUR = 3_600_000;
const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";
const TASK_TYPE_ORDER: SaleDailyTaskType[] = [
  "follow_up_low_gap_quote",
  "price_under_two_bids",
  "quote_two_plus_bids",
  "post_inspection_quote",
];

const TASK_COPY: Record<SaleDailyTaskType, { label: string; action: string; fallbackPriority: SaleDailyTaskPriority }> = {
  follow_up_low_gap_quote: {
    label: "Follow up gap thấp",
    action: "Follow up khách",
    fallbackPriority: "P2",
  },
  price_under_two_bids: {
    label: "Chào giá <2 bid",
    action: "Lấy thêm giá",
    fallbackPriority: "P3",
  },
  quote_two_plus_bids: {
    label: "Trả giá ≥2 bid",
    action: "Báo giá khách",
    fallbackPriority: "P1",
  },
  post_inspection_quote: {
    label: "Trả giá sau KĐ",
    action: "Báo giá sau KĐ",
    fallbackPriority: "P1",
  },
};

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function businessDateOf(value: string | Date, timeZone = BUSINESS_TIME_ZONE) {
  const date = toDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function endOfBusinessDay(businessDate: string) {
  return toDate(`${businessDate}T18:00:00+07:00`);
}

function addHours(value: string | Date | null | undefined, hours: number) {
  const date = toDate(value);
  if (!date) return null;
  return new Date(date.getTime() + hours * MS_PER_HOUR);
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    const date = toDate(value);
    if (!date) return latest;
    const latestDate = toDate(latest);
    return !latestDate || date.getTime() > latestDate.getTime() ? date.toISOString() : latest;
  }, null);
}

function isSameBusinessDate(value: string | null | undefined, businessDate: string) {
  if (!value) return false;
  return businessDateOf(value) === businessDate;
}

function isAfter(value: string | null | undefined, anchor: string | null | undefined) {
  const valueDate = toDate(value);
  const anchorDate = toDate(anchor);
  if (!valueDate || !anchorDate) return false;
  return valueDate.getTime() >= anchorDate.getTime();
}

function statusFor(dueAt: Date | null, now: Date, businessDate: string, completed: boolean): SaleDailyTaskStatus {
  if (completed) return "completed_signal";
  if (dueAt && dueAt.getTime() < now.getTime()) return "overdue";
  if (dueAt && businessDateOf(dueAt) === businessDate) return "due_today";
  return "todo";
}

function labelForStatus(status: SaleDailyTaskStatus) {
  if (status === "overdue") return "Quá hạn";
  if (status === "completed_signal") return "Có tín hiệu";
  if (status === "due_today") return "Hôm nay";
  return "Sắp tới";
}

function priorityFor(type: SaleDailyTaskType, status: SaleDailyTaskStatus, hotLead: boolean): SaleDailyTaskPriority {
  if (status === "overdue") return "P0";
  if (hotLead && status !== "completed_signal") return "P1";
  return TASK_COPY[type].fallbackPriority;
}

function buildTask(args: {
  type: SaleDailyTaskType;
  lead: SaleDailyTaskLead;
  dueAt: Date | null;
  completed: boolean;
  reason: string;
  slaLabel: string;
  now: Date;
  businessDate: string;
}): SaleDailyTask {
  const status = statusFor(args.dueAt, args.now, args.businessDate, args.completed);
  const copy = TASK_COPY[args.type];
  return {
    id: `${args.type}:${args.lead.carId}`,
    type: args.type,
    typeLabel: copy.label,
    actionLabel: copy.action,
    priority: priorityFor(args.type, status, args.lead.hotLead),
    status,
    statusLabel: labelForStatus(status),
    dueAt: args.dueAt?.toISOString() ?? null,
    slaLabel: args.slaLabel,
    reason: args.reason,
    lead: args.lead,
  };
}

function taskForLead(lead: SaleDailyTaskLead, now: Date, businessDate: string): SaleDailyTask | null {
  if (lead.workStage === "failed" || lead.workStage === "delayed" || lead.workStage === "success" || lead.workStage === "no_zalo") {
    return null;
  }

  const latestQuoteAt = latestTimestamp(lead.quoteTimestamps);

  if (lead.workStage === "follow_up_after_quote" && lead.gapBucket === "lt5" && latestQuoteAt) {
    const completed = isSameBusinessDate(lead.lastSaleAt, businessDate) && isAfter(lead.lastSaleAt, latestQuoteAt);
    return buildTask({
      type: "follow_up_low_gap_quote",
      lead,
      dueAt: addHours(latestQuoteAt, lead.hotLead ? 4 : 8),
      completed,
      reason: `Đã báo giá, gap ${lead.gapLabel}; cần follow up để chốt thiện chí.`,
      slaLabel: lead.hotLead ? "Follow up trong 4 giờ" : "Follow up trong 8 giờ",
      now,
      businessDate,
    });
  }

  if (lead.hasImages && lead.underTwoBids && lead.dealerBidDealerCount < 2) {
    const anchor = lead.lastCustomerAt || lead.createdAt;
    const completed = isSameBusinessDate(lead.lastSaleAt, businessDate);
    return buildTask({
      type: "price_under_two_bids",
      lead,
      dueAt: addHours(anchor, lead.hotLead ? 12 : 24),
      completed,
      reason: `Đã có ảnh và mới có ${lead.dealerBidDealerCount} dealer bid; cần thúc thêm giá.`,
      slaLabel: lead.hotLead ? "Có phản hồi trong 12 giờ" : "Có phản hồi trong 24 giờ",
      now,
      businessDate,
    });
  }

  if (lead.workStage === "need_quote" && lead.dealerBidDealerCount >= 2) {
    const anchorDate = businessDateOf(lead.latestPreInspectionBidAt || lead.createdAt);
    const completed = isSameBusinessDate(latestQuoteAt, businessDate) && isAfter(latestQuoteAt, lead.latestPreInspectionBidAt || lead.createdAt);
    return buildTask({
      type: "quote_two_plus_bids",
      lead,
      dueAt: endOfBusinessDay(anchorDate),
      completed,
      reason: `Đã có ${lead.dealerBidDealerCount} dealer bid, cao nhất ${lead.highestBidLabel}; cần báo giá khách.`,
      slaLabel: "Báo giá trong ngày có đủ bid",
      now,
      businessDate,
    });
  }

  if (lead.workStage === "need_post_inspection_quote") {
    const anchorDate = businessDateOf(lead.latestPostInspectionBidAt || lead.createdAt);
    const completed = isSameBusinessDate(latestQuoteAt, businessDate) && isAfter(latestQuoteAt, lead.latestPostInspectionBidAt || lead.createdAt);
    return buildTask({
      type: "post_inspection_quote",
      lead,
      dueAt: endOfBusinessDay(anchorDate),
      completed,
      reason: `Xe đã kiểm định và có bid sau KĐ; cần báo lại giá sau KĐ cho khách.`,
      slaLabel: "Báo giá sau KĐ trong ngày",
      now,
      businessDate,
    });
  }

  return null;
}

export function buildSaleDailyTasks(leads: SaleDailyTaskLead[], options: SaleDailyTaskOptions = {}): SaleDailyTask[] {
  const now = toDate(options.now ?? new Date()) ?? new Date();
  const businessDate = options.businessDate || businessDateOf(now);
  return leads
    .map((lead) => taskForLead(lead, now, businessDate))
    .filter((task): task is SaleDailyTask => Boolean(task))
    .sort((a, b) => {
      const typeDiff = TASK_TYPE_ORDER.indexOf(a.type) - TASK_TYPE_ORDER.indexOf(b.type);
      if (typeDiff !== 0) return typeDiff;
      const statusOrder: Record<SaleDailyTaskStatus, number> = { overdue: 0, due_today: 1, todo: 2, completed_signal: 3 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      if (a.lead.hotLead !== b.lead.hotLead) return a.lead.hotLead ? -1 : 1;
      const aGap = a.lead.gapPercent ?? Number.POSITIVE_INFINITY;
      const bGap = b.lead.gapPercent ?? Number.POSITIVE_INFINITY;
      if (aGap !== bGap) return aGap - bGap;
      return (toDate(a.lead.lastTouchAt)?.getTime() ?? 0) - (toDate(b.lead.lastTouchAt)?.getTime() ?? 0);
    });
}

export function getSaleDailyTaskSummary(tasks: SaleDailyTask[]): SaleDailyTaskSummary {
  const byType = Object.fromEntries(TASK_TYPE_ORDER.map((type) => [type, 0])) as Record<SaleDailyTaskType, number>;
  let overdue = 0;
  let dueToday = 0;
  let completedSignal = 0;

  for (const task of tasks) {
    byType[task.type] += 1;
    if (task.status === "overdue") overdue += 1;
    if (task.status === "due_today") dueToday += 1;
    if (task.status === "completed_signal") completedSignal += 1;
  }

  return {
    total: tasks.length,
    open: tasks.length - completedSignal,
    overdue,
    dueToday,
    completedSignal,
    byType,
  };
}

export function getSaleDailyTaskTypeOrder() {
  return TASK_TYPE_ORDER;
}
