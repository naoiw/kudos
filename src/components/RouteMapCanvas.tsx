import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { hasRoute, routeForActivity } from '../core/routeFallback';
import { sportColor } from '../core/sports';
import { activityPointsInPrefecture, prefectureBounds } from '../core/prefectureRoutes';
import { useLocale } from '../hooks/useLocale';
import type { DensityResult } from '../core/routeDensity';
import { RouteDensityOverlay, type DensityLeafletMap } from './RouteDensityOverlay';
import './RouteMap.css';

export interface RouteMapProps {
  activities: Activity[];
  allActivities?: Activity[];
  selectedActivity?: Activity | null;
  focusedPrefecture?: string | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

type LatLng = [number, number];

interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
}

interface LeafletMap extends DensityLeafletMap {
  setView(center: LatLng, zoom: number): LeafletMap;
  fitBounds(points: LatLng[], options: {
    padding: [number, number];
    maxZoom: number;
    animate: boolean;
  }): LeafletMap;
  invalidateSize(options?: { pan?: boolean }): LeafletMap;
  removeLayer(layer: LeafletLayer): LeafletMap;
  remove(): void;
}

interface LeafletTileLayer extends LeafletLayer {
  on(event: string, callback: () => void): LeafletTileLayer;
}

interface LeafletApi {
  map(container: HTMLElement, options: {
    zoomControl: boolean;
    scrollWheelZoom: boolean;
    attributionControl: boolean;
  }): LeafletMap;
  tileLayer(url: string, options: {
    attribution: string;
    maxZoom: number;
  }): LeafletTileLayer;
  polyline(points: LatLng[], options: {
    color: string;
    weight: number;
    opacity: number;
  }): LeafletLayer;
  control: {
    scale(options: { imperial: boolean; metric: boolean }): LeafletLayer;
  };
}

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

const MAP_CENTER: LatLng = [35.68, 139.76];
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Leaflet is loaded from a pinned CDN asset in index.html.
// Poll briefly because React may mount before the deferred script has executed.
function loadLeaflet(): Promise<LeafletApi> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const poll = () => {
      if (window.L) {
        resolve(window.L);
        return;
      }
      if (++attempts >= 100) {
        reject(new Error('Leaflet could not be loaded'));
        return;
      }
      window.setTimeout(poll, 100);
    };
    poll();
  });
}

interface DisplayRoute {
  points: LatLng[];
  type: string;
}

const decodedRouteCache = new WeakMap<Activity, DisplayRoute[]>();

function decodeRoute(activity: Activity): DisplayRoute[] {
  const cached = decodedRouteCache.get(activity);
  if (cached) return cached;

  const encoded = activity.route_segments?.length
    ? activity.route_segments
    : activity.summary_polyline ? [activity.summary_polyline] : [];
  const routes: DisplayRoute[] = [];
  for (const segment of encoded) {
    try {
      const points = polyline
        .decode(segment)
        .filter(([lat, lng]) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180
        )
        .map(([lat, lng]) => [lat, lng] as LatLng);
      if (points.length >= 2) {
        routes.push({ points, type: activity.type });
      }
    } catch {
      // Ignore an invalid segment but keep drawing the other segments.
    }
  }
  decodedRouteCache.set(activity, routes);
  return routes;
}

const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

function OpenStreetMapAttribution({ className }: { className: string }) {
  return (
    <span className={`route-map-attribution ${className}`}>
      Map data from{' '}
      <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer">
        OpenStreetMap
      </a>
    </span>
  );
}

