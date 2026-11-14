import { memo, useEffect, useMemo, useState } from 'react';
import type { Activity } from '../types';
import { extractProvince } from '../hooks/useActivities';

interface JapanMapProps {
  activities: Activity[];
  selectedPrefecture: string | null;
  onSelectPrefecture: (name: string | null) => void;
}

interface GeoFeature {
  properties: { code: number; name: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

const PREFECTURES = ["北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県","茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県","新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県","静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県","徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"] as const;
const WIDTH = 320;
const HEIGHT = 270;
// The bounds cover Hokkaido, Okinawa and the outlying eastern islands.
const EXTENT = { west: 122.4, east: 149.4, south: 23.8, north: 46 };

function project(lng: number, lat: number): [number, number] {
  return [
    ((lng - EXTENT.west) / (EXTENT.east - EXTENT.west)) * WIDTH,
    ((EXTENT.north - lat) / (EXTENT.north - EXTENT.south)) * HEIGHT,
  ];
}

function toSvgPath(feature: GeoFeature): string {
  const polygons =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);
  return polygons.flatMap((polygon) => polygon.map((ring) =>
    ring.map(([lng, lat], i) => {
      const [x, y] = project(lng, lat);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z'
  )).join(' ');
}

/**
 * A prefecture footprint map inspired by running_page's ChinaMap component.
 * The current activity schema supplies a single prefecture in location_country;
 * GPX-to-prefecture intersection can be added during future data ingestion.
 */
export const JapanMap = memo(function JapanMap({
  activities,
  selectedPrefecture,
  onSelectPrefecture,
}: JapanMapProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    import('../assets/japan-prefectures.json').then((data) => {
      if (mounted) setFeatures((data.default as { features: GeoFeature[] }).features);
    }).catch((error: unknown) => console.warn('Prefecture data unavailable:', error));
    return () => { mounted = false; };
  }, []);

  const paths = useMemo(
    () => features.map((feature) => ({
      name: PREFECTURES[feature.properties.code - 1],
      code: feature.properties.code,
      d: toSvgPath(feature),
    })),
    [features]
  );
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const activity of activities) {
      const pref = extractProvince(activity.location_country);
      if (pref) result.set(pref, (result.get(pref) ?? 0) + 1);
    }
    return result;
  }, [activities]);

  const focused = hover ?? selectedPrefecture;
  const focusedCount = focused ? (counts.get(focused) ?? 0) : 0;
  const toggle = (pref: string) => {
    if (!counts.has(pref)) return;
    onSelectPrefecture(selectedPrefecture === pref ? null : pref);
  };

  return (
    <section aria-label="足跡マップ"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">足跡マップ</h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {selectedPrefecture ? (
            <button className="text-[var(--color-accent)] hover:opacity-70"
              onClick={() => onSelectPrefecture(null)}>絞り込み解除</button>
          ) : (
            <><span className="font-mono font-bold text-[var(--color-accent)]">
              {counts.size}</span><span>/ 47 都道府県</span></>
          )}
        </div>
      </div>
      <div className="relative" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        <svg role="group" aria-label="都道府県別の活動状況"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="xMidYMid meet" width="100%" height="100%"
          style={{ position: 'absolute', inset: 0, display: 'block' }}>
          {paths.map(({ code, name, d }) => {
            if (!name) return null;
            const count = counts.get(name) ?? 0;
            const visited = count > 0;
            const selected = name === selectedPrefecture;
            const fill = !visited
              ? 'var(--color-border)'
              : selected ? 'var(--color-accent)'
                : hover === name
                  ? 'color-mix(in srgb, var(--color-accent) 80%, transparent)'
                  : selectedPrefecture
                    ? 'color-mix(in srgb, var(--color-accent) 25%, transparent)'
                    : 'color-mix(in srgb, var(--color-accent) 55%, transparent)';
            return (
              <path key={code} d={d} fill={fill} fillRule="evenodd"
                stroke="var(--color-bg)" strokeWidth="0.65"
                className={visited ? 'cursor-pointer transition-colors duration-150' : 'cursor-default'}
                onMouseEnter={() => setHover(name)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(name)}
                onBlur={() => setHover(null)}
                role={visited ? 'button' : undefined}
                tabIndex={visited ? 0 : undefined}
                aria-label={`${name}：${count}件`}
                aria-pressed={visited ? selected : undefined}
                onClick={() => toggle(name)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle(name);
                  }
                }}>
                <title>{`${name}：${count}件`}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <div className="mt-1.5 min-h-5 text-xs text-[var(--color-muted)]" aria-live="polite">
        {focused && (
          <><span className="font-medium text-[var(--color-text)]">{focused}</span>
            <span className="ml-2">{focusedCount}件</span>
            {focused === selectedPrefecture && <span className="ml-2 text-[var(--color-accent)]">絞り込み中</span>}
          </>
        )}
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-muted)]">
        地図データ：国土地理院（hfu/gmjpn21pref 加工）
      </p>
    </section>
  );
});
