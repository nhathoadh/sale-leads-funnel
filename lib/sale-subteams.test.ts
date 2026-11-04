import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ vucarV2Query: vi.fn() }));

import { applySubteamPicFilter, parseSubteamParam } from "@/lib/sale-subteams";

const team1 = {
  id: "7da02d43-424d-41b7-beb8-8f70ddd536fd",
  name: "Team 1 HN",
  memberIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
};

describe("parseSubteamParam", () => {
  it("accepts a team id and rejects anything else", () => {
    expect(parseSubteamParam(team1.id)).toBe(team1.id);
    expect(parseSubteamParam("Team 1 HN")).toBeNull();
    expect(parseSubteamParam(null)).toBeNull();
  });
});

describe("applySubteamPicFilter", () => {
  it("uses every member of the sub-team when no PIC is selected", () => {
    expect(applySubteamPicFilter([], team1)).toEqual(team1.memberIds);
  });

  it("keeps a selected PIC that belongs to the sub-team", () => {
    expect(applySubteamPicFilter([team1.memberIds[1]], team1)).toEqual([team1.memberIds[1]]);
  });

  it("drops PICs from outside the sub-team", () => {
    expect(applySubteamPicFilter(["33333333-3333-4333-8333-333333333333"], team1)).toEqual(team1.memberIds);
  });

  it("matches no lead for an empty sub-team instead of falling back to the whole region", () => {
    expect(applySubteamPicFilter([], { ...team1, memberIds: [] })).toEqual(["00000000-0000-0000-0000-000000000000"]);
  });

  it("leaves the PIC filter alone for an unknown sub-team", () => {
    expect(applySubteamPicFilter(["33333333-3333-4333-8333-333333333333"], undefined)).toEqual([
      "33333333-3333-4333-8333-333333333333",
    ]);
  });
});
