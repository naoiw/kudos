import { useMemo } from 'react';
import type { Activity, SportFilter } from '../types';

// Detect Japanese prefectures in optional human-readable location metadata.
const JAPANESE_PREFECTURES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"];

export function extractProvince(loc: string | null): string | null {
  if (!loc) return null;
  for (const pref of JAPANESE_PREFECTURES) {
    if (loc.includes(pref)) return pref;
  }
  return null;
}

export function useFilteredActivities(
  activities: Activity[],
  filter: SportFilter,
  year: number | null
) {
  return useMemo(() => {
    let filtered = activities;
    if (filter !== 'all') {
      filtered = filtered.filter((a) => a.type === filter);
    }
    if (year) {
      filtered = filtered.filter((a) => {
        const d = new Date(a.start_date_local);
        return d.getFullYear() === year;
      });
    }
    return filtered;
  }, [activities, filter, year]);
}

export function parseMovingTime(
  time: string | number | undefined | null
): number {
  if (!time) return 0;

  if (typeof time === 'number') {
    return isNaN(time) ? 0 : time;
  }

  if (typeof time === 'string') {
    let str = time.trim();
    let extraDaysSeconds = 0;

    // Handle "1 day, 10:44:26" strings
    if (str.includes('day')) {
      const dayMatch = str.match(/(\d+)\s+day/);
      if (dayMatch) {
        extraDaysSeconds = parseInt(dayMatch[1], 10) * 86400;
      }
      str = str.split(',').pop()?.trim() || str;
    }

    // Handle epoch timestamps like "1970-01-02 10:44:26.134000"
    if (str.includes(' ')) {
      const parts = str.split(' ');
      const datePart = parts[0]; // e.g. "1970-01-02"
      str = parts[1]; // e.g. "10:44:26.134000"

      const dateComponents = datePart.split('-');
      if (dateComponents.length === 3) {
        const dayNum = parseInt(dateComponents[2], 10);
        if (!isNaN(dayNum) && dayNum > 1) {
          extraDaysSeconds += (dayNum - 1) * 86400;
        }
      }
    }

    // Strip milliseconds (.134000)
    if (str.includes('.')) {
      str = str.split('.')[0];
    }

    // Parse HH:MM:SS / MM:SS / SS
    const timeParts = str.split(':').map(Number);
    if (timeParts.some(isNaN)) return 0;

    let seconds = 0;
    if (timeParts.length === 3) {
      seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
      seconds = timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 1) {
      seconds = timeParts[0];
    }

    return seconds + extraDaysSeconds;
  }

  return 0;
}

export function formatDistance(meters: number): string {
  return Math.round(meters / 1000).toString();
}

export function formatPace(speedMs: number): string {
  if (!speedMs) return '--';
  const totalSeconds = Math.round(1000 / speedMs);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatDuration(timeStr: string): string {
  const secs = parseMovingTime(timeStr);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function getAvailableYears(activities: Activity[]): number[] {
  const years = new Set(
    activities.map((a) => new Date(a.start_date_local).getFullYear())
  );
  return Array.from(years).sort((a, b) => b - a);
}

// Async data loading (fetch-based, compatible with Suspense)
import activitiesUrl from '@/static/activities.json?url';

let activityDataCache: Activity[] | null = null;
let activityDataError: unknown = null;
let activityDataPromise: Promise<Activity[]> | null = null;

const loadActivityData = () => {
  activityDataPromise ??= fetch(activitiesUrl)
    .then((response) => {
      if (!response.ok)
        throw new Error(`Failed to load activities: ${response.status}`);
      return response.json() as Promise<Activity[]>;
    })
    .then((data) => {
      activityDataCache = data;
      return data;
    })
    .catch((error: unknown) => {
      activityDataError = error;
      throw error;
    });
  return activityDataPromise;
};

export const getActivityData = () => {
  if (activityDataError) throw activityDataError;
  if (activityDataCache) return activityDataCache;
  throw loadActivityData();
};

// Reset the module-level cache so an ErrorBoundary can retry after a fetch failure
export function resetActivityData() {
  activityDataCache = null;
  activityDataError = null;
  activityDataPromise = null;
}
