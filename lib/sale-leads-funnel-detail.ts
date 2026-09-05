import { tryParseCallMessage, tryParseImageMessage } from "@/lib/zalo-message";

export interface SaleLeadDetailZaloMessageInput {
  msg_id: string;
  content: string;
  is_self: boolean;
  dateAction: string;
  msg_type?: string | null;
  source?: string | null;
}

export interface SaleLeadDetailZaloMessage {
  id: string;
  fromMe: boolean;
  sender: string;
  senderKind: "ai" | "human" | "customer";
  senderTag: string;
  content: string;
  at: string;
  type: string;
  imageUrl: string | null;
  thumbUrl: string | null;
  callDurationSeconds: number | null;
  callDurationLabel: string | null;
  callKind: "completed" | "missed" | null;
}

function classifySender(message: SaleLeadDetailZaloMessageInput) {
  const source = String(message.source ?? "").toLowerCase();
  if (!message.is_self) {
    return { sender: "Khách", senderKind: "customer" as const, senderTag: "Khách" };
  }
  if (source === "bot") {
    return { sender: "Vucar", senderKind: "ai" as const, senderTag: "AI" };
  }
  return { sender: "Vucar", senderKind: "human" as const, senderTag: "Human" };
}

export interface SaleLeadDetailDealerBid {
  id: string;
  dealerId: string;
  dealerName: string;
  price: number;
  priceLabel: string;
  version: number;
  phase: "pre_inspection" | "post_inspection";
  createdAt: string;
  comment: string | null;
}

export interface SaleLeadDealerBidRow {
  dealerId: string;
  dealerName: string;
  preInspection: SaleLeadDetailDealerBid | null;
  postInspection: SaleLeadDetailDealerBid | null;
  diff: number | null;
}

function newerBid(a: SaleLeadDetailDealerBid | null, b: SaleLeadDetailDealerBid) {
  if (!a) return b;
  return new Date(b.createdAt).getTime() > new Date(a.createdAt).getTime() ? b : a;
}

export function groupDealerBidsByDealer(bids: SaleLeadDetailDealerBid[]): SaleLeadDealerBidRow[] {
  const rows = new Map<string, SaleLeadDealerBidRow>();

  for (const bid of bids) {
    const existing =
      rows.get(bid.dealerId) ??
      {
        dealerId: bid.dealerId,
        dealerName: bid.dealerName,
        preInspection: null,
        postInspection: null,
        diff: null,
      };

    if (bid.phase === "post_inspection") {
      existing.postInspection = newerBid(existing.postInspection, bid);
    } else {
      existing.preInspection = newerBid(existing.preInspection, bid);
    }
    rows.set(bid.dealerId, existing);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      diff:
        row.preInspection && row.postInspection
          ? row.postInspection.price - row.preInspection.price
          : null,
    }))
    .sort((a, b) => {
      const aTime = Math.max(
        a.preInspection ? new Date(a.preInspection.createdAt).getTime() : 0,
        a.postInspection ? new Date(a.postInspection.createdAt).getTime() : 0,
      );
      const bTime = Math.max(
        b.preInspection ? new Date(b.preInspection.createdAt).getTime() : 0,
        b.postInspection ? new Date(b.postInspection.createdAt).getTime() : 0,
      );
      return bTime - aTime;
    });
}

export function mapZaloMessageForSaleLeadDetail(
  message: SaleLeadDetailZaloMessageInput,
): SaleLeadDetailZaloMessage {
  const image = tryParseImageMessage(message.content);
  const call = tryParseCallMessage(message.content);
  const sender = classifySender(message);

  return {
    id: message.msg_id,
    fromMe: message.is_self,
    sender: sender.sender,
    senderKind: sender.senderKind,
    senderTag: sender.senderTag,
    content: call ? (call.kind === "missed" ? "Cuộc gọi nhỡ" : "Cuộc gọi") : message.content,
    at: message.dateAction,
    type: call ? "call" : message.msg_type || "text",
    imageUrl: image?.href ?? null,
    thumbUrl: image?.thumb ?? null,
    callDurationSeconds: call?.durationSeconds ?? null,
    callDurationLabel: call?.durationLabel ?? null,
    callKind: call?.kind ?? null,
  };
}
