import { NextResponse } from "next/server";

import { vucarV2Query, vucarZaloQuery } from "@/lib/db";
import { biddings } from "@/lib/dealer-service";
import {
  LEAD_FAILED_SPEED_EXCLUDED_REASONS,
  buildHanoiDailyLeadCharts,
  buildHanoiDailyHumanMessageMixChart,
  buildHanoiDailyLeadIntakeChart,
  buildHanoiDailyZaloCallChart,
  buildHanoiDelayReasonChart,
  buildHanoiDetailedSaleCycle,
  buildHanoiFailureReasonFunnels,
  buildHanoiOverviewMetrics,
  buildHanoiSpeedToCloseMetrics,
  buildHanoiTargetFunnel,
  buildHanoiTotalFunnel,
  buildHanoiWorkStageChart,
  buildHanoiWorkableGapChart,
  normalizeHanoiFunnelDateInput,
  normalizeHanoiFunnelTeamFilter,
  parseHanoiZaloCallMinutes,
  parseHanoiFunnelPicFilter,
  type HanoiDelayReasonInput,
  type HanoiDetailedSaleCycleMetricInput,
  type HanoiDetailedSaleCycleMetricKey,
  type HanoiFailureReasonInput,
  type HanoiFunnelResponse,
  type HanoiSpeedToCloseMetricInput,
} from "@/lib/hanoi-funnel";
import {
  countStoredVehicleImages,
  classifySaleLeadStage,
  extractSaleTextQuoteEvents,
  hasVehicleImagesFromSources,
} from "@/lib/sale-leads-funnel";
import {
  buildSaleLeadSnapshotSummaries,
  mapSnapshotDbRow,
  readSaleLeadSnapshotFileSummaries,
  type SaleLeadSnapshotSummaries,
} from "@/lib/sale-leads-funnel-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TARGET_LOCATION_PATTERN = "HANOI|HÀ NỘI|HÀ-NỘI|HÀ_NỘI";
const REAL_BID_MIN = 1_000_000;
const DETAILED_SALE_CYCLE_DEFINITIONS: Array<{ key: HanoiDetailedSaleCycleMetricKey; label: string }> = [
  { key: "lead_first_action", label: "Lead → First action" },
  { key: "first_action_image", label: "First action → Có ảnh" },
  { key: "image_outreach", label: "Có ảnh → Chào dealer" },
  { key: "outreach_first_bid", label: "Chào dealer → Lấy giá" },
  { key: "first_bid_first_quote", label: "Lấy giá → Trả giá lần 1" },
  { key: "first_quote_win", label: "Trả giá lần 1 → Thành công" },
  { key: "first_quote_failed", label: "Trả giá lần 1 → Thất bại" },
];
function toNumber(value: unknown): number {
  return Number(value ?? 0);
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

function normalizeSnapshots(value: unknown): any[] {
  const parsed = parseJsonValue(value);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function firstTimestampAfter(values: unknown[], anchor?: unknown): Date | null {
  const anchorDate = parseDateValue(anchor);
  const anchorTime = anchorDate?.getTime() ?? null;
  return (
    values
      .map(parseDateValue)
      .filter((value): value is Date => Boolean(value))
      .filter((value) => anchorTime === null || value.getTime() >= anchorTime)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  );
}

function durationHours(from: unknown, to: unknown): number | null {
  const start = parseDateValue(from);
  const end = parseDateValue(to);
  if (!start || !end || end.getTime() < start.getTime()) return null;
  return (end.getTime() - start.getTime()) / 3_600_000;
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizePhoneKey(value: unknown): string | null {
  const phone = String(value ?? "").trim();
  return phone ? phone : null;
}

function getQuoteTimesFromSummary(value: unknown): unknown[] {
  const timestamps: unknown[] = [];
  for (const snapshot of normalizeSnapshots(value)) {
    const quoteTs = snapshot?.quote_ts ?? snapshot?.quoteTs;
    if (Array.isArray(quoteTs)) timestamps.push(...quoteTs);
    else if (quoteTs) timestamps.push(quoteTs);
    if (snapshot?.price_vucar_offered_at) timestamps.push(snapshot.price_vucar_offered_at);
  }
  return timestamps;
}

function teamMembershipCondition(teamParamIndex: number): string {
  return `UPPER(t.name) = UPPER($${teamParamIndex}::text)`;
}

function emptyDetailedSaleCycle() {
  return buildHanoiDetailedSaleCycle(
    DETAILED_SALE_CYCLE_DEFINITIONS.map((definition) => ({
      ...definition,
      cases: 0,
      averageHours: 0,
      medianHours: 0,
      previousAverageHours: 0,
    })),
  );
}

async function optionalHanoiChart<T>(label: string, promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.warn(`[hanoi-funnel] ${label} unavailable:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

async function readSnapshotSummaries(input: {
  from: string;
  to: string;
  team: string;
  pic: string[];
}): Promise<(SaleLeadSnapshotSummaries & { rows: number; computedAt: string | null }) | null> {
  const params: unknown[] = [input.from, input.to, input.team];
  let picCondition = "";
  if (input.pic.length > 0) {
    params.push(input.pic);
    picCondition = `AND pic_id = ANY($${params.length}::uuid[])`;
  }

  try {
    const result = await vucarV2Query(
      `
        SELECT
          work_stage,
          gap_bucket,
          has_images,
          MAX(computed_at) OVER () AS latest_computed_at
        FROM sale_leads_funnel_snapshots
        WHERE car_created_at >= $1::date
          AND car_created_at < ($2::date + INTERVAL '1 day')
          AND UPPER(team) = UPPER($3::text)
          ${picCondition}
      `,
      params,
    );

    if (result.rows.length === 0) {
      return readSaleLeadSnapshotFileSummaries(input);
    }
    return {
      ...buildSaleLeadSnapshotSummaries(result.rows.map(mapSnapshotDbRow)),
      rows: result.rows.length,
      computedAt: result.rows[0]?.latest_computed_at ? String(result.rows[0].latest_computed_at) : null,
    };
  } catch (error) {
    console.warn("[hanoi-funnel] snapshot summaries unavailable:", error instanceof Error ? error.message : error);
    return readSaleLeadSnapshotFileSummaries(input).catch((fileError) => {
      console.warn("[hanoi-funnel] file snapshot summaries unavailable:", fileError instanceof Error ? fileError.message : fileError);
      return null;
    });
  }
}

async function readDetailedSaleCyclePeriod(input: {
  from: string;
  to: string;
  team: string;
  picFilter: string[] | null;
}): Promise<HanoiDetailedSaleCycleMetricInput[]> {
  const emptyRows = () =>
    DETAILED_SALE_CYCLE_DEFINITIONS.map((definition) => ({
      ...definition,
      cases: 0,
      averageHours: 0,
      medianHours: 0,
      previousAverageHours: 0,
    }));

  try {
    const baseResult = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        )
        SELECT
          l.id::text AS lead_id,
          l.phone,
          l.created_at AS lead_created_at,
          c.id::text AS car_id,
          c.created_at AS car_created_at,
          c.updated_at AS car_updated_at,
          c.additional_images
        FROM members m
        JOIN leads l ON l.pic_id = m.pic_id
        JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
        WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ORDER BY l.created_at ASC
      `,
      [input.from, input.to, input.picFilter, input.team],
    );
    const baseRows = baseResult.rows;
    const carIds = baseRows.map((row: any) => row.car_id).filter(Boolean);
    const phones = Array.from(new Set(baseRows.map((row: any) => row.phone).filter(Boolean)));

    const [statusResult, summaryResult, zaloResult, dealerGrouped] = await Promise.all([
      carIds.length > 0
        ? vucarV2Query(
            `
              SELECT
                car_id::text AS car_id,
                MIN(COALESCE(updated_at, created_at)) FILTER (WHERE price_highest_bid > $2::bigint) AS crm_bid_at,
                MIN(first_payment_date) FILTER (WHERE first_payment_date IS NOT NULL) AS win_at,
                MIN(COALESCE(updated_at, created_at)) FILTER (WHERE stage::text = 'FAILED') AS failed_at
              FROM sale_status
              WHERE car_id = ANY($1::uuid[])
              GROUP BY car_id
            `,
            [carIds, REAL_BID_MIN],
          ).catch((error) => {
            console.warn("[hanoi-funnel] detailed sale cycle status unavailable:", error instanceof Error ? error.message : error);
            return { rows: [] };
          })
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? vucarV2Query(
            `
              SELECT DISTINCT ON (c.id)
                c.id::text AS car_id,
                sp.result
              FROM cars c
              JOIN leads l ON l.id = c.lead_id
              JOIN chat_summary cs ON cs.lead_id = l.id
              JOIN summary_properties sp ON sp.summary_id = cs.id
              WHERE c.id = ANY($1::uuid[])
              ORDER BY c.id, sp.created_at DESC
            `,
            [carIds],
          ).catch((error) => {
            console.warn("[hanoi-funnel] detailed sale cycle summaries unavailable:", error instanceof Error ? error.message : error);
            return { rows: [] };
          })
        : Promise.resolve({ rows: [] }),
      phones.length > 0
        ? vucarZaloQuery(
            `
              SELECT
                lr.phone,
                MIN(lr.created_at) AS relation_created_at,
                MIN(m.created_at) FILTER (WHERE m.is_self = false) AS first_customer_message_at,
                MIN(m.created_at) FILTER (
                  WHERE m.is_self = false
                    AND m.content IS NOT NULL
                    AND (
                      m.msg_type = 'chat.photo'
                      OR (
                        m.content LIKE '{%'
                        AND (m.content LIKE '%"href"%' OR m.content LIKE '%"thumb"%')
                        AND (
                          (m.content LIKE '%"width"%' AND m.content LIKE '%"height"%')
                          OR m.content LIKE '%https://photo-%'
                          OR m.content LIKE '%https://photo.%'
                          OR m.content LIKE '%zpc.zdn.vn%'
                        )
                      )
                    )
                ) AS first_customer_image_at,
                ARRAY_AGG(m.created_at ORDER BY m.created_at) FILTER (
                  WHERE m.is_self = true
                    AND m.content IS NOT NULL
                    AND m.content LIKE '{%'
                    AND m.content LIKE '%sendBubbleMessage%'
                    AND (m.content ILIKE '%Cuộc gọi%' OR m.content ILIKE '%Cuoc goi%')
                    AND (
                      m.content LIKE '%recommened.calltime%'
                      OR m.content LIKE '%recommended.calltime%'
                    )
                ) AS sale_completed_call_ts,
                JSONB_AGG(
                  JSONB_BUILD_OBJECT('created_at', m.created_at, 'content', m.content, 'source', m.source)
                  ORDER BY m.created_at
                ) FILTER (
                  WHERE m.is_self = true
                    AND m.content IS NOT NULL
                    AND BTRIM(m.content) NOT LIKE '{%'
                    AND m.content ~* '[0-9]'
                    AND (
                      m.content ~* '(tỷ|ty|tỉ|ti|tr|triệu|trieu)'
                      OR m.content ~* '[0-9]{2,4}[[:space:]]*[-–][[:space:]]*[0-9]{2,4}'
                      OR m.content ~* '(giá|gia|mức|muc|khung giá|khung gia)[[:space:]]+[0-9]{2,4}'
                      OR m.content ~* '(tầm|tam|khoảng|khoang|quanh|được|duoc)[[:space:]]+[0-9]{2,4}'
                    )
                    AND m.content ~* '(giá|gia|trả|tra|mua|khách|khach|khoảng|khoang|tầm|tam|giao dịch|giao dich)'
                ) AS sale_text_quote_messages
              FROM leads_relation lr
              LEFT JOIN messages m ON m.thread_id = lr.friend_id AND m.own_id = lr.account_id
              WHERE lr.phone = ANY($1::text[])
              GROUP BY lr.phone
            `,
            [phones],
          ).catch((error) => {
            console.warn("[hanoi-funnel] detailed sale cycle Zalo unavailable:", error instanceof Error ? error.message : error);
            return { rows: [] };
          })
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? biddings.listByCarsGrouped(carIds).catch((error) => {
            console.warn("[hanoi-funnel] detailed sale cycle dealer bids unavailable:", error instanceof Error ? error.message : error);
            return {};
          })
        : Promise.resolve({}),
    ]);

    const statusByCar = new Map(statusResult.rows.map((row: any) => [row.car_id, row]));
    const summaryByCar = new Map(summaryResult.rows.map((row: any) => [row.car_id, row.result]));
    const zaloByPhone = new Map(zaloResult.rows.map((row: any) => [row.phone, row]));
    const durations = new Map<HanoiDetailedSaleCycleMetricKey, number[]>(
      DETAILED_SALE_CYCLE_DEFINITIONS.map((definition) => [definition.key, []]),
    );

    for (const row of baseRows) {
      const leadAt = parseDateValue(row.lead_created_at);
      const status = statusByCar.get(row.car_id) ?? {};
      const zalo = row.phone ? zaloByPhone.get(row.phone) : null;
      const firstActionAt = firstTimestampAfter(
        [zalo?.relation_created_at, zalo?.first_customer_message_at],
        leadAt,
      );
      const imageZaloAt = firstTimestampAfter([zalo?.first_customer_image_at], firstActionAt ?? leadAt);
      const hasStoredVehicleImages = countStoredVehicleImages(row.additional_images) > 0;
      const storedImageProxyAt = hasStoredVehicleImages
        ? firstTimestampAfter([row.car_updated_at, row.car_created_at], firstActionAt ?? leadAt)
        : null;
      const firstImageAt = firstTimestampAfter([imageZaloAt, storedImageProxyAt], firstActionAt ?? leadAt);
      const bids = ((dealerGrouped as Record<string, any[]>)[row.car_id] ?? []).map((bid) => ({
        createdAt: bid.created_at,
        price: Number(bid.price ?? 0),
      }));
      const firstDealerOutreachAt = firstTimestampAfter(
        bids.map((bid) => bid.createdAt),
        firstImageAt ?? leadAt,
      );
      const firstDealerBidAt = firstTimestampAfter(
        bids.filter((bid) => bid.price > REAL_BID_MIN).map((bid) => bid.createdAt),
        firstDealerOutreachAt ?? firstImageAt ?? leadAt,
      );
      const crmBidAt = firstTimestampAfter([status.crm_bid_at], firstDealerOutreachAt ?? firstImageAt ?? leadAt);
      const firstBidAt = firstTimestampAfter([firstDealerBidAt, crmBidAt], firstDealerOutreachAt ?? firstImageAt ?? leadAt);
      const textQuoteTimes = extractSaleTextQuoteEvents(zalo?.sale_text_quote_messages).map((event) => event.at);
      const firstQuoteAt = firstTimestampAfter(
        [
          ...(Array.isArray(zalo?.sale_completed_call_ts) ? zalo.sale_completed_call_ts : []),
          ...textQuoteTimes,
          ...getQuoteTimesFromSummary(summaryByCar.get(row.car_id)),
        ],
        firstBidAt ?? firstDealerOutreachAt ?? firstImageAt ?? leadAt,
      );
      const winAt = firstTimestampAfter([status.win_at], firstQuoteAt ?? leadAt);
      const failedAt = firstTimestampAfter([status.failed_at], firstQuoteAt ?? leadAt);
      const pairs: Array<[HanoiDetailedSaleCycleMetricKey, unknown, unknown]> = [
        ["lead_first_action", leadAt, firstActionAt],
        ["first_action_image", firstActionAt, firstImageAt],
        ["image_outreach", firstImageAt, firstDealerOutreachAt],
        ["outreach_first_bid", firstDealerOutreachAt, firstBidAt],
        ["first_bid_first_quote", firstBidAt, firstQuoteAt],
        ["first_quote_win", firstQuoteAt, winAt],
        ["first_quote_failed", firstQuoteAt, failedAt],
      ];

      for (const [key, start, end] of pairs) {
        const hours = durationHours(start, end);
        if (hours !== null) durations.get(key)?.push(hours);
      }
    }

    return DETAILED_SALE_CYCLE_DEFINITIONS.map((definition) => {
      const values = durations.get(definition.key) ?? [];
      return {
        ...definition,
        cases: values.length,
        averageHours: average(values),
        medianHours: median(values),
        previousAverageHours: 0,
      };
    });
  } catch (error) {
    console.warn("[hanoi-funnel] detailed sale cycle unavailable:", error instanceof Error ? error.message : error);
    return emptyRows();
  }
}

function previousPeriod(from: string, to: string) {
  const shift = (value: string) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 10);
  };
  return { from: shift(from), to: shift(to) };
}

