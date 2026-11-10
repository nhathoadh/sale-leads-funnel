import { NextResponse } from "next/server";

import { vucarV2Query, vucarZaloQuery } from "@/lib/db";
import { parseSubteamParam, resolveSubteamPicFilter } from "@/lib/sale-subteams";
import { biddings } from "@/lib/dealer-service";
import {
  LEAD_FAILED_SPEED_EXCLUDED_REASONS,
  buildHanoiDailyLeadCharts,
  buildHanoiDailyHumanMessageMixChart,
  buildHanoiDailyLeadIntakeChart,
  buildHanoiDailyZaloCallChart,
  buildHanoiDelayReasonChart,
  buildHanoiDailyBookingChart,
  buildHanoiImageLeadBidSummary,
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
  type HanoiBookingType,
  type HanoiFailureReasonInput,
  type HanoiFunnelResponse,
  type HanoiSpeedToCloseMetricInput,
} from "@/lib/hanoi-funnel";
import {
  classifySaleLeadStage,
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

function normalizePhoneKey(value: unknown): string | null {
  const phone = String(value ?? "").trim();
  return phone ? phone : null;
}

function teamMembershipCondition(teamParamIndex: number): string {
  return `UPPER(t.name) = UPPER($${teamParamIndex}::text)`;
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

type PeriodFilter = { from: string; to: string; team: string; picFilter: string[] | null };

/** Inspection and car view bookings by booking day and lead PIC, matching the funnel's booking counts. */
async function readDailyBookingRows(input: PeriodFilter) {
  const result = await vucarV2Query(
    `
      WITH members AS (
        SELECT DISTINCT
          u.id AS pic_id,
          COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name, u.id::text) AS pic_name
        FROM users u
        LEFT JOIN sales s ON s.user_id = u.id
        JOIN team_members tm ON tm.user_id = u.id
        JOIN teams t ON t.id = tm.team_id
        WHERE ${teamMembershipCondition(4)}
          AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
      )
      SELECT
        (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS day,
        m.pic_id::text AS "picId",
        m.pic_name AS "picName",
        b.booking_type AS "bookingType",
        COUNT(DISTINCT b.id)::int AS count
      FROM members m
      JOIN leads l ON l.pic_id = m.pic_id
      JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
      JOIN bookings b ON b.car_id = c.id::text
      WHERE b.booking_type IN ('inspection', 'car_viewing')
        AND (b.time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
      GROUP BY 1, 2, 3, 4
    `,
    [input.from, input.to, input.picFilter, input.team],
  );
  return result.rows.map((row: any) => ({
    day: String(row.day),
    picId: String(row.picId),
    picName: String(row.picName),
    bookingType: row.bookingType as HanoiBookingType,
    count: toNumber(row.count),
  }));
}

/** Real dealer bids (price > 1tr) on the cars of every lead with images created in the period. */
async function readImageLeadBids(input: PeriodFilter) {
  const result = await vucarV2Query(
    `
      WITH members AS (
        SELECT DISTINCT u.id AS pic_id
        FROM users u
        JOIN team_members tm ON tm.user_id = u.id
        JOIN teams t ON t.id = tm.team_id
        WHERE ${teamMembershipCondition(4)}
          AND ($3::uuid[] IS NULL OR u.id = ANY($3::uuid[]))
      ),
      image_leads AS (
        SELECT DISTINCT l.id AS lead_id
        FROM members m
        JOIN leads l ON l.pic_id = m.pic_id
        JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
        WHERE (l.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1::date AND $2::date
          AND c.additional_images IS NOT NULL
      )
      SELECT il.lead_id::text AS lead_id, c.id::text AS car_id
      FROM image_leads il
      JOIN cars c ON c.lead_id = il.lead_id AND COALESCE(c.is_deleted, false) = false
    `,
    [input.from, input.to, input.picFilter, input.team],
  );
  const leadCount = new Set(result.rows.map((row: any) => row.lead_id)).size;
  const carIds = result.rows.map((row: any) => row.car_id).filter(Boolean);
  const grouped = carIds.length > 0 ? await biddings.listByCarsGrouped(carIds) : {};
  let bids = 0;
  for (const carId of carIds) {
    for (const bid of grouped[carId] ?? []) {
      if (Number(bid?.price ?? 0) > REAL_BID_MIN) bids += 1;
    }
  }
  return buildHanoiImageLeadBidSummary({ leadsWithImages: leadCount, bids });
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const from = normalizeHanoiFunnelDateInput(searchParams.get("from"), defaultFrom);
    const to = normalizeHanoiFunnelDateInput(searchParams.get("to"), today);
    const team = normalizeHanoiFunnelTeamFilter(searchParams.get("team"));
    const subteam = parseSubteamParam(searchParams.get("subteam"));
    const selectedPic = parseHanoiFunnelPicFilter(searchParams.get("pic"));
    const pic = await resolveSubteamPicFilter({ team, subteamId: subteam, picIds: selectedPic });
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
    const dailyBookingsPromise = optionalHanoiChart(
      "daily bookings",
      readDailyBookingRows({ from, to, team, picFilter }),
      [],
    );
    const imageLeadBidsPromise = optionalHanoiChart("image lead bids", readImageLeadBids({ from, to, team, picFilter }), null);
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
    const [dailyBookingRows, imageLeadBids] = await Promise.all([dailyBookingsPromise, imageLeadBidsPromise]);

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
      filters: { from, to, team, pic: selectedPic, subteam },
      picOptions: picOptionRows.rows,
      overview: buildHanoiOverviewMetrics({
        totalLeads: toNumber(row.totalLeads),
        soldCars: toNumber(row.overviewSoldCars),
        gmv: toNumber(row.overviewGmv),
        expectedRevenue: toNumber(row.overviewExpectedRevenue),
      }),
      speedToClose: buildHanoiSpeedToCloseMetrics(speedMetrics),
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
        totalLeads: toNumber(row.totalLeads),
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
      dailyBookings: buildHanoiDailyBookingChart({ from, to, rows: dailyBookingRows }),
      imageLeadBids,
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
