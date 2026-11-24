/**
 * Zalo threads for a set of phones, as a subquery with columns (phone, account_id, friend_id).
 *
 * `leads_relation` is the normal link from a phone to a Zalo thread. It is missing when Zalo's
 * find-by-phone fails (for example the customer hides their number) but the sale still reached
 * the customer another way. In that case the thread is recovered from the messages the system
 * sent to it, which `audit_log` records with the lead's phone.
 *
 * @param phonesSql SQL expression for a text[] of phones, e.g. "$1::text[]" or "ARRAY[$1::text]".
 */
export function zaloRelationsSql(phonesSql: string): string {
  return `(
    SELECT lr0.phone, lr0.account_id, lr0.friend_id
    FROM leads_relation lr0
    WHERE lr0.phone = ANY(${phonesSql})
    UNION
    SELECT a.phone, a.own_id AS account_id, a.target AS friend_id
    FROM audit_log a
    WHERE a.phone = ANY(${phonesSql})
      AND a.action = 'friends.send_message'
      AND a.success IS TRUE
      AND a.own_id IS NOT NULL
      AND a.target IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM leads_relation lr1 WHERE lr1.phone = a.phone)
  )`;
}
