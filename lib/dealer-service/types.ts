export interface Bidding {
  id: string;
  dealer_id: string;
  car_id: string;
  price: number;
  version: number;
  created_at: string;
  comment: string | null;
  /** true only for rows written/updated by AI auto-capture; manual rows are false. */
  auto_capture?: boolean;
  /** whether the dealer outreach was auto-sent by AI (nullable on legacy rows). */
  auto_send?: boolean | null;
  /**
   * Whether the dealer is still interested in this car. Absent on responses from
   * a dealer-service that predates surfacing the column — treat absent as
   * "interested" (fail-open). Explicit false = the dealer withdrew.
   */
  is_interested?: boolean | null;
}

export interface BiddingWithDealer extends Bidding {
  dealer_name: string;
  status: "sent" | "bid";
}

export interface UpsertBiddingInput {
  carId: string;
  dealerId: string;
  price: number;
  comment?: string;
  /**
   * Bidding version for the same (car_id, dealer_id) pair. Pre-inspection rows
   * start at 1; post-inspection captures use later versions. The service
   * requires it — the client defaults to 1 when a caller omits it.
   */
  version?: number;
  /** Set true when capturing a real dealer bid; omit to use the column default. */
  isInterested?: boolean;
  autoSend?: boolean | null;
  autoCapture?: boolean;
}

/**
 * PATCH /v1/biddings identifies the row by car_id + dealer_id + version (the
 * service no longer accepts a bare `id`). At least one of price, comment,
 * autoSend, or autoCapture must be provided.
 */
export interface UpdateBiddingInput {
  carId: string;
  dealerId: string;
  version: number;
  price?: number;
  comment?: string;
  autoSend?: boolean | null;
  autoCapture?: boolean;
  /** Explicit false = the dealer withdrew (no longer wants the car). */
  isInterested?: boolean | null;
}

/** Optional filters for GET /v1/biddings. */
export interface ListBiddingsFilters {
  /** Tri-state: true/false filter, or "null" to match rows where auto_send IS NULL. */
  autoSend?: boolean | "null";
  autoCapture?: boolean;
}

export interface UpsertResult {
  id?: string;
  sale_own_id?: string;
  dealer_id?: string;
  action: "created" | "updated" | "upserted";
}

export interface ModeBidResult {
  value: number | null;
  modeCount: number | null;
}

export interface ZaloDealerConnection {
  sale_own_id: string;
  dealer_id: string;
  dealer_own_id: string;
  created_at?: string;
  updated_at?: string;
}

export interface ListZaloDealerConnectionsInput {
  saleOwnId: string;
  dealerIds?: string[];
}

export interface UpsertZaloDealerConnectionInput {
  saleOwnId: string;
  dealerId: string;
  dealerOwnId: string;
}
