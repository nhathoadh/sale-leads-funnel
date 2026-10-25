import { NextResponse } from "next/server";

import { e2eQuery, vucarV2Query, vucarZaloQuery } from "@/lib/db";
import { biddings } from "@/lib/dealer-service";
import {
  SALE_LEAD_STAGE_CONFIG,
  buildSaleLeadPicOptions,
  buildSaleLeadStageSummary,
  buildSaleLeadWorkableGapSummary,
  calculateGapPercent,
  classifySaleLeadStage,
  countStoredVehicleImages,
  extractSaleTextQuoteEvents,
  filterSaleLeadRows,
  formatMillionShort,
  getSaleLeadActionFlags,
  getSaleLeadFilterCounts,
  getSaleLeadFilterFacets,
  getOrderedSaleLeadFilterFacets,
  getGapBucket,
  getQuoteTimestamps,
  hasVehicleImagesFromSources,
  isInInspectionRegion,
  isSouthernLeadLocation,
  normalizeSaleLeadTeamFilter,
  resolveSaleLeadCustomerPrice,
  resolveSaleLeadHighestBid,
  summarizeDealerBids,
  type AgentPricingEvents,
  type SaleLeadGapBucket,
  type SaleLeadWorkStage,
} from "@/lib/sale-leads-funnel";
import {
  CREATE_SALE_LEAD_FUNNEL_SNAPSHOT_TABLE_SQL,
  writeSaleLeadSnapshotFile,
} from "@/lib/sale-leads-funnel-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BASE_ROWS = 3_000;
const DEFAULT_PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SortKey = "last_touch_oldest" | "last_touch_newest" | "gap_asc" | "gap_desc" | "created_desc";

function dateInput(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCsv(value: string | null): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBooleanFilter(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function snapshotsFromResult(value: unknown): any[] {
  const parsed = parseJson(value);
  if (!parsed) return [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function latestSnapshot(value: unknown): any {
  const snapshots = snapshotsFromResult(value);
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

function normalizeQuoteTsFromSnapshots(snapshots: any[]) {
  const ts: string[] = [];
  for (const snap of snapshots) {
    const rawQuoteTs = snap?.quote_ts ?? snap?.quoteTs;
    if (Array.isArray(rawQuoteTs)) {
      ts.push(...rawQuoteTs.filter((value) => typeof value === "string"));
    } else if (typeof rawQuoteTs === "string") {
      ts.push(rawQuoteTs);
    }
  }
  return ts;
}

function normalizeTimestampArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((item) => (item instanceof Date ? item.toISOString() : String(item)));
  }
  if (typeof value === "string") return [value];
  return [];
}

function extractAgentPricingEvents(atoms: unknown): AgentPricingEvents | null {
  const parsed = parseJson(atoms);
  return parsed?.agent_pricing_events ?? null;
}

function hoursSince(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 3_600_000);
}

function compareNullableDate(a: string | null, b: string | null, missingLast = false) {
  const aTime = a ? new Date(a).getTime() : null;
  const bTime = b ? new Date(b).getTime() : null;
  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return missingLast ? 1 : -1;
  if (bTime === null) return missingLast ? -1 : 1;
  return aTime - bTime;
}

function sortRows<T extends { lastTouchAt: string | null; gapPercent: number | null; createdAt: string }>(
  rows: T[],
  sort: SortKey,
) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (sort === "last_touch_newest") return compareNullableDate(b.lastTouchAt, a.lastTouchAt, true);
    if (sort === "gap_asc") return (a.gapPercent ?? Number.POSITIVE_INFINITY) - (b.gapPercent ?? Number.POSITIVE_INFINITY);
    if (sort === "gap_desc") return (b.gapPercent ?? -1) - (a.gapPercent ?? -1);
    if (sort === "created_desc") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return compareNullableDate(a.lastTouchAt, b.lastTouchAt, true);
  });
  return sorted;
}

function canWriteSnapshotCache(request: Request) {
  const secret = process.env.SALE_LEADS_SNAPSHOT_SECRET;
  const authorization = request.headers.get("authorization");
  const headerSecret = request.headers.get("x-sale-leads-snapshot-secret");
  const userAgent = request.headers.get("user-agent") ?? "";

  if (!secret) {
    return process.env.NODE_ENV !== "production" || userAgent.includes("vercel-cron");
  }

  return authorization === `Bearer ${secret}` || headerSecret === secret;
}

