import type { Activity, SportFilter } from './types';
import type { DatePrecision } from './datePrecision';
import { parseMovingTime } from './hooks/useActivities';

export type SportMetricKey =
  | 'activityCount' | 'movingTime' | 'distance' | 'walkingDistance'
  | 'averageSpeed' | 'averagePace' | 'elevationGain' | 'longestDistance'
  | 'averageDistance' | 'longestStreak' | 'rideCount' | 'walkCount' | 'golfCount';

export interface SportMetric {
  key: SportMetricKey;
  label: string;
  value: string;
}

function number(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function km(meters: number): string {
  return number(meters / 1000) + ' km';
}

function duration(seconds: number): string {
  return Math.floor(seconds / 3600) + 'h ' +
    Math.floor((seconds % 3600) / 60) + 'm';
}

function pace(meters: number, seconds: number): string {
  if (meters <= 0 || seconds <= 0) return '—';
  const perKm = Math.round(seconds * 1000 / meters);
  return Math.floor(perKm / 60) + ':' +
    String(perKm % 60).padStart(2, '0') + ' /km';
}

function speed(meters: number, seconds: number): string {
  return meters > 0 && seconds > 0
    ? number(meters / seconds * 3.6) + ' km/h'
    : '—';
}

/** Longest consecutive run of distinct local calendar days, not session count. */
export function longestActivityStreak(activities: readonly Activity[]): number {
  const days = [...new Set(activities
    .map(activity => activity.start_date_local.slice(0, 10))
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();
  let max = 0;
  let streak = 0;
  let previous: number | null = null;
  for (const date of days) {
    const day = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(day)) continue;
    streak = previous !== null && day - previous === 86400000 ? streak + 1 : 1;
    max = Math.max(max, streak);
    previous = day;
  }
  return max;
}

/** Interpret speed consistently without displaying golf as a race or run. */
export function activityMotionValue(activity: Activity): string {
  const ms = activity.average_speed;
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (activity.type === 'Ride') return number(ms * 3.6) + ' km/h';
  if (activity.type === 'Walk') return pace(1000, 1000 / ms);
  return '—';
}

/**
 * Sport-specific metrics shared by the dashboard and summary.
 * The "all" view intentionally has no mixed-sport average pace or speed.
 * Golf reports recorded distance/time, never guessed scores or round counts.
 */
export function sportMetrics(
  activities: readonly Activity[],
  filter: SportFilter,
  locale: 'ja' | 'en',
  datePrecision: DatePrecision | null = null
): SportMetric[] {
  const items = filter === 'all'
    ? activities
    : activities.filter(activity => activity.type === filter);
  const isJapanese = locale === 'ja';
  const t = (ja: string, en: string) => isJapanese ? ja : en;
  const count = items.length;
  const meters = items.reduce((total, item) => total + item.distance, 0);
  const seconds = items.reduce(
    (total, item) => total + parseMovingTime(item.moving_time), 0);
  const elevation = items.reduce(
    (total, item) => total + (item.elevation_gain ?? 0), 0);
  const longest = Math.max(0, ...items.map(item => item.distance));
  const metrics: SportMetric[] = [];
  const add = (key: SportMetricKey, label: string, value: string) =>
    metrics.push({ key, label, value });

  add('activityCount',
    filter === 'Golf'
      ? t('ゴルフ活動回数', 'Golf activities')
      : t('活動回数', 'Activities'),
    String(count));
  add('movingTime', t('活動時間', 'Moving time'), duration(seconds));

  if (filter === 'Golf') {
    add('walkingDistance', t('移動・歩行距離', 'Distance walked'), km(meters));
    add('averageDistance', t('1回あたりの歩行距離', 'Distance per activity'),
      count ? km(meters / count) : '—');
    add('longestDistance', t('最長歩行距離', 'Longest walk'), km(longest));
    return metrics;
  }

  add('distance', t('総距離', 'Total distance'), km(meters));
  if (filter === 'Ride') {
    add('averageSpeed', t('平均速度', 'Average speed'), speed(meters, seconds));
    add('elevationGain', t('累積獲得標高', 'Elevation gain'), number(elevation) + ' m');
    add('longestDistance', t('最長距離', 'Longest activity'), km(longest));
    add('averageDistance', t('平均距離', 'Average distance'),
      count ? km(meters / count) : '—');
  } else if (filter === 'Walk') {
    add('averagePace', t('平均ペース', 'Average pace'), pace(meters, seconds));
    add('longestDistance', t('最長距離', 'Longest activity'), km(longest));
    add('averageDistance', t('平均距離', 'Average distance'),
      count ? km(meters / count) : '—');
    if (datePrecision !== 'month') {
      add('longestStreak', t('最長連続活動日数', 'Longest active-day streak'),
        String(longestActivityStreak(items)) + (isJapanese ? ' 日' : ' days'));
    }
  } else {
    add('elevationGain', t('累積獲得標高', 'Elevation gain'), number(elevation) + ' m');
    for (const [key, sport, ja, en] of [
      ['rideCount', 'Ride', 'サイクリング', 'Cycling'],
      ['walkCount', 'Walk', 'ウォーキング', 'Walking'],
      ['golfCount', 'Golf', 'ゴルフ', 'Golf'],
    ] as const) {
      add(key, t(ja, en),
        String(items.filter(item => item.type === sport).length) +
        (isJapanese ? ' 回' : ' activities'));
    }
  }
  return metrics;
}
