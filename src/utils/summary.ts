import type { Activity } from '../types';
export type SummaryPeriod = 'life' | 'year' | 'month';

// Use the recorded local calendar date, independent of the viewer's timezone.
export function summaryKey(date: string, period: SummaryPeriod): string {
  if (period === 'life') return 'Life';
  return period === 'year' ? date.slice(0, 4) : date.slice(0, 7);
}

export function groupSummary(activities: Activity[], period: SummaryPeriod) {
  const groups = new Map<string, Activity[]>();
  for (const activity of activities) {
    const key = summaryKey(activity.start_date_local, period);
    const group = groups.get(key) ?? [];
    group.push(activity);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export function summaryChart(
  activities: Activity[],
  period: SummaryPeriod,
  key: string
) {
  const buckets = new Map<string, number>();
  const bucketFor = (a: Activity) => {
    const date = a.start_date_local;
    if (period === 'life') return date.slice(0, 4);
    if (period === 'year') return date.slice(5, 7);
    return date.slice(8, 10);
  };
  // Life is a variable-length year series; year/month retain stable empty buckets.
  const length = period === 'year'
    ? 12
    : period === 'month'
      ? new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate()
      : 0;
  for (let i = 1; i <= length; i++)
    buckets.set(String(i).padStart(2, '0'), 0);
  for (const activity of activities) {
    const bucket = bucketFor(activity);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + activity.distance / 1000);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, km]) => ({ label, km: Number(km.toFixed(2)) }));
}
