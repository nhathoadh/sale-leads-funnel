export type SaleLeadWorkStage =
  | "failed"
  | "delayed"
  | "success"
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
  hotLead: boolean;
}

export interface SaleLeadListFilters {
  stages?: SaleLeadWorkStage[];
  gaps?: SaleLeadGapBucket[];
  hasImages?: boolean;
  noImages?: boolean;
  inspected?: boolean;
  noHumanTouch?: boolean;
  underTwoBids?: boolean;
  hotLead?: boolean;
}

export interface SaleLeadFilterCounts {
  total: number;
  stages: Record<SaleLeadWorkStage, number>;
  gaps: Record<SaleLeadGapBucket, number>;
  hasImages: number;
  inspected: number;
  noHumanTouch: number;
  noImages: number;
  underTwoBids: number;
  hotLead: number;
}

export interface SaleLeadFilterFacets {
  total: number;
  stages: Record<SaleLeadWorkStage, number>;
  gaps: Record<SaleLeadGapBucket, number>;
  status: {
    hasImages: number;
    noImages: number;
    inspected: number;
    noHumanTouch: number;
    underTwoBids: number;
    hotLead: number;
  };
  groupTotals?: {
    status: number;
    stages: number;
    gaps: number;
  };
}

export type SaleLeadFilterGroup = "status" | "stage" | "gap";
export type SaleLeadStatusFilterKey = "hasImages" | "noImages" | "inspected" | "noHumanTouch" | "underTwoBids" | "hotLead";

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
  firstPaymentDate?: string | null;
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
  saleTextQuoteTs?: string[] | null;
}

export interface SaleLeadVehicleImageSources {
  additionalImages: unknown;
  customerZaloImageCount: number;
  summaryHadImage: boolean;
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
    description: "Khách đã phản hồi nhưng chưa có ảnh xe.",
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
    key: "success",
    label: "Thành công",
    shortLabel: "Thành công",
    description: "Lead đã đặt cọc hoặc hoàn tất và có ngày thanh toán đầu tiên.",
  },
  {
    key: "no_zalo",
    label: "Không có Zalo chat",
    shortLabel: "No Zalo",
    description: "Không map được phone sang hội thoại Zalo.",
  },
];

const GAP_BUCKETS: SaleLeadGapBucket[] = ["lt5", "5_10", "gt10", "no_price"];
const VEHICLE_IMAGE_BUCKETS = ["outside", "inside", "engine", "frame", "thumbnail"];

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
  success: { badgeClass: "border-lime-200 bg-lime-50 text-lime-700" },
  no_zalo: { badgeClass: "border-slate-200 bg-slate-50 text-slate-600" },
};

export function getSaleLeadStageTone(stage: SaleLeadWorkStage): SaleLeadStageTone {
  return SALE_LEAD_STAGE_TONES[stage];
}

