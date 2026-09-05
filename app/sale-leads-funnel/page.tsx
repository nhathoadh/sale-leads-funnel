"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownUp,
  CalendarDays,
  Clipboard,
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
  SALE_LEAD_STAGE_CONFIG,
  formatMillionShort,
  type SaleLeadGapBucket,
  type SaleLeadWorkStage,
} from "@/lib/sale-leads-funnel";
import { groupDealerBidsByDealer } from "@/lib/sale-leads-funnel-detail";

type SortKey = "last_touch_oldest" | "last_touch_newest" | "gap_asc" | "gap_desc" | "created_desc";

interface FunnelLead {
  leadId: string;
  carId: string;
  leadName: string;
  phone: string | null;
  picId: string | null;
  picName: string;
  carName: string;
  location: string | null;
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
    pic: string[];
    stage: SaleLeadWorkStage[];
    gap: SaleLeadGapBucket[];
    hasImages?: boolean;
    inspected?: boolean;
    noHumanTouch?: boolean;
    underTwoBids?: boolean;
    sort: SortKey;
    page: number;
    perPage: number;
  };
  total: number;
  scanned: number;
  page: number;
  perPage: number;
  totalPages: number;
  warnings?: string[];
  counts?: {
    total: number;
    stages: Record<SaleLeadWorkStage, number>;
    gaps: Record<SaleLeadGapBucket, number>;
    hasImages: number;
    inspected: number;
    noHumanTouch: number;
    underTwoBids: number;
  };
  stages: Array<(typeof SALE_LEAD_STAGE_CONFIG)[number] & { count: number }>;
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

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromInput() {
  return new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
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
      ? "border-sky-700 bg-sky-700 text-white"
      : tone === "teal"
        ? "border-teal-700 bg-teal-700 text-white"
        : "border-slate-900 bg-slate-900 text-white";

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={classNames(
        "flex h-8 min-w-0 items-center justify-between gap-2 border px-2 text-left text-xs font-medium hover:bg-slate-50",
        active ? activeClass : "border-slate-200 bg-white text-slate-800",
      )}
    >
      <span className="truncate">{label}</span>
      <span className={classNames("shrink-0 text-[11px]", active ? "text-white/75" : "text-slate-400")}>{count}</span>
    </button>
  );
}

