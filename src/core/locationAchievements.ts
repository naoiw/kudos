import type { Activity } from './types';
import { prefecturesForActivity } from './prefectureRoutes';

export interface LocationAchievements {
  countryCount: number;
  prefectureCount: number;
}

/**
 * Country metadata is optional. The public manifest may contain null for
 * every location even when GPX/TCX routes are available in route chunks.
 * Count Japan whenever the shared route detector finds a Japanese prefecture.
 */
function countryFromLocationMetadata(location: string | null): string | null {
  const value = location?.trim();
  if (!value || /^(?:none|null|unknown|不明)$/i.test(value)) return null;

  let country = value;
  if (value.startsWith('{')) {
    try {
      const object: unknown = JSON.parse(
        value.replace(/'/g, '"').replace(/\bNone\b/g, 'null')
      );
      if (!object || typeof object !== 'object') return null;
      const field = (object as Record<string, unknown>).country;
      if (typeof field !== 'string' || !field.trim()) return null;
      country = field.trim();
    } catch {
      return null;
    }
  } else if (/日本|\bJapan\b/i.test(value)) {
    return '日本';
  } else {
    // "Tokyo, Japan" and similar location strings name the country last.
    country = value.split(',').at(-1)?.trim() || '';
  }

  if (!country || /^(?:none|null|unknown|不明)$/i.test(country)) return null;
  // A manually entered Japanese prefecture is not itself a country.
  if (/^(?:北海道|東京都|京都府|大阪府|.{2,4}県)$/.test(country)) return null;
  return /^(?:japan|jpn|日本|日本国)$/i.test(country) ? '日本' : country;
}

/** Return unique visited countries and prefectures within the given activities. */
export function locationAchievements(activities: Activity[]): LocationAchievements {
  const countries = new Set<string>();
  const prefectures = new Set<string>();
  for (const activity of activities) {
    const visited = prefecturesForActivity(activity);
    for (const prefecture of visited) prefectures.add(prefecture);
    if (visited.length > 0) countries.add('日本');

    const country = countryFromLocationMetadata(activity.location_country);
    if (country) countries.add(country);
  }
  return { countryCount: countries.size, prefectureCount: prefectures.size };
}
