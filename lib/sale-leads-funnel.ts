export type SaleLeadWorkStage =
  | "no_zalo"
  | "need_contact"
  | "need_images"
  | "need_price_source"
  | "need_quote"
  | "need_inspection_booking"
  | "need_post_inspection_quote"
  | "follow_up_after_quote";

export type SaleLeadGapBucket = "lt5" | "5_10" | "gt10" | "no_price" | "closed";

export interface SaleLeadFilterableRow {
  workStage: SaleLeadWorkStage;
  gapBucket: SaleLeadGapBucket;
  hasImages: boolean;
  inspected: boolean;
}

export interface SaleLeadListFilters {
  stages?: SaleLeadWorkStage[];
  gaps?: SaleLeadGapBucket[];
  hasImages?: boolean;
  inspected?: boolean;
}

export interface SaleLeadFilterCounts {
  total: number;
  stages: Record<SaleLeadWorkStage, number>;
  gaps: Record<SaleLeadGapBucket, number>;
  hasImages: number;
  inspected: number;
}

export interface AgentPricingEvent {
  type?: string | null;
  at?: string | null;
}

export interface AgentPricingEvents {
  vo_at?: string | null;
  vo_fired?: boolean | null;
  events?: AgentPricingEvent[] | null;
}

export interface SaleLeadClassifierInput {
  crmStage?: string | null;
  hasZaloChat: boolean;
  customerMessageCount: number;
  hasEnoughImages: boolean;
  inInspectionRegion: boolean;
  hasInspectionBooking: boolean;
  isInspected: boolean;
  highestBid?: number | null;
  preInspectionBidCount: number;
  postInspectionBidCount: number;
  latestPreInspectionBidAt?: string | null;
  latestPostInspectionBidAt?: string | null;
  quoteTs?: string[] | null;
  priceVucarOfferedAt?: string | null;
  priceVucarOffered?: number | null;
  agentPricingEvents?: AgentPricingEvents | null;
}

export interface SaleLeadStageConfig {
  key: SaleLeadWorkStage;
  label: string;
  shortLabel: string;
  description: string;
}

export const SALE_LEAD_STAGE_CONFIG: SaleLeadStageConfig[] = [
  {
    key: "need_contact",
    label: "Cần liên hệ",
    shortLabel: "Liên hệ",
    description: "Có Zalo nhưng khách chưa đồng ý kết bạn hoặc chưa nhắn lại.",
  },
  {
    key: "need_images",
    label: "Cần xin ảnh",
    shortLabel: "Xin ảnh",
    description: "Khách đã phản hồi nhưng thiếu ảnh xe hoặc giấy tờ xe.",
  },
  {
    key: "need_price_source",
    label: "Cần chào giá",
    shortLabel: "Chào giá",
    description: "Đã có ảnh nhưng chưa có bid dealer hoặc chưa có giá đáng nói với khách.",
  },
  {
    key: "need_quote",
    label: "Cần trả giá",
    shortLabel: "Trả giá",
    description: "Đã có bid trước kiểm định nhưng chưa báo giá cho khách sau bid đó.",
  },
  {
    key: "need_inspection_booking",
    label: "Cần đặt lịch kiểm định",
    shortLabel: "Đặt KĐ",
    description: "Đã báo giá, xe trong vùng kiểm định nhưng chưa có lịch.",
  },
  {
    key: "need_post_inspection_quote",
    label: "Cần trả giá sau kiểm định",
    shortLabel: "Giá sau KĐ",
    description: "Đã kiểm định và có bid sau kiểm định nhưng chưa báo giá sau bid đó.",
  },
  {
    key: "follow_up_after_quote",
    label: "Follow up sau trả giá",
    shortLabel: "Follow up",
    description: "Đã báo giá nhưng chưa đặt cọc, win hay thất bại.",
  },
  {
    key: "no_zalo",
    label: "Không có Zalo chat",
    shortLabel: "No Zalo",
    description: "Không map được phone sang hội thoại Zalo.",
  },
];

const GAP_BUCKETS: SaleLeadGapBucket[] = ["lt5", "5_10", "gt10", "no_price", "closed"];

const TERMINAL_CRM_STAGES = new Set(["COMPLETED", "DEPOSIT_PAID", "FAILED"]);
const OFFER_EVENT_TYPES = new Set(["T_AGENT_FIRST_VUCAR_OFFER", "T_AGENT_VUCAR_OFFER_SUBSEQUENT"]);

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function addTimestamp(timestamps: string[], seen: Set<string>, value: string | null | undefined) {
  if (!value || seen.has(value) || parseTimestamp(value) === null) return;
  seen.add(value);
  timestamps.push(value);
}

export function getQuoteTimestamps(input: SaleLeadClassifierInput): string[] {
  const timestamps: string[] = [];
  const seen = new Set<string>();

  for (const ts of input.quoteTs ?? []) {
    addTimestamp(timestamps, seen, ts);
  }

  addTimestamp(timestamps, seen, input.priceVucarOfferedAt);
  addTimestamp(timestamps, seen, input.agentPricingEvents?.vo_at ?? null);

  for (const event of input.agentPricingEvents?.events ?? []) {
    const type = String(event.type ?? "").toUpperCase();
    if (OFFER_EVENT_TYPES.has(type)) {
      addTimestamp(timestamps, seen, event.at ?? null);
    }
  }

  return timestamps.sort((a, b) => (parseTimestamp(a) ?? 0) - (parseTimestamp(b) ?? 0));
}

