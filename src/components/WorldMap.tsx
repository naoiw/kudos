import { memo, useMemo, useState } from 'react';
import type { Activity } from '../types';
import { countriesForActivity, regionLabel, worldRegion, worldRegions } from '../core/countryRoutes';
import { useLocale } from '../hooks/useLocale';

interface WorldMapProps {
  activities: Activity[];
  selectedCountry: string | null;
  onSelectCountry: (code: string | null) => void;
}

const WIDTH = 720;
const HEIGHT = 360;
const project = (lng: number, lat: number): [number, number] =>
  [(lng + 180) * WIDTH / 360, (90 - lat) * HEIGHT / 180];

const shapes = worldRegions().filter(region => region.polygons.length > 0).map(region => ({
  code: region.code,
  path: region.polygons.map(polygon =>
    polygon.map(ring =>
      ring.map(([lng, lat], index) => {
        const [x, y] = project(lng, lat);
        return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join(' ') + ' Z'
    ).join(' ')
  ).join(' '),
}));
const tinyCountries = worldRegions().filter(region => region.point);

function focusedViewBox(code: string | null): string {
  const region = code ? worldRegion(code) : null;
  if (!region) return '0 0 ' + WIDTH + ' ' + HEIGHT;
  const coords = region.point ? [region.point] :
    region.polygons.flatMap(polygon => polygon.flatMap(ring => ring));
  if (coords.length === 0) return '0 0 ' + WIDTH + ' ' + HEIGHT;
  const projected = coords.map(([lng, lat]) => project(lng, lat));
  const xs = projected.map(point => point[0]);
  const ys = projected.map(point => point[1]);
  const west = Math.min(...xs), east = Math.max(...xs);
  const north = Math.min(...ys), south = Math.max(...ys);
  const width = Math.min(WIDTH, Math.max(74, (east - west) * 1.35));
  const height = Math.min(HEIGHT, Math.max(68, (south - north) * 1.35));
  const x = Math.max(0, Math.min(WIDTH - width, (west + east - width) / 2));
  const y = Math.max(0, Math.min(HEIGHT - height, (north + south - height) / 2));
  return [x, y, width, height].join(' ');
}

export const WorldMap = memo(function WorldMap({
  activities,
  selectedCountry,
  onSelectCountry,
}: WorldMapProps) {
  const { locale } = useLocale();
  const isJapanese = locale === 'ja';
  const [hover, setHover] = useState<string | null>(null);
  const counts = useMemo(() => {
    const tally = new Map<string, number>();
    for (const activity of activities) {
      for (const code of countriesForActivity(activity)) {
        tally.set(code, (tally.get(code) ?? 0) + 1);
      }
    }
    return tally;
  }, [activities]);
  const visited = useMemo(
    () => [...counts.keys()].sort((a, b) =>
      regionLabel(a, locale).localeCompare(regionLabel(b, locale), locale)
    ),
    [counts, locale]
  );
  const toggle = (code: string) =>
    onSelectCountry(selectedCountry === code ? null : code);
  const focus = hover ?? selectedCountry;

  const fillFor = (code: string) => selectedCountry === code
    ? 'var(--color-accent)'
    : (counts.get(code) ?? 0) > 0
      ? 'color-mix(in srgb, var(--color-accent) 60%, var(--color-card))'
      : 'var(--color-border)';

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5"
      aria-label={isJapanese ? '世界の足跡マップ' : 'World footprint map'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {isJapanese ? '世界の足跡マップ' : 'World footprints'}
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {selectedCountry && (
            <button type="button" className="text-[var(--color-accent)]"
              onClick={() => onSelectCountry(null)}>
              {isJapanese ? '絞り込み解除' : 'Clear filter'}
            </button>
          )}
          <span className="font-mono font-bold text-[var(--color-accent)]">{counts.size}</span>
          <span>{isJapanese ? 'か国・地域' : 'countries / territories'}</span>
        </div>
      </div>
      <svg role="group"
        aria-label={isJapanese ? 'GPS経路から判定した国・地域（選択して活動を絞り込む）' : 'Countries and territories visited from GPS routes'}
        viewBox={focusedViewBox(selectedCountry)}
        width="100%" style={{ aspectRatio: '2 / 1', background: 'var(--color-bg)' }}
        className="rounded-lg">
        {shapes.map(({ code, path }) => (
          <path key={code} d={path} fill={fillFor(code)} fillRule="evenodd"
            stroke="var(--color-bg)" strokeWidth="0.7" vectorEffect="non-scaling-stroke"
            className="cursor-pointer transition-colors hover:opacity-70"
            role="button" tabIndex={0} aria-pressed={selectedCountry === code}
            aria-label={regionLabel(code, locale) + '：' + (counts.get(code) ?? 0) + (isJapanese ? '件' : ' activities')}
            onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(code)} onBlur={() => setHover(null)}
            onClick={() => toggle(code)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle(code);
              }
            }}>
            <title>{regionLabel(code, locale) + '：' + (counts.get(code) ?? 0)}</title>
          </path>
        ))}
        {tinyCountries.map((region) => {
          const [x, y] = project(region.point![0], region.point![1]);
          return (
            <circle key={region.code} cx={x} cy={y} r="2.6"
              fill={fillFor(region.code)} stroke="var(--color-text)"
              strokeWidth="0.4" vectorEffect="non-scaling-stroke"
              role="button" tabIndex={0} className="cursor-pointer"
              aria-pressed={selectedCountry === region.code}
              aria-label={regionLabel(region.code, locale) + '：' + (counts.get(region.code) ?? 0) + (isJapanese ? '件' : ' activities')}
              onMouseEnter={() => setHover(region.code)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(region.code)} onBlur={() => setHover(null)}
              onClick={() => toggle(region.code)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault(); toggle(region.code);
                }
              }}>
              <title>{regionLabel(region.code, locale)}</title>
            </circle>
          );
        })}
      </svg>
      <div className="mt-2 min-h-5 text-xs text-[var(--color-muted)]" aria-live="polite">
        {focus && (
          <span>{regionLabel(focus, locale) + '：' + (counts.get(focus) ?? 0)}
            {isJapanese ? '件' : ' activities'}
            {focus === selectedCountry && (
              <span className="ml-2 text-[var(--color-accent)]">
                {isJapanese ? '絞り込み中' : 'Filtered'}
              </span>
            )}
          </span>
        )}
      </div>
      {visited.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group"
          aria-label={isJapanese ? '訪問した国・地域' : 'Visited countries'}>
          {visited.map(code => (
            <button key={code} type="button" aria-pressed={selectedCountry === code}
              onClick={() => toggle(code)}
              className={selectedCountry === code
                ? 'rounded-full border border-[var(--color-accent)] bg-[var(--color-accent)] px-2.5 py-1 text-xs text-[var(--color-on-accent)]'
                : 'rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs hover:bg-[var(--color-bg)]'}>
              {regionLabel(code, locale)} ({counts.get(code)})
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {isJapanese ? '判定できる国・地域の活動がありません' : 'No recognized countries or territories'}
        </p>
      )}
      <p className="mt-2 text-[10px] text-[var(--color-muted)]">
        {isJapanese
          ? '国・地域を選択すると活動とルート地図も連動します。境界データ：Natural Earth（小島は概略判定）'
          : 'Choose a region to filter activities and routes. Boundaries: Natural Earth (small islands approximate).'}
      </p>
    </section>
  );
});
