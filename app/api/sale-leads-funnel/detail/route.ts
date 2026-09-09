import { NextResponse } from "next/server";

import { vucarV2Query, vucarZaloQuery } from "@/lib/db";
import { biddings } from "@/lib/dealer-service";
import { fetchZaloMessagesFromDb } from "@/lib/zalo-chat-fetcher";
import { formatMillionShort } from "@/lib/sale-leads-funnel";
import {
  buildSaleLeadExternalLinks,
  mapZaloMessageForSaleLeadDetail,
  selectSaleWorkspaceId,
} from "@/lib/sale-leads-funnel-detail";

export const dynamic = "force-dynamic";

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

function displayCar(row: any) {
  return [row.brand, row.model, row.variant, row.year].filter(Boolean).join(" ") || row.sku || row.car_id;
}

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const carId = searchParams.get("carId");
    if (!carId) return NextResponse.json({ error: "carId is required" }, { status: 400 });

    const result = await vucarV2Query(
      `WITH latest_status AS (
         SELECT DISTINCT ON (ss.car_id)
           ss.*
         FROM sale_status ss
         WHERE ss.car_id = $1::uuid
         ORDER BY ss.car_id, ss.updated_at DESC NULLS LAST, ss.created_at DESC NULLS LAST
       ),
       latest_summary AS (
         SELECT DISTINCT ON (c.id)
           c.id::text AS car_id,
           sp.result
         FROM cars c
         JOIN leads l ON l.id = c.lead_id
         JOIN chat_summary cs ON cs.lead_id = l.id
         JOIN summary_properties sp ON sp.summary_id = cs.id
         WHERE c.id = $1::uuid
         ORDER BY c.id, sp.created_at DESC
       )
       SELECT
         l.id::text AS lead_id,
         l.name AS lead_name,
         l.phone,
         l.additional_phone,
         l.source,
         l.customer_feedback,
         l.e2e_status_reason,
         l.created_at AS lead_created_at,
         l.pic_id::text AS pic_id,
         COALESCE(NULLIF(BTRIM(s.name), ''), u.user_name) AS pic_name,
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
         ss.reason,
         ss.notes,
         ss.gmv_flow_no_reason,
         ss.qualified,
         ss.intention,
         ss.negotiation_ability,
         ls.result AS summary_result
       FROM cars c
       JOIN leads l ON l.id = c.lead_id
       LEFT JOIN latest_status ss ON ss.car_id = c.id
       LEFT JOIN users u ON u.id = l.pic_id
       LEFT JOIN sales s ON s.user_id = u.id
       LEFT JOIN latest_summary ls ON ls.car_id = c.id::text
       WHERE c.id = $1::uuid
       LIMIT 1`,
      [carId],
    );

    if (result.rows.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const row = result.rows[0];
    const [
      rawBids,
      latestBids,
      messagesResult,
      activitiesResult,
      zaloRelationResult,
      saleWorkspaceResult,
      relatedCarsResult,
    ] = await Promise.all([
      biddings.listByCar(carId).catch(() => []),
      biddings.listLatestPerDealer(carId).catch(() => []),
      row.phone ? fetchZaloMessagesFromDb({ phone: String(row.phone), limit: 120 }) : Promise.resolve([]),
      vucarV2Query(
         `SELECT
           created_at,
           activity_type,
           actor_type,
           metadata
         FROM sale_activities
         WHERE lead_id = $1::uuid
         ORDER BY created_at DESC
         LIMIT 40`,
        [row.lead_id],
      ).catch(() => ({ rows: [] })),
      row.phone
        ? vucarZaloQuery(
            `SELECT account_id::text AS account_id, friend_id::text AS friend_id
             FROM leads_relation
             WHERE phone = $1
             LIMIT 1`,
            [String(row.phone)],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      row.phone
        ? vucarV2Query(
            `SELECT car_id AS sale_workspace_id
             FROM customer_funnel_event
             WHERE phone = $1
               AND car_id IS NOT NULL
               AND BTRIM(car_id) <> ''
             ORDER BY timestamp DESC
             LIMIT 1`,
            [String(row.phone)],
          ).catch(() => ({ rows: [] }))
        : Promise.resolve({ rows: [] }),
      vucarV2Query(
        `WITH latest_status AS (
           SELECT DISTINCT ON (ss.car_id)
             ss.car_id,
             ss.price_highest_bid
           FROM sale_status ss
           JOIN cars c ON c.id = ss.car_id
           WHERE c.lead_id = $1::uuid
           ORDER BY ss.car_id, ss.updated_at DESC NULLS LAST, ss.created_at DESC NULLS LAST
         )
         SELECT
           c.id::text AS car_id,
           c.created_at,
           ls.price_highest_bid
         FROM cars c
         LEFT JOIN latest_status ls ON ls.car_id = c.id
         WHERE c.lead_id = $1::uuid
           AND COALESCE(c.is_deleted, false) = false
         ORDER BY c.created_at DESC`,
        [row.lead_id],
      ).catch(() => ({ rows: [] })),
    ]);

    const dealerNames = new Map(latestBids.map((bid: any) => [bid.dealer_id, bid.dealer_name]));
    const dealerBids = rawBids
      .map((bid: any) => ({
        id: bid.id,
        dealerId: bid.dealer_id,
        dealerName: dealerNames.get(bid.dealer_id) || bid.dealer_name || "Unknown Dealer",
        price: Number(bid.price ?? 0),
        priceLabel: Number(bid.price ?? 0) > 1_000_000 ? formatMillionShort(Number(bid.price ?? 0)) : "Đã chào, chưa có giá",
        version: Number(bid.version ?? 1),
        phase: Number(bid.version ?? 1) >= 2 ? "post_inspection" : "pre_inspection",
        createdAt: bid.created_at,
        comment: bid.comment ?? null,
        isInterested: bid.is_interested ?? null,
        autoCapture: Boolean(bid.auto_capture),
        autoSend: bid.auto_send ?? null,
      }))
      .filter((bid) => bid.price >= 1 && bid.isInterested !== false)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const snapshots = snapshotsFromResult(row.summary_result);
    const timeline = snapshots.slice(-30).map((snap) => ({
      at: snap.created_at ?? null,
      stage: snap.stage ?? null,
      priceCustomer: snap.price_customer ?? null,
      priceVucarOffered: snap.price_vucar_offered ?? null,
      sellerSentiment: snap.seller_sentiment ?? null,
      thinking: snap.thinking_process ?? null,
      priceVucarOfferedAt: snap.price_vucar_offered_at ?? null,
      infoCollectedAt: snap.info_collected_at ?? null,
      inspectionBookedAt: snap.inspection_booked_at ?? null,
    }));

    const messages = messagesResult.map(mapZaloMessageForSaleLeadDetail);
    const zaloRelation = zaloRelationResult.rows[0] ?? null;
    const saleWorkspace = saleWorkspaceResult.rows[0] ?? null;
    const saleWorkspaceId = selectSaleWorkspaceId({
      eventWorkspaceId: saleWorkspace?.sale_workspace_id ? String(saleWorkspace.sale_workspace_id) : null,
      currentCarId: row.car_id ? String(row.car_id) : null,
      relatedCars: relatedCarsResult.rows.map((car: any) => ({
        carId: car.car_id ? String(car.car_id) : null,
        priceHighestBid: car.price_highest_bid ?? null,
        createdAt: car.created_at ?? null,
      })),
    });
    const externalLinks = buildSaleLeadExternalLinks({
      phone: row.phone ? String(row.phone) : null,
      picId: row.pic_id ? String(row.pic_id) : null,
      zaloAccountId: zaloRelation?.account_id ? String(zaloRelation.account_id) : null,
      zaloFriendId: zaloRelation?.friend_id ? String(zaloRelation.friend_id) : null,
      saleWorkspaceId,
    });

    return NextResponse.json({
      lead: {
        leadId: row.lead_id,
        carId: row.car_id,
        leadName: row.lead_name || "Chưa có tên",
        phone: row.phone,
        additionalPhone: row.additional_phone,
        source: row.source,
        customerFeedback: row.customer_feedback,
        picId: row.pic_id,
        picName: row.pic_name || "Chưa rõ PIC",
        createdAt: row.car_created_at ?? row.lead_created_at,
        carName: displayCar(row),
        brand: row.brand,
        model: row.model,
        variant: row.variant,
        year: row.year,
        mileage: row.mileage,
        location: row.location,
        plate: row.plate,
        sku: row.sku,
        crmStage: row.stage || "UNDEFINED",
        priceCustomer: row.price_customer ?? null,
        priceHighestBid: row.price_highest_bid ?? null,
        priceSold: row.price_sold ?? null,
        failureReason: row.reason ?? null,
        notes: row.notes ?? null,
        gmvFlowNoReason: row.gmv_flow_no_reason ?? null,
        qualified: row.qualified ?? null,
        intention: row.intention ?? null,
        negotiationAbility: row.negotiation_ability ?? null,
        e2eStatusReason: row.e2e_status_reason ?? null,
        additionalImages: parseJson(row.additional_images) ?? {},
      },
      dealerBids,
      timeline,
      saleActivities: activitiesResult.rows,
      messages,
      externalLinks,
    });
  } catch (error) {
    console.error("[sale-leads-funnel/detail] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sale lead detail", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
