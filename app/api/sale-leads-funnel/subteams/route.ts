import { NextResponse } from "next/server";

import { normalizeSaleLeadTeamFilter } from "@/lib/sale-leads-funnel";
import { loadSaleSubteams } from "@/lib/sale-subteams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const team = normalizeSaleLeadTeamFilter(new URL(request.url).searchParams.get("team"));
  try {
    return NextResponse.json({ team, subteams: await loadSaleSubteams(team) });
  } catch (error) {
    console.warn("[sale-leads-funnel] subteams unavailable:", error instanceof Error ? error.message : error);
    return NextResponse.json({ team, subteams: [], error: "subteams_unavailable" }, { status: 503 });
  }
}
