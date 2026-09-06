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

export interface SaleLeadExternalLinkInput {
  phone?: string | null;
  picId?: string | null;
  zaloAccountId?: string | null;
  zaloFriendId?: string | null;
  saleWorkspaceId?: string | null;
}

export interface SaleLeadExternalLink {
  key: "crm" | "e2e" | "zalo" | "sale_workspace";
  label: string;
  href: string;
}

export interface SaleWorkspaceCandidateCar {
  carId?: string | null;
  priceHighestBid?: number | string | null;
  createdAt?: string | null;
}

export function selectSaleWorkspaceId(input: {
  eventWorkspaceId?: string | null;
  currentCarId?: string | null;
  relatedCars?: SaleWorkspaceCandidateCar[];
}) {
  const eventWorkspaceId = input.eventWorkspaceId?.trim();
  if (eventWorkspaceId) return eventWorkspaceId;

  const currentCarId = input.currentCarId?.trim();
  const relatedCars = (input.relatedCars ?? []).filter((car) => car.carId?.trim());
  const withBidEvidence = relatedCars
    .filter((car) => Number(car.priceHighestBid ?? 0) > 1_000_000)
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

  return withBidEvidence[0]?.carId?.trim() || currentCarId || null;
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

export function buildSaleLeadExternalLinks(input: SaleLeadExternalLinkInput): SaleLeadExternalLink[] {
  const links: SaleLeadExternalLink[] = [];
  const phone = input.phone?.trim();
  const picId = input.picId?.trim();
  const zaloAccountId = input.zaloAccountId?.trim();
  const zaloFriendId = input.zaloFriendId?.trim();
  const saleWorkspaceId = input.saleWorkspaceId?.trim();

  if (phone) {
    links.push({
      key: "crm",
      label: "CRM",
      href: `https://dashboard.vucar.vn/crm-v2?search=${encodeURIComponent(phone)}&searchType=lead`,
    });
  }

  if (phone && picId) {
    links.push({
      key: "e2e",
      label: "E2E",
      href: `https://e2e-management.vucar.vn/e2e/${encodeURIComponent(picId)}?search=${encodeURIComponent(phone)}`,
    });
  }

  if (zaloAccountId && zaloFriendId) {
    links.push({
      key: "zalo",
      label: "Zalo",
      href: `https://zl.vucar.vn/chat/${encodeURIComponent(zaloAccountId)}/${encodeURIComponent(zaloFriendId)}`,
    });
  }

  if (saleWorkspaceId && picId) {
    links.push({
      key: "sale_workspace",
      label: "Sale WS",
      href: `https://saleworkspace.vucar.vn/session/${encodeURIComponent(saleWorkspaceId)}?from=chat&pic=${encodeURIComponent(picId)}`,
    });
  }

  return links;
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
