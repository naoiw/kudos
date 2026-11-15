import type { Activity } from './types';

/**
 * Build chronological activity lists by recorded local day.
 *
 * This deliberately uses start_date_local instead of Date parsing, so a
 * timezone conversion cannot place a late-night activity on another day.
 * Month-only disclosures have no real day and are never grouped here.
 */
export function groupActivitiesByLocalDay(
  activities: readonly Activity[],
  month?: string
): Map<string, Activity[]> {
  const groups = new Map<string, Activity[]>();
  for (const activity of activities) {
    const day = activity.start_date_local.slice(0, 10);
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day)) {
      continue;
    }
    if (month && day.slice(0, 7) !== month) continue;
    const list = groups.get(day) ?? [];
    list.push(activity);
    groups.set(day, list);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.start_date_local.localeCompare(b.start_date_local));
  }
  return groups;
}
