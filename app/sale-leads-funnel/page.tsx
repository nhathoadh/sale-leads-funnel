"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  BarChart3,
  CalendarDays,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Image,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

import {
  SALE_LEAD_DATA_WARNING_LABELS,
  SALE_LEAD_STAGE_CONFIG,
  formatMillionShort,
  getSaleLeadDefaultDateRange,
  getSaleLeadQuickMonthOptions,
  getSaleLeadStageTone,
  normalizeSaleLeadTeamFilter,
  type SaleLeadDataWarning,
  type SaleLeadGapBucket,
  type SaleLeadTeamFilter,
  type SaleLeadWorkStage,
} from "@/lib/sale-leads-funnel";
import { formatCrmValue, groupDealerBidsByDealer, hasRealDealerBidPrice } from "@/lib/sale-leads-funnel-detail";
import type { SaleSubteam } from "@/lib/sale-subteams";
import {
  GAP_STRUCTURE_COLORS,
  GAP_STRUCTURE_LABELS,
  buildGapStructureView,
  buildHanoiSummaryCharts,
  buildHanoiWorkablePieGradient,
  buildHanoiWorkablePieSlices,
  sortHanoiSaleRows,
  type HanoiSaleSortKey,
  type HanoiSortDirection,
  type GapStructureLead,
  type GapStructureSlice,
  type GapStructureView,
  type HanoiFunnelResponse,
} from "@/lib/hanoi-funnel";

type SortKey = "last_touch_oldest" | "last_touch_newest" | "gap_asc" | "gap_desc" | "created_desc";
type DashboardTab = "leads" | "hanoi-funnel";
type HanoiStageCharts = NonNullable<ReturnType<typeof buildHanoiSummaryCharts>>;

const TEAM_OPTIONS: Array<{ value: SaleLeadTeamFilter; label: string }> = [
  { value: "HANOI", label: "Team Hà Nội" },
  { value: "HCM", label: "Team HCM" },
];

interface FunnelLead {
  leadId: string;
  carId: string;
  leadName: string;
  phone: string | null;
  picId: string | null;
  picName: string;
  carName: string;
  location: string | null;
  southernLead: boolean;
  createdAt: string;
  crmStage: string;
  workStage: SaleLeadWorkStage;
  priceCustomer: number | null;
  highestBid: number | null;
  highestDealerName: string | null;
  gapAmount: number | null;
  gapPercent: number | null;
  gapBucket: SaleLeadGapBucket;
  hasImages: boolean;
  inspected: boolean;
  booked: boolean;
  noHumanTouch: boolean;
  underTwoBids: boolean;
  hotLead: boolean;
  needsInspectionBooking: boolean;
  needsPostInspectionQuote: boolean;
  humanMessageCount: number;
  aiMessageCount: number;
  dealerBidDealerCount: number;
  lastTouchAt: string | null;
  lastTouchHours: number | null;
  quoteTimestamps: string[];
  imageCount: number;
  priceCustomerLabel: string;
  highestBidLabel: string;
  gapLabel: string;
}

interface FunnelResponse {
  filters: {
    from: string;
    to: string;
    team: SaleLeadTeamFilter;
    pic: string[];
    subteam?: string | null;
    stage: SaleLeadWorkStage[];
    gap: SaleLeadGapBucket[];
    hasImages?: boolean;
    noImages?: boolean;
    inspected?: boolean;
    noHumanTouch?: boolean;
    underTwoBids?: boolean;
    hotLead?: boolean;
    southernLead?: boolean;
    needsInspectionBooking?: boolean;
    needsPostInspectionQuote?: boolean;
    filterOrder: string[];
    sort: SortKey;
    page: number;
    perPage: number;
  };
  total: number;
  scanned: number;
  page: number;
  perPage: number;
  totalPages: number;
  warnings?: SaleLeadDataWarning[];
  counts?: {
    total: number;
    stages: Record<SaleLeadWorkStage, number>;
    gaps: Record<SaleLeadGapBucket, number>;
    hasImages: number;
    noImages: number;
    inspected: number;
    noHumanTouch: number;
    underTwoBids: number;
    hotLead: number;
    southernLead: number;
    needsInspectionBooking: number;
    needsPostInspectionQuote: number;
  };
  facets?: {
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
      southernLead: number;
      needsInspectionBooking: number;
      needsPostInspectionQuote: number;
    };
    groupTotals?: {
      status: number;
      stages: number;
      gaps: number;
    };
  };
  stages: Array<(typeof SALE_LEAD_STAGE_CONFIG)[number] & { count: number }>;
  stageSummary?: {
    total: number;
    workableTotal: number;
    stages: Array<(typeof SALE_LEAD_STAGE_CONFIG)[number] & { count: number; workableCount: number }>;
  };
  workableGapSummary?: {
    total: number;
    buckets: Array<{ key: SaleLeadGapBucket; label: string; count: number; percent: number }>;
  };
  picOptions: Array<{ id: string; name: string }>;
  leads: FunnelLead[];
}

interface LeadDetail {
  lead: {
    leadId: string;
    carId: string;
    leadName: string;
    phone: string | null;
    additionalPhone: string | null;
    source: string | null;
    picName: string;
    createdAt: string;
    carName: string;
    mileage: number | null;
    location: string | null;
    plate: string | null;
    sku: string | null;
    crmStage: string;
    priceCustomer: number | null;
    priceHighestBid: number | null;
    priceSold: number | null;
    failureReason: string | null;
    notes: string | null;
    gmvFlowNoReason: string | null;
    qualified: string | null;
    intention: string | null;
    negotiationAbility: string | null;
    e2eStatusReason: string | null;
    customerFeedback?: string | null;
  };
  dealerBids: Array<{
    id: string;
    dealerId: string;
    dealerName: string;
    price: number;
    priceLabel: string;
    version: number;
    phase: "pre_inspection" | "post_inspection";
    createdAt: string;
    comment: string | null;
  }>;
  timeline: Array<{
    at: string | null;
    stage: string | null;
    priceCustomer: number | null;
    priceVucarOffered: number | null;
    sellerSentiment: string | null;
    thinking: string | null;
  }>;
  saleActivities: Array<{ created_at: string; activity_type?: string; actor_type?: string; metadata?: Record<string, unknown> }>;
  messages: Array<{
    id: string;
    fromMe: boolean;
    sender: string;
    senderKind: "ai" | "human" | "customer";
    senderTag: string;
    content: string;
    at: string;
    type: string;
    imageUrl: string | null;
    thumbUrl: string | null;
    callDurationSeconds: number | null;
    callDurationLabel: string | null;
    callKind: "completed" | "missed" | null;
  }>;
  externalLinks: Array<{
    key: "crm" | "e2e" | "zalo" | "sale_workspace";
    label: string;
    href: string;
  }>;
  warnings?: SaleLeadDataWarning[];
}

const GAP_OPTIONS: Array<{ value: SaleLeadGapBucket; label: string }> = [
  { value: "lt5", label: "<5%" },
  { value: "5_10", label: "5-10%" },
  { value: "gt10", label: ">10%" },
  { value: "no_price", label: "Chưa có giá" },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "last_touch_oldest", label: "Last touch lâu nhất" },
  { value: "last_touch_newest", label: "Last touch mới nhất" },
  { value: "gap_asc", label: "Gap nhỏ nhất" },
  { value: "gap_desc", label: "Gap lớn nhất" },
  { value: "created_desc", label: "Lead mới nhất" },
];

type StatusFilterKey =
  | "southernLead"
  | "hasImages"
  | "noImages"
  | "inspected"
  | "noHumanTouch"
  | "underTwoBids"
  | "hotLead"
  | "needsInspectionBooking"
  | "needsPostInspectionQuote";

const STATUS_FILTER_KEYS: StatusFilterKey[] = [
  "southernLead",
  "hasImages",
  "noImages",
  "inspected",
  "noHumanTouch",
  "underTwoBids",
  "hotLead",
  "needsInspectionBooking",
  "needsPostInspectionQuote",
];

function todayInput() {
  return getSaleLeadDefaultDateRange().to;
}

