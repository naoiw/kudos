/**
 * Canonical Kudos activity genres and display order.
 * Legacy Run activities and title-based classifications are normalized when
 * reading older published JSON, without re-uploading any GPS chunks.
 */
export const SPORT_ORDER = ['Ride', 'Walk', 'Golf'] as const;
export type Sport = (typeof SPORT_ORDER)[number];

export const SPORT_DETAILS: Record<Sport, {
  ja: string; en: string; icon: string; color: string;
}> = {
  Ride: { ja: 'サイクリング', en: 'Cycling', icon: '🚴', color: '#3b82f6' },
  Walk: { ja: 'ウォーキング', en: 'Walking', icon: '🚶', color: '#f97316' },
  Golf: { ja: 'ゴルフ', en: 'Golf', icon: '⛳', color: '#16a34a' },
};

export function normalizeSport(value: string): Sport | null {
  const sport = value.toLowerCase();
  if (sport === 'ride' || sport === 'cycling') return 'Ride';
  if (['walk', 'walking', 'run', 'running', 'hike'].includes(sport)) return 'Walk';
  if (sport === 'golf') return 'Golf';
  return null;
}

export function sportFromActivityName(name: string): Sport | null {
  const title = name.toLowerCase();
  if (/ゴルフ|golf/.test(title)) return 'Golf';
  if (/サイクリング|ライド|自転車|ポタリング|cycling|biking|bicycle|bike|ride/.test(title)) {
    return 'Ride';
  }
  if (/ハイキング|ランニング|ジョギング|ウォーキング|ウォーク|散歩|登山|トレッキング|walking|hiking|jogging|running|walk|jog|run|trekking/.test(title)) {
    return 'Walk';
  }
  return null;
}

export function resolveActivitySport(name: string, type: string, trusted = false): Sport | null {
  const normalized = normalizeSport(type);
  // New GAS exports have already applied sport_override, so trust their result.
  if (trusted) return normalized;
  return sportFromActivityName(name) ?? normalized;
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
