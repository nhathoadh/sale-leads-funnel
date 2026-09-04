import { NextResponse } from "next/server";

import { e2eQuery, vucarV2Query, vucarZaloQuery } from "@/lib/db";
import { biddings } from "@/lib/dealer-service";
import {
  SALE_LEAD_STAGE_CONFIG,
  calculateGapPercent,
  classifySaleLeadStage,
  filterSaleLeadRows,
  formatMillionShort,
  getSaleLeadFilterCounts,
  getGapBucket,
  getQuoteTimestamps,
  isInInspectionRegion,
  type AgentPricingEvents,
  type SaleLeadGapBucket,
  type SaleLeadWorkStage,
} from "@/lib/sale-leads-funnel";

export const dynamic = "force-dynamic";

const MAX_BASE_ROWS = 500;
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

function imageCount(additionalImages: unknown) {
  const parsed = parseJson(additionalImages) ?? {};
  let count = 0;
  for (const value of Object.values(parsed)) {
    if (Array.isArray(value)) count += value.length;
  }
  return count;
}

function hasEnoughImages(additionalImages: unknown, summaryHadImage: boolean) {
  const parsed = parseJson(additionalImages) ?? {};
  const hasOutside = Array.isArray(parsed.outside) && parsed.outside.length > 0;
  const hasPaper = Array.isArray(parsed.paper) && parsed.paper.length > 0;
  return (hasOutside && hasPaper) || summaryHadImage;
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

function extractAgentPricingEvents(atoms: unknown): AgentPricingEvents | null {
  const parsed = parseJson(atoms);
  return parsed?.agent_pricing_events ?? null;
}

function bidSummary(rows: any[] | undefined) {
  const validRows = (rows ?? [])
    .map((row) => ({
      ...row,
      price: Number(row.price ?? 0),
      version: Number(row.version ?? 1),
      created_at: row.created_at ? String(row.created_at) : null,
      dealer_name: row.dealer_name || row.dealerName || "Unknown Dealer",
    }))
    .filter((row) => row.price > 1_000_000 && row.is_interested !== false);

  const pre = validRows.filter((row) => row.version <= 1);
  const post = validRows.filter((row) => row.version >= 2);
  const highest = validRows.reduce<any | null>((best, row) => (!best || row.price > best.price ? row : best), null);

  const latestAt = (items: any[]) =>
    items.reduce<string | null>((latest, row) => {
      if (!row.created_at) return latest;
      return !latest || new Date(row.created_at).getTime() > new Date(latest).getTime() ? row.created_at : latest;
    }, null);

  return {
    highestBid: highest?.price ?? null,
    highestDealerName: highest?.dealer_name ?? null,
    preInspectionBidCount: pre.length,
    postInspectionBidCount: post.length,
    latestPreInspectionBidAt: latestAt(pre),
    latestPostInspectionBidAt: latestAt(post),
  };
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
    const inspectedFilter = parseBooleanFilter(searchParams.get("inspected"));
    const picIds = parseCsv(searchParams.get("pic")).filter((id) => UUID_RE.test(id));

    const queryParams: unknown[] = [from, to];
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
         ss.price_sold,
         ss.qualified,
         ss.intention,
         ss.negotiation_ability
       FROM leads l
       JOIN cars c ON c.lead_id = l.id AND COALESCE(c.is_deleted, false) = false
       LEFT JOIN latest_status ss ON ss.car_id = c.id
       LEFT JOIN users u ON u.id = l.pic_id
       LEFT JOIN sales s ON s.user_id = u.id
       WHERE c.created_at >= $1::date
         AND c.created_at < ($2::date + INTERVAL '1 day')
         ${picCondition}
       ORDER BY c.created_at DESC
       LIMIT $${queryParams.length}::int`,
      queryParams,
    );

    const baseRows = baseResult.rows;
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
               COUNT(m.msg_id) FILTER (
                 WHERE m.is_self = false
                   AND m.content IS NOT NULL
                   AND m.content LIKE '{%'
                   AND (m.content LIKE '%"href"%' OR m.content LIKE '%"thumb"%')
                   AND (
                     m.content LIKE '%"width"%'
                     AND m.content LIKE '%"height"%'
                     OR m.content LIKE '%https://photo-%'
                     OR m.content LIKE '%https://photo.%'
                   )
               ) AS customer_image_message_count,
               MAX(m.created_at) AS last_message_at,
               MAX(m.created_at) FILTER (WHERE m.is_self = false) AS last_customer_at,
               MAX(m.created_at) FILTER (WHERE m.is_self = true) AS last_sale_at
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
        const bid = bidSummary((groupedBids as Record<string, any[]>)[row.car_id]);
        const fallbackHighestBid = bid.highestBid ?? numberOrNull(row.price_highest_bid);
        const zalo = row.phone ? zaloByPhone.get(row.phone) : null;
        const relationCount = Number(zalo?.relation_count ?? 0);
        const customerMessageCount = Number(zalo?.customer_message_count ?? 0);
        const customerZaloImageCount = Number(zalo?.customer_image_message_count ?? 0);
        const inspected = inspectionByCar.has(row.car_id);
        const booked = bookingByCar.has(row.car_id);
        const priceCustomer = numberOrNull(row.price_customer ?? latest?.price_customer);
        const gapPercent = calculateGapPercent(priceCustomer, fallbackHighestBid);
        const storedImageCount = imageCount(row.additional_images);
        const summaryHadImage = latest?.had_car_image === true || latest?.had_image === true;
        const hasImages = storedImageCount > 0 || customerZaloImageCount > 0 || summaryHadImage;
        const hasEnoughImagesForStage = hasEnoughImages(row.additional_images, summaryHadImage) || customerZaloImageCount > 0;
        const classifierInput = {
          crmStage: row.stage,
          hasZaloChat: relationCount > 0,
          customerMessageCount,
          hasEnoughImages: hasEnoughImagesForStage,
          inInspectionRegion: isInInspectionRegion(row.location ?? latest?.location),
          hasInspectionBooking: booked,
          isInspected: inspected,
          highestBid: fallbackHighestBid,
          preInspectionBidCount: bid.preInspectionBidCount,
          postInspectionBidCount: bid.postInspectionBidCount,
          latestPreInspectionBidAt: bid.latestPreInspectionBidAt,
          latestPostInspectionBidAt: bid.latestPostInspectionBidAt,
          quoteTs: normalizeQuoteTsFromSnapshots(snapshots),
          priceVucarOfferedAt: latest?.price_vucar_offered_at ?? null,
          priceVucarOffered: numberOrNull(latest?.price_vucar_offered),
          agentPricingEvents: extractAgentPricingEvents(signalByCar.get(row.car_id)),
        };
        const workStage = classifySaleLeadStage(classifierInput);
        if (!workStage) return null;
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
          plate: row.plate,
          sku: row.sku,
          createdAt: row.car_created_at ?? row.lead_created_at,
          crmStage: row.stage || "UNDEFINED",
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
          lastTouchAt,
          lastTouchHours: hoursSince(lastTouchAt),
          lastCustomerAt: zalo?.last_customer_at ? String(zalo.last_customer_at) : null,
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
    const filteredRows = filterSaleLeadRows(allRows, {
      stages: stageFilter,
      gaps: gapFilter,
      hasImages: hasImagesFilter,
      inspected: inspectedFilter,
    });
    const sortedRows = sortRows(filteredRows, sort);
    const total = sortedRows.length;
    const start = (page - 1) * perPage;
    const leads = sortedRows.slice(start, start + perPage);

    const picOptions = Array.from(
      new Map(
        baseRows
          .filter((row: any) => row.pic_id)
          .map((row: any) => [row.pic_id, { id: row.pic_id, name: row.pic_name || row.pic_id }]),
      ).values(),
    ).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "vi"));

    return NextResponse.json({
      filters: {
        from,
        to,
        pic: picIds,
        stage: stageFilter,
        gap: gapFilter,
        hasImages: hasImagesFilter,
        inspected: inspectedFilter,
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
      counts,
      stages: SALE_LEAD_STAGE_CONFIG.map((stage) => ({ ...stage, count: counts.stages[stage.key] ?? 0 })),
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
