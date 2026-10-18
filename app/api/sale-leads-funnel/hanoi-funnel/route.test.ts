import { beforeEach, describe, expect, it, vi } from "vitest";

import { vucarV2Query } from "@/lib/db";
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
});
