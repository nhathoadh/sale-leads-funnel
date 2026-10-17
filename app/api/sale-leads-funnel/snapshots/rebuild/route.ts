import { NextResponse } from "next/server";

import {
  DEFAULT_SALE_LEAD_TEAM_FILTER,
  normalizeSaleLeadTeamFilter,
} from "@/lib/sale-leads-funnel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function dateInput(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function canRunRebuild(request: Request) {
  const secret = process.env.SALE_LEADS_SNAPSHOT_SECRET;
  const authorization = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") ?? "";
  const isVercelCron = userAgent.includes("vercel-cron");

  if (!secret) return process.env.NODE_ENV !== "production" || isVercelCron;
  return isVercelCron || authorization === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!canRunRebuild(request)) {
    return NextResponse.json({ error: "Unauthorized snapshot rebuild" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.min(120, Math.max(1, Number(searchParams.get("days") || 45)));
  const defaultFrom = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const from = dateInput(searchParams.get("from"), defaultFrom);
  const to = dateInput(searchParams.get("to"), today);
  const team = normalizeSaleLeadTeamFilter(searchParams.get("team") || DEFAULT_SALE_LEAD_TEAM_FILTER);
  const pic = searchParams.get("pic");

  const target = new URL("/api/sale-leads-funnel", request.url);
  target.searchParams.set("from", from);
  target.searchParams.set("to", to);
  target.searchParams.set("team", team);
  target.searchParams.set("summary", "stage");
  target.searchParams.set("cacheSnapshots", "true");
  if (pic) target.searchParams.set("pic", pic);

  const headers: HeadersInit = {};
  if (process.env.SALE_LEADS_SNAPSHOT_SECRET) {
    headers["x-sale-leads-snapshot-secret"] = process.env.SALE_LEADS_SNAPSHOT_SECRET;
  }

  const response = await fetch(target, {
    cache: "no-store",
    headers,
  });
  const body = await response.json().catch(() => null);

  return NextResponse.json(
    {
      ok: response.ok,
      from,
      to,
      team,
      snapshotCache: body?.snapshotCache ?? null,
      scanned: body?.scanned ?? 0,
      warnings: body?.warnings ?? [],
      error: body?.error ?? null,
    },
    { status: response.ok ? 200 : response.status },
  );
}