function parseJsonValue(value: unknown): any {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function countStoredVehicleImages(additionalImages: unknown): number {
  const parsed = parseJsonValue(additionalImages) ?? {};
  let count = 0;
  for (const bucket of VEHICLE_IMAGE_BUCKETS) {
    const value = parsed[bucket];
    if (Array.isArray(value)) count += value.length;
  }
  return count;
}

export function hasVehicleImagesFromSources(sources: SaleLeadVehicleImageSources): boolean {
  return (
    countStoredVehicleImages(sources.additionalImages) > 0 ||
    Number(sources.customerZaloImageCount ?? 0) > 0 ||
    sources.summaryHadImage
  );
}

const TERMINAL_CRM_STAGES = new Set(["COMPLETED", "DEPOSIT_PAID"]);
const SUCCESS_CRM_STAGES = new Set(["COMPLETED", "DEPOSIT_PAID"]);
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

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const OUTBOUND_QUOTE_CONTEXT_RE =
  /(gia|khung gia|muc gia|tra quanh|dang tra|ben mua|khach mua|mua duoc|giao dich|ket noi khach|ban duoc gia|duoc gia|can doi khoang|khoang nay|tam)/;
const ABSOLUTE_CAR_PRICE_RE =
  /\b\d+\s*(?:ty|ti|t)\s*\d{0,3}\s*(?:tr|trieu)?\b|\b[5-9]\d{2,3}\s*(?:tr|trieu)\b/;

export function isSaleTextQuote(content: string | null | undefined) {
  if (!content) return false;
  const text = normalizeSearchText(content);
  return OUTBOUND_QUOTE_CONTEXT_RE.test(text) && ABSOLUTE_CAR_PRICE_RE.test(text);
}

export function extractSaleTextQuoteTimestamps(
  messages: Array<{ created_at?: string | Date | null; content?: string | null }> | null | undefined,
) {
  const timestamps: string[] = [];
  const seen = new Set<string>();

  for (const message of messages ?? []) {
    const rawTimestamp = message.created_at;
    const timestamp = rawTimestamp instanceof Date ? rawTimestamp.toISOString() : rawTimestamp ? String(rawTimestamp) : null;
    if (isSaleTextQuote(message.content)) addTimestamp(timestamps, seen, timestamp);
  }

  return timestamps.sort((a, b) => (parseTimestamp(a) ?? 0) - (parseTimestamp(b) ?? 0));
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

  for (const ts of input.saleTextQuoteTs ?? []) {
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
  if (SUCCESS_CRM_STAGES.has(crmStage) && input.firstPaymentDate) return "success";
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
    const noImageOk = filters.noImages === undefined || row.hasImages !== filters.noImages;
    const inspectedOk = filters.inspected === undefined || row.inspected === filters.inspected;
    const humanTouchOk = filters.noHumanTouch === undefined || row.noHumanTouch === filters.noHumanTouch;
    const underTwoBidsOk = filters.underTwoBids === undefined || row.underTwoBids === filters.underTwoBids;
    const hotLeadOk = filters.hotLead === undefined || row.hotLead === filters.hotLead;
    return stageOk && gapOk && imageOk && noImageOk && inspectedOk && humanTouchOk && underTwoBidsOk && hotLeadOk;
  });
}

export function getSaleLeadFilterCounts(rows: SaleLeadFilterableRow[]): SaleLeadFilterCounts {
  const stages = Object.fromEntries(SALE_LEAD_STAGE_CONFIG.map((stage) => [stage.key, 0])) as Record<SaleLeadWorkStage, number>;
  const gaps = Object.fromEntries(GAP_BUCKETS.map((gap) => [gap, 0])) as Record<SaleLeadGapBucket, number>;

  let hasImages = 0;
  let inspected = 0;
  let noHumanTouch = 0;
  let underTwoBids = 0;
  let hotLead = 0;
  for (const row of rows) {
    stages[row.workStage] = (stages[row.workStage] ?? 0) + 1;
    gaps[row.gapBucket] = (gaps[row.gapBucket] ?? 0) + 1;
    if (row.hasImages) hasImages += 1;
    if (row.inspected) inspected += 1;
    if (row.noHumanTouch) noHumanTouch += 1;
    if (row.underTwoBids) underTwoBids += 1;
    if (row.hotLead) hotLead += 1;
  }

  return {
    total: rows.length,
    stages,
    gaps,
    hasImages,
    noImages: rows.length - hasImages,
    inspected,
    noHumanTouch,
    underTwoBids,
    hotLead,
  };
}

export function getSaleLeadFilterFacets(rows: SaleLeadFilterableRow[], filters: SaleLeadListFilters): SaleLeadFilterFacets {
  const statusFilteredRows = filterSaleLeadRows(rows, {
    hasImages: filters.hasImages,
    noImages: filters.noImages,
    inspected: filters.inspected,
    noHumanTouch: filters.noHumanTouch,
    underTwoBids: filters.underTwoBids,
    hotLead: filters.hotLead,
  });
  const statusScopedCounts = getSaleLeadFilterCounts(statusFilteredRows);
  const allCounts = getSaleLeadFilterCounts(rows);

  return {
    total: statusFilteredRows.length,
    stages: statusScopedCounts.stages,
    gaps: statusScopedCounts.gaps,
    status: {
      hasImages: allCounts.hasImages,
      noImages: allCounts.noImages,
      inspected: allCounts.inspected,
      noHumanTouch: allCounts.noHumanTouch,
      underTwoBids: allCounts.underTwoBids,
      hotLead: allCounts.hotLead,
    },
    groupTotals: {
      status: rows.length,
      stages: statusFilteredRows.length,
      gaps: statusFilteredRows.length,
    },
  };
}