function FilterTitle({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold text-slate-500">{children}</div>;
}

function FunnelClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<FunnelLead | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const dealerBidRows = useMemo(() => (detail ? groupDealerBidsByDealer(detail.dealerBids) : []), [detail]);
  const failureHighlights = useMemo(() => (detail ? buildFailureHighlights(detail.lead) : []), [detail]);

  const params = useMemo(() => {
    const from = searchParams.get("from") || defaultFromInput();
    const to = searchParams.get("to") || todayInput();
    const pic = searchParams.get("pic")?.split(",").filter(Boolean) ?? [];
    const stage = searchParams.get("stage")?.split(",").filter(Boolean) ?? [];
    const gap = searchParams.get("gap")?.split(",").filter(Boolean) ?? [];
    const hasImages = searchParams.get("hasImages") === "true";
    const inspected = searchParams.get("inspected") === "true";
    const noHumanTouch = searchParams.get("noHumanTouch") === "true";
    const underTwoBids = searchParams.get("underTwoBids") === "true";
    const sort = (searchParams.get("sort") || "last_touch_oldest") as SortKey;
    const page = Number(searchParams.get("page") || 1);
    return { from, to, pic, stage, gap, hasImages, inspected, noHumanTouch, underTwoBids, sort, page };
  }, [searchParams]);

  const updateParams = (patch: Partial<typeof params>) => {
    const next = new URLSearchParams(searchParams.toString());
    const merged = { ...params, ...patch };
    next.set("from", merged.from);
    next.set("to", merged.to);
    next.set("sort", merged.sort);
    next.set("page", String(patch.page ?? 1));
    setCsvParam(next, "pic", merged.pic);
    setCsvParam(next, "stage", merged.stage);
    setCsvParam(next, "gap", merged.gap);
    if (merged.hasImages) next.set("hasImages", "true");
    else next.delete("hasImages");
    if (merged.inspected) next.set("inspected", "true");
    else next.delete("inspected");
    if (merged.noHumanTouch) next.set("noHumanTouch", "true");
    else next.delete("noHumanTouch");
    if (merged.underTwoBids) next.set("underTwoBids", "true");
    else next.delete("underTwoBids");
    router.replace(`/sale-leads-funnel?${next.toString()}`);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const url = new URL("/api/sale-leads-funnel", window.location.origin);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("sort", params.sort);
    url.searchParams.set("page", String(params.page));
    setCsvParam(url.searchParams, "pic", params.pic);
    setCsvParam(url.searchParams, "stage", params.stage);
    setCsvParam(url.searchParams, "gap", params.gap);
    if (params.hasImages) url.searchParams.set("hasImages", "true");
    if (params.inspected) url.searchParams.set("inspected", "true");
    if (params.noHumanTouch) url.searchParams.set("noHumanTouch", "true");
    if (params.underTwoBids) url.searchParams.set("underTwoBids", "true");

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<FunnelResponse>;
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "Không tải được dữ liệu");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [
    params.from,
    params.to,
    params.pic.join(","),
    params.stage.join(","),
    params.gap.join(","),
    params.hasImages,
    params.inspected,
    params.noHumanTouch,
    params.underTwoBids,
    params.sort,
    params.page,
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

  const toggleStage = (stage: SaleLeadWorkStage) => {
    const next = params.stage.includes(stage)
      ? params.stage.filter((item) => item !== stage)
      : [...params.stage, stage];
    updateParams({ stage: next });
  };

  const toggleGap = (gap: SaleLeadGapBucket) => {
    const next = params.gap.includes(gap)
      ? params.gap.filter((item) => item !== gap)
      : [...params.gap, gap];
    updateParams({ gap: next });
  };

  const copyPhone = async (phone: string | null) => {
    if (!phone) return;
    await navigator.clipboard?.writeText(phone).catch(() => undefined);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div>
            <div className="text-lg font-semibold tracking-tight">Sale Leads Funnel</div>
            <div className="text-xs text-slate-500">
              Daily sales queue, sorted by oldest last touch by default
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold">{data?.total ?? 0} lead khớp lọc</span>
            <span className="text-slate-400">Đã quét {data?.scanned ?? 0}</span>
          </div>
        </div>
      </header>

      <main className="grid gap-4 px-5 py-4 lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="space-y-2 lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
          <section className="space-y-2 border border-slate-200 bg-white p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Bộ lọc</div>
              <button
                type="button"
                onClick={() => updateParams({})}
                className="inline-flex size-7 items-center justify-center border border-slate-200 text-slate-600 hover:bg-slate-50"
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
                  className="h-8 min-w-0 border border-slate-200 px-1.5 text-xs text-slate-900"
                />
                <input
                  type="date"
                  value={params.to}
                  onChange={(event) => updateParams({ to: event.target.value })}
                  className="h-8 min-w-0 border border-slate-200 px-1.5 text-xs text-slate-900"
                />
              </div>
            </label>

            <label className="grid gap-1 text-xs font-medium text-slate-500">
              PIC
              <select
                value={params.pic[0] || ""}
                onChange={(event) => updateParams({ pic: event.target.value ? [event.target.value] : [] })}
                className="h-8 border border-slate-200 px-2 text-xs text-slate-900"
              >
                <option value="">Tất cả PIC</option>
                {data?.picOptions.map((pic) => (
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
                className="h-8 border border-slate-200 px-2 text-xs text-slate-900"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="space-y-1.5 border border-slate-200 bg-white p-2.5">
            <CountFilterButton
              active={
                params.stage.length === 0 &&
                params.gap.length === 0 &&
                !params.hasImages &&
                !params.inspected &&
                !params.noHumanTouch &&
                !params.underTwoBids
              }
              label="Tất cả"
              count={data?.counts?.total ?? data?.scanned ?? 0}
              onClick={() =>
                updateParams({
                  stage: [],
                  gap: [],
                  hasImages: false,
                  inspected: false,
                  noHumanTouch: false,
                  underTwoBids: false,
                })
              }
            />
          </section>

          <section className="space-y-1.5 border border-slate-200 bg-white p-2.5">
            <FilterTitle>Trạng thái</FilterTitle>
            <div className="grid grid-cols-2 gap-1.5">
              <CountFilterButton
                active={params.hasImages}
                label="Có ảnh"
                count={data?.counts?.hasImages ?? 0}
                tone="teal"
                onClick={() => updateParams({ hasImages: !params.hasImages })}
              />
              <CountFilterButton
                active={params.inspected}
                label="Đã KĐ"
                count={data?.counts?.inspected ?? 0}
                tone="teal"
                onClick={() => updateParams({ inspected: !params.inspected })}
              />
              <CountFilterButton
                active={params.noHumanTouch}
                label="Chưa human"
                count={data?.counts?.noHumanTouch ?? 0}
                tone="teal"
                title="Có Zalo chat nhưng chưa có tin nhắn từ human sale."
                onClick={() => updateParams({ noHumanTouch: !params.noHumanTouch })}
              />
              <CountFilterButton
                active={params.underTwoBids}
                label="<2 bid"
                count={data?.counts?.underTwoBids ?? 0}
                tone="teal"
                title="Có giá khách và dealer bid, nhưng dưới 2 dealer có bid hợp lệ."
                onClick={() => updateParams({ underTwoBids: !params.underTwoBids })}
              />
            </div>
          </section>

          <section className="space-y-1.5 border border-slate-200 bg-white p-2.5">
            <FilterTitle>Giai đoạn</FilterTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {data?.stages.map((stage) => (
                <CountFilterButton
                  key={stage.key}
                  active={params.stage.includes(stage.key)}
                  label={stage.shortLabel}
                  count={data?.counts?.stages?.[stage.key] ?? stage.count}
                  title={stage.description}
                  onClick={() => toggleStage(stage.key)}
                />
              ))}
            </div>
          </section>

          <section className="space-y-1.5 border border-slate-200 bg-white p-2.5">
            <FilterTitle>Gap giá</FilterTitle>
            <div className="grid grid-cols-2 gap-1.5">
              <CountFilterButton
                active={params.gap.length === 0}
                label="Mọi gap"
                count={data?.counts?.total ?? data?.scanned ?? 0}
                tone="sky"
                onClick={() => updateParams({ gap: [] })}
              />
              {GAP_OPTIONS.map((gap) => (
                <CountFilterButton
                  key={gap.value}
                  active={params.gap.includes(gap.value)}
                  label={gap.label}
                  count={data?.counts?.gaps?.[gap.value] ?? 0}
                  tone="sky"
                  onClick={() => toggleGap(gap.value)}
                />
              ))}
            </div>
          </section>
        </aside>

        <div className="min-w-0 space-y-4">
          {data?.warnings?.includes("zalo_unavailable") && (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Không kết nối được dữ liệu Zalo trong lần tải này; nhóm stage dựa trên hội thoại có thể chưa chính xác.
            </div>
          )}

          <section className="overflow-hidden border border-slate-200 bg-white">
            {error ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-red-600">
                <Search className="size-6" />
                {error}
              </div>
            ) : loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 size-5 animate-spin" />
                Đang tải dữ liệu
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse text-sm">
                  <thead className="bg-slate-100 text-left text-xs font-semibold text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Xe</th>
                      <th className="px-3 py-2">Lead</th>
                      <th className="px-3 py-2">SĐT</th>
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
                          className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                        >
                          <td className="px-3 py-3">
                            <div className="font-medium">{lead.carName}</div>
                            <div className="text-xs text-slate-500">
                              {lead.location || "-"} · <CalendarDays className="inline size-3" /> {formatDateTime(lead.createdAt)}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{lead.leadName}</div>
                            <div className="text-xs text-slate-500">{lead.picName}</div>
                          </td>
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                copyPhone(lead.phone);
                              }}
                              className="inline-flex items-center gap-1 border border-slate-200 px-2 py-1 hover:bg-white"
                            >
                              <Phone className="size-3" />
                              {lead.phone || "-"}
                              {lead.phone && <Clipboard className="size-3 text-slate-400" />}
                            </button>
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
                            <div className="text-xs text-slate-500">{stageLabel(lead.workStage)}</div>
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
                className="border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
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
                className="border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </main>

      {selectedLead && (
        <div className="fixed inset-0 z-40 bg-slate-950/20" onClick={() => setSelectedLead(null)}>
          <aside
            className="ml-auto h-full w-full max-w-[760px] overflow-y-auto bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h1 className="pr-8 text-lg font-semibold">{selectedLead.carName}</h1>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>{selectedLead.leadName}</span>
                  <span>{selectedLead.phone || "Không có SĐT"}</span>
                  <span>{selectedLead.picName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="inline-flex size-8 items-center justify-center border border-slate-200 hover:bg-slate-50"
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
                <section className="grid gap-2 border-b border-slate-200 py-4 sm:grid-cols-3">
                  <Info label="Stage" value={stageLabel(selectedLead.workStage)} />
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
                  <div className="border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                    {detail.lead.notes || "Chưa có ghi chú."}
                  </div>
                  {(selectedLead.workStage === "failed" || detail.lead.crmStage.toUpperCase() === "FAILED") && (
                    <div className="mt-2 border border-rose-200 bg-rose-50 px-3 py-3 text-sm">
                      <div className="font-semibold text-rose-900">Lý do thất bại</div>
                      <p className="mt-1 leading-6 text-rose-800">{detail.lead.failureReason || "Chưa có lý do thất bại."}</p>
                      {failureHighlights.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="text-xs font-semibold text-rose-900">Highlights</div>
                          {failureHighlights.map((item) => (
                            <div key={item.label} className="border border-rose-100 bg-white px-2 py-2 text-rose-900">
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
                  <div className="overflow-hidden border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 text-left text-xs text-slate-500">
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
                  <div className="max-h-[520px] space-y-2 overflow-y-auto border border-slate-200 bg-slate-50 p-3">
                    {detail.messages.length ? (
                      detail.messages.map((message) => (
                        <div
                          key={message.id}
                          className={classNames(
                            "max-w-[86%] border bg-white px-3 py-2 text-sm",
                            message.fromMe ? "ml-auto border-teal-200 text-slate-800" : "mr-auto border-slate-200 text-slate-900",
                          )}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{message.sender}</span>
                              <span className={classNames("shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold", senderTagClass(message.senderKind))}>
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
                            <div className="inline-flex items-center gap-2 rounded-none border border-slate-200 bg-slate-50 px-3 py-2">
                              <span className="inline-flex size-8 items-center justify-center border border-slate-200 bg-white text-sky-700">
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
    <div className="border border-slate-200 bg-slate-50 px-3 py-2">
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
