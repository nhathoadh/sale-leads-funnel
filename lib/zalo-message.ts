// Tin nhắn ẢNH của Zalo KHÔNG lưu text — content là một cục JSON:
//   {"title":"","description":"","href":"https://photo-xx.zdn.vn/...jpg","thumb":"...","hd":"...","params":"{\"group_layout_id\":..}"}
// Chỗ nào render thẳng `content` sẽ đổ nguyên JSON ra màn hình (bug "chưa xem được hình").
// → Luôn thử tryParseImageMessage(content) trước; có kết quả thì render <img>, không thì mới coi là text.
//
// Trước đây hàm này nằm CỤC BỘ trong components/pic-label/PicLabelEditor.tsx nên khung chat của
// watcher/e2e không dùng được. Tách ra đây làm một nguồn duy nhất.
export interface ParsedImageMessage {
  href: string  // ảnh gốc (hd nếu có) — dùng khi mở full
  thumb: string // ảnh nhỏ — dùng để hiện trong bong bóng chat
  group_layout_id?: number // ảnh gửi theo lô cùng group_layout_id = 1 chùm
}

export interface ParsedCallMessage {
  durationSeconds: number
  durationLabel: string
}

function parseJson(value: string | null | undefined): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function formatCallDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  if (minutes > 0 && seconds > 0) return `${minutes} phút ${seconds} giây`
  if (minutes > 0) return `${minutes} phút`
  return `${seconds} giây`
}

export function tryParseImageMessage(content: string | null | undefined): ParsedImageMessage | null {
  if (!content) return null
  const t = content.trim()
  if (!t.startsWith("{")) return null
  try {
    const parsed = parseJson(t)
    if (parsed.href && (parsed.thumb || parsed.href)) {
      let params: any = {}
      if (parsed.params) {
        params = typeof parsed.params === "string" ? parseJson(parsed.params) || {} : parsed.params
      }
      const href = String(parsed.hd || parsed.href)
      const thumb = String(parsed.thumb || parsed.href)
      const hasMediaDimensions = Number(params?.width ?? 0) > 0 && Number(params?.height ?? 0) > 0
      const isZaloPhotoHost = /^https:\/\/photo[-.]/.test(href) || /^https:\/\/photo[-.]/.test(thumb)
      if (!hasMediaDimensions && !isZaloPhotoHost) return null
      return {
        href,
        thumb,
        group_layout_id: params?.group_layout_id,
      }
    }
  } catch {
    /* không phải JSON hợp lệ → coi như text thường */
  }
  return null
}

export function tryParseCallMessage(content: string | null | undefined): ParsedCallMessage | null {
  if (!content) return null
  const parsed = parseJson(content.trim())
  if (!parsed) return null

  const params = typeof parsed.params === "string" ? parseJson(parsed.params) : parsed.params
  const action = String(parsed.action ?? "")
  const title = String(parsed.title ?? "")
  const description = String(parsed.description ?? "")
  const durationSeconds = Number(params?.duration)

  if (title !== "sendBubbleMessage") return null
  if (action !== "recommened.calltime") return null
  if (!description.toLowerCase().includes("cuộc gọi") && !description.toLowerCase().includes("cuoc goi")) return null
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) return null

  return {
    durationSeconds: Math.floor(durationSeconds),
    durationLabel: formatCallDuration(durationSeconds),
  }
}
