/**
 * One row of a bridge subscription list. Two lists share it with different
 * shapes: `list_all_subscriptions` (an account's communities) and
 * `list_subscribers` (a community's members).
 */
export type Subscription = string[];

/**
 * One row of `bridge.list_all_subscriptions`: a community the account has
 * joined, as `[name, title, role, label]`.
 */
export type AccountSubscription = [name: string, title: string, role: string, label: string];

const cell = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * The bridge answer for an account's subscriptions as typed rows. Drops every
 * entry that is not an array whose first cell is a non-empty string (a `null`,
 * a bare string, a nameless row); fills a missing or non-string title, role or
 * label with "". The bridge has not been seen to send such entries, but every
 * reader indexes rows during render, where one bad row throws.
 */
export function normalizeAccountSubscriptions(value: unknown): AccountSubscription[] {
  if (!Array.isArray(value)) return [];
  const rows: AccountSubscription[] = [];
  for (const row of value) {
    if (!Array.isArray(row)) continue;
    const [name, title, role, label] = row as unknown[];
    if (typeof name !== "string" || !name) continue;
    rows.push([name, cell(title), cell(role), cell(label)]);
  }
  return rows;
}