function latestTimestampForSnapshot(...values: Array<string | null | undefined>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return latest;
    const latestTime = latest ? new Date(latest).getTime() : null;
    return latestTime === null || time > latestTime ? value : latest;
  }, null);
}

async function writeSnapshotCache(input: {
  rows: any[];
  from: string;
  to: string;
  team: string;
  picIds: string[];
}) {
  const snapshotRows = input.rows.map((row) => ({
    car_id: row.carId,
    lead_id: row.leadId,
    phone: row.phone,
    team: input.team,
    pic_id: row.picId,
    pic_name: row.picName,
    car_created_at: row.createdAt,
    work_stage: row.workStage,
    gap_bucket: row.gapBucket,
    has_images: row.hasImages,
    inspected: row.inspected,
    no_human_touch: row.noHumanTouch,
    under_two_bids: row.underTwoBids,
    hot_lead: row.hotLead,
    needs_inspection_booking: row.needsInspectionBooking,
    needs_post_inspection_quote: row.needsPostInspectionQuote,
    last_touch_at: row.lastTouchAt,
    source_updated_at: latestTimestampForSnapshot(
      row.lastTouchAt,
      row.latestPreInspectionBidAt,
      row.latestPostInspectionBidAt,
      row.createdAt,
    ),
    payload: {
      priceCustomer: row.priceCustomer,
      highestBid: row.highestBid,
      qualified: row.qualified,
      dealerBidDealerCount: row.dealerBidDealerCount,
      quoteTimestamps: row.quoteTimestamps,
      lastSaleAt: row.lastSaleAt,
      lastCustomerAt: row.lastCustomerAt,
    },
  }));

  try {
    await vucarV2Query(CREATE_SALE_LEAD_FUNNEL_SNAPSHOT_TABLE_SQL);

    const deleteParams: unknown[] = [input.team, input.from, input.to];
    let picCondition = "";
    if (input.picIds.length > 0) {
      deleteParams.push(input.picIds);
      picCondition = `AND pic_id = ANY($${deleteParams.length}::uuid[])`;
    }
    await vucarV2Query(
      `
        DELETE FROM sale_leads_funnel_snapshots
        WHERE UPPER(team) = UPPER($1::text)
          AND car_created_at >= $2::date
          AND car_created_at < ($3::date + INTERVAL '1 day')
          ${picCondition}
      `,
      deleteParams,
    );

    if (snapshotRows.length > 0) {
      await vucarV2Query(
        `
          WITH input AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS x(
              car_id uuid,
              lead_id uuid,
              phone text,
              team text,
              pic_id uuid,
              pic_name text,
              car_created_at timestamptz,
              work_stage text,
              gap_bucket text,
              has_images boolean,
              inspected boolean,
              no_human_touch boolean,
              under_two_bids boolean,
              hot_lead boolean,
              needs_inspection_booking boolean,
              needs_post_inspection_quote boolean,
              last_touch_at timestamptz,
              source_updated_at timestamptz,
              payload jsonb
            )
          )
          INSERT INTO sale_leads_funnel_snapshots (
            car_id,
            lead_id,
            phone,
            team,
            pic_id,
            pic_name,
            car_created_at,
            work_stage,
            gap_bucket,
            has_images,
            inspected,
            no_human_touch,
            under_two_bids,
            hot_lead,
            needs_inspection_booking,
            needs_post_inspection_quote,
            last_touch_at,
            source_updated_at,
            computed_at,
            payload
          )
          SELECT
            car_id,
            lead_id,
            phone,
            team,
            pic_id,
            pic_name,
            car_created_at,
            work_stage,
            gap_bucket,
            has_images,
            inspected,
            no_human_touch,
            under_two_bids,
            hot_lead,
            needs_inspection_booking,
            needs_post_inspection_quote,
            last_touch_at,
            source_updated_at,
            now(),
            COALESCE(payload, '{}'::jsonb)
          FROM input
          ON CONFLICT (car_id) DO UPDATE SET
            lead_id = EXCLUDED.lead_id,
            phone = EXCLUDED.phone,
            team = EXCLUDED.team,
            pic_id = EXCLUDED.pic_id,
            pic_name = EXCLUDED.pic_name,
            car_created_at = EXCLUDED.car_created_at,
            work_stage = EXCLUDED.work_stage,
            gap_bucket = EXCLUDED.gap_bucket,
            has_images = EXCLUDED.has_images,
            inspected = EXCLUDED.inspected,
            no_human_touch = EXCLUDED.no_human_touch,
            under_two_bids = EXCLUDED.under_two_bids,
            hot_lead = EXCLUDED.hot_lead,
            needs_inspection_booking = EXCLUDED.needs_inspection_booking,
            needs_post_inspection_quote = EXCLUDED.needs_post_inspection_quote,
            last_touch_at = EXCLUDED.last_touch_at,
            source_updated_at = EXCLUDED.source_updated_at,
            computed_at = now(),
            payload = EXCLUDED.payload
        `,
        [JSON.stringify(snapshotRows)],
      );
    }

    return { storage: "db", written: snapshotRows.length };
  } catch (error) {
    console.warn("[sale-leads-funnel] DB snapshot cache unavailable, falling back to file:", error instanceof Error ? error.message : error);
    const fileResult = await writeSaleLeadSnapshotFile({
      rows: snapshotRows as any,
      from: input.from,
      to: input.to,
      team: input.team,
      picIds: input.picIds,
    });
    return { storage: "file", written: fileResult.written, path: fileResult.path, warning: error instanceof Error ? error.message : "db_unavailable" };
  }
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const from = dateInput(searchParams.get("from"), defaultFrom);
    const to = dateInput(searchParams.get("to"), today);
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const perPage = Math.min(100, Math.max(10, Number(searchParams.get("perPage") || DEFAULT_PAGE_SIZE)));
    const sort = (searchParams.get("sort") || "last_touch_oldest") as SortKey;
    const stageFilter = parseCsv(searchParams.get("stage")) as SaleLeadWorkStage[];
    const gapFilter = parseCsv(searchParams.get("gap")) as SaleLeadGapBucket[];
    const hasImagesFilter = parseBooleanFilter(searchParams.get("hasImages"));
    const noImagesFilter = parseBooleanFilter(searchParams.get("noImages"));
    const inspectedFilter = parseBooleanFilter(searchParams.get("inspected"));
    const noHumanTouchFilter = parseBooleanFilter(searchParams.get("noHumanTouch"));
    const underTwoBidsFilter = parseBooleanFilter(searchParams.get("underTwoBids"));
    const hotLeadFilter = parseBooleanFilter(searchParams.get("hotLead"));
    const southernLeadFilter = parseBooleanFilter(searchParams.get("southernLead"));
    const needsInspectionBookingFilter = parseBooleanFilter(searchParams.get("needsInspectionBooking"));
    const needsPostInspectionQuoteFilter = parseBooleanFilter(searchParams.get("needsPostInspectionQuote"));
    const filterOrder = parseCsv(searchParams.get("filterOrder"));
    const picIds = parseCsv(searchParams.get("pic")).filter((id) => UUID_RE.test(id));
    const team = normalizeSaleLeadTeamFilter(searchParams.get("team"));
    const shouldCacheSnapshots = searchParams.get("cacheSnapshots") === "true";
    if (shouldCacheSnapshots && !canWriteSnapshotCache(request)) {
      return NextResponse.json({ error: "Unauthorized snapshot cache write" }, { status: 401 });
    }

    const queryParams: unknown[] = [from, to, team];
    const teamCondition = `AND EXISTS (
           SELECT 1
           FROM team_members tm
           JOIN teams t ON t.id = tm.team_id
           WHERE tm.user_id = l.pic_id
             AND t.name = $3
         )`;
    let picCondition = "";
    if (picIds.length > 0) {
      queryParams.push(picIds);
      picCondition = `AND l.pic_id = ANY($${queryParams.length}::uuid[])`;
    }
    queryParams.push(MAX_BASE_ROWS);

    const baseResult = await vucarV2Query(
      `WITH latest_status AS (
         SELECT DISTINCT ON (ss.car_id)
           ss.*
         FROM sale_status ss
         ORDER BY ss.car_id, ss.updated_at DESC NULLS LAST, ss.created_at DESC NULLS LAST
       )
       SELECT
         l.id::text AS lead_id,
         l.name AS lead_name,
         l.phone,
         l.additional_phone,
         l.created_at AS lead_created_at,
         l.pic_id::text AS pic_id,
         COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name) AS pic_name,
         l.source,
         c.id::text AS car_id,
         c.brand,
         c.model,
         c.variant,
         c.year,
         c.mileage,
         c.location,
         c.plate,
         c.sku,
         c.additional_images,
         c.created_at AS car_created_at,
         ss.stage,
         ss.price_customer,
         ss.price_highest_bid,
         lead_price_fallback.price_customer AS lead_price_customer_fallback,
         lead_price_fallback.price_highest_bid AS lead_price_highest_bid_fallback,
         ss.price_sold,
         ss.first_payment_date,
         ss.qualified,
         ss.intention,
         ss.negotiation_ability,
         ss.is_hot_lead
       FROM leads l
       JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
       LEFT JOIN latest_status ss ON ss.car_id = c.id
       LEFT JOIN LATERAL (
         SELECT
           ss2.price_customer,
           ss2.price_highest_bid
         FROM cars c2
         JOIN sale_status ss2 ON ss2.car_id = c2.id
         WHERE c2.lead_id = l.id
           AND c2.id <> c.id
           AND COALESCE(c2.is_deleted, false) = false
           AND (ss2.price_customer > 1000000 OR ss2.price_highest_bid > 1000000)
         ORDER BY
           CASE
             WHEN ss2.price_customer > 1000000 AND ss2.price_highest_bid > 1000000 THEN 0
             WHEN ss2.price_customer > 1000000 THEN 1
             ELSE 2
           END,
           ss2.updated_at DESC NULLS LAST,
           ss2.created_at DESC NULLS LAST
         LIMIT 1
       ) lead_price_fallback ON true
       LEFT JOIN users u ON u.id = l.pic_id
       LEFT JOIN sales s ON s.user_id = u.id
       WHERE c.created_at >= $1::date
         AND c.created_at < ($2::date + INTERVAL '1 day')
         ${teamCondition}
         ${picCondition}
       ORDER BY c.created_at DESC
       LIMIT $${queryParams.length}::int`,
      queryParams,
    );

    const baseRows = baseResult.rows;
    const picOptionRows =
      picIds.length > 0
        ? (
            await vucarV2Query(
              `SELECT DISTINCT
                 l.pic_id::text AS pic_id,
                 COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name, l.pic_id::text) AS pic_name
               FROM leads l
               JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
               LEFT JOIN users u ON u.id = l.pic_id
               LEFT JOIN sales s ON s.user_id = u.id
               WHERE c.created_at >= $1::date
                 AND c.created_at < ($2::date + INTERVAL '1 day')
                 ${teamCondition}
                 AND l.pic_id IS NOT NULL`,
              [from, to, team],
            )
          ).rows
        : baseRows;
    const carIds = baseRows.map((row: any) => row.car_id).filter(Boolean);
    const phones = Array.from(new Set(baseRows.map((row: any) => row.phone).filter(Boolean)));
    let zaloUnavailable = false;

    const [zaloResult, inspectionResult, bookingResult, summaryResult, signalResult, groupedBids] = await Promise.all([
      phones.length > 0
        ? vucarZaloQuery(
            `SELECT
               lr.phone,
               COUNT(DISTINCT lr.friend_id) AS relation_count,
               COUNT(m.msg_id) AS message_count,
               COUNT(m.msg_id) FILTER (WHERE m.is_self = false) AS customer_message_count,
               COUNT(m.msg_id) FILTER (WHERE m.is_self = true) AS sale_message_count,
               COUNT(m.msg_id) FILTER (WHERE m.is_self = true AND m.source = 'user') AS human_message_count,
               COUNT(m.msg_id) FILTER (WHERE m.is_self = true AND m.source = 'bot') AS ai_message_count,
               COUNT(m.msg_id) FILTER (
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
               ) AS customer_image_message_count,
               MAX(m.created_at) AS last_message_at,
               MAX(m.created_at) FILTER (WHERE m.is_self = false) AS last_customer_at,
               MAX(m.created_at) FILTER (WHERE m.is_self = true) AS last_sale_at,
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
                 JSONB_BUILD_OBJECT('created_at', m.created_at, 'content', m.content)
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
             GROUP BY lr.phone`,
            [phones],
          ).catch((error) => {
            console.warn("[sale-leads-funnel] Zalo stats unavailable:", error instanceof Error ? error.message : error);
            zaloUnavailable = true;
            return { rows: [] };
          })
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? vucarV2Query(
             `SELECT DISTINCT ON (i.car_id)
               i.car_id::text AS car_id,
               i.created_at AS inspected_at,
               i.note IS NOT NULL AS inspected
             FROM inspection i
             WHERE i.car_id = ANY($1::uuid[])
               AND i.note IS NOT NULL
             ORDER BY i.car_id, i.created_at DESC`,
            [carIds],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? vucarV2Query(
            `SELECT car_id, MIN(time) AS booked_at
             FROM bookings
             WHERE car_id = ANY($1::text[])
               AND booking_type = 'inspection'
             GROUP BY car_id`,
            [carIds],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? vucarV2Query(
            `SELECT DISTINCT ON (c.id)
               c.id::text AS car_id,
               sp.result
             FROM cars c
             JOIN leads l ON l.id = c.lead_id
             JOIN chat_summary cs ON cs.lead_id = l.id
             JOIN summary_properties sp ON sp.summary_id = cs.id
             WHERE c.id = ANY($1::uuid[])
             ORDER BY c.id, sp.created_at DESC`,
            [carIds],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? e2eQuery(
             `SELECT DISTINCT ON (car_id)
               car_id::text AS car_id,
               atoms
             FROM agent_signal_snapshots
             WHERE car_id = ANY($1::text[])
             ORDER BY car_id, created_at DESC`,
            [carIds],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      carIds.length > 0
        ? biddings.listByCarsGrouped(carIds).catch((error) => {
            console.warn("[sale-leads-funnel] Dealer bids unavailable:", error instanceof Error ? error.message : error);
            return {};
          })
        : Promise.resolve({}),
    ]);

    const zaloByPhone = new Map(zaloResult.rows.map((row: any) => [row.phone, row]));
    const inspectionByCar = new Map(inspectionResult.rows.map((row: any) => [row.car_id, row]));
    const bookingByCar = new Map(bookingResult.rows.map((row: any) => [row.car_id, row]));
    const summaryByCar = new Map(summaryResult.rows.map((row: any) => [row.car_id, row.result]));
    const signalByCar = new Map(signalResult.rows.map((row: any) => [row.car_id, row.atoms]));

    const allRows = baseRows
      .map((row: any) => {
        const snapshots = snapshotsFromResult(summaryByCar.get(row.car_id));
        const latest = latestSnapshot(summaryByCar.get(row.car_id));
        const bid = summarizeDealerBids((groupedBids as Record<string, any[]>)[row.car_id]);
        const fallbackHighestBid = resolveSaleLeadHighestBid(
          row.price_highest_bid,
          bid.highestBid,
          row.lead_price_highest_bid_fallback,
        );
        const zalo = row.phone ? zaloByPhone.get(row.phone) : null;
        const relationCount = Number(zalo?.relation_count ?? 0);
        const customerMessageCount = Number(zalo?.customer_message_count ?? 0);
        const humanMessageCount = Number(zalo?.human_message_count ?? 0);
        const aiMessageCount = Number(zalo?.ai_message_count ?? 0);
        const customerZaloImageCount = Number(zalo?.customer_image_message_count ?? 0);
        const inspected = inspectionByCar.has(row.car_id);
        const booked = bookingByCar.has(row.car_id);
        const priceCustomer = resolveSaleLeadCustomerPrice(
          row.price_customer,
          latest?.price_customer,
          row.lead_price_customer_fallback,
        );
        const hasCustomerAndDealerPrice = Boolean(priceCustomer && fallbackHighestBid);
        const dealerBidDealerCount = Number(bid.validDealerBidDealerCount ?? 0);
        const noHumanTouch = relationCount > 0 && humanMessageCount <= 0;
        const underTwoBids = hasCustomerAndDealerPrice && dealerBidDealerCount > 0 && dealerBidDealerCount < 2;
        const hotLead = row.is_hot_lead === true;
        const saleTextQuoteEvents = extractSaleTextQuoteEvents(zalo?.sale_text_quote_messages);
        const gapPercent = calculateGapPercent(priceCustomer, fallbackHighestBid);
        const storedImageCount = countStoredVehicleImages(row.additional_images);
        const summaryHadImage = latest?.had_car_image === true || latest?.had_image === true;
        const hasImages = hasVehicleImagesFromSources({
          additionalImages: row.additional_images,
          customerZaloImageCount,
          summaryHadImage,
        });
        const classifierInput = {
          crmStage: row.stage,
          firstPaymentDate: row.first_payment_date ? String(row.first_payment_date) : null,
          intention: row.intention,
          hasZaloChat: relationCount > 0,
          customerMessageCount,
          hasEnoughImages: hasImages,
          inInspectionRegion: isInInspectionRegion(row.location ?? latest?.location),
          hasInspectionBooking: booked,
          isInspected: inspected,
          latestInspectionAt: inspectionByCar.get(row.car_id)?.inspected_at
            ? String(inspectionByCar.get(row.car_id)?.inspected_at)
            : null,
          highestBid: fallbackHighestBid,
          preInspectionBidCount: bid.preInspectionBidCount,
          postInspectionBidCount: bid.postInspectionBidCount,
          latestPreInspectionBidAt: bid.latestPreInspectionBidAt,
          latestPostInspectionBidAt: bid.latestPostInspectionBidAt,
          quoteTs: normalizeQuoteTsFromSnapshots(snapshots),
          priceVucarOfferedAt: latest?.price_vucar_offered_at ?? null,
          priceVucarOffered: numberOrNull(latest?.price_vucar_offered),
          agentPricingEvents: extractAgentPricingEvents(signalByCar.get(row.car_id)),
          saleCompletedCallTs: normalizeTimestampArray(zalo?.sale_completed_call_ts),
          saleTextQuoteTs: saleTextQuoteEvents.map((event) => event.at),
          saleTextQuotePrices: saleTextQuoteEvents
            .map((event) => event.price)
            .filter((price): price is number => price !== null),
        };
        const workStage = classifySaleLeadStage(classifierInput);
        if (!workStage) return null;
        const actionFlags = getSaleLeadActionFlags(classifierInput);
        const quoteTimestamps = getQuoteTimestamps(classifierInput);
        const lastTouchAt = zalo?.last_message_at ? String(zalo.last_message_at) : null;

        return {
          leadId: row.lead_id,
          carId: row.car_id,
          leadName: row.lead_name || "Chưa có tên",
          phone: row.phone,
          picId: row.pic_id,
          picName: row.pic_name || "Chưa rõ PIC",
          source: row.source,
          carName: [row.brand, row.model, row.variant, row.year].filter(Boolean).join(" ") || row.sku || row.car_id,
          brand: row.brand,
          model: row.model,
          variant: row.variant,
          year: row.year,
          mileage: row.mileage,
          location: row.location,
          southernLead: isSouthernLeadLocation(row.location),
          plate: row.plate,
          sku: row.sku,
          createdAt: row.car_created_at ?? row.lead_created_at,
          crmStage: row.stage || "UNDEFINED",
          qualified: row.qualified || "UNDEFINED_QUALIFIED",
          firstPaymentDate: row.first_payment_date ? String(row.first_payment_date) : null,
          workStage,
          priceCustomer,
          highestBid: fallbackHighestBid,
          highestDealerName: bid.highestDealerName,
          gapAmount: priceCustomer && fallbackHighestBid ? Math.max(0, priceCustomer - fallbackHighestBid) : null,
          gapPercent,
          gapBucket: getGapBucket(priceCustomer, fallbackHighestBid),
          inspected,
          booked,
          hasImages,
          noHumanTouch,
          underTwoBids,
          hotLead,
          needsInspectionBooking: actionFlags.needsInspectionBooking,
          needsPostInspectionQuote: actionFlags.needsPostInspectionQuote,
          humanMessageCount,
          aiMessageCount,
          dealerBidDealerCount,
          lastTouchAt,
          lastTouchHours: hoursSince(lastTouchAt),
          lastSaleAt: zalo?.last_sale_at ? String(zalo.last_sale_at) : null,
          lastCustomerAt: zalo?.last_customer_at ? String(zalo.last_customer_at) : null,
          latestPreInspectionBidAt: bid.latestPreInspectionBidAt,
          latestPostInspectionBidAt: bid.latestPostInspectionBidAt,
          quoteTimestamps,
          imageCount: storedImageCount + customerZaloImageCount,
          priceCustomerLabel: formatMillionShort(priceCustomer),
          highestBidLabel: formatMillionShort(fallbackHighestBid),
          gapLabel:
            priceCustomer && fallbackHighestBid
              ? `${formatMillionShort(Math.max(0, priceCustomer - fallbackHighestBid))} · ${gapPercent?.toFixed(1) ?? "?"}%`
              : "—",
        };
      })
      .filter(Boolean) as any[];

    const counts = getSaleLeadFilterCounts(allRows);
    const stageSummary = buildSaleLeadStageSummary(counts);
    const workableGapSummary = buildSaleLeadWorkableGapSummary(allRows);
    const snapshotCache = shouldCacheSnapshots
      ? await writeSnapshotCache({ rows: allRows, from, to, team, picIds })
      : null;
    if (searchParams.get("summary") === "stage") {
      return NextResponse.json({
        filters: {
          from,
          to,
          team,
          pic: picIds,
        },
        scanned: baseRows.length,
        warnings: zaloUnavailable ? ["zalo_unavailable"] : [],
        snapshotCache,
        stageSummary,
        workableGapSummary,
      });
    }

    const activeFilters = {
      stages: stageFilter,
      gaps: gapFilter,
      hasImages: hasImagesFilter,
      noImages: noImagesFilter,
      inspected: inspectedFilter,
      noHumanTouch: noHumanTouchFilter,
      underTwoBids: underTwoBidsFilter,
      hotLead: hotLeadFilter,
      southernLead: southernLeadFilter,
      needsInspectionBooking: needsInspectionBookingFilter,
      needsPostInspectionQuote: needsPostInspectionQuoteFilter,
    };
    const facets =
      filterOrder.length > 0
        ? getOrderedSaleLeadFilterFacets(allRows, { filters: activeFilters, order: filterOrder })
        : getSaleLeadFilterFacets(allRows, activeFilters);
    const filteredRows = filterSaleLeadRows(allRows, {
      ...activeFilters,
    });
    const sortedRows = sortRows(filteredRows, sort);
    const total = sortedRows.length;
    const start = (page - 1) * perPage;
    const leads = sortedRows.slice(start, start + perPage);

    const picOptions = buildSaleLeadPicOptions(picOptionRows);

    return NextResponse.json({
      filters: {
        from,
        to,
        team,
        pic: picIds,
        stage: stageFilter,
        gap: gapFilter,
        hasImages: hasImagesFilter,
        noImages: noImagesFilter,
        inspected: inspectedFilter,
        noHumanTouch: noHumanTouchFilter,
        underTwoBids: underTwoBidsFilter,
        hotLead: hotLeadFilter,
        southernLead: southernLeadFilter,
        needsInspectionBooking: needsInspectionBookingFilter,
        needsPostInspectionQuote: needsPostInspectionQuoteFilter,
        filterOrder,
        sort,
        page,
        perPage,
      },
      total,
      scanned: baseRows.length,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      warnings: zaloUnavailable ? ["zalo_unavailable"] : [],
      snapshotCache,
      counts,
      stageSummary,
      workableGapSummary,
      facets,
      stages: SALE_LEAD_STAGE_CONFIG.map((stage) => ({ ...stage, count: facets.stages[stage.key] ?? 0 })),
      picOptions,
      leads,
    });
  } catch (error) {
    console.error("[sale-leads-funnel] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sale leads funnel", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
