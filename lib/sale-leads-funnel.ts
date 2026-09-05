export type SaleLeadWorkStage =
  | "failed"
  | "delayed"
  | "no_zalo"
  | "need_contact"
  | "need_images"
  | "need_price_source"
  | "need_quote"
  | "need_inspection_booking"
  | "need_post_inspection_quote"
  | "follow_up_after_quote";

export type SaleLeadGapBucket = "lt5" | "5_10" | "gt10" | "no_price";

export interface SaleLeadFilterableRow {
  workStage: SaleLeadWorkStage;
  gapBucket: SaleLeadGapBucket;
  hasImages: boolean;
  inspected: boolean;
  noHumanTouch: boolean;
  underTwoBids: boolean;
}

export interface SaleLeadListFilters {
  stages?: SaleLeadWorkStage[];
  gaps?: SaleLeadGapBucket[];
  hasImages?: boolean;
  inspected?: boolean;
  noHumanTouch?: boolean;
  underTwoBids?: boolean;
}

export interface SaleLeadFilterCounts {
  total: number;
  stages: Record<SaleLeadWorkStage, number>;
  gaps: Record<SaleLeadGapBucket, number>;
  hasImages: number;
  inspected: number;
  noHumanTouch: number;
  underTwoBids: number;
}

export interface SaleLeadFilterFacets {
  total: number;
  stages: Record<SaleLeadWorkStage, number>;
  gaps: Record<SaleLeadGapBucket, number>;
  status: {
    hasImages: number;
    inspected: number;
    noHumanTouch: number;
    underTwoBids: number;
  };
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
  intention?: string | null;
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
  saleCompletedCallTs?: string[] | null;
}

export interface DealerBidLike {
  price?: number | string | null;
  version?: number | string | null;
  created_at?: string | null;
  dealer_id?: string | null;
  dealerId?: string | null;
  dealer_name?: string | null;
  dealerName?: string | null;
  is_interested?: boolean | null;
}

export interface SaleLeadStageConfig {
  key: SaleLeadWorkStage;
  label: string;
  shortLabel: string;
  description: string;
}

export interface SaleLeadStageTone {
  badgeClass: string;
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
    key: "delayed",
    label: "Hoãn bán",
    shortLabel: "Hoãn",
    description: "Lead có intention DELAY và chưa bị FAILED.",
  },
  {
    key: "failed",
    label: "Thất bại",
    shortLabel: "Thất bại",
    description: "Lead có CRM stage FAILED.",
  },
  {
    key: "no_zalo",
    label: "Không có Zalo chat",
    shortLabel: "No Zalo",
    description: "Không map được phone sang hội thoại Zalo.",
  },
];

const GAP_BUCKETS: SaleLeadGapBucket[] = ["lt5", "5_10", "gt10", "no_price"];

