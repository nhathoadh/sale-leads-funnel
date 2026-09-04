import { describe, expect, it } from "vitest";

import { mapZaloMessageForSaleLeadDetail } from "@/lib/sale-leads-funnel-detail";

describe("mapZaloMessageForSaleLeadDetail", () => {
  it("extracts Zalo photo URLs from JSON content", () => {
    const imageJson = JSON.stringify({
      title: "",
      description: "",
      href: "https://photo-stal-12.zdn.vn/no/jpg/example/full.jpg",
      thumb: "https://photo-stal-12.zdn.vn/no/jpg/example/thumb.jpg",
      params: JSON.stringify({
        width: 960,
        height: 1280,
        group_layout_id: 1788232679891,
      }),
      type: "",
    });

    expect(
      mapZaloMessageForSaleLeadDetail({
        msg_id: "msg-1",
        content: imageJson,
        is_self: false,
        dateAction: "2026-09-04T03:00:00.000Z",
        msg_type: "chat.photo",
      }),
    ).toMatchObject({
      id: "msg-1",
      fromMe: false,
      sender: "Khách",
      content: imageJson,
      at: "2026-09-04T03:00:00.000Z",
      type: "chat.photo",
      imageUrl: "https://photo-stal-12.zdn.vn/no/jpg/example/full.jpg",
      thumbUrl: "https://photo-stal-12.zdn.vn/no/jpg/example/thumb.jpg",
    });
  });

  it("keeps normal text messages without image URLs", () => {
    expect(
      mapZaloMessageForSaleLeadDetail({
        msg_id: "msg-2",
        content: "Anh gửi giúp em ảnh đăng kiểm nhé",
        is_self: true,
        dateAction: "2026-09-04T04:00:00.000Z",
        msg_type: null,
      }),
    ).toEqual({
      id: "msg-2",
      fromMe: true,
      sender: "Vucar",
      content: "Anh gửi giúp em ảnh đăng kiểm nhé",
      at: "2026-09-04T04:00:00.000Z",
      type: "text",
      imageUrl: null,
      thumbUrl: null,
    });
  });
});
