import type { Activity, SportFilter } from './types';
import { activityYear } from './datePrecision';

/** Shared, timezone-independent scope: never mutate catalog activities. */
export function filterActivities(
  activities: readonly Activity[],
  sport: SportFilter,
  year: number | null
): Activity[] {
  return activities.filter(activity =>
    (sport === 'all' || activity.type === sport) &&
    (year === null || activityYear(activity.start_date_local) === year)
  );
}

/** Never mix users while deriving their activity cards, stats, or routes. */
export function activitiesForUser(
  activities: readonly Activity[],
  userId: string
): Activity[] {
  return activities.filter(activity => activity.user_id === userId);
}

export function latestActivityYear(activities: readonly Activity[]): number | null {
  const years = activities
    .map(activity => activityYear(activity.start_date_local))
    .filter(Number.isFinite);
  return years.length ? Math.max(...years) : null;
}
