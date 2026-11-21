import type { Activity, SportFilter } from './types';
import type { DatePrecision } from './datePrecision';
import { parseMovingTime } from './hooks/useActivities';
import { prefecturesForActivity } from './prefectureRoutes';

export type ComparisonPeriod = 'life' | 'year' | 'month';

export interface ComparisonBucket {
  key: string;
  label: string;
  km: number;
}

export interface UserComparison {
  userId: string;
  activityCount: number;
  distanceMeters: number;
  movingSeconds: number;
  prefectureCount: number;
  trend: ComparisonBucket[];
}

/** Derive the shared year choices from the public catalog, not one selected user. */
export function comparisonYears(activities: readonly Activity[]): number[] {
  return [...new Set(activities
    .map(activity => Number(activity.start_date_local.slice(0, 4)))
    .filter(year => Number.isInteger(year) && year >= 1))]
    .sort((left, right) => right - left);
}

function inPeriod(activity: Activity, period: ComparisonPeriod, year: number, month: number): boolean {
  if (period === 'life') return true;
  const date = activity.start_date_local;
  if (date.slice(0, 4) !== String(year)) return false;
  return period === 'year' ||
    date.slice(5, 7) === String(month).padStart(2, '0');
}

function trendKeys(
  activities: readonly Activity[],
  userIds: readonly string[],
  period: ComparisonPeriod,
  year: number,
  month: number,
  precision: DatePrecision | null
): string[] {
  if (period === 'life') {
    const selected = new Set(userIds);
    return comparisonYears(activities.filter(activity => selected.has(activity.user_id || '')))
      .reverse().map(String);
  }
  if (period === 'year') {
    return Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));
  }
  // YYYY-MM never provides a real day. Do not invent day-level activity trends.
  if (precision === 'month') return [];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => String(index + 1).padStart(2, '0'));
}

function bucketOf(activity: Activity, period: ComparisonPeriod): string {
  const date = activity.start_date_local;
  return period === 'life' ? date.slice(0, 4)
    : period === 'year' ? date.slice(5, 7) : date.slice(8, 10);
}

/**
 * Compare only explicitly selected user IDs from an already loaded, approved catalog.
 * No additional APIs are called and no activities are merged across users.
 * Missing data contributes zero; month-only timestamps never generate daily trends.
 */
export function compareUsers(
  activities: readonly Activity[],
  userIds: readonly string[],
  sport: SportFilter,
  period: ComparisonPeriod,
  year: number,
  month: number,
  precision: DatePrecision | null
): UserComparison[] {
  const keys = trendKeys(activities, userIds, period, year, month, precision);
  const selected = new Set(userIds);
  const perUser = new Map<string, Activity[]>();
  for (const id of selected) perUser.set(id, []);
  for (const activity of activities) {
    const id = activity.user_id || '';
    if (!selected.has(id) || (sport !== 'all' && activity.type !== sport) ||
        !inPeriod(activity, period, year, month)) continue;
    perUser.get(id)?.push(activity);
  }
  return [...selected].map(userId => {
    const items = perUser.get(userId) || [];
    const prefectures = new Set<string>();
    const distances = new Map(keys.map(key => [key, 0]));
    let distanceMeters = 0;
    let movingSeconds = 0;
    for (const activity of items) {
      distanceMeters += activity.distance;
      movingSeconds += parseMovingTime(activity.moving_time);
      for (const prefecture of prefecturesForActivity(activity)) prefectures.add(prefecture);
      const key = bucketOf(activity, period);
      if (distances.has(key)) distances.set(key, (distances.get(key) || 0) + activity.distance);
    }
    return {
      userId,
      activityCount: items.length,
      distanceMeters,
      movingSeconds,
      prefectureCount: prefectures.size,
      trend: keys.map(key => ({
        key,
        label: key,
        km: Math.round((distances.get(key) || 0) / 10) / 100,
      })),
    };
  });
}
