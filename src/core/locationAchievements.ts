import type { Activity } from './types';
import { prefecturesForActivity } from './prefectureRoutes';
import { countriesForActivity } from './countryRoutes';

export interface LocationAchievements {
  countryCount: number;
  prefectureCount: number;
}

/** Return unique visited countries and prefectures within the given activities. */
export function locationAchievements(activities: Activity[]): LocationAchievements {
  const countries = new Set<string>();
  const prefectures = new Set<string>();
  for (const activity of activities) {
    const visited = prefecturesForActivity(activity);
    for (const prefecture of visited) prefectures.add(prefecture);
    for (const code of countriesForActivity(activity)) countries.add(code);
    // A manual Japanese prefecture override also establishes a Japan visit.
    if (visited.length > 0) countries.add('JPN');
  }
  return { countryCount: countries.size, prefectureCount: prefectures.size };
}
