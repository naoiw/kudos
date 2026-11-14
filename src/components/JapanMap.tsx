import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Activity } from '../types';
import { prefecturesForActivity } from '../core/prefectureRoutes';

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
const MIN_ZOOM = 1;
const MAX_ZOOM = 9;
const INITIAL_ZOOM = 2.4;
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

interface MapView {
  x: number;
  y: number;
  zoom: number;
}

interface PointerPosition {
  x: number;
  y: number;
}

interface DragStart extends PointerPosition {
  id: number;
  originX: number;
  originY: number;
}

function clampView(view: MapView): MapView {
  return {
    x: Math.max(0, Math.min(WIDTH, view.x)),
    y: Math.max(0, Math.min(HEIGHT, view.y)),
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom)),
  };
}

// Use the largest landmass rather than the full bounding box, which would
// pull prefectures with remote islands far away from their main territory.
function prefectureCenter(feature: GeoFeature): [number, number] {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][];
  let largestArea = -1;
  let result: [number, number] = [WIDTH / 2, HEIGHT / 2];

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;

    const points = ring.map(([lng, lat]) => project(lng, lat));
    let signedArea = 0;
    let centerX = 0;
    let centerY = 0;

    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      const cross = x1 * y2 - x2 * y1;
      signedArea += cross;
      centerX += (x1 + x2) * cross;
      centerY += (y1 + y2) * cross;
    }

    const area = Math.abs(signedArea);
    if (area <= largestArea || area < 0.000001) continue;
    largestArea = area;
    result = [centerX / (3 * signedArea), centerY / (3 * signedArea)];
  }
  return result;
}

