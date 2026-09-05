import { vucarZaloQuery } from "@/lib/db"

/**
 * Chat message shape returned by fetchZaloMessagesFromDb.
 *
 * Matches the legacy `fetchZaloChatHistory` shape (`senderName`, `dateAction`,
 * `msg_content`, `content`) so existing harness format strings work unchanged,
 * but ALSO carries `msg_id` — a stable Zalo identifier that lets cross-system
 * callers (e.g. Zalo Vucar bot) anchor specific messages without depending
 * on array index ordering.
 */
export interface ZaloChatMessage {
  msg_id: string          // Stable Zalo message identifier
  senderName: string      // "Customer" or "Vucar PIC"
  dateAction: string      // ISO timestamp
  msg_content: string     // Message text
  content: string         // Alias of msg_content (legacy compat)
  is_self: boolean        // true = sent by Vucar PIC, false = customer
  display_name: string | null
  source?: string | null // "bot" = AI Agent, "user" = human sale, "customer" = customer
  msg_type?: string | null // Zalo message kind: null=text, chat.photo, chat.video.msg, share.file, friend_request, webchat...
}

/**
 * Fetch Zalo chat history directly from the VucarZalo database (replaces the
 * legacy 2-source fallback in lib/chat-history-service.ts).
 *
 * Source: `messages` JOIN `leads_relation` by (thread_id, own_id) filtered by phone.
 *
 * Returns the last `limit` messages in CHRONOLOGICAL order (oldest first),
 * which is what the harness expects when formatting the chat section.
 */
export async function fetchZaloMessagesFromDb({
  phone,
  limit = 200,
  cutAt,
}: {
  phone: string
  limit?: number
  /** If provided, only return messages with created_at <= cutAt (for time-anchored eval). */
  cutAt?: string | Date
}): Promise<ZaloChatMessage[]> {
  try {
    const params: unknown[] = [phone]
    let whereClause = "WHERE lr.phone = $1"
    if (cutAt) {
      params.push(cutAt instanceof Date ? cutAt.toISOString() : cutAt)
      whereClause += ` AND m.created_at <= $${params.length}`
    }
    params.push(limit)
    const limitParam = `$${params.length}`

    const res = await vucarZaloQuery(
      `SELECT m.msg_id, m.content, m.is_self, m.created_at, m.display_name, m.source, m.msg_type
       FROM leads_relation lr
       JOIN messages m ON m.thread_id = lr.friend_id AND m.own_id = lr.account_id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ${limitParam}`,
      params
    )

    if (res.rows.length === 0) {
      console.warn(`[zalo-chat-fetcher] No messages for phone=${phone}`)
      return []
    }

    // Reverse so consumer gets oldest → newest order (matches harness format)
    return res.rows.reverse().map((row: any) => ({
      msg_id: String(row.msg_id),
      senderName: row.is_self ? "Vucar PIC" : "Customer",
      dateAction: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
      msg_content: row.content || "",
      content: row.content || "",
      is_self: Boolean(row.is_self),
      display_name: row.display_name || null,
      source: row.source || null,
      msg_type: row.msg_type || null,
    }))
  } catch (err) {
    console.error(`[zalo-chat-fetcher] Failed for phone=${phone}:`, err)
    return []
  }
}

/**
 * Resolve a single message by its stable `msg_id`.
 *
 * Used when anchoring: client sends msgId, server looks up the actual message
 * content/sender/timestamp without relying on array position.
 */
export async function resolveMessageById(msgId: string): Promise<ZaloChatMessage | null> {
  try {
    const res = await vucarZaloQuery(
      `SELECT msg_id, content, is_self, created_at, display_name, source
       FROM messages
       WHERE msg_id = $1
       LIMIT 1`,
      [msgId]
    )
    if (res.rows.length === 0) return null
    const row = res.rows[0]
    return {
      msg_id: String(row.msg_id),
      senderName: row.is_self ? "Vucar PIC" : "Customer",
      dateAction: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
      msg_content: row.content || "",
      content: row.content || "",
      is_self: Boolean(row.is_self),
      display_name: row.display_name || null,
      source: row.source || null,
    }
  } catch (err) {
    console.error(`[zalo-chat-fetcher] resolveMessageById failed for msgId=${msgId}:`, err)
    return null
  }
}
