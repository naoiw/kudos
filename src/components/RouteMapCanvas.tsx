import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { hasRoute, routeForActivity } from '../core/routeFallback';
import { useLocale } from '../hooks/useLocale';
import './RouteMap.css';

export interface RouteMapProps {
  activities: Activity[];
  allActivities?: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

type LatLng = [number, number];

interface LeafletLayer {
  addTo(map: LeafletMap): LeafletLayer;
}

interface LeafletMap {
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

const decodedRouteCache = new WeakMap<Activity, DisplayRoute | null>();

function decodeRoute(activity: Activity): DisplayRoute | null {
  const existing = decodedRouteCache.get(activity);
  if (existing !== undefined) return existing;

  let route: DisplayRoute | null = null;
  if (activity.summary_polyline) {
    try {
      const points = polyline
        .decode(activity.summary_polyline)
        .filter(
          ([lat, lng]) =>
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            Math.abs(lat) <= 90 &&
            Math.abs(lng) <= 180
        )
        .map(([lat, lng]) => [lat, lng] as LatLng);
      if (points.length >= 2) {
        route = { points, type: activity.type };
      }
    } catch {
      // Skip malformed routes; the activity statistics remain available.
    }
  }
  decodedRouteCache.set(activity, route);
  return route;
}

export function RouteMapCanvas({
  activities,
  allActivities = activities,
  selectedActivity,
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
    const list = selectedActivity
      ? displayedActivity
        ? [displayedActivity]
        : []
      : activities;

    return list
      .map(decodeRoute)
      .filter((route): route is DisplayRoute => route !== null);
  }, [activities, selectedActivity, displayedActivity]);

  const fitRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || boundsRef.current.length === 0) return;
    map.fitBounds(boundsRef.current, {
      padding: [30, 30],
      maxZoom: selectedActivity ? 16 : 13,
      animate: false,
    });
  }, [selectedActivity]);

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
        color: route.type === 'Run' ? '#f97316' : '#3b82f6',
        weight: selectedActivity ? 4 : 2.5,
        opacity: selectedActivity ? 1 : 0.75,
      });
      layer.addTo(map);
      routeLayersRef.current.push(layer);
      points.push(...route.points);
    }
    boundsRef.current = points;

    if (points.length) {
      fitRoutes();
    } else {
      map.setView(MAP_CENTER, 10);
    }
  }, [routes, mapReady, selectedActivity, fitRoutes]);

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
              : `${routes.length.toLocaleString()} ${ja ? '件の経路' : 'routes'}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {selectedActivity && onClearSelection && (
            <button className="route-map-action" onClick={onClearSelection}>
              {ja ? '一覧に戻る' : 'Overview'}
            </button>
          )}
          <button className="route-map-action" disabled={!routes.length} onClick={fitRoutes}>
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

      <div className="route-map-body">
        <div ref={containerRef} className="h-full w-full" />
        {!routes.length && (
          <div className="route-map-empty" role="status">
            {ja ? '表示可能なGPS経路がありません' : 'No GPS route available'}
          </div>
        )}
      </div>
      <div className="route-map-footer">
        <span role="status" aria-live="polite">
          {status === 'error'
            ? ja ? '地図ライブラリを読み込めませんでした' : 'Failed to load map library'
            : status === 'loading'
              ? ja ? '背景地図を読み込み中…' : 'Loading background map…'
              : ja ? '背景地図 · OpenStreetMap' : 'Basemap · OpenStreetMap'}
        </span>
        {status === 'error' && (
          <button className="route-map-action" onClick={() => {
            setMapReady(false);
            setRetry((value) => value + 1);
          }}>
            {ja ? '再試行' : 'Retry'}
          </button>
        )}
      </div>
    </section>
  );
}