async function readDetailedSaleCycleSummary(input: {
  from: string;
  to: string;
  team: string;
  picFilter: string[] | null;
}) {
  const previous = previousPeriod(input.from, input.to);
  const [currentRows, previousRows] = await Promise.all([
    readDetailedSaleCyclePeriod(input),
    readDetailedSaleCyclePeriod({
      ...input,
      from: previous.from,
      to: previous.to,
    }),
  ]);
  const previousByKey = new Map(previousRows.map((row) => [row.key, row]));

  return buildHanoiDetailedSaleCycle(
    currentRows.map((row) => ({
      ...row,
      previousAverageHours: previousByKey.get(row.key)?.averageHours ?? 0,
    })),
  );
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const from = normalizeHanoiFunnelDateInput(searchParams.get("from"), defaultFrom);
    const to = normalizeHanoiFunnelDateInput(searchParams.get("to"), today);
    const team = normalizeHanoiFunnelTeamFilter(searchParams.get("team"));
    const pic = parseHanoiFunnelPicFilter(searchParams.get("pic"));
    const picFilter = pic.length > 0 ? pic : null;
    const picOptionRows = await vucarV2Query(
      `SELECT DISTINCT
         u.id::text AS "id",
         COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name, u.id::text) AS "name"
       FROM users u
       LEFT JOIN sales s ON s.user_id = u.id
       JOIN team_members tm ON tm.user_id = u.id
       JOIN teams t ON t.id = tm.team_id
       WHERE ${teamMembershipCondition(1)}
       ORDER BY "name", "id"`,
      [team],
    );
    if (searchParams.get("options") === "pic") {
      return NextResponse.json({ picOptions: picOptionRows.rows });
    }
    const detailedSaleCyclePromise = optionalHanoiChart(
      "detailed sale cycle",
      readDetailedSaleCycleSummary({ from, to, team, picFilter }),
      emptyDetailedSaleCycle(),
    );
    const snapshotSummaries = await readSnapshotSummaries({ from, to, team, pic });

    const totals = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT
            u.id AS pic_id,
            u.user_name,
            COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name) AS display_name,
            COALESCE(s.is_deactivated, false) AS is_deactivated
          FROM users u
          LEFT JOIN sales s ON s.user_id = u.id
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(5)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        ),
        lead_base AS (
          SELECT
            l.id AS lead_id,
            bool_or(
              c.id IS NOT NULL
              AND COALESCE(c.is_deleted, false) = false
              AND COALESCE(ss.stage::text, 'UNDEFINED') NOT IN ('CANNOT_CONTACT', 'UNDEFINED')
            ) AS contacted,
            bool_or(c.id IS NOT NULL AND COALESCE(c.is_deleted, false) = false AND c.location ~* $4) AS in_target,
            bool_or(c.id IS NOT NULL AND COALESCE(c.is_deleted, false) = false AND c.additional_images IS NOT NULL) AS has_image,
            bool_or(c.id IS NOT NULL AND COALESCE(c.is_deleted, false) = false AND c.location ~* $4 AND c.additional_images IS NOT NULL) AS in_target_has_image
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          LEFT JOIN cars c ON c.lead_id = l.id
          LEFT JOIN sale_status ss ON ss.car_id = c.id
          WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
          GROUP BY l.id
        ),
        lead_agg AS (
          SELECT
            COUNT(DISTINCT lead_id)::int AS total_leads,
            COUNT(DISTINCT lead_id) FILTER (WHERE contacted)::int AS contacted_leads,
            COUNT(DISTINCT lead_id) FILTER (WHERE has_image)::int AS leads_with_images,
            COUNT(DISTINCT lead_id) FILTER (WHERE in_target)::int AS target_leads,
            COUNT(DISTINCT lead_id) FILTER (WHERE in_target_has_image)::int AS target_leads_with_images
          FROM lead_base
        ),
        booking_total AS (
          SELECT
            COUNT(DISTINCT b.id) FILTER (WHERE b.booking_type = 'inspection')::int AS inspection_bookings,
            COUNT(DISTINCT b.id) FILTER (WHERE b.booking_type = 'car_viewing')::int AS carview_bookings
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN bookings b ON b.car_id = c.id::text
          WHERE (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        booking_cohort AS (
          SELECT
            COUNT(DISTINCT b.id) FILTER (WHERE b.booking_type = 'inspection')::int AS inspection_bookings,
            COUNT(DISTINCT b.id) FILTER (WHERE b.booking_type = 'car_viewing')::int AS carview_bookings,
            COUNT(DISTINCT b.id) FILTER (
              WHERE b.booking_type = 'inspection'
                AND c.location ~* $4
            )::int AS target_inspection_bookings
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN bookings b ON b.car_id = c.id::text
          WHERE (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
            AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        win_total AS (
          SELECT COUNT(DISTINCT c.id)::int AS wins
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        win_deals AS (
          SELECT DISTINCT ON (c.id)
            c.id AS car_id,
            COALESCE(ss.price_sold, 0)::numeric AS price_sold,
            (COALESCE(ss.comission_seller, 0) + COALESCE(ss.comission_buyer, 0))::numeric AS expected_revenue
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
          ORDER BY c.id, ss.first_payment_date DESC NULLS LAST, ss.updated_at DESC NULLS LAST
        ),
        overview AS (
          SELECT
            COUNT(*)::int AS sold_cars,
            COALESCE(SUM(price_sold), 0)::numeric AS gmv,
            COALESCE(SUM(expected_revenue), 0)::numeric AS expected_revenue
          FROM win_deals
        ),
        win_cohort AS (
          SELECT COUNT(DISTINCT c.id)::int AS wins
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
            AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        failed_total AS (
          SELECT COUNT(DISTINCT l.id)::int AS failed_leads
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE ss.stage::text = 'FAILED'
            AND (ss.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        failed_cohort AS (
          SELECT COUNT(DISTINCT l.id)::int AS failed_leads
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE ss.stage::text = 'FAILED'
            AND (ss.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
            AND (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        )
        SELECT
          COALESCE(la.total_leads, 0)::int AS "totalLeads",
          COALESCE(la.contacted_leads, 0)::int AS "contactedLeads",
          COALESCE(la.leads_with_images, 0)::int AS "leadsWithImages",
          COALESCE(la.target_leads, 0)::int AS "targetLeads",
          COALESCE(la.target_leads_with_images, 0)::int AS "targetLeadsWithImages",
          COALESCE(bt.inspection_bookings, 0)::int AS "inspectionBookings",
          COALESCE(bt.carview_bookings, 0)::int AS "carviewBookings",
          COALESCE(bc.inspection_bookings, 0)::int AS "cohortInspectionBookings",
          COALESCE(bc.carview_bookings, 0)::int AS "cohortCarviewBookings",
          COALESCE(bc.target_inspection_bookings, 0)::int AS "targetInspectionBookings",
          COALESCE(wt.wins, 0)::int AS "wins",
          COALESCE(wc.wins, 0)::int AS "cohortWins",
          COALESCE(ft.failed_leads, 0)::int AS "failedLeads",
          COALESCE(fc.failed_leads, 0)::int AS "cohortFailedLeads",
          COALESCE(ov.sold_cars, 0)::int AS "overviewSoldCars",
          COALESCE(ov.gmv, 0)::numeric AS "overviewGmv",
          COALESCE(ov.expected_revenue, 0)::numeric AS "overviewExpectedRevenue"
        FROM lead_agg la
        CROSS JOIN booking_total bt
        CROSS JOIN booking_cohort bc
        CROSS JOIN win_total wt
        CROSS JOIN overview ov
        CROSS JOIN win_cohort wc
        CROSS JOIN failed_total ft
        CROSS JOIN failed_cohort fc;
      `,
      [from, to, picFilter, TARGET_LOCATION_PATTERN, team],
    );

    const speedRows = await vucarV2Query(
      `
        WITH params AS (
          SELECT
            $1::date AS from_date,
            $2::date AS to_date,
            ($1::date - INTERVAL '1 month')::date AS previous_from_date,
            ($2::date - INTERVAL '1 month')::date AS previous_to_date
        ),
        members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        ),
        periods AS (
          SELECT 'current'::text AS period, from_date, to_date FROM params
          UNION ALL
          SELECT 'previous'::text AS period, previous_from_date, previous_to_date FROM params
        ),
        first_booking AS (
          SELECT DISTINCT ON (p.period, l.id)
            p.period,
            l.id AS lead_id,
            (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS lead_created_at,
            (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh') AS booking_time
          FROM periods p
          JOIN members m ON true
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN bookings b ON b.car_id = c.id::text
          WHERE b.booking_type = 'inspection'
            AND b.time IS NOT NULL
            AND l.created_at IS NOT NULL
            AND (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p.from_date AND p.to_date
            AND (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh') >= (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
          ORDER BY p.period, l.id, b.time ASC
        ),
        win_cases AS (
          SELECT DISTINCT ON (p.period, c.id)
            p.period,
            c.id AS car_id,
            (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS lead_created_at,
            (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AS payment_time
          FROM periods p
          JOIN members m ON true
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE ss.first_payment_date IS NOT NULL
            AND l.created_at IS NOT NULL
            AND (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p.from_date AND p.to_date
            AND (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh') >= (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
          ORDER BY p.period, c.id, ss.first_payment_date ASC
        ),
        failed_cases AS (
          SELECT DISTINCT ON (p.period, l.id)
            p.period,
            l.id AS lead_id,
            (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS lead_created_at,
            (ss.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS failed_time
          FROM periods p
          JOIN members m ON true
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE ss.stage::text = 'FAILED'
            AND ss.updated_at IS NOT NULL
            AND l.created_at IS NOT NULL
            AND LOWER(COALESCE(NULLIF(BTRIM(ss.reason), ''), 'Khác')) <> ALL($5::text[])
            AND (ss.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN p.from_date AND p.to_date
            AND (ss.updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
          ORDER BY p.period, l.id, ss.updated_at ASC
        ),
        win_with_booking AS (
          SELECT
            w.period,
            w.car_id,
            w.payment_time,
            booking.booking_time
          FROM win_cases w
          JOIN LATERAL (
            SELECT MIN(b.time AT TIME ZONE 'Asia/Ho_Chi_Minh') AS booking_time
            FROM bookings b
            WHERE b.car_id = w.car_id::text
              AND b.booking_type = 'inspection'
              AND b.time IS NOT NULL
              AND (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh') <= w.payment_time
          ) booking ON booking.booking_time IS NOT NULL
        ),
        milestone_durations AS (
          SELECT period, 'lead_booking'::text AS metric_key, EXTRACT(EPOCH FROM (booking_time - lead_created_at)) / 86400 AS days FROM first_booking
          UNION ALL
          SELECT period, 'lead_win'::text AS metric_key, EXTRACT(EPOCH FROM (payment_time - lead_created_at)) / 86400 AS days FROM win_cases
          UNION ALL
          SELECT period, 'booking_win'::text AS metric_key, EXTRACT(EPOCH FROM (payment_time - booking_time)) / 86400 AS days FROM win_with_booking
          UNION ALL
          SELECT period, 'lead_failed'::text AS metric_key, EXTRACT(EPOCH FROM (failed_time - lead_created_at)) / 86400 AS days FROM failed_cases
        ),
        metric_order AS (
          SELECT *
          FROM (
            VALUES
              (1, 'lead_booking'::text, 'Lead → Booking'::text),
              (2, 'lead_win'::text, 'Lead → Win'::text),
              (3, 'booking_win'::text, 'Booking → Win'::text),
              (4, 'lead_failed'::text, 'Lead → Failed'::text)
          ) AS metric(ord, metric_key, label)
        ),
        aggregated AS (
          SELECT
            metric_key,
            COUNT(*) FILTER (WHERE period = 'current')::int AS cases,
            AVG(days) FILTER (WHERE period = 'current')::numeric AS average_days,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY days) FILTER (WHERE period = 'current')::numeric AS median_days,
            AVG(days) FILTER (WHERE period = 'previous')::numeric AS last_month_average_days
          FROM milestone_durations
          WHERE days >= 0
          GROUP BY metric_key
        )
        SELECT
          mo.metric_key AS "key",
          mo.label AS "label",
          COALESCE(a.cases, 0)::int AS "cases",
          COALESCE(a.average_days, 0)::numeric AS "averageDays",
          COALESCE(a.median_days, 0)::numeric AS "medianDays",
          COALESCE(a.last_month_average_days, 0)::numeric AS "lastMonthAverageDays"
        FROM metric_order mo
        LEFT JOIN aggregated a ON a.metric_key = mo.metric_key
        ORDER BY mo.ord;
      `,
      [from, to, picFilter, team, LEAD_FAILED_SPEED_EXCLUDED_REASONS],
    );

    const failureReasonRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        ),
        status_candidates AS (
          SELECT
            l.id AS lead_id,
            c.id AS car_id,
            EXISTS (
              SELECT 1
              FROM cars image_car
              WHERE image_car.lead_id = l.id
                AND COALESCE(image_car.is_deleted, false) = false
                AND image_car.additional_images IS NOT NULL
            ) AS has_image,
            UPPER(COALESCE(ss.stage::text, 'UNDEFINED')) AS stage,
            ss.reason,
            ss.updated_at
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        failed_leads AS (
          SELECT DISTINCT ON (lead_id)
            lead_id,
            CASE WHEN has_image THEN 'worked' ELSE 'not_worked' END AS group_key,
            stage,
            reason
          FROM status_candidates
          ORDER BY lead_id, updated_at DESC NULLS LAST, car_id DESC
        )
        SELECT
          group_key AS "groupKey",
          reason AS "reason",
          COUNT(DISTINCT lead_id)::int AS "count"
        FROM failed_leads
        WHERE stage = 'FAILED'
        GROUP BY group_key, reason;
      `,
      [from, to, picFilter, team],
    );

    const delayReasonRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        ),
        status_candidates AS (
          SELECT
            l.id AS lead_id,
            c.id AS car_id,
            UPPER(COALESCE(ss.stage::text, 'UNDEFINED')) AS stage,
            UPPER(COALESCE(ss.intention::text, '')) AS intention,
            ss.reason,
            ss.updated_at
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ),
        delay_leads AS (
          SELECT DISTINCT ON (lead_id)
            lead_id,
            stage,
            intention,
            reason
          FROM status_candidates
          ORDER BY lead_id, updated_at DESC NULLS LAST, car_id DESC
        )
        SELECT
          reason AS "reason",
          COUNT(DISTINCT lead_id)::int AS "count"
        FROM delay_leads
        WHERE intention = 'DELAY'
          AND stage NOT IN ('FAILED', 'COMPLETED', 'WIN', 'DEPOSIT_PAID')
        GROUP BY reason;
      `,
      [from, to, picFilter, team],
    );

    const byUserRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT
            u.id AS pic_id,
            u.user_name,
            COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name) AS display_name,
            COALESCE(s.is_deactivated, false) AS is_deactivated
          FROM users u
          LEFT JOIN sales s ON s.user_id = u.id
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        ),
        lead_base AS (
          SELECT
            m.pic_id,
            l.id AS lead_id,
            bool_or(c.id IS NOT NULL AND COALESCE(c.is_deleted, false) = false AND c.additional_images IS NOT NULL) AS has_image
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          LEFT JOIN cars c ON c.lead_id = l.id
          WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
          GROUP BY m.pic_id, l.id
        ),
        lead_agg AS (
          SELECT
            pic_id,
            COUNT(DISTINCT lead_id)::int AS total_leads,
            COUNT(DISTINCT lead_id) FILTER (WHERE has_image)::int AS leads_with_images
          FROM lead_base
          GROUP BY pic_id
        ),
        booking_total AS (
          SELECT m.pic_id, COUNT(DISTINCT b.id)::int AS inspection_bookings
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN bookings b ON b.car_id = c.id::text
          WHERE b.booking_type = 'inspection'
            AND (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
          GROUP BY m.pic_id
        ),
        win_total AS (
          SELECT m.pic_id, COUNT(DISTINCT c.id)::int AS wins
          FROM members m
          JOIN leads l ON l.pic_id = m.pic_id
          JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
          JOIN sale_status ss ON ss.car_id = c.id
          WHERE (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
          GROUP BY m.pic_id
        )
        SELECT
          m.pic_id::text AS "userId",
          m.user_name AS "userName",
          m.display_name AS "displayName",
          m.is_deactivated AS "isDeactivated",
          COALESCE(la.total_leads, 0)::int AS "totalLeads",
          COALESCE(la.leads_with_images, 0)::int AS "leadsWithImages",
          COALESCE(bt.inspection_bookings, 0)::int AS "inspectionBookings",
          COALESCE(wt.wins, 0)::int AS "wins"
        FROM members m
        LEFT JOIN lead_agg la ON la.pic_id = m.pic_id
        LEFT JOIN booking_total bt ON bt.pic_id = m.pic_id
        LEFT JOIN win_total wt ON wt.pic_id = m.pic_id
        ORDER BY "totalLeads" DESC, "wins" DESC, "displayName";
      `,
      [from, to, picFilter, team],
    );

    const dailyLeadRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        ),
        latest_status AS (
          SELECT DISTINCT ON (ss.car_id)
            ss.car_id,
            ss.qualified,
            ss.stage,
            ss.intention,
            ss.first_payment_date
          FROM sale_status ss
          ORDER BY ss.car_id, ss.updated_at DESC NULLS LAST, ss.created_at DESC NULLS LAST
        )
        SELECT
          c.id::text AS "carId",
          l.id::text AS "leadId",
          l.phone,
          c.additional_images AS "additionalImages",
          ls.stage AS "crmStage",
          ls.intention,
          ls.first_payment_date AS "firstPaymentDate",
          (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,
          COALESCE(ls.qualified::text, 'UNDEFINED_QUALIFIED') AS qualified
        FROM members m
        JOIN leads l ON l.pic_id = m.pic_id
        JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
        LEFT JOIN latest_status ls ON ls.car_id = c.id
        WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ORDER BY day;
      `,
      [from, to, picFilter, team],
    );
    const qualityCarIds = dailyLeadRows.rows.map((row) => String(row.carId));
    const qualityPhones = Array.from(new Set(dailyLeadRows.rows.map((row) => row.phone).filter(Boolean)));
    let leadQualityError: string | null = null;
    const qualityUnavailable = (error: unknown) => {
      console.warn("[hanoi-funnel] daily lead quality unavailable:", error instanceof Error ? error.message : error);
      leadQualityError = "Không tải đủ dữ liệu ảnh và phản hồi để phân loại lead.";
      return { rows: [] };
    };
    const [qualitySummaries, qualityZalo] = await Promise.all([
      qualityCarIds.length > 0
        ? vucarV2Query(
            `SELECT DISTINCT ON (c.id)
               c.id::text AS car_id, sp.result
             FROM cars c
             JOIN leads l ON l.id = c.lead_id
             JOIN chat_summary cs ON cs.lead_id = l.id
             JOIN summary_properties sp ON sp.summary_id = cs.id
             WHERE c.id = ANY($1::uuid[])
             ORDER BY c.id, sp.created_at DESC`,
            [qualityCarIds],
          ).catch(qualityUnavailable)
        : Promise.resolve({ rows: [] }),
      qualityPhones.length > 0
        ? vucarZaloQuery(
            `SELECT lr.phone,
               COUNT(DISTINCT lr.friend_id) AS "relationCount",
               COUNT(m.msg_id) FILTER (WHERE m.is_self = false) AS "customerMessageCount",
               COUNT(m.msg_id) FILTER (
                 WHERE m.is_self = false AND m.content IS NOT NULL AND (
                   m.msg_type = 'chat.photo' OR (
                     m.content LIKE '{%'
                     AND (m.content LIKE '%"href"%' OR m.content LIKE '%"thumb"%')
                     AND (
                       (m.content LIKE '%"width"%' AND m.content LIKE '%"height"%')
                       OR m.content LIKE '%https://photo-%'
                       OR m.content LIKE '%https://photo.%'
                       OR m.content LIKE '%zpc.zdn.vn%'
                     )
                   )
                 )
               ) AS "customerImageCount"
             FROM leads_relation lr
             LEFT JOIN messages m ON m.thread_id = lr.friend_id AND m.own_id = lr.account_id
             WHERE lr.phone = ANY($1::text[])
             GROUP BY lr.phone`,
            [qualityPhones],
          ).catch(qualityUnavailable)
        : Promise.resolve({ rows: [] }),
    ]);
    const qualitySummaryByCar = new Map(qualitySummaries.rows.map((row) => [String(row.car_id), parseJsonValue(row.result)]));
    const qualityZaloByPhone = new Map(qualityZalo.rows.map((row) => [row.phone, row]));
    const dailyLeadIntakeRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        )
        SELECT DISTINCT
          l.id::text AS "leadId",
          (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day
        FROM members m
        JOIN leads l ON l.pic_id = m.pic_id
        WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        ORDER BY day;
      `,
      [from, to, picFilter, team],
    );
    const humanMessageLeadBaseRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(3)}
            AND ($2::uuid[] IS NULL OR u.id = ANY($2::uuid[]))
        )
        SELECT DISTINCT
          l.id::text AS "leadId",
          (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS "leadCreatedDay",
          l.phone,
          l.additional_phone AS "additionalPhone"
        FROM members m
        JOIN leads l ON l.pic_id = m.pic_id
        WHERE l.created_at < ($1::date + INTERVAL '1 day')
          AND (l.phone IS NOT NULL OR l.additional_phone IS NOT NULL)
        ORDER BY "leadCreatedDay" DESC;
      `,
      [to, picFilter, team],
    );
    const leadsByPhone = new Map<string, Array<{ leadId: string; leadCreatedDay: string }>>();
    for (const row of humanMessageLeadBaseRows.rows) {
      const lead = { leadId: String(row.leadId), leadCreatedDay: String(row.leadCreatedDay) };
      for (const rawPhone of [row.phone, row.additionalPhone]) {
        const phone = normalizePhoneKey(rawPhone);
        if (!phone) continue;
        const phoneLeads = leadsByPhone.get(phone) ?? [];
        phoneLeads.push(lead);
        leadsByPhone.set(phone, phoneLeads);
      }
    }
    for (const phoneLeads of leadsByPhone.values()) {
      phoneLeads.sort((left, right) => right.leadCreatedDay.localeCompare(left.leadCreatedDay));
    }
    const phonesForHumanMessages = Array.from(leadsByPhone.keys());
    const humanMessageRows =
      phonesForHumanMessages.length > 0
        ? await vucarZaloQuery(
            `
              SELECT
                lr.phone,
                (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS "messageDay"
              FROM leads_relation lr
              JOIN messages m ON m.thread_id = lr.friend_id AND m.own_id = lr.account_id
              WHERE lr.phone = ANY($1::text[])
                AND m.is_self = true
                AND m.source = 'user'
                AND (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date
              GROUP BY lr.phone, "messageDay"
              ORDER BY "messageDay";
            `,
            [phonesForHumanMessages, from, to],
          ).catch((error) => {
            console.warn("[hanoi-funnel] daily human message mix unavailable:", error instanceof Error ? error.message : error);
            return { rows: [] };
          })
        : { rows: [] };
    const dailyHumanMessageMixRows = humanMessageRows.rows.flatMap((row: any) => {
      const phone = normalizePhoneKey(row.phone);
      const messageDay = String(row.messageDay);
      const lead = phone
        ? leadsByPhone.get(phone)?.find((candidate) => candidate.leadCreatedDay <= messageDay)
        : null;
      if (!lead) return [];
      return [{ ...lead, messageDay }];
    });
    const zaloCallRows =
      phonesForHumanMessages.length > 0
        ? await vucarZaloQuery(
            `
              SELECT DISTINCT ON (lr.phone, m.own_id, m.msg_id)
                lr.phone,
                (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,
                m.content
              FROM leads_relation lr
              JOIN messages m ON m.thread_id = lr.friend_id AND m.own_id = lr.account_id
              WHERE lr.phone = ANY($1::text[])
                AND m.is_self = true
                AND m.content IS NOT NULL
                AND m.content LIKE '{%'
                AND m.content LIKE '%sendBubbleMessage%'
                AND (m.content ILIKE '%Cuộc gọi%' OR m.content ILIKE '%Cuoc goi%')
                AND (
                  m.content LIKE '%recommened.calltime%'
                  OR m.content LIKE '%recommended.calltime%'
                  OR m.content ILIKE '%calltime%'
                  OR m.content ILIKE '%duration%'
                )
                AND (m.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date
              ORDER BY lr.phone, m.own_id, m.msg_id, m.created_at;
            `,
            [phonesForHumanMessages, from, to],
          ).catch((error) => {
            console.warn("[hanoi-funnel] daily Zalo call chart unavailable:", error instanceof Error ? error.message : error);
            return { rows: [] };
          })
        : { rows: [] };
    const dailyZaloCallRows = zaloCallRows.rows.flatMap((row: any) => {
      const phone = normalizePhoneKey(row.phone);
      const day = String(row.day);
      const lead = phone ? leadsByPhone.get(phone)?.find((candidate) => candidate.leadCreatedDay <= day) : null;
      const minutes = parseHanoiZaloCallMinutes(row.content);
      if (!lead || minutes <= 0) return [];
      return [{ day, leadId: lead.leadId, minutes }];
    });
    const winDailyRows = await vucarV2Query(
      `
        WITH members AS (
          SELECT DISTINCT u.id AS pic_id
          FROM users u
          JOIN team_members tm ON tm.user_id = u.id
          JOIN teams t ON t.id = tm.team_id
          WHERE ${teamMembershipCondition(4)}
            AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
        )
        SELECT
          (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,
          COUNT(DISTINCT c.id)::int AS count
        FROM members m
        JOIN leads l ON l.pic_id = m.pic_id
        JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
        JOIN sale_status ss ON ss.car_id = c.id
        WHERE ss.first_payment_date IS NOT NULL
          AND (ss.first_payment_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
        GROUP BY day
        ORDER BY day;
      `,
      [from, to, picFilter, team],
    );
    const dailyCharts = buildHanoiDailyLeadCharts({
      from,
      to,
      leadRows: dailyLeadRows.rows.map((dailyRow: any) => {
        const summary = qualitySummaryByCar.get(String(dailyRow.carId));
        const zalo = qualityZaloByPhone.get(dailyRow.phone);
        const hasImages = hasVehicleImagesFromSources({
          additionalImages: dailyRow.additionalImages,
          customerZaloImageCount: Number(zalo?.customerImageCount ?? 0),
          summaryHadImage: summary?.had_car_image === true || summary?.had_image === true,
        });
        return {
          hasImages,
          workStage: classifySaleLeadStage({
            crmStage: dailyRow.crmStage,
            intention: dailyRow.intention,
            firstPaymentDate: dailyRow.firstPaymentDate ? String(dailyRow.firstPaymentDate) : null,
            hasZaloChat: Number(zalo?.relationCount ?? 0) > 0,
            customerMessageCount: Number(zalo?.customerMessageCount ?? 0),
            hasEnoughImages: hasImages,
            inInspectionRegion: false,
            hasInspectionBooking: false,
            isInspected: false,
            preInspectionBidCount: 0,
            postInspectionBidCount: 0,
          }),
          day: String(dailyRow.day),
          qualified: dailyRow.qualified ?? null,
        };
      }),
      winRows: winDailyRows.rows.map((winRow) => ({
        day: String(winRow.day),
        count: toNumber(winRow.count),
      })),
    });

    const row = totals.rows[0] ?? {};
    const speedMetrics: HanoiSpeedToCloseMetricInput[] = speedRows.rows.map((speedRow) => ({
      key: speedRow.key as HanoiSpeedToCloseMetricInput["key"],
      label: String(speedRow.label ?? ""),
      cases: toNumber(speedRow.cases),
      averageDays: toNumber(speedRow.averageDays),
      medianDays: toNumber(speedRow.medianDays),
      lastMonthAverageDays: toNumber(speedRow.lastMonthAverageDays),
    }));
    const failureReasons: HanoiFailureReasonInput[] = failureReasonRows.rows.map((failureReasonRow) => ({
      groupKey: failureReasonRow.groupKey === "worked" ? "worked" : "not_worked",
      reason: typeof failureReasonRow.reason === "string" ? failureReasonRow.reason : null,
      count: toNumber(failureReasonRow.count),
    }));
    const delayReasons: HanoiDelayReasonInput[] = delayReasonRows.rows.map((delayReasonRow) => ({
      reason: typeof delayReasonRow.reason === "string" ? delayReasonRow.reason : null,
      count: toNumber(delayReasonRow.count),
    }));
    const detailedSaleCycle = await detailedSaleCyclePromise;

    const totalFunnel = buildHanoiTotalFunnel({
      totalLeads: toNumber(row.totalLeads),
      contactedLeads: toNumber(row.contactedLeads),
      leadsWithImages: toNumber(row.leadsWithImages),
      inspectionBookings: toNumber(row.inspectionBookings),
      carviewBookings: toNumber(row.carviewBookings),
      wins: toNumber(row.wins),
      failedLeads: toNumber(row.failedLeads),
    });
    const response: HanoiFunnelResponse = {
      filters: { from, to, team, pic },
      picOptions: picOptionRows.rows,
      overview: buildHanoiOverviewMetrics({
        totalLeads: toNumber(row.totalLeads),
        soldCars: toNumber(row.overviewSoldCars),
        gmv: toNumber(row.overviewGmv),
        expectedRevenue: toNumber(row.overviewExpectedRevenue),
      }),
      speedToClose: buildHanoiSpeedToCloseMetrics(speedMetrics),
      detailedSaleCycle,
      workStageChart: snapshotSummaries
        ? buildHanoiWorkStageChart(snapshotSummaries.stageSummary)
        : { totalLeads: 0, workableLeads: 0, stages: [] },
      workableGapChart: buildHanoiWorkableGapChart(snapshotSummaries?.workableGapSummary),
      snapshotMeta: {
        source: snapshotSummaries ? "snapshot" : "empty",
        rows: snapshotSummaries?.rows ?? 0,
        computedAt: snapshotSummaries?.computedAt ?? null,
      },
      totalFunnel,
      cohortFunnel: buildHanoiTotalFunnel({
        totalLeads: toNumber(row.totalLeads),
        contactedLeads: toNumber(row.contactedLeads),
        leadsWithImages: toNumber(row.leadsWithImages),
        inspectionBookings: toNumber(row.cohortInspectionBookings),
        carviewBookings: toNumber(row.cohortCarviewBookings),
        wins: toNumber(row.cohortWins),
        failedLeads: toNumber(row.cohortFailedLeads),
      }),
      targetFunnel: buildHanoiTargetFunnel({
        targetLeads: toNumber(row.targetLeads),
        targetLeadsWithImages: toNumber(row.targetLeadsWithImages),
        targetInspectionBookings: toNumber(row.targetInspectionBookings),
      }),
      dailyLeadIntake: buildHanoiDailyLeadIntakeChart({
        from,
        to,
        rows: dailyLeadIntakeRows.rows.map((dailyRow: any) => ({
          day: String(dailyRow.day),
          leadId: String(dailyRow.leadId),
        })),
      }),
      dailyHumanMessageMix: buildHanoiDailyHumanMessageMixChart({
        from,
        to,
        rows: dailyHumanMessageMixRows,
      }),
      dailyZaloCalls: buildHanoiDailyZaloCallChart({
        from,
        to,
        rows: dailyZaloCallRows,
      }),
      leadQualityByDay: dailyCharts.leadQualityByDay,
      leadQualityError,
      winCasesByDay: dailyCharts.winCasesByDay,
      failureReasons: buildHanoiFailureReasonFunnels(failureReasons),
      delayReasons: buildHanoiDelayReasonChart(delayReasons),
      byUser: byUserRows.rows,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[hanoi-funnel] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