function defaultFromInput() {
  return getSaleLeadDefaultDateRange().from;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastTouch(hours: number | null, at: string | null) {
  if (!at || hours === null) return "Chưa có";
  if (hours < 1) return "<1 giờ";
  if (hours < 24) return `${Math.round(hours)} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}

function formatVnd(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  return `${amount.toLocaleString("vi-VN")} đ`;
}

function formatDiff(value: number | null) {
  if (value === null) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value / 1_000_000).toLocaleString("vi-VN")}M`;
}

function buildFailureHighlights(lead: LeadDetail["lead"]) {
  return [
    lead.gmvFlowNoReason ? { label: "GMV flow", value: lead.gmvFlowNoReason } : null,
    lead.customerFeedback ? { label: "Khách phản hồi", value: lead.customerFeedback } : null,
    lead.e2eStatusReason ? { label: "E2E", value: lead.e2eStatusReason } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;
}

function setCsvParam(params: URLSearchParams, key: string, values: string[]) {
  if (values.length > 0) params.set(key, values.join(","));
  else params.delete(key);
}

function hanoiStageCacheKey(input: {
  from: string;
  to: string;
  team: SaleLeadTeamFilter;
  subteam?: string | null;
  pic: string[];
}) {
  return [input.from, input.to, input.team, input.subteam ?? "", [...input.pic].sort().join(",")].join("|");
}

function stageLabel(stage: SaleLeadWorkStage) {
  return SALE_LEAD_STAGE_CONFIG.find((item) => item.key === stage)?.label ?? stage;
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function senderTagClass(kind: "ai" | "human" | "customer") {
  if (kind === "ai") return "border-violet-200 bg-violet-50 text-violet-700";
  if (kind === "human") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-white text-slate-500";
}

function StageBadge({ stage }: { stage: SaleLeadWorkStage }) {
  return (
    <span
      className={classNames(
        "inline-flex max-w-[144px] items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        getSaleLeadStageTone(stage).badgeClass,
      )}
    >
      <span className="truncate">{stageLabel(stage)}</span>
    </span>
  );
}

function CountFilterButton({
  active,
  count,
  label,
  title,
  tone = "slate",
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  title?: string;
  tone?: "slate" | "sky" | "teal";
  onClick: () => void;
}) {
  const activeClass =
    tone === "sky"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : tone === "teal"
        ? "border-teal-200 bg-teal-50 text-teal-800"
        : "border-slate-300 bg-slate-100 text-slate-900";

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={classNames(
        "flex h-8 min-w-0 items-center justify-between gap-2 rounded-md border px-2 text-left text-xs font-medium shadow-sm shadow-slate-200/30 transition hover:-translate-y-px hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100",
        active ? activeClass : "border-slate-200 bg-white text-slate-800",
      )}
    >
      <span className="truncate">{label}</span>
      <span className={classNames("shrink-0 text-[11px]", active ? "text-current/70" : "text-slate-400")}>{count}</span>
    </button>
  );
}

function FilterTitle({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold text-slate-500">{children}</div>;
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function formatPercentFixed(value: number) {
  return `${Number(value || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatPlainNumber(value: number) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function formatMillionOneDecimal(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `${(amount / 1_000_000).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}M`;
}

function formatDays(value: number) {
  return `${Number(value || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} ngày`;
}

function formatChartDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return value.slice(5);
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
}

const FUNNEL_STAGE_LABELS: Record<string, string> = {
  total: "Lead",
  contacted: "Liên hệ",
  image: "Có ảnh",
  inspection: "Kiểm định",
  carview: "Xem xe",
  win: "Win",
  failed: "Failed",
  target: "Target",
  target_image: "Target có ảnh",
  target_inspection: "Target KĐ",
};

function HanoiMetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm shadow-slate-200/40">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}

function HanoiFunnelChart({
  title,
  stages,
}: {
  title: string;
  stages: HanoiFunnelResponse["totalFunnel"];
}) {
  const max = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] font-semibold text-slate-400">{formatPlainNumber(stages[0]?.count ?? 0)} total</span>
      </div>
      <div className="flex h-[calc(100%-37px)] flex-col justify-around gap-1.5 p-3">
        {stages.map((stage) => (
          <div key={stage.key} className="grid grid-cols-[82px_minmax(72px,1fr)_58px_44px] items-center gap-2 text-xs">
            <div className="truncate font-medium text-slate-600">{FUNNEL_STAGE_LABELS[stage.key] ?? stage.label}</div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.max(2, (stage.count / max) * 100)}%` }}
              />
            </div>
            <div className="text-right font-semibold text-slate-900 tabular-nums">{formatPlainNumber(stage.count)}</div>
            <div className="text-right text-[11px] text-slate-400 tabular-nums">{formatPercent(stage.percentOfTotal)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HanoiTargetProcess({ stages }: { stages: HanoiFunnelResponse["targetFunnel"] }) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="text-sm font-semibold">Funnel target</h2>
        <span className="text-[11px] font-semibold text-slate-400">{formatPlainNumber(stages[0]?.count ?? 0)} total</span>
      </div>
      <div className="flex h-[calc(100%-37px)] flex-col justify-around gap-1.5 p-3">
        {stages.map((stage, index) => (
          <div key={stage.key} className="grid grid-cols-[28px_minmax(0,1fr)_58px] items-center gap-2 text-xs">
            <span className="flex size-6 items-center justify-center rounded-full bg-sky-50 text-[11px] font-semibold text-sky-700">
              {index + 1}
            </span>
            <span className="min-w-0 font-medium leading-4 text-slate-600">{FUNNEL_STAGE_LABELS[stage.key] ?? stage.label}</span>
            <span className="text-right tabular-nums">
              <span className="block font-semibold text-slate-900">{formatPlainNumber(stage.count)}</span>
              <span className="block text-[11px] text-slate-400">{formatPercent(stage.percentOfTotal)}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HanoiWorkStageChart({ chart }: { chart: HanoiFunnelResponse["workStageChart"] }) {
  const max = Math.max(1, ...chart.stages.map((stage) => stage.totalCount));

  return (
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="text-sm font-semibold">Stage công việc</h2>
        <span className="text-[11px] font-semibold text-slate-400">{formatPlainNumber(chart.totalLeads)} total</span>
      </div>
      <div className="flex h-[calc(100%-37px)] flex-col justify-around gap-1.5 p-3">
        {chart.stages.length ? (
          chart.stages.map((stage) => (
            <div key={stage.key} className="grid grid-cols-[78px_minmax(48px,112px)_58px_42px] items-center gap-2 text-xs">
              <div className="truncate font-medium text-slate-600">{stage.shortLabel}</div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-500"
                  style={{ width: `${Math.max(2, (stage.totalCount / max) * 100)}%` }}
                />
              </div>
              <div className="text-right font-semibold text-slate-900 tabular-nums">{formatPlainNumber(stage.totalCount)}</div>
              <div className="text-right text-[11px] text-slate-400 tabular-nums">{formatPercent(stage.percentOfTotal)}</div>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">Chưa có snapshot stage.</div>
        )}
      </div>
    </section>
  );
}

function HanoiGapChart({
  chart,
  compact = false,
}: {
  chart: HanoiFunnelResponse["workableGapChart"];
  compact?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const slices = useMemo(() => buildHanoiWorkablePieSlices(chart), [chart]);
  const gradient = useMemo(() => buildHanoiWorkablePieGradient(slices), [slices]);
  const activeSlice = slices.find((slice) => slice.key === activeKey) ?? null;
  const centerCount = activeSlice ? activeSlice.count : chart.total;
  const centerLabel = activeSlice ? activeSlice.label : "actionable";
  const centerPercent = activeSlice ? formatPercent(activeSlice.percent) : null;

  return (
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className={classNames("flex items-center justify-between gap-2 border-b border-slate-100", compact ? "px-3 py-2" : "px-4 py-3")}>
        <h2 className="text-sm font-semibold">Workable lead</h2>
        <span className="text-[11px] font-semibold text-slate-400">{formatPlainNumber(chart.total)} lead</span>
      </div>
      <div
        className={classNames(
          "grid items-center",
          compact ? "gap-2 p-3" : "gap-4 p-4 md:grid-cols-[180px_minmax(0,1fr)]",
        )}
        onMouseLeave={() => setActiveKey(null)}
      >
        <div className={classNames("relative mx-auto rounded-full transition-transform duration-150", compact ? "size-32" : "size-40")} style={{ background: gradient }}>
          <div className={classNames("absolute flex flex-col items-center justify-center rounded-full bg-white shadow-inner", compact ? "inset-5" : "inset-7")}>
            <div className={classNames("font-semibold text-slate-950", compact ? "text-lg" : "text-xl")}>{formatPlainNumber(centerCount)}</div>
            <div className="max-w-[78px] truncate text-center text-[11px] font-medium text-slate-400">{centerLabel}</div>
            {centerPercent && <div className="text-[10px] font-semibold text-slate-400">{centerPercent}</div>}
          </div>
        </div>
        <div className={classNames("grid content-center", compact ? "grid-cols-2 gap-1.5" : "gap-2")}>
          {slices.map((slice) => (
            <button
              type="button"
              key={slice.key}
              onMouseEnter={() => setActiveKey(slice.key)}
              onFocus={() => setActiveKey(slice.key)}
              onBlur={() => setActiveKey(null)}
              className={classNames(
                "grid items-center rounded-md text-left transition focus:outline-none focus:ring-2 focus:ring-sky-100",
                compact ? "grid-cols-[10px_1fr_auto] gap-1.5 px-1.5 py-1 text-[11px]" : "grid-cols-[14px_1fr_58px_58px] gap-2 px-1 py-1 text-xs",
                activeKey === slice.key && "bg-slate-50",
                activeKey && activeKey !== slice.key && "opacity-45",
              )}
            >
              <span className={classNames("rounded-full", compact ? "size-2" : "size-2.5")} style={{ backgroundColor: slice.color }} />
              <span className="truncate font-medium text-slate-600">{slice.label}</span>
              <span className="text-right font-semibold text-slate-900 tabular-nums">
                {formatPlainNumber(slice.count)}
                {compact && <span className="ml-1 font-medium text-slate-400">{formatPercent(slice.percent)}</span>}
              </span>
              {!compact && <span className="text-right text-slate-400">{formatPercent(slice.percent)}</span>}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

type GapStructureFocus = { kind: "start" | "now" | "flow" | "inspection"; key: string };
type GapStructureHover = GapStructureFocus & { x: number; y: number };

const GAP_STRUCTURE_TOOLTIP_ROWS = 12;

function formatGapStructurePercent(value: number | null) {
  return value === null ? "chưa đủ gap" : `${value.toFixed(1).replace(".", ",")}%`;
}

function formatGapStructurePrices(customer: number | null, bid: number | null) {
  return `${customer ? formatMillionShort(customer) : "?"} / ${bid ? formatMillionShort(bid) : "?"}`;
}

function gapStructureFocusLeads(view: GapStructureView, focus: GapStructureFocus | null) {
  if (!focus) return null;
  if (focus.kind === "flow") {
    const flow = view.flows.find((item) => `${item.from}>${item.to}` === focus.key);
    return flow
      ? { title: `${GAP_STRUCTURE_LABELS[flow.from]} → ${GAP_STRUCTURE_LABELS[flow.to]}`, count: flow.count, percent: (flow.count / Math.max(1, view.total)) * 100, leads: flow.leads }
      : null;
  }
  const slice = (focus.kind === "now" ? view.now : view.start).find((item) => item.key === focus.key);
  if (!slice) return null;
  if (focus.kind === "inspection") {
    return {
      title: `Kiểm định · ${slice.label} · ${formatPlainNumber(slice.inspectedCount)} đã KĐ`,
      count: slice.count,
      percent: slice.percent,
      leads: slice.leads.slice().sort((a, b) => Number(b.inspected) - Number(a.inspected)),
    };
  }
  return { title: `${focus.kind === "start" ? "Ban đầu" : "Hiện tại"} · ${slice.label}`, count: slice.count, percent: slice.percent, leads: slice.leads };
}

function gapStructureLeadLine(lead: GapStructureLead, kind: GapStructureFocus["kind"]) {
  if (kind === "start" || kind === "inspection") {
    return [lead.phone || "—", lead.carName, formatGapStructurePrices(lead.startPriceCustomer, lead.startHighestBid), formatGapStructurePercent(lead.startGapPercent)];
  }
  if (kind === "now") {
    return [lead.phone || "—", lead.carName, formatGapStructurePrices(lead.priceCustomer, lead.highestBid), formatGapStructurePercent(lead.nowGapPercent)];
  }
  return [
    lead.phone || "—",
    lead.carName,
    `${formatGapStructurePrices(lead.startPriceCustomer, lead.startHighestBid)} → ${formatGapStructurePrices(lead.priceCustomer, lead.highestBid)}`,
    `${formatGapStructurePercent(lead.startGapPercent)} → ${formatGapStructurePercent(lead.nowGapPercent)}`,
  ];
}

function gapStructureArcPath(cx: number, cy: number, r: number, start: number, end: number) {
  if (end - start >= Math.PI * 2 - 1e-6) {
    return `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`;
  }
  const x0 = cx + r * Math.sin(start);
  const y0 = cy - r * Math.cos(start);
  const x1 = cx + r * Math.sin(end);
  const y1 = cy - r * Math.cos(end);
  return `M${cx},${cy}L${x0},${y0}A${r},${r} 0 ${end - start > Math.PI ? 1 : 0},1 ${x1},${y1}Z`;
}

function HanoiGapStructurePie({
  title,
  kind,
  slices,
  focus,
  onHover,
  onLeave,
  onPin,
}: {
  title: string;
  kind: "start" | "now";
  slices: GapStructureSlice[];
  focus: GapStructureFocus | null;
  onHover: (focus: GapStructureFocus, event: ReactMouseEvent) => void;
  onLeave: () => void;
  onPin: (focus: GapStructureFocus) => void;
}) {
  const size = 200;
  const r = size / 2 - 4;
  let cursor = 0;
  const arcs = slices.map((slice) => {
    const start = cursor;
    cursor += (slice.percent / 100) * Math.PI * 2;
    return { slice, start, end: cursor };
  });
  const isActive = (key: string) => focus?.kind === kind && focus.key === key;
  const dimmed = (key: string) => focus?.kind === kind && focus.key !== key;

  return (
    <div className="@container min-w-0">
      <h3 className="mb-2 text-xs font-semibold text-slate-700">{title}</h3>
      <div className="flex flex-col items-center justify-center gap-3 @[17rem]:flex-row @[17rem]:gap-4 @md:gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[150px] shrink-0 @[17rem]:w-[108px] @sm:w-[124px] @md:w-[136px]" role="img" aria-label={title}>
        {arcs.map(({ slice, start, end }) => (
          <path
            key={slice.key}
            d={gapStructureArcPath(size / 2, size / 2, isActive(slice.key) ? r : r - 3, start, end)}
            fill={slice.color}
            stroke="#fff"
            strokeWidth={2}
            opacity={dimmed(slice.key) ? 0.4 : 1}
            className="cursor-pointer transition-opacity"
            onMouseMove={(event) => onHover({ kind, key: slice.key }, event)}
            onMouseLeave={onLeave}
            onClick={() => onPin({ kind, key: slice.key })}
          />
        ))}
        {arcs
          .filter(({ slice }) => slice.percent >= 6)
          .map(({ slice, start, end }) => {
            const mid = (start + end) / 2;
            return (
              <text
                key={slice.key}
                x={size / 2 + r * 0.62 * Math.sin(mid)}
                y={size / 2 - r * 0.62 * Math.cos(mid)}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none fill-white text-[11px] font-semibold"
              >
                {formatPercent(slice.percent)}
              </text>
            );
          })}
      </svg>
      <div className="grid w-full min-w-0 grid-cols-2 gap-x-2 @[17rem]:w-auto @[17rem]:min-w-[11.75rem] @[17rem]:max-w-[14rem] @[17rem]:flex-1 @[17rem]:grid-cols-1">
        {slices.map((slice) => (
          <button
            type="button"
            key={slice.key}
            onMouseEnter={(event) => onHover({ kind, key: slice.key }, event)}
            onMouseLeave={onLeave}
            onClick={() => onPin({ kind, key: slice.key })}
            className={classNames(
              "grid grid-cols-[8px_minmax(0,1fr)_auto_2.5rem] items-center gap-x-2 rounded-md px-1.5 py-0.5 text-left text-[11px] leading-5 transition focus:outline-none focus:ring-2 focus:ring-sky-100",
              isActive(slice.key) && "bg-slate-50",
              dimmed(slice.key) && "opacity-45",
            )}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="truncate font-medium text-slate-600">{slice.label}</span>
            <span className="text-right font-semibold text-slate-900 tabular-nums">{formatPlainNumber(slice.count)}</span>
            <span className="text-right font-medium text-slate-400 tabular-nums">{formatPercent(slice.percent)}</span>
          </button>
        ))}
      </div>
      </div>
    </div>
  );
}

function HanoiGapInspectionChart({
  view,
  focus,
  onHover,
  onLeave,
  onPin,
}: {
  view: GapStructureView;
  focus: GapStructureFocus | null;
  onHover: (focus: GapStructureFocus, event: ReactMouseEvent) => void;
  onLeave: () => void;
  onPin: (focus: GapStructureFocus) => void;
}) {
  const max = Math.max(1, ...view.start.map((slice) => slice.count));
  const isActive = (key: string) => focus?.kind === "inspection" && focus.key === key;
  const dimmed = (key: string) => focus?.kind === "inspection" && focus.key !== key;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-xs font-semibold text-slate-700">Kiểm định theo gap ban đầu</h3>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {formatPlainNumber(view.inspected)} / {formatPlainNumber(view.total)} xe đã kiểm định (
          {formatPercent((view.inspected / Math.max(1, view.total)) * 100)}). Bấm để xem danh sách.
        </p>
      </div>
      <div className="flex flex-1 flex-col justify-around gap-2">
        {view.start.map((slice) => {
          const rate = (slice.inspectedCount / Math.max(1, slice.count)) * 100;
          return (
            <button
              type="button"
              key={slice.key}
              onMouseMove={(event) => onHover({ kind: "inspection", key: slice.key }, event)}
              onMouseLeave={onLeave}
              onClick={() => onPin({ kind: "inspection", key: slice.key })}
              className={classNames(
                "rounded-md px-2 py-1.5 text-left text-[11px] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100",
                isActive(slice.key) && "bg-slate-50",
                dimmed(slice.key) && "opacity-45",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-slate-600">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate">{slice.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-400">
                  <span className="font-semibold text-slate-900">{formatPlainNumber(slice.count)}</span> xe · {formatPercent(slice.percent)}
                </span>
              </div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="flex h-full rounded-full" style={{ width: `${Math.max(2, (slice.count / max) * 100)}%` }}>
                  <span style={{ flexGrow: slice.inspectedCount, flexBasis: 0, backgroundColor: slice.color }} />
                  <span style={{ flexGrow: slice.count - slice.inspectedCount, flexBasis: 0, backgroundColor: slice.color, opacity: 0.3 }} />
                </div>
              </div>
              <div className="mt-1 tabular-nums text-slate-500">
                Đã KĐ <span className="font-semibold text-slate-900">{formatPlainNumber(slice.inspectedCount)}</span> xe · {formatPercent(rate)} nhóm
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">Màu đậm: đã kiểm định · Màu nhạt: chưa kiểm định · % = tỉ trọng trên xe có ảnh</p>
    </div>
  );
}

function HanoiGapStructureFlow({
  view,
  focus,
  onHover,
  onLeave,
  onPin,
}: {
  view: GapStructureView;
  focus: GapStructureFocus | null;
  onHover: (focus: GapStructureFocus, event: ReactMouseEvent) => void;
  onLeave: () => void;
  onPin: (focus: GapStructureFocus) => void;
}) {
  // Draw at the container's real width so labels keep their size and the height can fill the column.
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(300, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const height = Math.round(Math.min(440, Math.max(300, width * 0.8)));
  const labelWidth = width < 420 ? 104 : 118;
  const nodeWidth = 10;
  const nodeGap = 8;
  const left = labelWidth;
  const right = width - labelWidth - nodeWidth;
  const rows = Math.max(view.start.length, view.now.length);
  const unit = (height - nodeGap * (rows - 1)) / Math.max(1, view.total);

  const place = (slices: GapStructureSlice[]) => {
    let y = 0;
    return new Map(
      slices.map((slice) => {
        const box = { y, h: slice.count * unit };
        y += box.h + nodeGap;
        return [slice.key, box] as const;
      }),
    );
  };
  const startBoxes = place(view.start);
  const nowBoxes = place(view.now);
  const startOffset = new Map<string, number>();
  const nowOffset = new Map<string, number>();
  const nowIndex = (key: string) => view.now.findIndex((slice) => slice.key === key);
  const startIndex = (key: string) => view.start.findIndex((slice) => slice.key === key);

  const ribbons = view.flows.map((flow) => {
    const h = flow.count * unit;
    const y0 = (startBoxes.get(flow.from)?.y ?? 0) + (startOffset.get(flow.from) ?? 0);
    startOffset.set(flow.from, (startOffset.get(flow.from) ?? 0) + h);
    return { flow, h, y0, y1: 0 };
  });
  for (const ribbon of ribbons
    .slice()
    .sort((a, b) => nowIndex(a.flow.to) - nowIndex(b.flow.to) || startIndex(a.flow.from) - startIndex(b.flow.from))) {
    ribbon.y1 = (nowBoxes.get(ribbon.flow.to)?.y ?? 0) + (nowOffset.get(ribbon.flow.to) ?? 0);
    nowOffset.set(ribbon.flow.to, (nowOffset.get(ribbon.flow.to) ?? 0) + ribbon.h);
  }

  const xa = left + nodeWidth;
  const xb = right;
  const xm = (xa + xb) / 2;
  const ribbonPath = ({ h, y0, y1 }: { h: number; y0: number; y1: number }) =>
    `M${xa},${y0}C${xm},${y0} ${xm},${y1} ${xb},${y1}V${y1 + h}C${xm},${y1 + h} ${xm},${y0 + h} ${xa},${y0 + h}Z`;
  const activeFlow = focus?.kind === "flow" ? focus.key : null;

  return (
    <div ref={containerRef} className="flex min-w-0 flex-col gap-3">
      <h3 className="text-xs font-semibold text-slate-700">Gap ban đầu chuyển thành gap nào</h3>
      <svg viewBox={`0 -4 ${width} ${height + 8}`} className="w-full" role="img" aria-label="Gap ban đầu chuyển thành gap hiện tại">
        {ribbons.map((ribbon) => {
          const key = `${ribbon.flow.from}>${ribbon.flow.to}`;
          return (
            <path
              key={key}
              d={ribbonPath(ribbon)}
              fill={GAP_STRUCTURE_COLORS[ribbon.flow.from]}
              fillOpacity={activeFlow === key ? 0.8 : activeFlow ? 0.15 : 0.4}
              stroke="#fff"
              strokeWidth={0.5}
              className="cursor-pointer transition-[fill-opacity]"
              onMouseMove={(event) => onHover({ kind: "flow", key }, event)}
              onMouseLeave={onLeave}
              onClick={() => onPin({ kind: "flow", key })}
            />
          );
        })}
        {[
          { slices: view.start, boxes: startBoxes, x: left, side: "left" as const },
          { slices: view.now, boxes: nowBoxes, x: right, side: "right" as const },
        ].map(({ slices, boxes, x, side }) =>
          slices.map((slice) => {
            const box = boxes.get(slice.key) ?? { y: 0, h: 0 };
            return (
              <g key={`${side}-${slice.key}`}>
                <rect x={x} y={box.y} width={nodeWidth} height={Math.max(1, box.h)} rx={2} fill={slice.color} />
                <text
                  x={side === "left" ? x - 6 : x + nodeWidth + 6}
                  y={box.y + box.h / 2}
                  textAnchor={side === "left" ? "end" : "start"}
                  dominantBaseline="central"
                  className="fill-slate-600 text-[11px] font-medium"
                >
                  {slice.label} · {formatPlainNumber(slice.count)}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      <p className="text-[11px] text-slate-400">Trái: gap ban đầu · Phải: gap hiện tại · Độ dày = số xe</p>
    </div>
  );
}

function HanoiGapStructureSection({
  leads,
  loading,
  error,
}: {
  leads: GapStructureLead[] | null;
  loading: boolean;
  error: string | null;
}) {
  const view = useMemo(() => (leads ? buildGapStructureView(leads) : null), [leads]);
  const [hover, setHover] = useState<GapStructureHover | null>(null);
  const [pinned, setPinned] = useState<GapStructureFocus | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => setPinned(null), [leads]);

  if (!view) {
    return <HanoiStageChartPlaceholder title="Cơ cấu lead có ảnh" loading={loading} error={error} progress={loading ? 50 : 0} />;
  }

  const onHover = (focus: GapStructureFocus, event: ReactMouseEvent) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    setHover({ ...focus, x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
  };
  const onLeave = () => setHover(null);
  const focus = hover ?? pinned;
  const hovered = hover ? gapStructureFocusLeads(view, hover) : null;
  const pinnedGroup = pinned ? gapStructureFocusLeads(view, pinned) : null;
  const sectionWidth = sectionRef.current?.clientWidth ?? 1200;

  return (
    <section ref={sectionRef} className="relative rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Cơ cấu lead có ảnh</h2>
          <p className="text-[11px] text-slate-400">
            Gap ban đầu = giá khách đầu tiên trong CRM so với bid dealer cao nhất trong 24 giờ đầu trước kiểm định. Trỏ để xem xe, bấm để ghim danh sách.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatPlainNumber(view.total)} xe</span>
      </div>
      {view.total === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">Không có xe có ảnh trong kỳ.</div>
      ) : (
        <div className="grid gap-6 p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] xl:gap-0 xl:divide-x xl:divide-slate-100 xl:[&>*]:px-5 xl:[&>*:first-child]:pl-0 xl:[&>*:last-child]:pr-0">
          <div className="flex min-w-0 flex-col justify-around gap-6">
            <HanoiGapStructurePie title="Theo gap ban đầu" kind="start" slices={view.start} focus={focus} onHover={onHover} onLeave={onLeave} onPin={setPinned} />
            <HanoiGapStructurePie
              title="Theo gap hiện tại, tách hoãn bán, win và failed"
              kind="now"
              slices={view.now}
              focus={focus}
              onHover={onHover}
              onLeave={onLeave}
              onPin={setPinned}
            />
          </div>
          <div className="min-w-0 md:order-last md:col-span-2 xl:order-none xl:col-span-1">
            <HanoiGapStructureFlow view={view} focus={focus} onHover={onHover} onLeave={onLeave} onPin={setPinned} />
          </div>
          <HanoiGapInspectionChart view={view} focus={focus} onHover={onHover} onLeave={onLeave} onPin={setPinned} />
        </div>
      )}

      {hover && hovered && (
        <div
          className="pointer-events-none absolute z-20 w-[min(30rem,calc(100%-16px))] rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
          style={{ left: Math.max(8, Math.min(sectionWidth - 488, hover.x + 14)), top: hover.y + 14 }}
        >
          <div className="mb-1 font-semibold text-slate-700">
            {hovered.title} · {formatPlainNumber(hovered.count)} xe ({formatPercent(hovered.percent)})
          </div>
          {hovered.leads.slice(0, GAP_STRUCTURE_TOOLTIP_ROWS).map((lead) => (
            <div key={lead.carId} className="truncate text-slate-600 tabular-nums">
              {gapStructureLeadLine(lead, hover.kind).join(" · ")}
              {hover.kind === "inspection" && lead.inspected ? " · đã KĐ" : ""}
            </div>
          ))}
          {hovered.leads.length > GAP_STRUCTURE_TOOLTIP_ROWS && (
            <div className="mt-1 text-slate-400">và {hovered.leads.length - GAP_STRUCTURE_TOOLTIP_ROWS} xe khác, bấm để xem hết</div>
          )}
        </div>
      )}

      {pinned && pinnedGroup && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
            <span>
              {pinnedGroup.title} · {formatPlainNumber(pinnedGroup.count)} xe
            </span>
            <button type="button" onClick={() => setPinned(null)} className="rounded-md border border-slate-200 px-2 py-0.5 font-medium text-slate-500 hover:bg-slate-50">
              Đóng
            </button>
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-[11px] tabular-nums">
              <thead className="sticky top-0 bg-white text-slate-400">
                <tr>
                  <th className="py-1 pr-2 font-medium">SĐT</th>
                  <th className="py-1 pr-2 font-medium">Xe</th>
                  <th className="py-1 pr-2 font-medium">PIC</th>
                  <th className="py-1 pr-2 text-right font-medium">Giá khách / bid</th>
                  <th className="py-1 pr-2 text-right font-medium">Gap</th>
                  <th className="py-1 text-center font-medium">KĐ</th>
                </tr>
              </thead>
              <tbody>
                {pinnedGroup.leads.map((lead) => {
                  const [phone, car, prices, gap] = gapStructureLeadLine(lead, pinned.kind);
                  return (
                    <tr key={lead.carId} className="border-t border-slate-100 text-slate-600">
                      <td className="py-1 pr-2 whitespace-nowrap">{phone}</td>
                      <td className="py-1 pr-2">{car}</td>
                      <td className="py-1 pr-2 whitespace-nowrap">{lead.picName}</td>
                      <td className="py-1 pr-2 text-right whitespace-nowrap">{prices}</td>
                      <td className="py-1 pr-2 text-right whitespace-nowrap">{gap}</td>
                      <td className="py-1 text-center">{lead.inspected ? <span className="font-semibold text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

type HanoiDailyBarSeries = { key: string; label: string; color: string };
type HanoiDailyBarRow = { day: string; values: Record<string, number>; detail?: ReactNode };

/** Daily bars that always fit their card: no horizontal scroll, thinned day labels, tap or hover for the tooltip. */
function HanoiDailyBarChart({
  title,
  unit,
  series,
  rows,
  description,
  tall = false,
}: {
  title: string;
  description?: string;
  unit: string;
  series: readonly HanoiDailyBarSeries[];
  rows: HanoiDailyBarRow[];
  tall?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const totals = rows.map((row) => series.reduce((sum, item) => sum + (row.values[item.key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));
  const activeRow = active === null ? null : rows[active];
  const activePosition = active === null ? 0 : ((active + 0.5) / Math.max(rows.length, 1)) * 100;
  const plotHeight = tall ? "h-36" : "h-28";

  return (
    <section className="min-w-0 rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 border-b border-slate-100 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{description}</p> : null}
          {series.length > 1 ? (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
              {series.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          {formatPlainNumber(totals.reduce((sum, value) => sum + value, 0))} {unit}
        </span>
      </div>
      <div className="px-3 pb-2 pt-3">
        <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-1.5">
          <div className={classNames("flex flex-col justify-between text-right text-[10px] leading-none text-slate-400", plotHeight)}>
            {[1, 0.5, 0].map((tick) => (
              <span key={tick}>{Math.round(max * tick)}</span>
            ))}
          </div>
          <div className={classNames("relative border-b border-slate-200", plotHeight)} onMouseLeave={() => setActive(null)}>
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2].map((line) => (
                <span key={line} className="border-t border-dashed border-slate-100" />
              ))}
            </div>
            <div className="relative z-10 flex h-full items-end gap-px sm:gap-0.5">
              {rows.map((row, index) => (
                <button
                  key={row.day}
                  type="button"
                  className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm hover:bg-slate-50 focus:outline-none"
                  aria-label={`${formatChartDay(row.day)}: ${formatPlainNumber(totals[index])} ${unit}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onClick={() => setActive(index)}
                >
                  <span
                    className={classNames(
                      "flex w-full max-w-7 flex-col-reverse overflow-hidden rounded-t-sm",
                      active === index && "opacity-80 ring-2 ring-slate-300",
                    )}
                    style={{ height: `${(totals[index] / max) * 100}%`, minHeight: totals[index] > 0 ? 3 : 0 }}
                  >
                    {series.map((item) => (
                      <span
                        key={item.key}
                        style={{ flexGrow: row.values[item.key] ?? 0, flexBasis: 0, backgroundColor: item.color }}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
            {activeRow && active !== null ? (
              <div
                className="pointer-events-none absolute bottom-full z-30 mb-1 w-max max-w-[260px] rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-600 shadow-lg"
                style={{
                  left: `${activePosition}%`,
                  transform: `translateX(${activePosition < 30 ? "-15%" : activePosition > 70 ? "-85%" : "-50%"})`,
                }}
              >
                <div className="font-semibold text-slate-900">
                  {formatChartDay(activeRow.day)} · {formatPlainNumber(totals[active])} {unit}
                </div>
                {series.length > 1 ? (
                  <div className="mt-1 space-y-0.5">
                    {series.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.label}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-900">{formatPlainNumber(activeRow.values[item.key] ?? 0)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {activeRow.detail}
              </div>
            ) : null}
          </div>
          <div />
          <div className="mt-1 flex gap-px sm:gap-0.5">
            {rows.map((row, index) => (
              <span key={row.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[9px] text-slate-400">
                {index % labelEvery === 0 ? formatChartDay(row.day) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const LEAD_QUALITY_SERIES = [
  { key: "strongQualified", label: "Có ảnh", color: "#65a30d" },
  { key: "weakQualified", label: "Xin ảnh", color: "#facc15" },
  { key: "nonQualified", label: "Non-qualified", color: "#fb923c" },
  { key: "undefinedQualified", label: "Undefined", color: "#ef4444" },
] as const;

function HanoiLeadQualityByDayChart({ rows }: { rows: HanoiFunnelResponse["leadQualityByDay"] }) {
  return (
    <HanoiDailyBarChart
      title="Qualified leads theo ngày"
      unit="lead"
      series={LEAD_QUALITY_SERIES}
      tall
      rows={rows.map((row) => ({
        day: row.day,
        values: Object.fromEntries(LEAD_QUALITY_SERIES.map((item) => [item.key, row[item.key]])),
      }))}
    />
  );
}

const WIN_SERIES = [{ key: "count", label: "Win", color: "#a3e635" }] as const;

function HanoiWinCasesByDayChart({ rows }: { rows: HanoiFunnelResponse["winCasesByDay"] }) {
  return (
    <HanoiDailyBarChart
      title="Win case theo ngày"
      unit="win"
      series={WIN_SERIES}
      tall
      rows={rows.map((row) => ({ day: row.day, values: { count: row.count } }))}
    />
  );
}

const LEAD_INTAKE_SERIES = [{ key: "count", label: "Lead", color: "#0ea5e9" }] as const;

function HanoiDailyLeadIntakeChart({ rows }: { rows: HanoiFunnelResponse["dailyLeadIntake"] }) {
  return (
    <HanoiDailyBarChart
      title="Lead nhận mỗi ngày"
      unit="lead"
      series={LEAD_INTAKE_SERIES}
      rows={rows.map((row) => ({ day: row.day, values: { count: row.count } }))}
    />
  );
}

const HUMAN_MESSAGE_MIX_SERIES = [
  { key: "newLeadCount", label: "Lead mới (< 14 ngày)", color: "#10b981" },
  { key: "existingLeadCount", label: "Lead cũ (≥ 14 ngày)", color: "#64748b" },
] as const;

function HanoiHumanMessageMixChart({ rows }: { rows: HanoiFunnelResponse["dailyHumanMessageMix"] }) {
  return (
    <HanoiDailyBarChart
      title="Human message theo ngày"
      description="Số lead được sale nhắn Zalo (không tính AI) mỗi ngày. Lead mới: tạo trong 14 ngày gần nhất tính tới ngày nhắn; lead cũ: tạo từ 14 ngày trở lên."
      unit="lead"
      series={HUMAN_MESSAGE_MIX_SERIES}
      rows={rows.map((row) => ({
        day: row.day,
        values: { newLeadCount: row.newLeadCount, existingLeadCount: row.existingLeadCount },
      }))}
    />
  );
}

const BOOKING_SERIES = [
  { key: "inspection", label: "Kiểm định", color: "#6366f1" },
  { key: "carview", label: "Xem xe", color: "#f59e0b" },
] as const;
const BOOKING_TOOLTIP_PIC_LIMIT = 10;

function HanoiDailyBookingChart({ rows }: { rows: HanoiFunnelResponse["dailyBookings"] }) {
  return (
    <HanoiDailyBarChart
      title="Lịch kiểm định + xem xe"
      unit="lịch"
      series={BOOKING_SERIES}
      rows={rows.map((row) => {
        const shown = row.byPic.slice(0, BOOKING_TOOLTIP_PIC_LIMIT);
        const hiddenTotal = row.byPic.slice(BOOKING_TOOLTIP_PIC_LIMIT).reduce((sum, pic) => sum + pic.total, 0);
        return {
          day: row.day,
          values: { inspection: row.inspection, carview: row.carview },
          detail:
            row.byPic.length > 0 ? (
              <div className="mt-1.5 border-t border-slate-100 pt-1.5">
                <div className="mb-0.5 grid grid-cols-[minmax(0,1fr)_28px_28px] gap-2 text-[10px] font-semibold uppercase text-slate-400">
                  <span>PIC</span>
                  <span className="text-right">KĐ</span>
                  <span className="text-right">Xem</span>
                </div>
                {shown.map((pic) => (
                  <div key={pic.picId} className="grid grid-cols-[minmax(0,1fr)_28px_28px] gap-2">
                    <span className="truncate">{pic.picName}</span>
                    <span className="text-right font-semibold tabular-nums text-slate-900">{pic.inspection || "–"}</span>
                    <span className="text-right font-semibold tabular-nums text-slate-900">{pic.carview || "–"}</span>
                  </div>
                ))}
                {hiddenTotal > 0 ? (
                  <div className="mt-0.5 text-slate-400">
                    +{row.byPic.length - shown.length} PIC khác · {formatPlainNumber(hiddenTotal)} lịch
                  </div>
                ) : null}
              </div>
            ) : null,
        };
      })}
    />
  );
}

function formatCallMinutes(value: number) {
  return Number(value || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  });
}

function HanoiZaloCallChart({ rows }: { rows: HanoiFunnelResponse["dailyZaloCalls"] }) {
  const maxMinutes = Math.max(1, ...rows.map((row) => row.totalMinutes));
  const maxLeads = Math.max(1, ...rows.map((row) => row.uniqueLeadCount));
  const totalMinutes = rows.reduce((sum, row) => sum + row.totalMinutes, 0);
  const totalLeadTouches = rows.reduce((sum, row) => sum + row.uniqueLeadCount, 0);
  const labelEvery = Math.max(1, Math.ceil(rows.length / 7));

  return (
    <section className="min-w-0 rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Phút gọi Zalo theo ngày</h2>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-cyan-500" />
              Phút gọi
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-violet-500" />
              Unique lead
            </span>
          </div>
        </div>
        <span className="text-right text-[11px] font-semibold text-slate-400">
          {formatCallMinutes(totalMinutes)} phút · {formatPlainNumber(totalLeadTouches)} lead/ngày
        </span>
      </div>
      <div className="px-3 pb-2 pt-3">
        <div className="grid grid-cols-[32px_minmax(0,1fr)_22px] gap-x-1.5">
          <div className="flex h-28 flex-col justify-between text-right leading-none text-[10px] text-slate-400">
            {[1, 0.5, 0].map((tick) => (
              <span key={tick}>{formatCallMinutes(maxMinutes * tick)}</span>
            ))}
          </div>
          <div className="relative h-28 border-b border-slate-200">
            <div className="absolute inset-0 flex flex-col justify-between">
              {[0, 1].map((line) => (
                <span key={line} className="border-t border-dashed border-slate-100" />
              ))}
            </div>
            <div className="relative z-10 flex h-full items-end gap-px sm:gap-0.5">
              {rows.map((row) => (
                <div key={row.day} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <div className="relative h-full w-full max-w-7">
                    {row.totalMinutes > 0 ? (
                      <div
                        className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 rounded-t-sm bg-cyan-500"
                        title={`${formatChartDay(row.day)}: ${formatCallMinutes(row.totalMinutes)} phút gọi`}
                        style={{ height: `max(4px, ${(row.totalMinutes / maxMinutes) * 100}%)` }}
                      />
                    ) : null}
                    {row.uniqueLeadCount > 0 ? (
                      <span
                        className="absolute left-1/2 inline-flex size-2 -translate-x-1/2 items-center justify-center rounded-full border border-white bg-violet-500 text-[9px] font-semibold leading-none text-transparent shadow-sm sm:size-auto sm:h-4 sm:min-w-4 sm:px-1 sm:text-white"
                        title={`${formatChartDay(row.day)}: ${formatPlainNumber(row.uniqueLeadCount)} unique lead được gọi`}
                        style={{ bottom: `max(2px, calc(${(row.uniqueLeadCount / maxLeads) * 100}% - 16px))` }}
                      >
                        {row.uniqueLeadCount}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex h-28 flex-col justify-between text-[10px] leading-none text-violet-400">
            {[1, 0.5, 0].map((tick) => (
              <span key={tick}>{Math.round(maxLeads * tick)}</span>
            ))}
          </div>
          <div />
          <div className="mt-1 flex gap-px sm:gap-0.5">
            {rows.map((row, index) => (
              <span key={row.day} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[9px] text-slate-400">
                {index % labelEvery === 0 ? formatChartDay(row.day) : ""}
              </span>
            ))}
          </div>
          <div />
        </div>
      </div>
    </section>
  );
}

function HanoiSpeedCard({ data }: { data: HanoiFunnelResponse["speedToClose"] }) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-6 items-center justify-center rounded-md border border-sky-100 bg-sky-50 text-sky-700">
            <BarChart3 className="size-3" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight">Speed to Close</h2>
        </div>
        <span className="text-[11px] font-semibold text-slate-400">{formatPlainNumber(data.totalClosedMilestones)} milestones</span>
      </div>
      <div className="flex h-[calc(100%-33px)] flex-col justify-around gap-1 p-2">
        {data.metrics.map((metric, index) => (
          <div
            key={metric.key}
            className="grid grid-cols-[minmax(0,1fr)_52px_52px] items-center gap-1.5 rounded-md border border-slate-200 bg-white p-1.5 sm:grid-cols-[minmax(0,1fr)_66px_66px]"
          >
            <div className="flex min-w-0 gap-2">
              <div className="w-6 shrink-0 text-xs font-semibold text-indigo-500">{String(index + 1).padStart(2, "0")}</div>
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-tight text-slate-950">{metric.label}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                  <span>{formatPlainNumber(metric.cases)} cases</span>
                  <span>LM {metric.lastMonthAverageDays}d</span>
                  <span className={classNames("font-semibold", metric.averageDeltaDays > 0 ? "text-rose-600" : "text-emerald-600")}>
                    {metric.averageDeltaDays > 0 ? "+" : ""}
                    {metric.averageDeltaDays}d
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-md bg-slate-100 px-1.5 py-1 text-center">
              <div className="text-xs font-semibold text-slate-950">{metric.averageDays}d</div>
              <div className="text-[9px] font-semibold text-slate-500">AVG</div>
            </div>
            <div className="rounded-md bg-slate-100 px-1.5 py-1 text-center">
              <div className="text-xs font-semibold text-slate-950">{metric.medianDays}d</div>
              <div className="text-[9px] font-semibold text-slate-500">MED</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HanoiStageChartPlaceholder({
  title,
  loading,
  error,
  progress,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  progress: number;
}) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {loading ? <Loader2 className="size-4 animate-spin text-sky-500" /> : null}
      </div>
      <div className="flex h-[calc(100%-37px)] min-h-[170px] items-center p-3">
        {error ? (
          <div className="w-full rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600">{error}</div>
        ) : loading ? (
          <LeadLoadingProgress progress={progress} compact />
        ) : (
          <div className="w-full py-8 text-center text-xs text-slate-400">Chưa có dữ liệu stage/workable.</div>
        )}
      </div>
    </section>
  );
}

function HanoiReasonChart({
  title,
  total,
  rows,
  compact = false,
}: {
  title: string;
  total: number;
  rows: Array<{ reason: string; count: number; percentOfGroup?: number; percentOfTotal?: number }>;
  compact?: boolean;
}) {
  return (
    <section className={classNames("rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40", compact ? "p-2.5" : "p-3")}>
      <div className={classNames("flex items-center justify-between gap-2", compact ? "mb-1.5" : "mb-2")}>
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-slate-400">{formatPlainNumber(total)}</span>
      </div>
      <div className={classNames(compact ? "space-y-1.5" : "space-y-2")}>
        {rows.length ? (
          rows.slice(0, 6).map((row) => (
            <div key={row.reason} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-600">{row.reason}</span>
                <span className="font-semibold text-slate-900">{formatPlainNumber(row.count)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-rose-400"
                  style={{ width: `${row.percentOfGroup ?? row.percentOfTotal ?? 0}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">Chưa có dữ liệu.</div>
        )}
      </div>
    </section>
  );
}

function percentRatio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function HanoiPicPerformanceTable({ rows }: { rows: HanoiFunnelResponse["byUser"] }) {
  const [sort, setSort] = useState<{ key: HanoiSaleSortKey; direction: HanoiSortDirection }>({
    key: "totalLeads",
    direction: "desc",
  });
  const sortedRows = useMemo(() => sortHanoiSaleRows(rows, sort), [rows, sort]);

  const toggleSort = (key: HanoiSaleSortKey) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };
  const columns: Array<{ key: HanoiSaleSortKey; label: string; align?: "left" | "right" }> = [
    { key: "displayName", label: "Sale", align: "left" },
    { key: "totalLeads", label: "Total" },
    { key: "leadsWithImages", label: "Có ảnh" },
    { key: "imageRate", label: "% Có ảnh" },
    { key: "inspectionBookings", label: "Total KĐ" },
    { key: "inspectionRate", label: "% KĐ/Total" },
    { key: "wins", label: "Win tổng" },
    { key: "conversionRate", label: "% CVR/Total" },
  ];

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold">Đối chiếu theo sale</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-sm">
          <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={classNames("px-4 py-3", column.align === "left" ? "text-left" : "text-right")}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={classNames(
                      "inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-white hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100",
                      column.align === "left" ? "justify-start" : "justify-end",
                      sort.key === column.key && "text-sky-700",
                    )}
                  >
                    {column.label}
                    <ArrowDownUp className="size-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const imageRate = percentRatio(row.leadsWithImages, row.totalLeads);
              const inspectionRate = percentRatio(row.inspectionBookings, row.totalLeads);
              const conversionRate = percentRatio(row.wins, row.totalLeads);

              return (
                <tr key={row.userId} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold text-slate-700">{row.displayName}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPlainNumber(row.totalLeads)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPlainNumber(row.leadsWithImages)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPercentFixed(imageRate)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPlainNumber(row.inspectionBookings)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPercentFixed(inspectionRate)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPlainNumber(row.wins)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatPercentFixed(conversionRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HanoiFunnelDashboard({
  data,
  loading,
  error,
  stageCharts,
  stageLoading,
  stageProgress,
  stageError,
  gapStructureLeads,
  gapStructureLoading,
  gapStructureError,
}: {
  data: HanoiFunnelResponse | null;
  loading: boolean;
  error: string | null;
  stageCharts: HanoiStageCharts | null;
  stageLoading: boolean;
  stageProgress: number;
  stageError: string | null;
  gapStructureLeads: GapStructureLead[] | null;
  gapStructureLoading: boolean;
  gapStructureError: string | null;
}) {
  if (loading) {
    return (
      <section className="flex h-64 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-sm text-slate-500">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Đang tải hanoi-funnel
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="flex h-64 flex-col items-center justify-center rounded-lg border border-rose-200 bg-white text-sm text-rose-600">
        <BarChart3 className="mb-2 size-6" />
        {error || "Không tải được hanoi-funnel"}
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <HanoiMetricCard label="Lead" value={formatPlainNumber(data.overview.totalLeads)} hint="Lead trong kỳ" />
        <HanoiMetricCard label="Win" value={formatPlainNumber(data.overview.soldCars)} hint={`${formatPercent(data.overview.conversionRate)} CVR`} />
        <HanoiMetricCard label="GMV" value={formatMillionShort(data.overview.gmv)} hint="Tổng giá bán" />
        <HanoiMetricCard label="Revenue" value={formatMillionShort(data.overview.expectedRevenue)} hint="Doanh thu dự kiến" />
        <HanoiMetricCard label="Avg sold" value={formatMillionShort(data.overview.averageSoldCarValue)} hint="Giá trị xe TB" />
        <HanoiMetricCard label="Rev/car" value={formatMillionOneDecimal(data.overview.averageRevenuePerCar)} hint="Doanh thu TB" />
        <HanoiMetricCard
          label="Bids/lead có ảnh"
          value={data.imageLeadBids ? formatPlainNumber(data.imageLeadBids.averageBidsPerLead) : "—"}
          hint={
            data.imageLeadBids
              ? `${formatPlainNumber(data.imageLeadBids.bids)} bid / ${formatPlainNumber(data.imageLeadBids.leadsWithImages)} lead`
              : "Không đọc được giá dealer"
          }
        />
      </section>

      <section className="grid items-stretch gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.6fr)]">
        <HanoiSpeedCard data={data.speedToClose} />
        <HanoiFunnelChart title="Funnel tổng" stages={data.totalFunnel} />
        <HanoiFunnelChart title="Funnel cohort" stages={data.cohortFunnel} />
        <HanoiTargetProcess stages={data.targetFunnel} />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <HanoiDailyBookingChart rows={data.dailyBookings} />
        <HanoiDailyLeadIntakeChart rows={data.dailyLeadIntake} />
        <HanoiHumanMessageMixChart rows={data.dailyHumanMessageMix} />
        <HanoiZaloCallChart rows={data.dailyZaloCalls} />
      </section>

      <section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {stageCharts ? (
            <>
              <HanoiWorkStageChart chart={stageCharts.stageChart} />
              <HanoiGapChart chart={stageCharts.gapChart} compact />
            </>
          ) : (
            <>
              <HanoiStageChartPlaceholder title="Stage công việc" loading={stageLoading} error={stageError} progress={stageProgress} />
              <HanoiStageChartPlaceholder title="Workable lead" loading={stageLoading} error={stageError} progress={stageProgress} />
            </>
          )}
          {data.failureReasons.map((group) => (
            <HanoiReasonChart key={group.key} title={group.label} total={group.total} rows={group.reasons} compact />
          ))}
          <HanoiReasonChart title="Hoãn bán" total={data.delayReasons.total} rows={data.delayReasons.reasons} compact />
        </div>
      </section>

      <HanoiGapStructureSection leads={gapStructureLeads} loading={gapStructureLoading} error={gapStructureError} />

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
        {data.leadQualityError ? (
          <HanoiStageChartPlaceholder title="Qualified leads theo ngày" loading={false} error={data.leadQualityError} progress={0} />
        ) : (
          <HanoiLeadQualityByDayChart rows={data.leadQualityByDay} />
        )}
        <HanoiWinCasesByDayChart rows={data.winCasesByDay} />
      </section>

      <HanoiPicPerformanceTable rows={data.byUser} />
    </div>
  );
}

function leadLoadingText(progress: number) {
  if (progress < 30) return "Đang lấy danh sách lead";
  if (progress < 58) return "Đang đọc dữ liệu Zalo";
  if (progress < 88) return "Đang phân loại stage";
  if (progress < 100) return "Đang hoàn tất bộ lọc";
  return "Hoàn tất";
}

function LeadLoadingProgress({ progress, compact = false }: { progress: number; compact?: boolean }) {
  const rounded = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div
      className={classNames(
        "rounded-lg border border-sky-100 bg-sky-50/60 shadow-sm shadow-slate-200/40",
        compact ? "p-2.5" : "flex h-64 items-center justify-center p-6",
      )}
    >
      <div className={compact ? "w-full" : "w-full max-w-md"}>
        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-700">
          <span>{leadLoadingText(rounded)}</span>
          <span className="tabular-nums text-sky-700">{rounded}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white shadow-inner">
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
            style={{ width: `${rounded}%` }}
          />
        </div>
        {!compact && (
          <div className="mt-3 text-center text-xs text-slate-500">
            Dữ liệu sẽ hiện sau khi tất cả lead đã được phân loại xong.
          </div>
        )}
      </div>
    </div>
  );
}

function FunnelClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  // Only the load right after the refresh button bypasses the server row cache.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const consumedRefreshNonce = useRef(0);
  const [leadPicOptions, setLeadPicOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [subteamOptions, setSubteamOptions] = useState<{ team: string; subteams: SaleSubteam[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hanoiData, setHanoiData] = useState<HanoiFunnelResponse | null>(null);
  const [hanoiPicOptions, setHanoiPicOptions] = useState<{
    team: string;
    options: HanoiFunnelResponse["picOptions"];
  } | null>(null);
  const [hanoiLoading, setHanoiLoading] = useState(false);
  const [hanoiError, setHanoiError] = useState<string | null>(null);
  const [hanoiStageCache, setHanoiStageCache] = useState<{
    key: string;
    charts: HanoiStageCharts;
    rows: number;
    source: "session" | "summary";
  } | null>(null);
  const [hanoiStageLoading, setHanoiStageLoading] = useState(false);
  const [hanoiStageProgress, setHanoiStageProgress] = useState(0);
  const [hanoiStageError, setHanoiStageError] = useState<string | null>(null);
  const [hanoiGapStructure, setHanoiGapStructure] = useState<{ key: string; leads: GapStructureLead[] } | null>(null);
  const [hanoiGapStructureLoading, setHanoiGapStructureLoading] = useState(false);
  const [hanoiGapStructureError, setHanoiGapStructureError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<FunnelLead | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const dealerBidRows = useMemo(() => (detail ? groupDealerBidsByDealer(detail.dealerBids) : []), [detail]);
  const failureHighlights = useMemo(() => (detail ? buildFailureHighlights(detail.lead) : []), [detail]);
  const quickMonthOptions = useMemo(() => getSaleLeadQuickMonthOptions(undefined, 6), []);

  const params = useMemo(() => {
    const tab = searchParams.get("tab") === "hanoi-funnel" ? "hanoi-funnel" : "leads";
    const from = searchParams.get("from") || defaultFromInput();
    const to = searchParams.get("to") || todayInput();
    const team = normalizeSaleLeadTeamFilter(searchParams.get("team"));
    const subteam = searchParams.get("subteam") ?? "";
    const pic = searchParams.get("pic")?.split(",").filter(Boolean) ?? [];
    const stage = searchParams.get("stage")?.split(",").filter(Boolean) ?? [];
    const gap = searchParams.get("gap")?.split(",").filter(Boolean) ?? [];
    const hasImages = searchParams.get("hasImages") === "true";
    const noImages = searchParams.get("noImages") === "true";
    const inspected = searchParams.get("inspected") === "true";
    const noHumanTouch = searchParams.get("noHumanTouch") === "true";
    const underTwoBids = searchParams.get("underTwoBids") === "true";
    const hotLead = searchParams.get("hotLead") === "true";
    const southernLead = searchParams.get("southernLead") === "true";
    const needsInspectionBooking = searchParams.get("needsInspectionBooking") === "true";
    const needsPostInspectionQuote = searchParams.get("needsPostInspectionQuote") === "true";
    const filterOrder = searchParams.get("filterOrder")?.split(",").filter(Boolean) ?? [];
    const sort = (searchParams.get("sort") || "last_touch_oldest") as SortKey;
    const page = Number(searchParams.get("page") || 1);
    return {
      tab: tab as DashboardTab,
      from,
      to,
      team,
      subteam,
      pic,
      stage,
      gap,
      hasImages,
      noImages,
      inspected,
      noHumanTouch,
      underTwoBids,
      hotLead,
      southernLead,
      needsInspectionBooking,
      needsPostInspectionQuote,
      filterOrder,
      sort,
      page,
    };
  }, [searchParams]);
  const activeQuickMonth = useMemo(
    () => quickMonthOptions.find((month) => params.from === month.from && params.to === month.to)?.key ?? "",
    [params.from, params.to, quickMonthOptions],
  );

  const currentHanoiStageCacheKey = useMemo(
    () =>
      hanoiStageCacheKey({ from: params.from, to: params.to, team: params.team, subteam: params.subteam, pic: params.pic }),
    [params.from, params.to, params.team, params.subteam, params.pic.join(",")],
  );
  const resolvedHanoiStageCharts = useMemo(() => {
    if (hanoiStageCache?.key === currentHanoiStageCacheKey) return hanoiStageCache.charts;
    if (hanoiData?.snapshotMeta?.rows && hanoiData.snapshotMeta.rows > 0) {
      return {
        stageChart: hanoiData.workStageChart,
        gapChart: hanoiData.workableGapChart,
      };
    }
    return null;
  }, [currentHanoiStageCacheKey, hanoiData, hanoiStageCache]);

  const activeFilterTokensFor = (value: typeof params) => {
    const tokens: string[] = [];
    for (const key of STATUS_FILTER_KEYS) {
      if (value[key]) tokens.push(`status:${key}`);
    }
    for (const stage of value.stage) tokens.push(`stage:${stage}`);
    for (const gap of value.gap) tokens.push(`gap:${gap}`);
    return tokens;
  };

  const normalizeFilterOrder = (order: string[], activeTokens: string[]) => {
    const activeSet = new Set(activeTokens);
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const token of order) {
      if (!activeSet.has(token) || seen.has(token)) continue;
      normalized.push(token);
      seen.add(token);
    }

    for (const token of activeTokens) {
      if (seen.has(token)) continue;
      normalized.push(token);
      seen.add(token);
    }

    return normalized;
  };

  const updateParams = (patch: Partial<typeof params>, orderPatch?: string[]) => {
    const next = new URLSearchParams(searchParams.toString());
    const merged = { ...params, ...patch };
    const filterOrder = normalizeFilterOrder(orderPatch ?? merged.filterOrder, activeFilterTokensFor(merged));
    next.set("from", merged.from);
    next.set("to", merged.to);
    next.set("team", merged.team);
    if (merged.subteam) next.set("subteam", merged.subteam);
    else next.delete("subteam");
    next.set("sort", merged.sort);
    next.set("page", String(patch.page ?? 1));
    if (merged.tab === "hanoi-funnel") next.set("tab", "hanoi-funnel");
    else next.delete("tab");
    setCsvParam(next, "pic", merged.pic);
    setCsvParam(next, "stage", merged.stage);
    setCsvParam(next, "gap", merged.gap);
    if (merged.hasImages) next.set("hasImages", "true");
    else next.delete("hasImages");
    if (merged.noImages) next.set("noImages", "true");
    else next.delete("noImages");
    if (merged.inspected) next.set("inspected", "true");
    else next.delete("inspected");
    if (merged.noHumanTouch) next.set("noHumanTouch", "true");
    else next.delete("noHumanTouch");
    if (merged.underTwoBids) next.set("underTwoBids", "true");
    else next.delete("underTwoBids");
    if (merged.hotLead) next.set("hotLead", "true");
    else next.delete("hotLead");
    if (merged.southernLead) next.set("southernLead", "true");
    else next.delete("southernLead");
    if (merged.needsInspectionBooking) next.set("needsInspectionBooking", "true");
    else next.delete("needsInspectionBooking");
    if (merged.needsPostInspectionQuote) next.set("needsPostInspectionQuote", "true");
    else next.delete("needsPostInspectionQuote");
    setCsvParam(next, "filterOrder", filterOrder);
    router.replace(`/sale-leads-funnel?${next.toString()}`);
  };

  useEffect(() => {
    if (searchParams.get("from") && searchParams.get("to")) return;
    updateParams({});
  }, [searchParams, updateParams]);

  useEffect(() => {
    if (params.tab === "hanoi-funnel") {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setLoadingProgress(8);
    setError(null);
    setData(null);
    setSelectedLead(null);
    setDetail(null);
    const progressTimer = window.setInterval(() => {
      setLoadingProgress((current) => {
        if (current >= 92) return current;
        return Math.min(92, current + Math.max(2, Math.round((92 - current) * 0.18)));
      });
    }, 280);
    const url = new URL("/api/sale-leads-funnel", window.location.origin);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("team", params.team);
    url.searchParams.set("sort", params.sort);
    url.searchParams.set("page", String(params.page));
    if (params.subteam) url.searchParams.set("subteam", params.subteam);
    setCsvParam(url.searchParams, "pic", params.pic);
    setCsvParam(url.searchParams, "stage", params.stage);
    setCsvParam(url.searchParams, "gap", params.gap);
    if (params.hasImages) url.searchParams.set("hasImages", "true");
    if (params.noImages) url.searchParams.set("noImages", "true");
    if (params.inspected) url.searchParams.set("inspected", "true");
    if (params.noHumanTouch) url.searchParams.set("noHumanTouch", "true");
    if (params.underTwoBids) url.searchParams.set("underTwoBids", "true");
    if (params.hotLead) url.searchParams.set("hotLead", "true");
    if (params.southernLead) url.searchParams.set("southernLead", "true");
    if (params.needsInspectionBooking) url.searchParams.set("needsInspectionBooking", "true");
    if (params.needsPostInspectionQuote) url.searchParams.set("needsPostInspectionQuote", "true");
    setCsvParam(url.searchParams, "filterOrder", params.filterOrder);
    if (refreshNonce !== consumedRefreshNonce.current) {
      consumedRefreshNonce.current = refreshNonce;
      url.searchParams.set("fresh", "1");
    }

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<FunnelResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setLoadingProgress(100);
        setLeadPicOptions(payload.picOptions);
        setData(payload);
        const charts = buildHanoiSummaryCharts({
          stageSummary: payload.stageSummary,
          workableGapSummary: payload.workableGapSummary,
        });
        if (charts) {
          setHanoiStageCache({
            key: hanoiStageCacheKey({
              from: payload.filters.from,
              to: payload.filters.to,
              team: payload.filters.team,
              subteam: payload.filters.subteam,
              pic: payload.filters.pic,
            }),
            charts,
            rows: payload.scanned,
            source: "session",
          });
          setHanoiStageError(null);
        }
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") setError(err.message || "Không tải được dữ liệu");
      })
      .finally(() => {
        window.clearInterval(progressTimer);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      window.clearInterval(progressTimer);
      controller.abort();
    };
  }, [
    params.from,
    params.to,
    params.team,
    params.subteam,
    params.pic.join(","),
    params.stage.join(","),
    params.gap.join(","),
    params.hasImages,
    params.noImages,
    params.inspected,
    params.noHumanTouch,
    params.underTwoBids,
    params.hotLead,
    params.southernLead,
    params.needsInspectionBooking,
    params.needsPostInspectionQuote,
    params.filterOrder.join(","),
    params.sort,
    params.page,
    params.tab,
    refreshNonce,
  ]);

  useEffect(() => {
    if (params.tab !== "hanoi-funnel" || hanoiPicOptions?.team === params.team) return;

    const controller = new AbortController();
    let active = true;
    const url = new URL("/api/sale-leads-funnel/hanoi-funnel", window.location.origin);
    url.searchParams.set("team", params.team);
    url.searchParams.set("options", "pic");
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Pick<HanoiFunnelResponse, "picOptions">>;
      })
      .then((payload) => {
        if (active) setHanoiPicOptions({ team: params.team, options: payload.picOptions });
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") console.warn("Unable to load Hanoi PIC options", err);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [params.tab, params.team, hanoiPicOptions?.team]);

  useEffect(() => {
    if (subteamOptions?.team === params.team) return;

    const controller = new AbortController();
    let active = true;
    const url = new URL("/api/sale-leads-funnel/subteams", window.location.origin);
    url.searchParams.set("team", params.team);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ subteams: SaleSubteam[] }>;
      })
      .then((payload) => {
        if (active) setSubteamOptions({ team: params.team, subteams: payload.subteams });
      })
      .catch((err) => {
        if (active && err.name !== "AbortError") console.warn("Unable to load sub-teams", err);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [params.team, subteamOptions?.team]);

  useEffect(() => {
    if (params.tab !== "hanoi-funnel") return;

    const controller = new AbortController();
    setHanoiLoading(true);
    setHanoiError(null);
    const url = new URL("/api/sale-leads-funnel/hanoi-funnel", window.location.origin);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("team", params.team);
    if (params.subteam) url.searchParams.set("subteam", params.subteam);
    setCsvParam(url.searchParams, "pic", params.pic);

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<HanoiFunnelResponse>;
      })
      .then(setHanoiData)
      .catch((err) => {
        if (err.name !== "AbortError") setHanoiError(err.message || "Không tải được hanoi-funnel");
      })
      .finally(() => setHanoiLoading(false));

    return () => controller.abort();
  }, [params.tab, params.from, params.to, params.team, params.subteam, params.pic.join(",")]);

  useEffect(() => {
    if (params.tab !== "hanoi-funnel") return;
    if (hanoiStageCache?.key === currentHanoiStageCacheKey) return;
    if (hanoiData?.snapshotMeta?.rows && hanoiData.snapshotMeta.rows > 0) return;

    const controller = new AbortController();
    setHanoiStageLoading(true);
    setHanoiStageProgress(8);
    setHanoiStageError(null);
    const progressTimer = window.setInterval(() => {
      setHanoiStageProgress((current) => {
        if (current >= 92) return current;
        return Math.min(92, current + Math.max(2, Math.round((92 - current) * 0.18)));
      });
    }, 280);

    const url = new URL("/api/sale-leads-funnel", window.location.origin);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("team", params.team);
    url.searchParams.set("summary", "stage");
    if (params.subteam) url.searchParams.set("subteam", params.subteam);
    setCsvParam(url.searchParams, "pic", params.pic);

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<Pick<FunnelResponse, "filters" | "scanned" | "stageSummary" | "workableGapSummary">>;
      })
      .then((payload) => {
        const charts = buildHanoiSummaryCharts({
          stageSummary: payload.stageSummary,
          workableGapSummary: payload.workableGapSummary,
        });
        if (!charts) throw new Error("Không có dữ liệu stage/workable");
        setHanoiStageProgress(100);
        setHanoiStageCache({
          key: hanoiStageCacheKey({
            from: payload.filters.from,
            to: payload.filters.to,
            team: payload.filters.team,
            subteam: payload.filters.subteam,
            pic: payload.filters.pic,
          }),
          charts,
          rows: payload.scanned,
          source: "summary",
        });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setHanoiStageError(err.message || "Không tải được stage/workable");
      })
      .finally(() => {
        window.clearInterval(progressTimer);
        setHanoiStageLoading(false);
      });

    return () => {
      window.clearInterval(progressTimer);
      controller.abort();
    };
  }, [
    currentHanoiStageCacheKey,
    hanoiData?.snapshotMeta?.rows,
    hanoiStageCache?.key,
    params.from,
    params.pic.join(","),
    params.subteam,
    params.tab,
    params.team,
    params.to,
  ]);

  useEffect(() => {
    if (params.tab !== "hanoi-funnel") return;
    if (hanoiGapStructure?.key === currentHanoiStageCacheKey) return;

    const controller = new AbortController();
    const key = currentHanoiStageCacheKey;
    setHanoiGapStructureLoading(true);
    setHanoiGapStructureError(null);
    const url = new URL("/api/sale-leads-funnel", window.location.origin);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("team", params.team);
    url.searchParams.set("summary", "gap-structure");
    if (params.subteam) url.searchParams.set("subteam", params.subteam);
    setCsvParam(url.searchParams, "pic", params.pic);

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<{ gapStructure: { leads: GapStructureLead[] } }>;
      })
      .then((payload) => setHanoiGapStructure({ key, leads: payload.gapStructure.leads }))
      .catch((err) => {
        if (err.name !== "AbortError") setHanoiGapStructureError(err.message || "Không tải được cơ cấu gap");
      })
      .finally(() => setHanoiGapStructureLoading(false));

    return () => controller.abort();
  }, [
    currentHanoiStageCacheKey,
    hanoiGapStructure?.key,
    params.from,
    params.pic.join(","),
    params.subteam,
    params.tab,
    params.team,
    params.to,
  ]);

  useEffect(() => {
    if (!selectedLead) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    fetch(`/api/sale-leads-funnel/detail?carId=${encodeURIComponent(selectedLead.carId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<LeadDetail>;
      })
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selectedLead]);

  const toggleStatus = (key: StatusFilterKey) => {
    const token = `status:${key}`;
    const active = params[key];
    const currentOrder = normalizeFilterOrder(params.filterOrder, activeFilterTokensFor(params));
    let order = active ? currentOrder.filter((item) => item !== token) : [...currentOrder, token];
    const patch = { [key]: !active } as Partial<typeof params>;

    if (!active && key === "hasImages") {
      patch.noImages = false;
      order = order.filter((item) => item !== "status:noImages");
    }

    if (!active && key === "noImages") {
      patch.hasImages = false;
      order = order.filter((item) => item !== "status:hasImages");
    }

    updateParams(patch, order);
  };

  const toggleStage = (stage: SaleLeadWorkStage) => {
    const token = `stage:${stage}`;
    const active = params.stage.includes(stage);
    const next = params.stage.includes(stage)
      ? params.stage.filter((item) => item !== stage)
      : [...params.stage, stage];
    const currentOrder = normalizeFilterOrder(params.filterOrder, activeFilterTokensFor(params));
    const order = active ? currentOrder.filter((item) => item !== token) : [...currentOrder, token];
    updateParams({ stage: next }, order);
  };

  const toggleGap = (gap: SaleLeadGapBucket) => {
    const token = `gap:${gap}`;
    const active = params.gap.includes(gap);
    const next = params.gap.includes(gap)
      ? params.gap.filter((item) => item !== gap)
      : [...params.gap, gap];
    const currentOrder = normalizeFilterOrder(params.filterOrder, activeFilterTokensFor(params));
    const order = active ? currentOrder.filter((item) => item !== token) : [...currentOrder, token];
    updateParams({ gap: next }, order);
  };

  const copyPhone = async (phone: string | null) => {
    if (!phone) return;
    await navigator.clipboard?.writeText(phone).catch(() => undefined);
    setCopiedPhone(phone);
    window.setTimeout(() => setCopiedPhone((current) => (current === phone ? null : current)), 1200);
  };
  const picOptions =
    params.tab === "hanoi-funnel"
      ? hanoiPicOptions?.team === params.team
        ? hanoiPicOptions.options
        : hanoiData?.filters.team === params.team ? hanoiData.picOptions : []
      : leadPicOptions;
  const subteams = subteamOptions?.team === params.team ? subteamOptions.subteams : [];
  const subteamMemberIds = subteams.find((subteam) => subteam.id === params.subteam)?.memberIds;
  const visiblePicOptions = subteamMemberIds
    ? picOptions.filter((pic) => subteamMemberIds.includes(pic.id))
    : picOptions;
  const headerTotal = params.tab === "hanoi-funnel" ? hanoiData?.overview.totalLeads ?? 0 : data?.total ?? 0;
  const headerScanned = params.tab === "hanoi-funnel" ? hanoiData?.snapshotMeta?.rows ?? 0 : data?.scanned ?? 0;

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="text-lg font-semibold tracking-tight">Sale Leads Funnel</div>
            <div className="text-xs text-slate-500">
              Daily sales queue, sorted by oldest last touch by default
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => updateParams({ tab: "leads" })}
                className={classNames(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  params.tab === "leads" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800",
                )}
              >
                Leads
              </button>
              <button
                type="button"
                onClick={() => updateParams({ tab: "hanoi-funnel" })}
                className={classNames(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  params.tab === "hanoi-funnel" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800",
                )}
              >
                hanoi-funnel
              </button>
            </div>
            <span className="font-semibold">{headerTotal} lead khớp lọc</span>
            <span className="text-slate-400">{params.tab === "hanoi-funnel" ? "Snapshot" : "Đã quét"} {headerScanned}</span>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-5 py-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="space-y-2 lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
          <section className="space-y-2 rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm shadow-slate-200/50">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Bộ lọc</div>
              <button
                type="button"
                onClick={() => setRefreshNonce((value) => value + 1)}
                className="inline-flex size-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100"
                aria-label="Tải lại"
                title="Tải lại"
              >
                <RefreshCw className="size-3.5" />
              </button>
            </div>

            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Khoảng ngày
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={params.from}
                  onChange={(event) => updateParams({ from: event.target.value })}
                  className="h-8 min-w-0 rounded-md border border-slate-200 px-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                />
                <input
                  type="date"
                  value={params.to}
                  onChange={(event) => updateParams({ to: event.target.value })}
                  className="h-8 min-w-0 rounded-md border border-slate-200 px-1.5 text-xs text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Lọc nhanh
              <select
                value={activeQuickMonth}
                onChange={(event) => {
                  const selected = quickMonthOptions.find((month) => month.key === event.target.value);
                  if (selected) updateParams({ from: selected.from, to: selected.to });
                }}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">Tuỳ chỉnh</option>
                {quickMonthOptions.map((month) => (
                  <option key={month.key} value={month.key}>
                    Tháng {month.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Team
              <select
                value={params.team}
                onChange={(event) =>
                  updateParams({ team: event.target.value as SaleLeadTeamFilter, subteam: "", pic: [] })
                }
                className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
              >
                {TEAM_OPTIONS.map((team) => (
                  <option key={team.value} value={team.value}>
                    {team.label}
                  </option>
                ))}
              </select>
            </label>

            {subteams.length > 0 ? (
              <label className="grid gap-1 text-xs font-medium text-slate-500">
                Team con
                <select
                  value={params.subteam}
                  onChange={(event) => updateParams({ subteam: event.target.value, pic: [] })}
                  className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Tất cả team con</option>
                  {subteams.map((subteam) => (
                    <option key={subteam.id} value={subteam.id}>
                      {subteam.name} ({subteam.memberIds.length})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="grid gap-1 text-xs font-medium text-slate-500">
              PIC
              <select
                value={params.pic[0] || ""}
                onChange={(event) => updateParams({ pic: event.target.value ? [event.target.value] : [] })}
                className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">Tất cả PIC</option>
                {visiblePicOptions.map((pic) => (
                  <option key={pic.id} value={pic.id}>
                    {pic.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-500">
              Sắp xếp
              <select
                value={params.sort}
                onChange={(event) => updateParams({ sort: event.target.value as SortKey })}
                className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-900 outline-none transition focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {params.tab === "leads" && loading ? (
            <LeadLoadingProgress progress={loadingProgress} compact />
          ) : params.tab === "leads" && data ? (
            <>
              <section className="space-y-1.5 rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm shadow-slate-200/50">
                <CountFilterButton
                  active={
                    params.stage.length === 0 &&
                    params.gap.length === 0 &&
                    !params.hasImages &&
                    !params.noImages &&
                    !params.inspected &&
                    !params.noHumanTouch &&
                    !params.underTwoBids &&
                    !params.hotLead &&
                    !params.southernLead &&
                    !params.needsInspectionBooking &&
                    !params.needsPostInspectionQuote
                  }
                  label="Tất cả"
                  count={data?.counts?.total ?? data?.scanned ?? 0}
                  onClick={() =>
                    updateParams({
                      stage: [],
                      gap: [],
                      hasImages: false,
                      noImages: false,
                      inspected: false,
                      noHumanTouch: false,
                      underTwoBids: false,
                      hotLead: false,
                      southernLead: false,
                      needsInspectionBooking: false,
                      needsPostInspectionQuote: false,
                      filterOrder: [],
                    })
                  }
                />
              </section>

              <section className="space-y-1.5 rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm shadow-slate-200/50">
                <FilterTitle>Trạng thái</FilterTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="col-span-2 grid">
                    <CountFilterButton
                      active={params.southernLead}
                      label="Lead miền Nam"
                      count={data?.facets?.status.southernLead ?? data?.counts?.southernLead ?? 0}
                      tone="teal"
                      title="Vị trí xe thuộc Đông Nam Bộ hoặc Tây Nam Bộ, không phụ thuộc team sale."
                      onClick={() => toggleStatus("southernLead")}
                    />
                  </div>
                  <CountFilterButton
                    active={params.hasImages}
                    label="Có ảnh"
                    count={data?.facets?.status.hasImages ?? data?.counts?.hasImages ?? 0}
                    tone="teal"
                    onClick={() => toggleStatus("hasImages")}
                  />
                  <CountFilterButton
                    active={params.noImages}
                    label="Không ảnh"
                    count={data?.facets?.status.noImages ?? data?.counts?.noImages ?? 0}
                    tone="teal"
                    title="Lead chưa có ảnh xe từ Zalo hoặc kho ảnh xe."
                    onClick={() => toggleStatus("noImages")}
                  />
                  <CountFilterButton
                    active={params.inspected}
                    label="Đã KĐ"
                    count={data?.facets?.status.inspected ?? data?.counts?.inspected ?? 0}
                    tone="teal"
                    onClick={() => toggleStatus("inspected")}
                  />
                  <CountFilterButton
                    active={params.noHumanTouch}
                    label="Chưa human"
                    count={data?.facets?.status.noHumanTouch ?? data?.counts?.noHumanTouch ?? 0}
                    tone="teal"
                    title="Có Zalo chat nhưng chưa có tin nhắn từ human sale."
                    onClick={() => toggleStatus("noHumanTouch")}
                  />
                  <CountFilterButton
                    active={params.underTwoBids}
                    label="<2 bid"
                    count={data?.facets?.status.underTwoBids ?? data?.counts?.underTwoBids ?? 0}
                    tone="teal"
                    title="Có giá khách và dealer bid, nhưng dưới 2 dealer có bid hợp lệ."
                    onClick={() => toggleStatus("underTwoBids")}
                  />
                  <CountFilterButton
                    active={params.hotLead}
                    label="Hot lead"
                    count={data?.facets?.status.hotLead ?? data?.counts?.hotLead ?? 0}
                    tone="teal"
                    title="Lead được đánh dấu hot lead trong CRM."
                    onClick={() => toggleStatus("hotLead")}
                  />
                  <CountFilterButton
                    active={params.needsInspectionBooking}
                    label="Đặt KĐ"
                    count={data?.facets?.status.needsInspectionBooking ?? data?.counts?.needsInspectionBooking ?? 0}
                    tone="teal"
                    title="Lead có ảnh, trong vùng kiểm định, chưa đặt lịch và chưa kiểm định."
                    onClick={() => toggleStatus("needsInspectionBooking")}
                  />
                  <CountFilterButton
                    active={params.needsPostInspectionQuote}
                    label="Giá sau KĐ"
                    count={data?.facets?.status.needsPostInspectionQuote ?? data?.counts?.needsPostInspectionQuote ?? 0}
                    tone="teal"
                    title="Lead đã kiểm định, có bid sau KĐ, nhưng chưa báo giá sau bid đó."
                    onClick={() => toggleStatus("needsPostInspectionQuote")}
                  />
                </div>
              </section>

              <section className="space-y-1.5 rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm shadow-slate-200/50">
                <FilterTitle>Giai đoạn</FilterTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  {data?.stages.map((stage) => (
                    <CountFilterButton
                      key={stage.key}
                      active={params.stage.includes(stage.key)}
                      label={stage.shortLabel}
                      count={data?.facets?.stages?.[stage.key] ?? data?.counts?.stages?.[stage.key] ?? stage.count}
                      title={stage.description}
                      onClick={() => toggleStage(stage.key)}
                    />
                  ))}
                </div>
              </section>

              <section className="space-y-1.5 rounded-lg border border-slate-200/80 bg-white p-2.5 shadow-sm shadow-slate-200/50">
                <FilterTitle>Gap giá</FilterTitle>
                <div className="grid grid-cols-2 gap-1.5">
                  <CountFilterButton
                    active={params.gap.length === 0}
                    label="Mọi gap"
                    count={data?.facets?.groupTotals?.gaps ?? data?.facets?.total ?? data?.counts?.total ?? data?.scanned ?? 0}
                    tone="sky"
                    onClick={() => updateParams({ gap: [] }, params.filterOrder.filter((item) => !item.startsWith("gap:")))}
                  />
                  {GAP_OPTIONS.map((gap) => (
                    <CountFilterButton
                      key={gap.value}
                      active={params.gap.includes(gap.value)}
                      label={gap.label}
                      count={data?.facets?.gaps?.[gap.value] ?? data?.counts?.gaps?.[gap.value] ?? 0}
                      tone="sky"
                      onClick={() => toggleGap(gap.value)}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4">
          {data?.warnings && data.warnings.length > 0 && (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Thiếu dữ liệu trong lần tải này:{" "}
              {data.warnings.map((warning) => SALE_LEAD_DATA_WARNING_LABELS[warning] ?? warning).join(", ")}. Stage và
              các bộ lọc dựa trên nguồn này có thể chưa chính xác.
            </div>
          )}

          {params.tab === "hanoi-funnel" ? (
            <HanoiFunnelDashboard
              data={hanoiData}
              loading={hanoiLoading || (!hanoiData && !hanoiError)}
              error={hanoiError}
              stageCharts={resolvedHanoiStageCharts}
              stageLoading={hanoiStageLoading}
              stageProgress={hanoiStageProgress}
              stageError={hanoiStageError}
              gapStructureLeads={hanoiGapStructure?.key === currentHanoiStageCacheKey ? hanoiGapStructure.leads : null}
              gapStructureLoading={hanoiGapStructureLoading}
              gapStructureError={hanoiGapStructureError}
            />
          ) : (
            <>
              <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60">
                {error ? (
                  <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-red-600">
                    <Search className="size-6" />
                    {error}
                  </div>
                ) : loading || !data ? (
                  <LeadLoadingProgress progress={loadingProgress} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
                      <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Xe</th>
                          <th className="px-3 py-2">Lead</th>
                          <th className="px-3 py-2">Giai đoạn</th>
                          <th className="px-3 py-2">Gap</th>
                          <th className="px-3 py-2">Giá mong muốn</th>
                          <th className="px-3 py-2">Bid cao nhất</th>
                          <th className="px-3 py-2">Dealer</th>
                          <th className="px-3 py-2">Ảnh</th>
                          <th className="px-3 py-2">Kiểm định</th>
                          <th className="px-3 py-2">Last touch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.leads.length ? (
                          data.leads.map((lead) => (
                            <tr
                              key={lead.carId}
                              onClick={() => setSelectedLead(lead)}
                              className="cursor-pointer border-t border-slate-100 transition hover:bg-sky-50/40"
                            >
                              <td className="px-3 py-3">
                                <div className="font-medium">{lead.carName}</div>
                                <div className="text-xs text-slate-500">
                                  {lead.location || "-"} · <CalendarDays className="inline size-3" /> {formatDateTime(lead.createdAt)}
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    copyPhone(lead.phone);
                                  }}
                                  className="group inline-flex items-center gap-1.5 rounded-md px-0.5 py-0.5 text-xs font-semibold text-slate-700 transition hover:bg-sky-50 hover:text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-100"
                                  title={lead.phone ? "Copy số điện thoại" : "Không có số điện thoại"}
                                >
                                  <Phone className="size-3 text-slate-400 group-hover:text-sky-600" />
                                  {lead.phone || "-"}
                                  {lead.phone &&
                                    (copiedPhone === lead.phone ? (
                                      <Check className="size-3 text-emerald-600" />
                                    ) : (
                                      <Clipboard className="size-3 text-slate-300 group-hover:text-sky-500" />
                                    ))}
                                </button>
                                <div className="mt-1 flex max-w-[220px] items-center gap-1.5 text-sm">
                                  <span className="truncate font-medium text-slate-800">{lead.leadName}</span>
                                  <span className="shrink-0 text-slate-300">/</span>
                                  <span className="truncate text-xs text-slate-500">{lead.picName}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <StageBadge stage={lead.workStage} />
                              </td>
                              <td className="px-3 py-3 font-medium">{lead.gapLabel}</td>
                              <td className="px-3 py-3">{lead.priceCustomerLabel}</td>
                              <td className="px-3 py-3">{lead.highestBidLabel}</td>
                              <td className="px-3 py-3">{lead.highestDealerName || "-"}</td>
                              <td className="px-3 py-3">
                                {lead.hasImages ? (
                                  <span className="inline-flex items-center gap-1 text-teal-700">
                                    <Image className="size-3" />
                                    Có
                                  </span>
                                ) : (
                                  "Chưa"
                                )}
                              </td>
                              <td className="px-3 py-3">{lead.inspected ? "Đã KĐ" : lead.booked ? "Đã hẹn" : "Chưa"}</td>
                              <td className="px-3 py-3">
                                <div className="font-medium">{formatLastTouch(lead.lastTouchHours, lead.lastTouchAt)}</div>
                                <div className="text-xs text-slate-500">{formatDateTime(lead.lastTouchAt)}</div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={10} className="h-40 text-center text-slate-500">
                              Không có lead khớp bộ lọc.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={params.page <= 1}
                    onClick={() => updateParams({ page: params.page - 1 })}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Trước
                  </button>
                  <span className="text-sm text-slate-500">
                    Trang {data.page}/{data.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={params.page >= data.totalPages}
                    onClick={() => updateParams({ page: params.page + 1 })}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    Sau
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selectedLead && (
        <div className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px]" onClick={() => setSelectedLead(null)}>
          <aside
            className="ml-auto h-full w-full max-w-[760px] overflow-y-auto bg-[#fbfcfe] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur">
              <div>
                <h1 className="pr-8 text-lg font-semibold">{selectedLead.carName}</h1>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{selectedLead.leadName}</span>
                  <span>{selectedLead.phone || "Không có SĐT"}</span>
                  <span>{selectedLead.picName}</span>
                </div>
                {detail?.externalLinks?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {detail.externalLinks.map((link) => (
                      <a
                        key={link.key}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-sm shadow-slate-200/40 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      >
                        {link.label}
                        <ExternalLink className="size-3" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-100"
                aria-label="Đóng"
              >
                <X className="size-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="flex h-48 items-center justify-center text-slate-500">
                <Loader2 className="mr-2 size-5 animate-spin" />
                Đang tải chi tiết
              </div>
            ) : detail ? (
              <div className="space-y-4 px-5 pb-6">
                {detail.warnings && detail.warnings.length > 0 && (
                  <div className="mt-4 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Thiếu dữ liệu: {detail.warnings.map((warning) => SALE_LEAD_DATA_WARNING_LABELS[warning] ?? warning).join(", ")}.
                  </div>
                )}
                <section className="grid gap-2 border-b border-slate-200/80 py-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm shadow-slate-200/40">
                    <div className="text-[11px] font-medium text-slate-500">Giai đoạn phễu</div>
                    <div className="mt-1">
                      <StageBadge stage={selectedLead.workStage} />
                    </div>
                  </div>
                  <Info label="Stage CRM" value={formatCrmValue(detail.lead.crmStage)} />
                  <Info label="Qualified CRM" value={formatCrmValue(detail.lead.qualified)} />
                  <Info label="Intention CRM" value={formatCrmValue(detail.lead.intention)} />
                  <Info label="Giá khách" value={formatMillionShort(detail.lead.priceCustomer)} />
                  <Info label="Bid CRM" value={formatMillionShort(detail.lead.priceHighestBid)} />
                  <Info label="Vị trí" value={detail.lead.location || "-"} />
                  <Info label="ODO" value={detail.lead.mileage ? `${Number(detail.lead.mileage).toLocaleString("vi-VN")} km` : "-"} />
                  <Info label="Biển số" value={detail.lead.plate || "-"} />
                </section>

                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <FileText className="size-4 text-sky-700" />
                    Ghi chú
                  </h2>
                  <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-3 text-sm leading-6 text-slate-700 shadow-sm shadow-slate-200/40">
                    {detail.lead.notes || "Chưa có ghi chú."}
                  </div>
                  {(selectedLead.workStage === "failed" || detail.lead.crmStage.toUpperCase() === "FAILED") && (
                    <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm shadow-sm shadow-rose-100/60">
                      <div className="font-semibold text-rose-900">Lý do thất bại</div>
                      <p className="mt-1 leading-6 text-rose-800">{detail.lead.failureReason || "Chưa có lý do thất bại."}</p>
                      {failureHighlights.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-semibold text-rose-900">Highlights</div>
                          {failureHighlights.map((item) => (
                            <div key={item.label} className="rounded-md border border-rose-100 bg-white px-2 py-2 text-rose-900">
                              <span className="font-medium">{item.label}: </span>
                              <span>{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <ArrowDownUp className="size-4 text-amber-600" />
                    Giá dealer đã trả
                  </h2>
                  <div className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="w-12 px-3 py-2">STT</th>
                          <th className="px-3 py-2">Tên dealer</th>
                          <th className="px-3 py-2">
                            <span className="mr-1 inline-block size-1.5 rounded-full bg-blue-600 align-middle" />
                            Trước KĐ
                          </th>
                          <th className="px-3 py-2">
                            <span className="mr-1 inline-block size-1.5 rounded-full bg-amber-500 align-middle" />
                            Sau KĐ
                          </th>
                          <th className="px-3 py-2">Chênh lệch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dealerBidRows.length ? (
                          dealerBidRows.map((row, index) => (
                            <tr key={row.dealerId} className="border-t border-slate-100 align-top">
                              <td className="px-3 py-3 text-slate-500">{index + 1}</td>
                              <td className="px-3 py-3 font-medium">{row.dealerName}</td>
                              <td className="px-3 py-3">
                                <DealerBidCell bid={row.preInspection} />
                              </td>
                              <td className="px-3 py-3">
                                <DealerBidCell bid={row.postInspection} />
                              </td>
                              <td
                                className={classNames(
                                  "px-3 py-3 font-semibold",
                                  row.diff === null && "text-slate-500",
                                  row.diff !== null && row.diff > 0 && "text-emerald-700",
                                  row.diff !== null && row.diff < 0 && "text-rose-600",
                                )}
                              >
                                {formatDiff(row.diff)}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="h-16 text-center text-slate-500">
                              Chưa có bid dealer.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section>
                  <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <MessageCircle className="size-4 text-sky-700" />
                    Hội thoại Zalo
                  </h2>
                  <div className="max-h-[520px] space-y-2 overflow-y-auto rounded-lg border border-slate-200/80 bg-slate-50/70 p-3">
                    {detail.messages.length ? (
                      detail.messages.map((message) => (
                        <div
                          key={message.id}
                          className={classNames(
                            "max-w-[86%] rounded-lg border bg-white px-3 py-2 text-sm shadow-sm shadow-slate-200/40",
                            message.fromMe ? "ml-auto border-teal-100 text-slate-800" : "mr-auto border-slate-200 text-slate-900",
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{message.sender}</span>
                              <span className={classNames("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", senderTagClass(message.senderKind))}>
                                {message.senderTag}
                              </span>
                            </span>
                            <span>{formatDateTime(message.at)}</span>
                          </div>
                          {message.thumbUrl ? (
                            <a href={message.imageUrl || message.thumbUrl} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={message.thumbUrl}
                                alt="Ảnh khách gửi trên Zalo"
                                loading="lazy"
                                className="max-h-72 w-auto max-w-full border border-slate-200 object-contain"
                              />
                            </a>
                          ) : message.type === "call" ? (
                            <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-sky-700">
                                <Phone className="size-4" />
                              </span>
                              <span>
                                <span className="block font-medium">{message.content || "Cuộc gọi"}</span>
                                <span className="block text-xs text-slate-500">
                                  {message.callDurationLabel || (message.callKind === "missed" ? "Không kết nối" : "-")}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap break-words">{message.content || `[${message.type}]`}</div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="py-8 text-center text-sm text-slate-500">Không có hội thoại Zalo.</div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="px-5 py-10 text-sm text-slate-500">Không tải được chi tiết lead.</div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 shadow-sm shadow-slate-200/40">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DealerBidCell({
  bid,
}: {
  bid: ReturnType<typeof groupDealerBidsByDealer>[number]["preInspection"];
}) {
  if (!bid) {
    return <span className="text-sm italic text-slate-400">Chưa có giá</span>;
  }

  if (!hasRealDealerBidPrice(bid)) {
    return (
      <div>
        <div className="text-sm font-semibold text-slate-500">Đã chào, chưa có giá</div>
        <div className="mt-1 text-xs text-slate-400">{formatDateTime(bid.createdAt)}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="font-semibold text-blue-700">{formatVnd(bid.price)}</div>
      <div className="mt-1 text-xs text-slate-400">{formatDateTime(bid.createdAt)}</div>
    </div>
  );
}

export default function SaleLeadsFunnelPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Đang mở Sale Leads Funnel</div>}>
      <FunnelClient />
    </Suspense>
  );
}