function distance(a: PointerPosition, b: PointerPosition): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const [INITIAL_X, INITIAL_Y] = project(137.3, 35.5);
const INITIAL_VIEW: MapView = {
  x: INITIAL_X,
  y: INITIAL_Y,
  zoom: INITIAL_ZOOM,
};

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
  const [view, setView] = useState<MapView>(INITIAL_VIEW);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointersRef = useRef(new Map<number, PointerPosition>());
  const dragRef = useRef<DragStart | null>(null);
  const pinchDistanceRef = useRef<number | null>(null);
  const movedRef = useRef(false);

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
      center: prefectureCenter(feature),
    })),
    [features]
  );
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const activity of activities) {
      for (const pref of prefecturesForActivity(activity)) {
        result.set(pref, (result.get(pref) ?? 0) + 1);
      }
    }
    return result;
  }, [activities]);

  // Recenter for both clicks on the map and selections initiated elsewhere.
  // Changes to zoom do not change the center, even while a region is selected.
  useEffect(() => {
    if (!selectedPrefecture) return;
    const selected = paths.find((path) => path.name === selectedPrefecture);
    if (!selected) return;
    setView((previous) => clampView({
      x: selected.center[0],
      y: selected.center[1],
      zoom: Math.max(previous.zoom, 2.8),
    }));
  }, [paths, selectedPrefecture]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Non-passive listener prevents the page from scrolling while zooming.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.002);
      setView((previous) => clampView({
        ...previous,
        zoom: previous.zoom * factor,
      }));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (factor: number) => {
    setView((previous) => clampView({
      ...previous,
      zoom: previous.zoom * factor,
    }));
  };

  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const position = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, position);
    if (pointersRef.current.size === 1) {
      dragRef.current = {
        id: event.pointerId,
        ...position,
        originX: position.x,
        originY: position.y,
      };
      movedRef.current = false;
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchDistanceRef.current = distance(a, b);
      movedRef.current = true;
    }
  };

  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const nextDistance = distance(a, b);
      const previousDistance = pinchDistanceRef.current;
      if (previousDistance && previousDistance > 0) {
        zoomBy(nextDistance / previousDistance);
      }
      pinchDistanceRef.current = nextDistance;
      movedRef.current = true;
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (!movedRef.current && distance(drag, {
      x: event.clientX,
      y: event.clientY,
    }) <= 5) {
      return;
    }

    if (!movedRef.current) {
      movedRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width && bounds.height) {
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      setView((previous) => clampView({
        ...previous,
        x: previous.x - deltaX * WIDTH / previous.zoom / bounds.width,
        y: previous.y - deltaY * HEIGHT / previous.zoom / bounds.height,
      }));
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pinchDistanceRef.current = null;
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length === 1) {
      const [id, position] = remaining[0];
      dragRef.current = {
        id,
        ...position,
        originX: position.x,
        originY: position.y,
      };
      movedRef.current = true;
    } else {
      dragRef.current = null;
    }
  };

  const focused = hover ?? selectedPrefecture;
  const focusedCount = focused ? (counts.get(focused) ?? 0) : 0;
  const toggle = (pref: string) => {
    onSelectPrefecture(selectedPrefecture === pref ? null : pref);
  };

  const viewWidth = WIDTH / view.zoom;
  const viewHeight = HEIGHT / view.zoom;
  const viewBox = [
    view.x - viewWidth / 2,
    view.y - viewHeight / 2,
    viewWidth,
    viewHeight,
  ].join(' ');

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
      <div className="relative overflow-hidden rounded-lg"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, background: 'var(--color-bg)' }}>
        <svg ref={svgRef} role="group" aria-label="都道府県別の活動状況（ドラッグで移動、ホイール・ピンチで拡大縮小）"
          viewBox={viewBox} preserveAspectRatio="xMidYMid meet"
          width="100%" height="100%"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          style={{
            position: 'absolute', inset: 0, display: 'block',
            touchAction: 'none', userSelect: 'none', cursor: 'grab',
          }}>
          {paths.map(({ code, name, d }) => {
            if (!name) return null;
            const count = counts.get(name) ?? 0;
            const visited = count > 0;
            const selected = name === selectedPrefecture;
            const fill = selected
              ? 'var(--color-accent)'
              : !visited
                ? 'var(--color-border)'
                : hover === name
                  ? 'color-mix(in srgb, var(--color-accent) 80%, transparent)'
                  : selectedPrefecture
                    ? 'color-mix(in srgb, var(--color-accent) 25%, transparent)'
                    : 'color-mix(in srgb, var(--color-accent) 55%, transparent)';
            return (
              <path key={code} d={d} fill={fill} fillRule="evenodd"
                stroke="var(--color-bg)" strokeWidth="0.65" vectorEffect="non-scaling-stroke"
                className="footprint-prefecture cursor-pointer transition-colors duration-150"
                onMouseEnter={() => setHover(name)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(name)}
                onBlur={() => setHover(null)}
                role="button"
                tabIndex={0}
                aria-label={`${name}：${count}件`}
                aria-pressed={selected}
                onClick={() => {
                  if (!movedRef.current) toggle(name);
                }}
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
        <div className="absolute right-2 top-2 flex flex-col gap-1" role="group" aria-label="地図の表示操作">
          <button type="button" aria-label="拡大" title="拡大"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-lg shadow-sm hover:opacity-80"
            onClick={() => zoomBy(1.5)}>＋</button>
          <button type="button" aria-label="縮小" title="縮小"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-lg shadow-sm hover:opacity-80"
            onClick={() => zoomBy(1 / 1.5)}>－</button>
          <button type="button" aria-label="中部地方を中心とした初期表示に戻す"
            title="初期位置に戻す"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)] text-xs shadow-sm hover:opacity-80"
            onClick={() => {
              onSelectPrefecture(null);
              setView(INITIAL_VIEW);
            }}>戻す</button>
        </div>
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
        ドラッグで移動・ホイール／ピンチで拡大縮小。都道府県を選択すると中央に表示します。
      </p>
      <p className="mt-1 text-[10px] text-[var(--color-muted)]">
        地図データ：国土地理院（hfu/gmjpn21pref 加工）
      </p>
    </section>
  );
});