const STATUS_FILTER_KEYS: SaleLeadStatusFilterKey[] = [
  "hasImages",
  "noImages",
  "inspected",
  "noHumanTouch",
  "underTwoBids",
  "hotLead",
];

const STAGE_KEYS = SALE_LEAD_STAGE_CONFIG.map((stage) => stage.key);

function isStatusFilterKey(value: string): value is SaleLeadStatusFilterKey {
  return STATUS_FILTER_KEYS.includes(value as SaleLeadStatusFilterKey);
}

function isStageKey(value: string): value is SaleLeadWorkStage {
  return STAGE_KEYS.includes(value as SaleLeadWorkStage);
}

function isGapKey(value: string): value is SaleLeadGapBucket {
  return GAP_BUCKETS.includes(value as SaleLeadGapBucket);
}

function groupFromToken(token: string): SaleLeadFilterGroup | null {
  const [group] = token.split(":");
  if (group === "status" || group === "stage" || group === "gap") return group;
  return null;
}

function activeFilterTokens(filters: SaleLeadListFilters): string[] {
  const tokens: string[] = [];
  for (const key of STATUS_FILTER_KEYS) {
    if (filters[key] === true) tokens.push(`status:${key}`);
  }
  for (const stage of filters.stages ?? []) {
    if (isStageKey(stage)) tokens.push(`stage:${stage}`);
  }
  for (const gap of filters.gaps ?? []) {
    if (isGapKey(gap)) tokens.push(`gap:${gap}`);
  }
  return tokens;
}

function orderedActiveTokens(filters: SaleLeadListFilters, order: string[]) {
  const active = activeFilterTokens(filters);
  const activeSet = new Set(active);
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const token of order) {
    if (!activeSet.has(token) || seen.has(token)) continue;
    ordered.push(token);
    seen.add(token);
  }

  for (const token of active) {
    if (seen.has(token)) continue;
    ordered.push(token);
    seen.add(token);
  }

  return ordered;
}

function filtersFromTokens(tokens: string[]): SaleLeadListFilters {
  const filters: SaleLeadListFilters = {};

  for (const token of tokens) {
    const [group, value] = token.split(":");
    if (group === "status" && isStatusFilterKey(value)) {
      filters[value] = true;
    } else if (group === "stage" && isStageKey(value)) {
      filters.stages = [...(filters.stages ?? []), value];
    } else if (group === "gap" && isGapKey(value)) {
      filters.gaps = [...(filters.gaps ?? []), value];
    }
  }

  return filters;
}

function scopeRowsForFilterGroup(
  rows: SaleLeadFilterableRow[],
  filters: SaleLeadListFilters,
  order: string[],
  group: SaleLeadFilterGroup,
) {
  const ordered = orderedActiveTokens(filters, order);
  const firstGroupIndex = ordered.findIndex((token) => groupFromToken(token) === group);
  const scopedTokens =
    firstGroupIndex >= 0
      ? ordered.slice(0, firstGroupIndex)
      : ordered.filter((token) => groupFromToken(token) !== group);
  return filterSaleLeadRows(rows, filtersFromTokens(scopedTokens));
}

export function getOrderedSaleLeadFilterFacets(
  rows: SaleLeadFilterableRow[],
  input: { filters: SaleLeadListFilters; order: string[] },
): SaleLeadFilterFacets {
  const statusRows = scopeRowsForFilterGroup(rows, input.filters, input.order, "status");
  const stageRows = scopeRowsForFilterGroup(rows, input.filters, input.order, "stage");
  const gapRows = scopeRowsForFilterGroup(rows, input.filters, input.order, "gap");
  const statusCounts = getSaleLeadFilterCounts(statusRows);
  const stageCounts = getSaleLeadFilterCounts(stageRows);
  const gapCounts = getSaleLeadFilterCounts(gapRows);

  return {
    total: filterSaleLeadRows(rows, input.filters).length,
    stages: stageCounts.stages,
    gaps: gapCounts.gaps,
    status: {
      hasImages: statusCounts.hasImages,
      noImages: statusCounts.noImages,
      inspected: statusCounts.inspected,
      noHumanTouch: statusCounts.noHumanTouch,
      underTwoBids: statusCounts.underTwoBids,
      hotLead: statusCounts.hotLead,
    },
    groupTotals: {
      status: statusRows.length,
      stages: stageRows.length,
      gaps: gapRows.length,
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
