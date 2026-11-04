import { vucarV2Query } from "@/lib/db";
import type { SaleLeadTeamFilter } from "@/lib/sale-leads-funnel";

export interface SaleSubteam {
  id: string;
  name: string;
  memberIds: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches no pic_id, so an empty sub-team shows no leads instead of the whole region.
const NO_MEMBER_PIC_ID = "00000000-0000-0000-0000-000000000000";
const SUBTEAMS_CACHE_TTL_MS = 5 * 60_000;

const globalForSubteams = globalThis as unknown as {
  saleSubteamsCache: Map<string, { expiresAt: number; promise: Promise<SaleSubteam[]> }> | undefined;
};
const subteamsCache = (globalForSubteams.saleSubteamsCache ??= new Map());

export function parseSubteamParam(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/** Sub-teams are rows of `teams` whose parent_team_id is the region team (HANOI, HCM). */
export function loadSaleSubteams(team: SaleLeadTeamFilter): Promise<SaleSubteam[]> {
  const hit = subteamsCache.get(team);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const promise = vucarV2Query(
    `SELECT
       t.id::text AS id,
       t.name,
       COALESCE(ARRAY_AGG(tm.user_id::text ORDER BY tm.user_id) FILTER (WHERE tm.user_id IS NOT NULL), '{}') AS member_ids
     FROM teams t
     JOIN teams parent ON parent.id = t.parent_team_id
     LEFT JOIN team_members tm ON tm.team_id = t.id
     WHERE UPPER(parent.name) = UPPER($1::text)
     GROUP BY t.id, t.name
     ORDER BY t.name`,
    [team],
  ).then((result) =>
    result.rows.map((row: any) => ({ id: row.id, name: row.name, memberIds: row.member_ids ?? [] })),
  );
  subteamsCache.set(team, { expiresAt: Date.now() + SUBTEAMS_CACHE_TTL_MS, promise });
  promise.catch(() => {
    if (subteamsCache.get(team)?.promise === promise) subteamsCache.delete(team);
  });
  return promise;
}

/**
 * Narrow the PIC filter to a sub-team. Selected PICs outside the sub-team are dropped; with
 * none left (or none selected) every member of the sub-team is used. An unknown sub-team id
 * (e.g. from another region) leaves the PIC filter unchanged.
 */
export function applySubteamPicFilter(picIds: string[], subteam: SaleSubteam | null | undefined): string[] {
  if (!subteam) return picIds;
  const members = new Set(subteam.memberIds);
  const selected = picIds.filter((id) => members.has(id));
  if (selected.length > 0) return selected;
  return subteam.memberIds.length > 0 ? [...subteam.memberIds] : [NO_MEMBER_PIC_ID];
}

export async function resolveSubteamPicFilter(input: {
  team: SaleLeadTeamFilter;
  subteamId: string | null;
  picIds: string[];
}): Promise<string[]> {
  if (!input.subteamId) return input.picIds;
  const subteams = await loadSaleSubteams(input.team);
  return applySubteamPicFilter(
    input.picIds,
    subteams.find((subteam) => subteam.id === input.subteamId),
  );
}
