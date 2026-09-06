import { describe, expect, it } from "vitest";

import {
  buildSaleLeadExternalLinks,
  groupDealerBidsByDealer,
  mapZaloMessageForSaleLeadDetail,
  selectSaleWorkspaceId,
} from "@/lib/sale-leads-funnel-detail";

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
      senderKind: "customer",
      senderTag: "Khách",
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
        source: "user",
        dateAction: "2026-09-04T04:00:00.000Z",
        msg_type: null,
      }),
    ).toEqual({
      id: "msg-2",
      fromMe: true,
      sender: "Vucar",
      senderKind: "human",
      senderTag: "Human",
      content: "Anh gửi giúp em ảnh đăng kiểm nhé",
      at: "2026-09-04T04:00:00.000Z",
      type: "text",
      imageUrl: null,
      thumbUrl: null,
      callDurationSeconds: null,
      callDurationLabel: null,
      callKind: null,
    });
  });

  it("tags outbound bot messages as AI Agent", () => {
    expect(
      mapZaloMessageForSaleLeadDetail({
        msg_id: "msg-bot",
        content: "Em chào anh, em là trợ lý Vucar.",
        is_self: true,
        source: "bot",
        dateAction: "2026-09-04T04:05:00.000Z",
        msg_type: null,
      }),
    ).toMatchObject({
      sender: "Vucar",
      senderKind: "ai",
      senderTag: "AI",
    });
  });

  it("does not treat Zalo contact cards as customer car photos", () => {
    const contactCardJson = JSON.stringify({
      title: "Haiqm đã đồng ý kết bạn",
      description: "Hai bên đã có thể nhắn tin với nhau",
      href: "https://res-zalo.zadn.vn/some/contact-card.png",
      thumb: "https://res-zalo.zadn.vn/some/contact-card.png",
      params: JSON.stringify({
        actions: [],
        header: {},
        layoutType: 0,
        notifyTxt: "Đã đồng ý kết bạn",
      }),
      type: "0",
    });

    expect(
      mapZaloMessageForSaleLeadDetail({
        msg_id: "msg-3",
        content: contactCardJson,
        is_self: false,
        dateAction: "2026-09-04T04:00:00.000Z",
        msg_type: "chat.ecard",
      }),
    ).toMatchObject({
      imageUrl: null,
      thumbUrl: null,
    });
  });

  it("extracts Zalo call duration from bubble messages", () => {
    const callJson = JSON.stringify({
      title: "sendBubbleMessage",
      description: "Cuộc gọi",
      href: "",
      thumb: "",
      childnumber: 0,
      action: "recommened.calltime",
      params: JSON.stringify({
        duration: 145,
        isCaller: 0,
        isEnableCallback: 1,
        calltype: 0,
      }),
    });

    expect(
      mapZaloMessageForSaleLeadDetail({
        msg_id: "msg-4",
        content: callJson,
        is_self: false,
        dateAction: "2026-09-04T05:00:00.000Z",
        msg_type: "chat.call",
      }),
    ).toMatchObject({
      content: "Cuộc gọi",
      type: "call",
      callDurationSeconds: 145,
      callDurationLabel: "2 phút 25 giây",
      callKind: "completed",
      imageUrl: null,
      thumbUrl: null,
    });
  });

  it("renders Zalo missed calls as call messages instead of raw JSON", () => {
    const missedCallJson = JSON.stringify({
      title: "sendBubbleMessage",
      description: "Cuộc gọi",
      href: "",
      thumb: "",
      childnumber: 0,
      action: "recommened.misscall",
      params: JSON.stringify({
        duration: 0,
        reason: 1,
        isCaller: 1,
        isEnableCallback: 1,
        calltype: 0,
      }),
    });

    expect(
      mapZaloMessageForSaleLeadDetail({
        msg_id: "msg-5",
        content: missedCallJson,
        is_self: true,
        dateAction: "2026-09-04T06:00:00.000Z",
        msg_type: "chat.recommended",
      }),
    ).toMatchObject({
      content: "Cuộc gọi nhỡ",
      type: "call",
      callDurationSeconds: 0,
      callDurationLabel: null,
      callKind: "missed",
      imageUrl: null,
      thumbUrl: null,
    });
  });
});

