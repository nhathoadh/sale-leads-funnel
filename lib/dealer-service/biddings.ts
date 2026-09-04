/**
 * Dealer biddings client — HTTP face over the dealer service (vucar-RDS-proxy).
 *
 * Every function keeps the SAME signature/return type it had when this module
 * queried the DRM database directly, so existing callers are unchanged; only the
 * implementation moved from SQL to an authenticated HTTP call.
 */
import { dealerFetch } from "./db";
import type {
  Bidding,
  BiddingWithDealer,
  UpsertBiddingInput,
  UpdateBiddingInput,
  ListBiddingsFilters,
  UpsertResult,
  ModeBidResult,
} from "./types";

export async function listByCar(
  carId: string,
  filters: ListBiddingsFilters = {},
): Promise<Bidding[]> {
  return dealerFetch<Bidding[]>("/v1/biddings", {
    query: {
      carId,
      auto_send: filters.autoSend === undefined ? undefined : String(filters.autoSend),
      auto_capture: filters.autoCapture === undefined ? undefined : String(filters.autoCapture),
    },
  });
}

export async function listLatestPerDealer(carId: string): Promise<BiddingWithDealer[]> {
  const rows = await dealerFetch<any[]>("/v1/biddings/latest-per-dealer", { query: { carId } });
  return rows
    .map((row) => ({
      id: row.id,
      dealer_id: row.dealer_id,
      car_id: row.car_id,
      price: Number(row.price),
      version: Number(row.version || 1),
      created_at: row.created_at,
      comment: row.comment,
      dealer_name: row.dealer_name || "Unknown Dealer",
      status: row.status as "sent" | "bid",
      auto_capture: Boolean(row.auto_capture),
      auto_send: row.auto_send ?? null,
      is_interested: row.is_interested ?? null,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// The dealer-service caps request bodies (~100kb), so a large car_ids batch returns
// 413 "request entity too large". Split into batches that stay well under the limit
// (~500 UUIDs ≈ 20kb) and merge the per-batch Record responses.
const CAR_ID_BATCH_SIZE = 500;

async function fetchByCarIdsBatched<T>(
  path: string,
  carIds: string[],
  extraBody: Record<string, unknown> = {},
): Promise<Record<string, T>> {
  const merged: Record<string, T> = {};
  for (let i = 0; i < carIds.length; i += CAR_ID_BATCH_SIZE) {
    const chunk = carIds.slice(i, i + CAR_ID_BATCH_SIZE);
    const res = await dealerFetch<Record<string, T>>(path, {
      method: "POST",
      body: { car_ids: chunk, ...extraBody },
    });
    Object.assign(merged, res);
  }
  return merged;
}

export async function listByCarsGrouped(carIds: string[]): Promise<Record<string, any[]>> {
  if (!carIds || carIds.length === 0) return {};
  return fetchByCarIdsBatched<any[]>("/v1/biddings/by-cars", carIds);
}

export async function highestBid(carId: string, minPrice: number): Promise<number | null> {
  const res = await dealerFetch<{ max_price: number | null }>("/v1/biddings/highest", {
    method: "POST",
    body: { car_id: carId, min_price: minPrice },
  });
  return res.max_price !== null && res.max_price !== undefined ? Number(res.max_price) : null;
}

export async function highestBidForCars(
  carIds: string[],
  minPrice = 1,
): Promise<Record<string, number>> {
  // Validate client-side too (defense in depth — the literal is also validated server-side).
  if (!Number.isFinite(minPrice)) {
    throw new Error("highestBidForCars: minPrice must be a finite number");
  }
  if (!carIds || carIds.length === 0) return {};
  const res = await fetchByCarIdsBatched<number | string>(
    "/v1/biddings/highest",
    carIds,
    { min_price: minPrice },
  );
  const map: Record<string, number> = {};
  for (const [carId, v] of Object.entries(res)) map[carId] = Number(v);
  return map;
}

export async function dedupCheck(carId: string, dealerId: string): Promise<boolean> {
  const res = await dealerFetch<{ exists: boolean }>("/v1/biddings/dedup", {
    query: { carId, dealerId },
  });
  return res.exists;
}

function upsertBody(input: UpsertBiddingInput) {
  return {
    car_id: input.carId,
    dealer_id: input.dealerId,
    price: input.price,
    // The service requires version (min 1); default a fresh pre-inspection row to 1.
    version: input.version ?? 1,
    comment: input.comment,
    is_interested: input.isInterested,
    auto_send: input.autoSend,
    auto_capture: input.autoCapture,
  };
}

export async function create(input: UpsertBiddingInput): Promise<{ id: string }> {
  // The service has no force-insert endpoint; upsert creates when the pair is
  // absent (the only path create() was ever reached on). Returns the new id.
  const res = await dealerFetch<UpsertResult>("/v1/biddings/upsert", {
    method: "POST",
    body: upsertBody(input),
  });
  if (!res.id) throw new Error("Dealer bidding create did not return an id");
  return { id: res.id };
}

export async function upsert(input: UpsertBiddingInput): Promise<UpsertResult> {
  return dealerFetch<UpsertResult>("/v1/biddings/upsert", {
    method: "POST",
    body: upsertBody(input),
  });
}

export async function update(input: UpdateBiddingInput): Promise<string | null> {
  const res = await dealerFetch<{ success: boolean; car_id: string | null }>("/v1/biddings", {
    method: "PATCH",
    body: {
      car_id: input.carId,
      dealer_id: input.dealerId,
      version: input.version,
      price: input.price,
      comment: input.comment,
      auto_send: input.autoSend,
      auto_capture: input.autoCapture,
      is_interested: input.isInterested,
    },
  });
  return res.car_id ?? null;
}

export async function broadcastSentinel(args: {
  carId: string;
  dealerId: string;
  /** Set true for an AUTOMATIC broadcast (agent/rebrander/cron). Persisted only on the
   *  INSERT of a new sentinel; a re-delivery leaves the existing row's auto_send untouched. */
  autoSend?: boolean;
}): Promise<void> {
  await dealerFetch("/v1/biddings/sentinel", {
    method: "POST",
    body: { car_id: args.carId, dealer_id: args.dealerId, auto_send: args.autoSend },
  });
}

export async function modeBidPrice(carId: string): Promise<ModeBidResult> {
  return dealerFetch<ModeBidResult>("/v1/biddings/mode", { query: { carId } });
}

// ── Read helpers used by analytics routes (ask-about-dealer, m5-cohort-bids) ─

/** Aggregate bid stats for a dealer (price >= 1, sentinels included). */
export async function stats(dealerId: string): Promise<any> {
  return dealerFetch<any>("/v1/biddings/stats", { query: { dealerId } });
}

/** Real bids (price > SENTINEL_MAX) for a cohort of cars, enriched with dealer name. */
export async function cohort(carIds: string[], limit?: number): Promise<any[]> {
  if (!carIds || carIds.length === 0) return [];
  return dealerFetch<any[]>("/v1/biddings/cohort", {
    method: "POST",
    body: { car_ids: carIds, limit },
  });
}

/** Recent bids by a dealer, joined with car brand/model/year. */
export async function recentByDealer(dealerId: string, limit = 10): Promise<any[]> {
  return dealerFetch<any[]>("/v1/biddings/recent-by-dealer", { query: { dealerId, limit } });
}

/** Cars where this dealer holds the highest bid. */
export async function wonAuctions(dealerId: string, limit = 10): Promise<any[]> {
  return dealerFetch<any[]>("/v1/biddings/won-auctions", { query: { dealerId, limit } });
}
