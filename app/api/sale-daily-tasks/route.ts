import { NextResponse } from "next/server";

import {
  buildSaleDailyTasks,
  getSaleDailyTaskSummary,
  getSaleDailyTaskTypeOrder,
  type SaleDailyTask,
  type SaleDailyTaskStatus,
  type SaleDailyTaskType,
} from "@/lib/sale-daily-tasks";

export const dynamic = "force-dynamic";

const DAILY_TASK_STATUSES: SaleDailyTaskStatus[] = ["overdue", "due_today", "todo", "completed_signal"];
const DEFAULT_PAGE_SIZE = 100;
const MAX_FETCH_PAGES = 30;

function dateInput(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function parseCsv(value: string | null) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function defaultFrom(to: string) {
  const date = new Date(`${to}T00:00:00+07:00`);
  date.setDate(date.getDate() - 29);
  return date.toISOString().slice(0, 10);
}

function setCsv(params: URLSearchParams, key: string, values: string[]) {
  if (values.length > 0) params.set(key, values.join(","));
}

function isTaskType(value: string): value is SaleDailyTaskType {
  return (getSaleDailyTaskTypeOrder() as string[]).includes(value);
}

function isTaskStatus(value: string): value is SaleDailyTaskStatus {
  return (DAILY_TASK_STATUSES as string[]).includes(value);
}

async function fetchFunnelPage(origin: string, args: { from: string; to: string; picIds: string[]; page: number }) {
  const url = new URL("/api/sale-leads-funnel", origin);
  url.searchParams.set("from", args.from);
  url.searchParams.set("to", args.to);
  url.searchParams.set("sort", "last_touch_oldest");
  url.searchParams.set("page", String(args.page));
  url.searchParams.set("perPage", String(DEFAULT_PAGE_SIZE));
  setCsv(url.searchParams, "pic", args.picIds);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.details || body?.error || `HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchAllFunnelLeads(origin: string, args: { from: string; to: string; picIds: string[] }) {
  const first = await fetchFunnelPage(origin, { ...args, page: 1 });
  const leads = [...(first.leads ?? [])];
  const totalPages = Math.min(Number(first.totalPages ?? 1), MAX_FETCH_PAGES);

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await fetchFunnelPage(origin, { ...args, page });
    leads.push(...(result.leads ?? []));
  }

  return {
    leads,
    scanned: first.scanned ?? leads.length,
    warnings: first.warnings ?? [],
    picOptions: first.picOptions ?? [],
    capped: Number(first.totalPages ?? 1) > MAX_FETCH_PAGES,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const today = todayInVietnam();
    const to = dateInput(url.searchParams.get("to"), today);
    const from = dateInput(url.searchParams.get("from"), defaultFrom(to));
    const picIds = parseCsv(url.searchParams.get("pic"));
    const typeFilter = parseCsv(url.searchParams.get("type")).filter(isTaskType);
    const statusFilter = parseCsv(url.searchParams.get("status")).filter(isTaskStatus);
    const includeCompleted = url.searchParams.get("includeCompleted") === "true";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const perPage = Math.min(100, Math.max(10, Number(url.searchParams.get("perPage") || 50)));

    const optionSource = picIds.length > 0 ? await fetchAllFunnelLeads(url.origin, { from, to, picIds: [] }) : null;
    const source = await fetchAllFunnelLeads(url.origin, { from, to, picIds });
    const allTasks = buildSaleDailyTasks(source.leads, { businessDate: today });
    const visibleTasks = allTasks.filter((task) => {
      const typeOk = typeFilter.length === 0 || typeFilter.includes(task.type);
      const statusOk = statusFilter.length === 0 || statusFilter.includes(task.status);
      const completedOk = includeCompleted || task.status !== "completed_signal";
      return typeOk && statusOk && completedOk;
    });
    const start = (page - 1) * perPage;
    const tasks = visibleTasks.slice(start, start + perPage);

    const typeCounts = Object.fromEntries(getSaleDailyTaskTypeOrder().map((type) => [type, 0])) as Record<SaleDailyTaskType, number>;
    const statusCounts = Object.fromEntries(DAILY_TASK_STATUSES.map((status) => [status, 0])) as Record<SaleDailyTaskStatus, number>;
    for (const task of allTasks) {
      typeCounts[task.type] += 1;
      statusCounts[task.status] += 1;
    }

    return NextResponse.json({
      filters: { from, to, pic: picIds, type: typeFilter, status: statusFilter, includeCompleted, page, perPage },
      generatedAt: new Date().toISOString(),
      businessDate: today,
      scanned: source.scanned,
      warnings: source.capped ? [...source.warnings, "daily_tasks_page_cap"] : source.warnings,
      summary: getSaleDailyTaskSummary(allTasks),
      counts: {
        type: typeCounts,
        status: statusCounts,
      },
      page,
      perPage,
      total: visibleTasks.length,
      totalPages: Math.max(1, Math.ceil(visibleTasks.length / perPage)),
      picOptions: optionSource?.picOptions ?? source.picOptions,
      tasks: tasks satisfies SaleDailyTask[],
    });
  } catch (error) {
    console.error("[sale-daily-tasks] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sale daily tasks", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
