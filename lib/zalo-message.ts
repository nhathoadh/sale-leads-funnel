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

export function tryParseImageMessage(content: string | null | undefined): ParsedImageMessage | null {
  if (!content) return null
  const t = content.trim()
  if (!t.startsWith("{")) return null
  try {
    const parsed = JSON.parse(t)
    if (parsed.href && (parsed.thumb || parsed.href)) {
      let params: any = {}
      if (parsed.params) {
        try {
          params = typeof parsed.params === "string" ? JSON.parse(parsed.params) : parsed.params
        } catch {
          /* params hỏng → bỏ qua, ảnh vẫn hiện được */
        }
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
