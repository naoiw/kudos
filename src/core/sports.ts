/**
 * Shared rules live in shared/sport-rules.json and are embedded into GAS by
 * scripts/generate-sport-rules.cjs. Never duplicate keywords in this module.
 */
import rules from '../../shared/sport-rules.json';

export type Sport = 'Ride' | 'Walk' | 'Golf';
export const SPORT_ORDER: readonly Sport[] = rules.order as Sport[];

export const SPORT_DETAILS: Record<Sport, {
  ja: string; en: string; icon: string; color: string;
}> = {
  Ride: { ja: 'サイクリング', en: 'Cycling', icon: '🚴', color: '#3b82f6' },
  Walk: { ja: 'ウォーキング', en: 'Walking', icon: '🚶', color: '#f97316' },
  Golf: { ja: 'ゴルフ', en: 'Golf', icon: '⛳', color: '#16a34a' },
};

export function normalizeSport(value: string): Sport | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  for (const sport of SPORT_ORDER) {
    if (rules.aliases[sport].includes(normalized)) return sport;
  }
  return null;
}

export function sportFromActivityName(name: string): Sport | null {
  const title = String(name ?? '').trim().toLowerCase();
  for (const sport of rules.titlePriority as Sport[]) {
    if (rules.titleKeywords[sport].some((keyword) => title.includes(keyword))) {
      return sport;
    }
  }
  return null;
}

export type SportConfidence = 'override' | 'title' | 'inferred';

/** Mirrors kudosResolveSport_ in the GAS project. */
export function resolveSportClassification(
  name: string,
  detected: string,
  override = ''
): { sport: Sport | 'Unknown'; confidence: SportConfidence } {
  const explicit = normalizeSport(override);
  if (explicit) return { sport: explicit, confidence: 'override' };
  const fromName = sportFromActivityName(name);
  if (fromName) return { sport: fromName, confidence: 'title' };
  return { sport: normalizeSport(detected) ?? 'Unknown', confidence: 'inferred' };
}

/**
 * Old published JSON lacks genre_version and needs title-based inference.
 * New GAS exports have already applied sport_override; trust their type.
 * Keep this behavior so a manual override cannot be lost in the browser.
 */
export function resolveActivitySport(name: string, type: string, trusted = false): Sport | null {
  if (trusted) return normalizeSport(type);
  const resolved = resolveSportClassification(name, type).sport;
  return resolved === 'Unknown' ? null : resolved;
}

export function sportLabel(type: string, locale: 'ja' | 'en' = 'ja'): string {
  const sport = normalizeSport(type);
  return sport ? SPORT_DETAILS[sport][locale] : type;
}

export function sportIcon(type: string): string {
  const sport = normalizeSport(type);
  return sport ? SPORT_DETAILS[sport].icon : '📌';
}

export function sportColor(type: string): string {
  const sport = normalizeSport(type);
  return sport ? SPORT_DETAILS[sport].color : '#64748b';
}
