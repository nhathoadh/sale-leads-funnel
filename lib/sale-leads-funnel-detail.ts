import { tryParseCallMessage, tryParseImageMessage } from "@/lib/zalo-message";

export interface SaleLeadDetailZaloMessageInput {
  msg_id: string;
  content: string;
  is_self: boolean;
  dateAction: string;
  msg_type?: string | null;
}

export interface SaleLeadDetailZaloMessage {
  id: string;
  fromMe: boolean;
  sender: string;
  content: string;
  at: string;
  type: string;
  imageUrl: string | null;
  thumbUrl: string | null;
  callDurationSeconds: number | null;
  callDurationLabel: string | null;
}

export function mapZaloMessageForSaleLeadDetail(
  message: SaleLeadDetailZaloMessageInput,
): SaleLeadDetailZaloMessage {
  const image = tryParseImageMessage(message.content);
  const call = tryParseCallMessage(message.content);

  return {
    id: message.msg_id,
    fromMe: message.is_self,
    sender: message.is_self ? "Vucar" : "Khách",
    content: call ? "Cuộc gọi" : message.content,
    at: message.dateAction,
    type: call ? "call" : message.msg_type || "text",
    imageUrl: image?.href ?? null,
    thumbUrl: image?.thumb ?? null,
    callDurationSeconds: call?.durationSeconds ?? null,
    callDurationLabel: call?.durationLabel ?? null,
  };
}