export function RouteMapCanvas({
  activities,
  allActivities = activities,
  selectedActivity,
  focusedPrefecture = null,
  dark = false,
  onClearSelection,
}: RouteMapProps) {
  const { locale } = useLocale();
  const ja = locale === 'ja';
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const routeLayersRef = useRef<LeafletLayer[]>([]);
  const boundsRef = useRef<LatLng[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [viewMode, setViewMode] = useState<'routes' | 'density'>('routes');
  const [density, setDensity] = useState<DensityResult | null>(null);
  const [densityStatus, setDensityStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [densityRetry, setDensityRetry] = useState(0);
  // Individual activity selection temporarily shows its route. Overview restores density.
  const showDensity = viewMode === 'density' && !selectedActivity;

  useEffect(() => {
    if (!showDensity) return;
    setDensity(null);
    setDensityStatus('loading');
    let cancelled = false;
    let worker: Worker | null = null;
    try {
      worker = new Worker(
        new URL('../workers/routeDensity.worker.ts', import.meta.url),
        { type: 'module' }
      );
      worker.onmessage = ({ data }: MessageEvent<{
        result?: DensityResult;
        error?: string;
      }>) => {
        if (cancelled) return;
        if (!data.result || data.error) {
          setDensityStatus('error');
          return;
        }
        setDensity(data.result);
        setDensityStatus('ready');
      };
      worker.onerror = () => {
        if (!cancelled) setDensityStatus('error');
      };
      worker.postMessage(activities.map(({ summary_polyline, route_segments }) => ({
        summary_polyline, route_segments,
      })));
    } catch {
      setDensityStatus('error');
    }
    return () => {
      cancelled = true;
      worker?.terminate();
    };
  }, [showDensity, activities, densityRetry]);

  const displayedActivity = useMemo(
    () =>
      selectedActivity
        ? routeForActivity(selectedActivity, allActivities)
        : null,
    [selectedActivity, allActivities]
  );

  const fallbackActivity =
    selectedActivity && !hasRoute(selectedActivity)
      ? displayedActivity
      : null;

  const routes = useMemo(() => {
    if (showDensity) return [];
    const list = selectedActivity
      ? displayedActivity
        ? [displayedActivity]
        : []
      : activities;

    return list.flatMap(decodeRoute);
  }, [activities, selectedActivity, displayedActivity, showDensity]);

  const fitRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (focusedPrefecture && !selectedActivity) {
      const selectedPoints = activityPointsInPrefecture(activities, focusedPrefecture);
      const regionBounds = prefectureBounds(focusedPrefecture);
      // Focus on the actual portion of routes inside the prefecture when possible.
      const focus = selectedPoints.length
        ? selectedPoints
        : regionBounds
          ? regionBounds
          : [];
      if (focus.length) {
        map.fitBounds(focus, {
          padding: [35, 35],
          maxZoom: 12,
          animate: false,
        });
        return;
      }
    }

    if (showDensity && density?.bounds) {
      map.fitBounds(density.bounds, {
        padding: [30, 30],
        maxZoom: 13,
        animate: false,
      });
      return;
    }
    if (boundsRef.current.length === 0) return;
    map.fitBounds(boundsRef.current, {
      padding: [30, 30],
      maxZoom: selectedActivity ? 16 : 13,
      animate: false,
    });
  }, [activities, focusedPrefecture, selectedActivity, showDensity, density]);

  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | null = null;

    setStatus('loading');
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current, {
          zoomControl: true,
          scrollWheelZoom: true,
          // The visible OSM credit is rendered beside the map and in fullscreen.
          attributionControl: false,
        });
        instance = map;
        mapRef.current = map;
        map.setView(MAP_CENTER, 10);

        const tiles = L.tileLayer(TILE_URL, {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
          maxZoom: 19,
        });
        tiles.on('load', () => {
          if (!cancelled) setStatus('ready');
        });
        tiles.on('tileerror', () => {
          // A single unavailable tile should not hide the entire map.
          console.warn('A background map tile failed to load.');
        });
        tiles.addTo(map);
        L.control.scale({ imperial: false, metric: true }).addTo(map);
        setMapReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error('Failed to initialize Leaflet:', error);
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current === instance) mapRef.current = null;
      instance?.remove();
    };
  }, [retry]);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!mapReady || !map || !L) return;

    for (const layer of routeLayersRef.current) {
      map.removeLayer(layer);
    }
    routeLayersRef.current = [];

    const points: LatLng[] = [];
    for (const route of routes) {
      const layer = L.polyline(route.points, {
        color: sportColor(route.type),
        weight: selectedActivity ? 4 : 2.5,
        opacity: selectedActivity ? 1 : 0.75,
      });
      layer.addTo(map);
      routeLayersRef.current.push(layer);
      points.push(...route.points);
    }
    boundsRef.current = points;

    if (showDensity) {
      if (density?.bounds || focusedPrefecture) fitRoutes();
      else if (densityStatus === 'ready') map.setView(MAP_CENTER, 10);
      return;
    }
    if (points.length) {
      fitRoutes();
    } else if (focusedPrefecture) {
      fitRoutes();
    } else {
      map.setView(MAP_CENTER, 10);
    }
  }, [routes, mapReady, selectedActivity, focusedPrefecture, fitRoutes, showDensity, density, densityStatus]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement !== panelRef.current &&
          document.fullscreenElement !== null) return;
      window.requestAnimationFrame(() => {
        mapRef.current?.invalidateSize({ pan: false });
      });
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement === panelRef.current) {
      void document.exitFullscreen();
    } else if (panelRef.current?.requestFullscreen) {
      void panelRef.current.requestFullscreen();
    }
  };

  return (
    <section
      ref={panelRef}
      className={`route-map ${dark ? 'route-map-dark' : ''}`}
      aria-label={ja ? 'ルートマップ' : 'Route map'}
    >
      <div className="route-map-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {ja ? 'ルートマップ' : 'Route map'}
          </h2>
          <p className="truncate text-xs text-[var(--color-muted)]" title={selectedActivity?.name}>
            {selectedActivity
              ? `${selectedActivity.name} · ${(selectedActivity.distance / 1000).toFixed(1)} km`
              : showDensity
                ? `${(density?.activityCount ?? 0).toLocaleString()} ${ja ? '件の活動から密度を算出' : 'activities counted'}`
                : `${routes.length.toLocaleString()} ${ja ? '件の経路' : 'routes'}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!selectedActivity && (
            <div className="route-map-view-switch" role="group"
              aria-label={ja ? '地図の表示方式' : 'Map view mode'}>
              {(['routes', 'density'] as const).map(mode => (
                <button key={mode} type="button" className="route-map-action"
                  aria-pressed={viewMode === mode}
                  onClick={() => setViewMode(mode)}>
                  {mode === 'routes'
                    ? (ja ? '通常' : 'Routes')
                    : (ja ? '密度' : 'Density')}
                </button>
              ))}
            </div>
          )}
          {selectedActivity && onClearSelection && (
            <button className="route-map-action" onClick={onClearSelection}>
              {ja ? '一覧に戻る' : 'Overview'}
            </button>
          )}
          <button className="route-map-action" disabled={showDensity ? !density?.bounds : !routes.length} onClick={fitRoutes}>
            {ja ? '経路全体を表示' : 'Fit routes'}
          </button>
          <button className="route-map-action" onClick={toggleFullscreen}
            aria-label={ja ? '地図の全画面表示を切り替え' : 'Toggle map fullscreen'}>
            {ja ? '全画面' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {fallbackActivity && (
        <p role="status" className="px-4 pb-2 text-xs text-[var(--color-muted)]">
          {ja
            ? `選択した活動にはGPS経路がありません。代わりに ${fallbackActivity.name} の経路を表示しています。`
            : `No GPS route for this activity. Showing ${fallbackActivity.name} instead.`}
        </p>
      )}

      {showDensity && (
        <div className="route-density-legend" role="note">
          <span>{ja ? '通過アクティビティ数' : 'Visits by activity'}</span>
          <span><i className="route-density-swatch" style={{ background: '#2563eb' }} />
            {ja ? '1回' : '1'}</span>
          <span><i className="route-density-swatch" style={{ background: '#f59e0b' }} />
            {ja ? '2〜3回' : '2–3'}</span>
          <span><i className="route-density-swatch" style={{ background: '#ef4444' }} />
            {ja ? '4回以上' : '4+'}</span>
        </div>
      )}
      <div className="route-map-body">
        <div ref={containerRef} className="h-full w-full" />
        {showDensity && (
          <RouteDensityOverlay map={mapReady ? mapRef.current : null} density={density} />
        )}
        {showDensity && densityStatus === 'loading' && (
          <div className="route-map-density-status" role="status">
            {ja ? '経路密度を計算中…' : 'Calculating route density…'}
          </div>
        )}
        {showDensity && densityStatus === 'error' && (
          <div className="route-map-density-status" role="alert">
            {ja ? '密度の計算に失敗しました。' : 'Could not calculate density.'}
            <button className="route-map-action" type="button"
              onClick={() => setDensityRetry(value => value + 1)}>
              {ja ? '再試行' : 'Retry'}
            </button>
          </div>
        )}
        {showDensity && densityStatus === 'ready' && !density?.cells.length && (
          <div className="route-map-empty" role="status">
            {ja ? '密度表示に使用できるGPS経路がありません' : 'No GPS routes for density'}
          </div>
        )}
        {!showDensity && !routes.length && (
          <div className="route-map-empty" role="status">
            {ja ? '表示可能なGPS経路がありません' : 'No GPS route available'}
          </div>
        )}
        <OpenStreetMapAttribution className="route-map-attribution-fullscreen" />
      </div>
      {showDensity && (
        <p className="route-density-privacy-note" role="note">
          {ja
            ? '公開GPSからの推定です。頻繁に通る場所から生活圏が分かる可能性があります。'
            : 'Estimated from public GPS routes. Frequent locations may reveal personal patterns.'}
        </p>
      )}
      <div className="route-map-footer">
        {status !== 'ready' && (
          <span role="status" aria-live="polite">
            {status === 'error'
              ? ja ? '地図ライブラリを読み込めませんでした' : 'Failed to load map library'
              : ja ? '背景地図を読み込み中…' : 'Loading background map…'}
          </span>
        )}
        {status === 'error' && (
          <button className="route-map-action" onClick={() => {
            setMapReady(false);
            setRetry((value) => value + 1);
          }}>
            {ja ? '再試行' : 'Retry'}
          </button>
        )}
        <OpenStreetMapAttribution className="route-map-attribution-footer" />
      </div>
    </section>
  );
}
