import fs from "node:fs/promises";
import path from "node:path";

import {
  SALE_LEAD_STAGE_CONFIG,
  buildSaleLeadStageSummary,
  buildSaleLeadWorkableGapSummary,
  type SaleLeadGapBucket,
  type SaleLeadStageSummary,
  type SaleLeadTeamFilter,
  type SaleLeadWorkStage,
  type SaleLeadWorkableGapSummary,
} from "@/lib/sale-leads-funnel";

export const SALE_LEAD_FUNNEL_SNAPSHOT_TABLE = "sale_leads_funnel_snapshots";

export const CREATE_SALE_LEAD_FUNNEL_SNAPSHOT_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS sale_leads_funnel_snapshots (
    car_id uuid PRIMARY KEY,
    lead_id uuid NOT NULL,
    phone text,
    team text NOT NULL,
    pic_id uuid,
    pic_name text,
    car_created_at timestamptz NOT NULL,
    work_stage text NOT NULL,
    gap_bucket text NOT NULL,
    has_images boolean NOT NULL DEFAULT false,
    inspected boolean NOT NULL DEFAULT false,
    no_human_touch boolean NOT NULL DEFAULT false,
    under_two_bids boolean NOT NULL DEFAULT false,
    hot_lead boolean NOT NULL DEFAULT false,
    needs_inspection_booking boolean NOT NULL DEFAULT false,
    needs_post_inspection_quote boolean NOT NULL DEFAULT false,
    last_touch_at timestamptz,
    source_updated_at timestamptz,
    computed_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE INDEX IF NOT EXISTS sale_leads_funnel_snapshots_team_created_idx
    ON sale_leads_funnel_snapshots (team, car_created_at DESC);
  CREATE INDEX IF NOT EXISTS sale_leads_funnel_snapshots_pic_created_idx
    ON sale_leads_funnel_snapshots (pic_id, car_created_at DESC);
  CREATE INDEX IF NOT EXISTS sale_leads_funnel_snapshots_source_updated_idx
    ON sale_leads_funnel_snapshots (source_updated_at DESC);
`;

export interface SaleLeadSnapshotSummaryRow {
  workStage: SaleLeadWorkStage;
  gapBucket: SaleLeadGapBucket;
  hasImages: boolean;
}

export interface SaleLeadSnapshotDailyRow extends SaleLeadSnapshotSummaryRow {
  carId: string;
  leadId: string;
  picId: string | null;
  day: string;
  qualified: string | null;
}

export interface SaleLeadSnapshotDbRow extends SaleLeadSnapshotSummaryRow {
  carId: string;
  leadId: string;
  phone: string | null;
  team: SaleLeadTeamFilter;
  picId: string | null;
  picName: string | null;
  carCreatedAt: string;
  inspected: boolean;
  noHumanTouch: boolean;
  underTwoBids: boolean;
  hotLead: boolean;
  needsInspectionBooking: boolean;
  needsPostInspectionQuote: boolean;
  lastTouchAt: string | null;
  sourceUpdatedAt: string | null;
  payload?: Record<string, unknown>;
}

export interface SaleLeadSnapshotSummaries {
  stageSummary: SaleLeadStageSummary;
  workableGapSummary: SaleLeadWorkableGapSummary;
}

export interface SaleLeadSnapshotFileRow extends SaleLeadSnapshotSummaryRow {
  car_id: string;
  lead_id: string;
  phone: string | null;
  team: SaleLeadTeamFilter | string;
  pic_id: string | null;
  pic_name: string | null;
  car_created_at: string;
  inspected: boolean;
  no_human_touch: boolean;
  under_two_bids: boolean;
  hot_lead: boolean;
  needs_inspection_booking: boolean;
  needs_post_inspection_quote: boolean;
  last_touch_at: string | null;
  source_updated_at: string | null;
  computed_at?: string;
  payload?: Record<string, unknown>;
}

export function buildSaleLeadSnapshotSummaries(rows: SaleLeadSnapshotSummaryRow[]): SaleLeadSnapshotSummaries {
  const stageCounts = Object.fromEntries(SALE_LEAD_STAGE_CONFIG.map((stage) => [stage.key, 0])) as Record<SaleLeadWorkStage, number>;

  for (const row of rows) {
    stageCounts[row.workStage] = (stageCounts[row.workStage] ?? 0) + 1;
  }

  return {
    stageSummary: buildSaleLeadStageSummary({
      total: rows.length,
      stages: stageCounts,
    }),
    workableGapSummary: buildSaleLeadWorkableGapSummary(
      rows.map((row) => ({
        workStage: row.workStage,
        gapBucket: row.gapBucket,
        hasImages: row.hasImages,
        inspected: false,
        noHumanTouch: false,
        underTwoBids: false,
        hotLead: false,
        needsInspectionBooking: false,
        needsPostInspectionQuote: false,
      })),
    ),
  };
}

export function mapSnapshotDbRow(row: Record<string, unknown>): SaleLeadSnapshotSummaryRow {
  return {
    workStage: row.work_stage as SaleLeadWorkStage,
    gapBucket: row.gap_bucket as SaleLeadGapBucket,
    hasImages: row.has_images === true,
  };
}

function snapshotFilePath() {
  return process.env.SALE_LEADS_SNAPSHOT_FILE || path.join("/tmp", "sale-leads-funnel-snapshots.json");
}

function inDateRange(value: string, from: string, to: string) {
  const day = value.slice(0, 10);
  return day >= from && day <= to;
}

async function readSnapshotFileRows(): Promise<SaleLeadSnapshotFileRow[]> {
  try {
    const raw = await fs.readFile(snapshotFilePath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.rows) ? parsed.rows : [];
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function writeSaleLeadSnapshotFile(input: {
  rows: SaleLeadSnapshotFileRow[];
  from: string;
  to: string;
  team: string;
  picIds: string[];
}) {
  const existing = await readSnapshotFileRows();
  const picSet = new Set(input.picIds);
  const kept = existing.filter((row) => {
    const sameTeam = String(row.team).toUpperCase() === input.team.toUpperCase();
    const sameDateRange = inDateRange(row.car_created_at, input.from, input.to);
    const samePic = input.picIds.length === 0 || (row.pic_id !== null && picSet.has(row.pic_id));
    return !(sameTeam && sameDateRange && samePic);
  });
  const computedAt = new Date().toISOString();
  const rows = [...kept, ...input.rows.map((row) => ({ ...row, computed_at: computedAt }))];

  await fs.mkdir(path.dirname(snapshotFilePath()), { recursive: true });
  await fs.writeFile(snapshotFilePath(), JSON.stringify({ rows }, null, 2));

  return { written: input.rows.length, computedAt, path: snapshotFilePath() };
}

export async function readSaleLeadSnapshotFileSummaries(input: {
  from: string;
  to: string;
  team: string;
  pic: string[];
}): Promise<(SaleLeadSnapshotSummaries & { rows: number; computedAt: string | null; storage: "file" }) | null> {
  const rows = await readSnapshotFileRows();
  const picSet = new Set(input.pic);
  const filtered = rows.filter((row) => {
    if (String(row.team).toUpperCase() !== input.team.toUpperCase()) return false;
    if (!inDateRange(row.car_created_at, input.from, input.to)) return false;
    if (input.pic.length > 0 && (row.pic_id === null || !picSet.has(row.pic_id))) return false;
    return true;
  });

  if (filtered.length === 0) return null;

  return {
    ...buildSaleLeadSnapshotSummaries(
      filtered.map((row) => ({
        workStage: row.workStage ?? (row as any).work_stage,
        gapBucket: row.gapBucket ?? (row as any).gap_bucket,
        hasImages: row.hasImages ?? (row as any).has_images === true,
      })),
    ),
    rows: filtered.length,
    computedAt: filtered.reduce<string | null>((latest, row) => {
      if (!row.computed_at) return latest;
      return !latest || row.computed_at > latest ? row.computed_at : latest;
    }, null),
    storage: "file",
  };
}

export async function readSaleLeadSnapshotFileDailyRows(input: {
  from: string;
  to: string;
  team: string;
  pic: string[];
}): Promise<SaleLeadSnapshotDailyRow[]> {
  const rows = await readSnapshotFileRows();
  const picSet = new Set(input.pic);
  const filtered = rows.filter((row) => {
    if (String(row.team).toUpperCase() !== input.team.toUpperCase()) return false;
    if (!inDateRange(row.car_created_at, input.from, input.to)) return false;
    if (input.pic.length > 0 && (row.pic_id === null || !picSet.has(row.pic_id))) return false;
    return true;
  });

  return filtered.map((row) => ({
    carId: row.car_id,
    leadId: row.lead_id,
    picId: row.pic_id,
    day: row.car_created_at.slice(0, 10),
    workStage: row.workStage ?? (row as any).work_stage,
    gapBucket: row.gapBucket ?? (row as any).gap_bucket,
    hasImages: row.hasImages ?? (row as any).has_images === true,
    qualified:
      typeof row.payload?.qualified === "string"
        ? row.payload.qualified
        : typeof (row as any).qualified === "string"
          ? (row as any).qualified
          : null,
  }));
}
