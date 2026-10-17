"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  Clock3,
  Flame,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";

import type { SaleDailyTaskStatus, SaleDailyTaskType } from "@/lib/sale-daily-tasks";

type DailyTaskPriority = "P0" | "P1" | "P2" | "P3";

interface DailyTaskLead {
  leadId: string;
  carId: string;
  leadName: string;
  phone: string | null;
  picId: string | null;
  picName: string;
  carName: string;
  location: string | null;
  createdAt: string;
  gapPercent: number | null;
  hotLead: boolean;
  dealerBidDealerCount: number;
  lastTouchAt: string | null;
  priceCustomerLabel: string;
  highestBidLabel: string;
  gapLabel: string;
}

interface DailyTask {
  id: string;
  type: SaleDailyTaskType;
  typeLabel: string;
  actionLabel: string;
  priority: DailyTaskPriority;
  status: SaleDailyTaskStatus;
  statusLabel: string;
  dueAt: string | null;
  slaLabel: string;
  reason: string;
  lead: DailyTaskLead;
}

interface DailyTaskResponse {
  filters: {
    from: string;
    to: string;
    pic: string[];
    type: SaleDailyTaskType[];
    status: SaleDailyTaskStatus[];
    includeCompleted: boolean;
    page: number;
    perPage: number;
  };
  generatedAt: string;
  businessDate: string;
  scanned: number;
  summary: {
    total: number;
    open: number;
    overdue: number;
    dueToday: number;
    completedSignal: number;
    byType: Record<SaleDailyTaskType, number>;
  };
  counts: {
    type: Record<SaleDailyTaskType, number>;
    status: Record<SaleDailyTaskStatus, number>;
  };
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  picOptions: Array<{ id: string; name: string }>;
  tasks: DailyTask[];
  warnings?: string[];
}

const TASK_TYPE_OPTIONS: Array<{ value: SaleDailyTaskType; label: string }> = [
  { value: "follow_up_low_gap_quote", label: "Follow up gap thấp" },
  { value: "price_under_two_bids", label: "Chào giá <2 bid" },
  { value: "quote_two_plus_bids", label: "Trả giá ≥2 bid" },
  { value: "post_inspection_quote", label: "Giá sau KĐ" },
];

const STATUS_OPTIONS: Array<{ value: SaleDailyTaskStatus; label: string }> = [
  { value: "overdue", label: "Quá hạn" },
  { value: "due_today", label: "Hôm nay" },
  { value: "todo", label: "Sắp tới" },
  { value: "completed_signal", label: "Có tín hiệu" },
];

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function defaultFromInput() {
  return new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
}

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function setCsvParam(params: URLSearchParams, key: string, values: string[]) {
  if (values.length > 0) params.set(key, values.join(","));
  else params.delete(key);
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

function formatRelativeDue(value: string | null) {
  if (!value) return "Chưa có hạn";
  const diffHours = (new Date(value).getTime() - Date.now()) / 3_600_000;
  if (diffHours < -24) return `Trễ ${Math.round(Math.abs(diffHours) / 24)} ngày`;
  if (diffHours < 0) return `Trễ ${Math.max(1, Math.round(Math.abs(diffHours)))} giờ`;
  if (diffHours < 24) return `Còn ${Math.max(1, Math.round(diffHours))} giờ`;
  return `${formatDateTime(value)}`;
}

function priorityClass(priority: DailyTaskPriority) {
  if (priority === "P0") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "P1") return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "P2") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function statusClass(status: SaleDailyTaskStatus) {
  if (status === "overdue") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "completed_signal") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "due_today") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-white text-slate-600";
}

function MetricCard({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "rose" | "blue" | "emerald" }) {
  const toneClass =
    tone === "rose"
      ? "bg-rose-50 text-rose-700"
      : tone === "blue"
        ? "bg-blue-50 text-blue-700"
        : tone === "emerald"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-50 text-slate-700";
  return (
    <div className={classNames("rounded-xl border border-slate-200 p-4", toneClass)}>
      <div className="text-3xl font-semibold tracking-tight">{value.toLocaleString("vi-VN")}</div>
      <div className="mt-1 text-sm font-medium opacity-75">{label}</div>
    </div>
  );
}

function FilterPill({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-100",
        active ? "border-sky-200 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
      )}
    >
      <span className="truncate">{label}</span>
      <span className={classNames("text-xs", active ? "text-sky-500" : "text-slate-400")}>{count}</span>
    </button>
  );
}

function DailyTasksClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<DailyTaskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const params = useMemo(() => {
    const from = searchParams.get("from") || defaultFromInput();
    const to = searchParams.get("to") || todayInput();
    const pic = searchParams.get("pic")?.split(",").filter(Boolean) ?? [];
    const type = searchParams.get("type")?.split(",").filter(Boolean) as SaleDailyTaskType[] | undefined;
    const status = searchParams.get("status")?.split(",").filter(Boolean) as SaleDailyTaskStatus[] | undefined;
    const includeCompleted = searchParams.get("includeCompleted") === "true";
    const page = Number(searchParams.get("page") || 1);
    return { from, to, pic, type: type ?? [], status: status ?? [], includeCompleted, page };
  }, [searchParams]);

  const updateParams = (patch: Partial<typeof params>) => {
    const next = new URLSearchParams(searchParams.toString());
    const merged = { ...params, ...patch };
    next.set("from", merged.from);
    next.set("to", merged.to);
    next.set("page", String(patch.page ?? 1));
    setCsvParam(next, "pic", merged.pic);
    setCsvParam(next, "type", merged.type);
    setCsvParam(next, "status", merged.status);
    if (merged.includeCompleted) next.set("includeCompleted", "true");
    else next.delete("includeCompleted");
    router.replace(`/sale-daily-tasks?${next.toString()}`);
  };

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const url = new URL("/api/sale-daily-tasks", window.location.origin);
    url.searchParams.set("from", params.from);
    url.searchParams.set("to", params.to);
    url.searchParams.set("page", String(params.page));
    setCsvParam(url.searchParams, "pic", params.pic);
    setCsvParam(url.searchParams, "type", params.type);
    setCsvParam(url.searchParams, "status", params.status);
    if (params.includeCompleted) url.searchParams.set("includeCompleted", "true");

    fetch(url.toString(), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
        }
        return response.json() as Promise<DailyTaskResponse>;
      })
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || "Không tải được việc hôm nay");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [params.from, params.to, params.pic.join(","), params.type.join(","), params.status.join(","), params.includeCompleted, params.page]);

  const toggleType = (type: SaleDailyTaskType) => {
    updateParams({ type: params.type.includes(type) ? params.type.filter((item) => item !== type) : [...params.type, type] });
  };

  const toggleStatus = (status: SaleDailyTaskStatus) => {
    updateParams({ status: params.status.includes(status) ? params.status.filter((item) => item !== status) : [...params.status, status] });
  };

  const copyPhone = async (phone: string | null) => {
    if (!phone) return;
    await navigator.clipboard?.writeText(phone).catch(() => undefined);
    setCopiedPhone(phone);
    window.setTimeout(() => setCopiedPhone((current) => (current === phone ? null : current)), 1200);
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Việc hôm nay</h1>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                {data?.businessDate ?? todayInput()}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Queue nhắc sale xử lý đúng hạn, ưu tiên theo rule vận hành.</p>
          </div>
          <a
            href="/sale-leads-funnel"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Mở funnel <ArrowUpRight className="size-4" />
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-5 px-6 py-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-5 lg:max-h-[calc(100vh-40px)] lg:overflow-y-auto">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold">Bộ lọc</div>
              <button
                type="button"
                onClick={() => updateParams({})}
                className="inline-flex size-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                title="Tải lại"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="grid gap-1 text-sm font-medium text-slate-500">
                Khoảng ngày
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={params.from}
                    onChange={(event) => updateParams({ from: event.target.value })}
                    className="h-10 min-w-0 rounded-lg border border-slate-200 px-2 text-sm text-slate-900 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                  <input
                    type="date"
                    value={params.to}
                    onChange={(event) => updateParams({ to: event.target.value })}
                    className="h-10 min-w-0 rounded-lg border border-slate-200 px-2 text-sm text-slate-900 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-500">
                PIC
                <select
                  value={params.pic[0] || ""}
                  onChange={(event) => updateParams({ pic: event.target.value ? [event.target.value] : [] })}
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="">Tất cả PIC</option>
                  {data?.picOptions.map((pic) => (
                    <option key={pic.id} value={pic.id}>
                      {pic.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                Hiện việc có tín hiệu
                <input
                  type="checkbox"
                  checked={params.includeCompleted}
                  onChange={(event) => updateParams({ includeCompleted: event.target.checked })}
                  className="size-4 accent-sky-600"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="mb-3 text-sm font-semibold text-slate-500">Trạng thái</div>
            <div className="grid gap-2">
              {STATUS_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  active={params.status.includes(option.value)}
                  label={option.label}
                  count={data?.counts.status[option.value] ?? 0}
                  onClick={() => toggleStatus(option.value)}
                />
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="mb-3 text-sm font-semibold text-slate-500">Nhóm việc</div>
            <div className="grid gap-2">
              {TASK_TYPE_OPTIONS.map((option) => (
                <FilterPill
                  key={option.value}
                  active={params.type.includes(option.value)}
                  label={option.label}
                  count={data?.counts.type[option.value] ?? 0}
                  onClick={() => toggleType(option.value)}
                />
              ))}
            </div>
          </section>
        </aside>

        <section className="space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard label="Cần theo dõi" value={data?.summary.open ?? 0} tone="slate" />
            <MetricCard label="Quá hạn" value={data?.summary.overdue ?? 0} tone="rose" />
            <MetricCard label="Đến hạn hôm nay" value={data?.summary.dueToday ?? 0} tone="blue" />
            <MetricCard label="Có tín hiệu đã làm" value={data?.summary.completedSignal ?? 0} tone="emerald" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="text-base font-semibold">Priority queue</div>
                <div className="text-sm text-slate-500">
                  {loading ? "Đang tải dữ liệu..." : `${data?.total ?? 0} việc khớp lọc, quét ${data?.scanned ?? 0} lead`}
                </div>
              </div>
              {data?.warnings?.length ? (
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                  <AlertCircle className="size-4" /> Dữ liệu có cảnh báo
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="p-10 text-center text-sm font-semibold text-rose-600">{error}</div>
            ) : loading ? (
              <div className="flex items-center justify-center gap-3 p-16 text-slate-500">
                <Loader2 className="size-5 animate-spin" /> Đang dựng queue hôm nay
              </div>
            ) : data?.tasks.length ? (
              <div className="divide-y divide-slate-100">
                {data.tasks.map((task) => (
                  <article key={task.id} className="grid gap-4 p-4 transition hover:bg-slate-50/70 xl:grid-cols-[180px_minmax(0,1fr)_260px]">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-bold", priorityClass(task.priority))}>
                          {task.priority}
                        </span>
                        <span className={classNames("rounded-full border px-2.5 py-1 text-xs font-bold", statusClass(task.status))}>
                          {task.statusLabel}
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{task.typeLabel}</div>
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <Clock3 className="size-4" />
                        {formatRelativeDue(task.dueAt)}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold tracking-tight text-slate-950">{task.lead.carName}</h2>
                        {task.lead.hotLead ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700">
                            <Flame className="size-3" /> Hot
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                        <button
                          type="button"
                          onClick={() => copyPhone(task.lead.phone)}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-sky-700"
                        >
                          {task.lead.phone || "Chưa có SĐT"}
                          <Clipboard className="size-3.5" />
                        </button>
                        <span>{task.lead.leadName}</span>
                        <span>{task.lead.picName}</span>
                        {task.lead.location ? <span>{task.lead.location}</span> : null}
                        {copiedPhone === task.lead.phone ? <span className="font-semibold text-emerald-600">Đã copy</span> : null}
                      </div>
                      <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">{task.reason}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">Giá khách {task.lead.priceCustomerLabel}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">Bid cao nhất {task.lead.highestBidLabel}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">Gap {task.lead.gapLabel}</span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1">{task.lead.dealerBidDealerCount} dealer bid</span>
                      </div>
                    </div>

                    <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                          {task.status === "completed_signal" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CalendarClock className="size-4 text-sky-600" />}
                          {task.actionLabel}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">{task.slaLabel}</div>
                        <div className="mt-2 text-xs text-slate-400">Deadline {formatDateTime(task.dueAt)}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {task.lead.phone ? (
                          <a
                            href={`https://dashboard.vucar.vn/crm-v2?search=${encodeURIComponent(task.lead.phone)}&searchType=lead`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            CRM <ArrowUpRight className="size-3" />
                          </a>
                        ) : null}
                        {task.lead.phone && task.lead.picId ? (
                          <a
                            href={`https://e2e-management.vucar.vn/e2e/${encodeURIComponent(task.lead.picId)}?search=${encodeURIComponent(task.lead.phone)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            E2E <ArrowUpRight className="size-3" />
                          </a>
                        ) : null}
                        <a
                          href={`/sale-leads-funnel?from=${encodeURIComponent(params.from)}&to=${encodeURIComponent(params.to)}${task.lead.picId ? `&pic=${encodeURIComponent(task.lead.picId)}` : ""}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Funnel <MessageCircle className="size-3" />
                        </a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-16 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="mt-3 text-base font-semibold">Không có việc khớp lọc</div>
                <div className="mt-1 text-sm text-slate-500">Thử mở rộng khoảng ngày hoặc bật hiển thị việc có tín hiệu.</div>
              </div>
            )}
          </div>

          {data && data.totalPages > 1 ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={params.page <= 1}
                onClick={() => updateParams({ page: Math.max(1, params.page - 1) })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Trước
              </button>
              <span className="text-sm font-semibold text-slate-500">
                {data.page}/{data.totalPages}
              </span>
              <button
                type="button"
                disabled={params.page >= data.totalPages}
                onClick={() => updateParams({ page: params.page + 1 })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

export default function SaleDailyTasksPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-50 text-slate-500">
          <Loader2 className="size-5 animate-spin" /> Đang tải việc hôm nay
        </div>
      }
    >
      <DailyTasksClient />
    </Suspense>
  );
}