describe("groupDealerBidsByDealer", () => {
  it("puts each dealer on one row with latest pre/post inspection prices", () => {
    expect(
      groupDealerBidsByDealer([
        {
          id: "old-pre",
          dealerId: "dealer-a",
          dealerName: "Hách Nguyễn",
          price: 590_000_000,
          priceLabel: "590M",
          version: 1,
          phase: "pre_inspection",
          createdAt: "2026-08-04T10:00:00.000Z",
          comment: null,
        },
        {
          id: "new-pre",
          dealerId: "dealer-a",
          dealerName: "Hách Nguyễn",
          price: 600_000_000,
          priceLabel: "600M",
          version: 1,
          phase: "pre_inspection",
          createdAt: "2026-08-04T10:27:00.000Z",
          comment: null,
        },
        {
          id: "post",
          dealerId: "dealer-a",
          dealerName: "Hách Nguyễn",
          price: 550_000_000,
          priceLabel: "550M",
          version: 2,
          phase: "post_inspection",
          createdAt: "2026-08-27T02:40:00.000Z",
          comment: null,
        },
        {
          id: "post-only",
          dealerId: "dealer-b",
          dealerName: "Công Hội",
          price: 590_000_000,
          priceLabel: "590M",
          version: 2,
          phase: "post_inspection",
          createdAt: "2026-08-27T04:56:00.000Z",
          comment: null,
        },
      ]),
    ).toEqual([
      {
        dealerId: "dealer-b",
        dealerName: "Công Hội",
        preInspection: null,
        postInspection: expect.objectContaining({ price: 590_000_000, priceLabel: "590M" }),
        diff: null,
      },
      {
        dealerId: "dealer-a",
        dealerName: "Hách Nguyễn",
        preInspection: expect.objectContaining({ price: 600_000_000, priceLabel: "600M" }),
        postInspection: expect.objectContaining({ price: 550_000_000, priceLabel: "550M" }),
        diff: -50_000_000,
      },
    ]);
  });
});

describe("buildSaleLeadExternalLinks", () => {
  it("builds workspace links from phone, pic, Zalo relation, and sale workspace id", () => {
    expect(
      buildSaleLeadExternalLinks({
        phone: "0983839880",
        picId: "38c1ce38-6968-4b03-8957-2af40e441753",
        zaloAccountId: "627910245087469231",
        zaloFriendId: "5200139638818144819",
        saleWorkspaceId: "9357eed7-1651-4f46-b60f-af5f934af9c9",
      }),
    ).toEqual([
      {
        key: "crm",
        label: "CRM",
        href: "https://dashboard.vucar.vn/crm-v2?search=0983839880&searchType=lead",
      },
      {
        key: "e2e",
        label: "E2E",
        href: "https://e2e-management.vucar.vn/e2e/38c1ce38-6968-4b03-8957-2af40e441753?search=0983839880",
      },
      {
        key: "zalo",
        label: "Zalo",
        href: "https://zl.vucar.vn/chat/627910245087469231/5200139638818144819",
      },
      {
        key: "sale_workspace",
        label: "Sale WS",
        href: "https://saleworkspace.vucar.vn/session/9357eed7-1651-4f46-b60f-af5f934af9c9?from=chat&pic=38c1ce38-6968-4b03-8957-2af40e441753",
      },
    ]);
  });

  it("omits links that do not have enough identifiers", () => {
    expect(buildSaleLeadExternalLinks({ phone: "0983839880", picId: null })).toEqual([
      {
        key: "crm",
        label: "CRM",
        href: "https://dashboard.vucar.vn/crm-v2?search=0983839880&searchType=lead",
      },
    ]);
  });
});

describe("selectSaleWorkspaceId", () => {
  it("falls back to the sibling car with bid evidence when event mapping is missing", () => {
    expect(
      selectSaleWorkspaceId({
        eventWorkspaceId: null,
        currentCarId: "ba502be4-11ff-4cb1-b440-90d69245e209",
        relatedCars: [
          {
            carId: "ba502be4-11ff-4cb1-b440-90d69245e209",
            priceHighestBid: null,
            createdAt: "2026-08-25T06:41:05.107Z",
          },
          {
            carId: "9fb475af-3211-4e27-9e2b-71bc1b9466f2",
            priceHighestBid: 350_000_000,
            createdAt: "2026-08-04T01:11:33.933Z",
          },
        ],
      }),
    ).toBe("9fb475af-3211-4e27-9e2b-71bc1b9466f2");
  });
});