export function hasQuoted(input: SaleLeadClassifierInput): boolean {
  return (
    getQuoteTimestamps(input).length > 0 ||
    input.priceVucarOffered !== null && input.priceVucarOffered !== undefined ||
    input.agentPricingEvents?.vo_fired === true
  );
}

export function hasQuotedAfter(quoteTimestamps: string[], anchorTimestamp: string | null | undefined): boolean {
  const anchor = parseTimestamp(anchorTimestamp);
  if (anchor === null) return quoteTimestamps.length > 0;
  return quoteTimestamps.some((ts) => {
    const quoteTime = parseTimestamp(ts);
    return quoteTime !== null && quoteTime >= anchor;
  });
}

export function classifySaleLeadStage(input: SaleLeadClassifierInput): SaleLeadWorkStage | null {
  const crmStage = String(input.crmStage ?? "").toUpperCase();
  if (TERMINAL_CRM_STAGES.has(crmStage)) return null;

  if (!input.hasZaloChat) return "no_zalo";
  if (input.customerMessageCount <= 0) return "need_contact";
  if (!input.hasEnoughImages) return "need_images";

  const quoteTimestamps = getQuoteTimestamps(input);
  const hasAnyQuote = hasQuoted(input);
  const hasUsableBid = Number(input.highestBid ?? 0) > 1_000_000;

  if (input.isInspected && input.postInspectionBidCount > 0) {
    return hasQuotedAfter(quoteTimestamps, input.latestPostInspectionBidAt)
      ? "follow_up_after_quote"
      : "need_post_inspection_quote";
  }

  if (!hasUsableBid || input.preInspectionBidCount <= 0) return "need_price_source";

  if (!hasQuotedAfter(quoteTimestamps, input.latestPreInspectionBidAt)) return "need_quote";

  if (input.inInspectionRegion && !input.hasInspectionBooking && !input.isInspected) {
    return "need_inspection_booking";
  }

  return hasAnyQuote ? "follow_up_after_quote" : "need_quote";
}

export function calculateGapPercent(priceCustomer: number | null | undefined, highestBid: number | null | undefined): number | null {
  const customer = Number(priceCustomer ?? 0);
  const bid = Number(highestBid ?? 0);
  if (!Number.isFinite(customer) || !Number.isFinite(bid) || customer <= 0 || bid <= 0) return null;
  if (bid >= customer) return 0;
  return Number((((customer - bid) / customer) * 100).toFixed(2));
}

export function getGapBucket(priceCustomer: number | null | undefined, highestBid: number | null | undefined): SaleLeadGapBucket {
  const gapPercent = calculateGapPercent(priceCustomer, highestBid);
  if (gapPercent === null) return "no_price";
  if (gapPercent <= 0) return "closed";
  if (gapPercent < 5) return "lt5";
  if (gapPercent <= 10) return "5_10";
  return "gt10";
}

export function filterSaleLeadRows<T extends SaleLeadFilterableRow>(rows: T[], filters: SaleLeadListFilters): T[] {
  return rows.filter((row) => {
    const stageOk = !filters.stages?.length || filters.stages.includes(row.workStage);
    const gapOk = !filters.gaps?.length || filters.gaps.includes(row.gapBucket);
    const imageOk = filters.hasImages === undefined || row.hasImages === filters.hasImages;
    const inspectedOk = filters.inspected === undefined || row.inspected === filters.inspected;
    return stageOk && gapOk && imageOk && inspectedOk;
  });
}

export function getSaleLeadFilterCounts(rows: SaleLeadFilterableRow[]): SaleLeadFilterCounts {
  const stages = Object.fromEntries(SALE_LEAD_STAGE_CONFIG.map((stage) => [stage.key, 0])) as Record<SaleLeadWorkStage, number>;
  const gaps = Object.fromEntries(GAP_BUCKETS.map((gap) => [gap, 0])) as Record<SaleLeadGapBucket, number>;

  let hasImages = 0;
  let inspected = 0;
  for (const row of rows) {
    stages[row.workStage] = (stages[row.workStage] ?? 0) + 1;
    gaps[row.gapBucket] = (gaps[row.gapBucket] ?? 0) + 1;
    if (row.hasImages) hasImages += 1;
    if (row.inspected) inspected += 1;
  }

  return {
    total: rows.length,
    stages,
    gaps,
    hasImages,
    inspected,
  };
}

export function isInInspectionRegion(location: string | null | undefined): boolean {
  const value = String(location ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!value) return false;

  return (
    value.includes("tp.hcm") ||
    value.includes("ho chi minh") ||
    value.includes("hcm") ||
    value.includes("long an") ||
    value.includes("longan") ||
    value.includes("binh duong") ||
    value.includes("binhduong") ||
    value.includes("dong nai") ||
    value.includes("dongnai") ||
    value.includes("ha noi") ||
    value.includes("hanoi")
  );
}

export function formatMillionShort(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `${Math.round(amount / 1_000_000).toLocaleString("vi-VN")}M`;
}
