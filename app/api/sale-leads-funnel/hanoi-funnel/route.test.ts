import { beforeEach, describe, expect, it, vi } from "vitest";

import { vucarV2Query, vucarZaloQuery } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({
  vucarV2Query: vi.fn(),
  vucarZaloQuery: vi.fn().mockResolvedValue({ rows: [] }),
  e2eQuery: vi.fn().mockResolvedValue({ rows: [] }),
}));
vi.mock("@/lib/dealer-service", () => ({ biddings: vi.fn() }));
vi.mock("@/lib/sale-leads-funnel-snapshots", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/sale-leads-funnel-snapshots")>(),
  readSaleLeadSnapshotFileDailyRows: vi.fn().mockResolvedValue([]),
  readSaleLeadSnapshotFileSummaries: vi.fn().mockResolvedValue(null),
}));

const members = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Sale A" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Sale B" },
];

describe("Hanoi funnel PIC options", () => {
  beforeEach(() => {
    vi.mocked(vucarZaloQuery).mockReset().mockResolvedValue({ rows: [] } as any);
    vi.mocked(vucarV2Query).mockReset();
    vi.mocked(vucarV2Query).mockImplementation(async (sql, params) => {
      if (sql.includes('AS "id"') && sql.includes('AS "name"')) {
        expect(params).toEqual(["HANOI"]);
        expect(sql).not.toContain("ANY(");
        expect(sql).not.toContain("JOIN leads");
        return { rows: members } as any;
      }
      if (sql.includes('AS "userId"')) {
        const selected = members.find((member) => member.id === (params?.[2] as string[])?.[0]) ?? members[0];
        return { rows: [{ userId: selected.id, displayName: selected.name }] } as any;
      }
      return { rows: [] } as any;
    });
  });

  it("keeps the full team available when switching directly between filtered PICs", async () => {
    for (const member of members) {
      const response = await GET(new Request(
        `http://localhost/api/sale-leads-funnel/hanoi-funnel?from=2026-10-01&to=2026-10-18&team=HANOI&pic=${member.id}`,
      ));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.picOptions).toEqual(members);
      expect(body.byUser.map((row: { userId: string }) => row.userId)).toEqual([member.id]);
    }
  });

  it("serves PIC options without waiting for any chart queries", async () => {
    const response = await GET(new Request(
      "http://localhost/api/sale-leads-funnel/hanoi-funnel?team=HANOI&options=pic",
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ picOptions: members });
    expect(vi.mocked(vucarV2Query).mock.calls).toHaveLength(1);
  });

  it("classifies daily quality from live image sources when snapshots are empty", async () => {
    const defaultQuery = vi.mocked(vucarV2Query).getMockImplementation()!;
    const leads = [
      { carId: "crm-image", additionalImages: { outside: [{ url: "car.jpg" }] } },
      { carId: "summary-image", additionalImages: null },
      { carId: "zalo-image", additionalImages: null },
      { carId: "request-image", additionalImages: null },
      { carId: "non-qualified", additionalImages: null },
    ].map((row) => ({
      ...row, leadId: row.carId, phone: row.carId, day: "2026-10-01",
      qualified: "NON_QUALIFIED", crmStage: "CONTACTED",
    }));
    vi.mocked(vucarV2Query).mockImplementation(async (sql, params) => {
      if (sql.includes('AS "carId"') && sql.includes("AS qualified")) return { rows: leads } as any;
      if (sql.includes("sp.result")) {
        return { rows: [{ car_id: "summary-image", result: { had_car_image: true } }] } as any;
      }
      return defaultQuery(sql, params);
    });
    vi.mocked(vucarZaloQuery).mockImplementation(async (sql) => ({
      rows: sql.includes('AS "customerImageCount"') ? [
        { phone: "zalo-image", relationCount: 1, customerMessageCount: 2, customerImageCount: 1 },
        { phone: "request-image", relationCount: 1, customerMessageCount: 2, customerImageCount: 0 },
      ] : [],
    }) as any);
    const response = await GET(new Request(
      `http://localhost/api/sale-leads-funnel/hanoi-funnel?from=2026-10-01&to=2026-10-01&team=HANOI&pic=${members[0].id}`,
    ));
    expect(response.status).toBe(200);
    expect((await response.json()).leadQualityByDay).toEqual([{
      day: "2026-10-01", total: 5, strongQualified: 3, weakQualified: 1,
      nonQualified: 1, undefinedQualified: 0,
    }]);
  });
});
