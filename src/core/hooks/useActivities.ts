import { useMemo } from 'react';
import type { Activity, SportFilter } from '../types';
import { resolveActivitySport } from '../sports';

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

// Load the explicitly approved public statistics preview from GitHub Pages.
// When the preview is empty or has not been published, keep synthetic demo data.
import activitiesUrl from '@/static/activities.json?url';

export interface PublicPreviewUser {
  user_id: string;
  display_name: string;
}

export interface ActivityCatalog {
  users: PublicPreviewUser[];
  activities: Activity[];
  mode: 'demo' | 'public-preview';
  generatedAt: string | null;
  datePrecision: 'month' | 'exact' | null;
}

interface PreviewDocument {
  schema_version: number;
  mode: string;
  generated_at: string;
  date_precision?: 'month' | 'exact';
  genre_version?: number;
  users: PublicPreviewUser[];
  activities: Activity[];
  route_chunks?: string[];
}

interface RouteChunk {
  schema_version: number;
  routes: { run_id: number; route_segments: string[] }[];
}

/**
 * Manifest version 2 stores route polylines in separate static JSON chunks.
 * The manifest appears only after all files were committed in one transaction.
 */
async function loadRouteChunks(paths: string[]): Promise<Map<number, string[]>> {
  const collected = new Map<number, string[]>();
  // Limit concurrent downloads instead of flooding the server with 40+ files.
  for (let start = 0; start < paths.length; start += 6) {
    const group = await Promise.all(paths.slice(start, start + 6).map(async (path) => {
      if (!/^data\/exports\/[a-z0-9]{16,48}\/chunk-\d{4}\.json$/.test(path)) {
        throw new Error('Invalid route chunk path in preview manifest');
      }
      const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
      if (!response.ok) {
        throw new Error(`Route chunk could not be fetched: ${path} (${response.status})`);
      }
      const chunk: RouteChunk = await response.json();
      if (chunk.schema_version !== 1 || !Array.isArray(chunk.routes)) {
        throw new Error(`Invalid route chunk format: ${path}`);
      }
      return chunk.routes;
    }));
    for (const routes of group) {
      for (const route of routes) {
        if (!Number.isInteger(route.run_id) || collected.has(route.run_id) ||
            !Array.isArray(route.route_segments) ||
            !route.route_segments.length ||
            !route.route_segments.every((segment) => typeof segment === 'string')) {
          throw new Error('Invalid or duplicated encoded route entry in preview');
        }
        collected.set(route.run_id, route.route_segments);
      }
    }
  }
  return collected;
}

let catalogCache: ActivityCatalog | null = null;
let catalogError: unknown = null;
let catalogPromise: Promise<ActivityCatalog> | null = null;

async function loadCatalog(): Promise<ActivityCatalog> {
  const previewUrl = `${import.meta.env.BASE_URL}data/preview.json`;
  let manifestV2Detected = false;
  try {
    const response = await fetch(previewUrl, { cache: 'no-store' });
    if (response.ok) {
      const candidate: unknown = await response.json();
      if (candidate && typeof candidate === 'object') {
        const doc = candidate as PreviewDocument;
        if (
          (doc.schema_version === 1 || doc.schema_version === 2) &&
          doc.mode === 'public-stats-preview' &&
          Array.isArray(doc.users) &&
          doc.users.length > 0 &&
          Array.isArray(doc.activities)
        ) {
          const users = doc.users.filter(
            (user) =>
              typeof user.user_id === 'string' &&
              /^[a-z0-9][a-z0-9_-]{0,30}$/.test(user.user_id) &&
              typeof user.display_name === 'string'
          );
          const userIds = new Set(users.map((user) => user.user_id));
          if (users.length) {
            manifestV2Detected = doc.schema_version === 2;
            const routes = manifestV2Detected
              ? await loadRouteChunks(
                  Array.isArray(doc.route_chunks)
                    ? doc.route_chunks
                    : (() => { throw new Error('Missing route chunk index'); })()
                )
              : null;
            const activities = doc.activities
              .filter(
                (activity) =>
                  userIds.has(activity.user_id || '') &&
                  typeof activity.distance === 'number' &&
                  typeof activity.start_date_local === 'string'
              )
              .map((activity) => {
                const type = resolveActivitySport(
                  activity.name || '', activity.type || '',
                  doc.genre_version === 1
                );
                if (!type) return null;
                if (!routes) return { ...activity, type };
                const segments = routes.get(activity.run_id);
                if (!segments) throw new Error(
                  `Missing GPS route for activity ${activity.run_id}`
                );
                return {
                  ...activity,
                  type,
                  summary_polyline: segments[0] || null,
                  route_segments: segments,
                };
              })
              .filter((activity): activity is Activity => activity !== null);
            if (routes && routes.size !== doc.activities.length) {
              throw new Error('Route chunk count does not match published activities');
            }
            return {
              users,
              activities,
              mode: 'public-preview',
              generatedAt: doc.generated_at || null,
              datePrecision: doc.date_precision || null,
            };
          }
        }
      }
    }
  } catch (error) {
    // A published v2 manifest should never silently fall back to demo data.
    // Missing chunks indicate a deployment or data issue that needs fixing.
    if (manifestV2Detected) throw error;
    console.warn('Public preview unavailable; using synthetic demo:', error);
  }

  const response = await fetch(activitiesUrl);
  if (!response.ok) {
    throw new Error(`Failed to load demo activities: ${response.status}`);
  }
  const activities = (await response.json()) as Activity[];
  return {
    users: [{ user_id: 'demo', display_name: '架空デモ' }],
    activities: activities.map((activity) => ({
      ...activity,
      user_id: 'demo',
    })),
    mode: 'demo',
    generatedAt: null,
    datePrecision: null,
  };
}

function requireCatalog() {
  if (catalogError) throw catalogError;
  if (catalogCache) return catalogCache;
  catalogPromise ??= loadCatalog()
    .then((catalog) => {
      catalogCache = catalog;
      return catalog;
    })
    .catch((error: unknown) => {
      catalogError = error;
      throw error;
    });
  throw catalogPromise;
}

export const getActivityCatalog = (): ActivityCatalog => requireCatalog();

// Legacy helper retained for modules still using the single-user API.
export const getActivityData = (): Activity[] => requireCatalog().activities;

export function resetActivityData() {
  catalogCache = null;
  catalogError = null;
  catalogPromise = null;
}