const SALE_LEAD_STAGE_TONES: Record<SaleLeadWorkStage, SaleLeadStageTone> = {
  need_contact: { badgeClass: "border-sky-200 bg-sky-50 text-sky-700" },
  need_images: { badgeClass: "border-violet-200 bg-violet-50 text-violet-700" },
  need_price_source: { badgeClass: "border-yellow-200 bg-yellow-50 text-yellow-800" },
  need_quote: { badgeClass: "border-orange-200 bg-orange-50 text-orange-700" },
  need_inspection_booking: { badgeClass: "border-teal-200 bg-teal-50 text-teal-700" },
  need_post_inspection_quote: { badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  follow_up_after_quote: { badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  delayed: { badgeClass: "border-amber-200 bg-amber-50 text-amber-700" },
  failed: { badgeClass: "border-rose-200 bg-rose-50 text-rose-700" },
  no_zalo: { badgeClass: "border-slate-200 bg-slate-50 text-slate-600" },
};

export function getSaleLeadStageTone(stage: SaleLeadWorkStage): SaleLeadStageTone {
  return SALE_LEAD_STAGE_TONES[stage];
}

const TERMINAL_CRM_STAGES = new Set(["COMPLETED", "DEPOSIT_PAID"]);
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

  for (const ts of input.saleCompletedCallTs ?? []) {
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
    (input.priceVucarOffered !== null && input.priceVucarOffered !== undefined) ||
    input.agentPricingEvents?.vo_fired === true
  );
}

function latestAt(items: Array<{ created_at: string | null }>) {
  return items.reduce<string | null>((latest, row) => {
    if (!row.created_at) return latest;
    return !latest || new Date(row.created_at).getTime() > new Date(latest).getTime() ? row.created_at : latest;
  }, null);
}

function firstAtForHighestPrice(items: Array<{ price: number; created_at: string | null }>) {
  const highest = items.reduce<number | null>((best, row) => (best === null || row.price > best ? row.price : best), null);
  if (highest === null) return null;
  return items
    .filter((row) => row.price === highest)
    .reduce<string | null>((first, row) => {
      if (!row.created_at) return first;
      return !first || new Date(row.created_at).getTime() < new Date(first).getTime() ? row.created_at : first;
    }, null);
}

export function summarizeDealerBids(rows: DealerBidLike[] | undefined) {
  const validRows = (rows ?? [])
    .map((row) => ({
      ...row,
      price: Number(row.price ?? 0),
      version: Number(row.version ?? 1),
      created_at: row.created_at ? String(row.created_at) : null,
      dealer_id: row.dealer_id || row.dealerId || row.dealer_name || row.dealerName || "unknown",
      dealer_name: row.dealer_name || row.dealerName || "Unknown Dealer",
    }))
    .filter((row) => row.price > 1_000_000 && row.is_interested !== false);

  const pre = validRows.filter((row) => row.version <= 1);
  const post = validRows.filter((row) => row.version >= 2);
  const highest = validRows.reduce<any | null>((best, row) => (!best || row.price > best.price ? row : best), null);

  return {
    highestBid: highest?.price ?? null,
    highestDealerName: highest?.dealer_name ?? null,
    validDealerBidDealerCount: new Set(validRows.map((row) => row.dealer_id)).size,
    preInspectionBidCount: pre.length,
    postInspectionBidCount: post.length,
    latestPreInspectionBidAt: firstAtForHighestPrice(pre) ?? latestAt(pre),
    latestPostInspectionBidAt: firstAtForHighestPrice(post) ?? latestAt(post),
  };
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
  const intention = String(input.intention ?? "").toUpperCase();
  if (crmStage === "FAILED") return "failed";
  if (TERMINAL_CRM_STAGES.has(crmStage)) return null;
  if (intention === "DELAY") return "delayed";

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
    const humanTouchOk = filters.noHumanTouch === undefined || row.noHumanTouch === filters.noHumanTouch;
    const underTwoBidsOk = filters.underTwoBids === undefined || row.underTwoBids === filters.underTwoBids;
    return stageOk && gapOk && imageOk && inspectedOk && humanTouchOk && underTwoBidsOk;
  });
}

export function getSaleLeadFilterCounts(rows: SaleLeadFilterableRow[]): SaleLeadFilterCounts {
  const stages = Object.fromEntries(SALE_LEAD_STAGE_CONFIG.map((stage) => [stage.key, 0])) as Record<SaleLeadWorkStage, number>;
  const gaps = Object.fromEntries(GAP_BUCKETS.map((gap) => [gap, 0])) as Record<SaleLeadGapBucket, number>;

  let hasImages = 0;
  let inspected = 0;
  let noHumanTouch = 0;
  let underTwoBids = 0;
  for (const row of rows) {
    stages[row.workStage] = (stages[row.workStage] ?? 0) + 1;
    gaps[row.gapBucket] = (gaps[row.gapBucket] ?? 0) + 1;
    if (row.hasImages) hasImages += 1;
    if (row.inspected) inspected += 1;
    if (row.noHumanTouch) noHumanTouch += 1;
    if (row.underTwoBids) underTwoBids += 1;
  }

  return {
    total: rows.length,
    stages,
    gaps,
    hasImages,
    inspected,
    noHumanTouch,
    underTwoBids,
  };
}

export function getSaleLeadFilterFacets(rows: SaleLeadFilterableRow[], filters: SaleLeadListFilters): SaleLeadFilterFacets {
  const total = filterSaleLeadRows(rows, filters).length;
  const stageRows = filterSaleLeadRows(rows, {
    gaps: filters.gaps,
    hasImages: filters.hasImages,
    inspected: filters.inspected,
    noHumanTouch: filters.noHumanTouch,
    underTwoBids: filters.underTwoBids,
  });
  const gapRows = filterSaleLeadRows(rows, {
    stages: filters.stages,
    hasImages: filters.hasImages,
    inspected: filters.inspected,
    noHumanTouch: filters.noHumanTouch,
    underTwoBids: filters.underTwoBids,
  });
  const statusRows = filterSaleLeadRows(rows, {
    stages: filters.stages,
    gaps: filters.gaps,
  });

  const stageCounts = getSaleLeadFilterCounts(stageRows).stages;
  const gapCounts = getSaleLeadFilterCounts(gapRows).gaps;
  const statusCounts = getSaleLeadFilterCounts(statusRows);

  return {
    total,
    stages: stageCounts,
    gaps: gapCounts,
    status: {
      hasImages: statusCounts.hasImages,
      inspected: statusCounts.inspected,
      noHumanTouch: statusCounts.noHumanTouch,
      underTwoBids: statusCounts.underTwoBids,
    },
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
