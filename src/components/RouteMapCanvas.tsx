import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { hasRoute, routeForActivity } from '../core/routeFallback';
import { MAPBOX_TOKEN } from '../config';
import { useLocale } from '../hooks/useLocale';
import './RouteMap.css';

export interface RouteMapProps {
  activities: Activity[];
  allActivities?: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
}

const routeCache = new WeakMap<
  Activity,
  {
    type: 'Feature';
    properties: { type: string };
    geometry: { type: 'LineString'; coordinates: number[][] };
  }[]
>();

export function RouteMapCanvas({
  activities,
  allActivities = activities,
  selectedActivity,
  dark,
  onClearSelection,
}: RouteMapProps) {
  const { locale } = useLocale();
  const zh = locale === 'ja';
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const styleReadyRef = useRef(false);
  const cameraRef = useRef<mapboxgl.CameraOptions | null>(null);
  const fittedRef = useRef<unknown>(null);
  const appliedStyleRef = useRef<string | mapboxgl.StyleSpecification | null>(null);
  const [provider, setProvider] = useState<'mapbox' | 'osm'>(MAPBOX_TOKEN ? 'mapbox' : 'osm');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [retry, setRetry] = useState(0);
  // A self-contained raster style does not require a Mapbox token or remote
  // vector-style metadata, sprite sheets, or fonts.
  const style = useMemo<string | mapboxgl.StyleSpecification>(() =>
    provider === 'mapbox'
      ? `mapbox://styles/mapbox/${dark === false ? 'light' : 'dark'}-v11`
      : {
          version: 8,
          sources: {
            'openstreetmap': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
            },
          },
          layers: [
            {
              id: 'basemap',
              type: 'raster',
              source: 'openstreetmap',
              paint: {
                'raster-fade-duration': 0,
                ...(dark === false
                  ? {}
                  : {
                      'raster-brightness-max': 0.8,
                      'raster-saturation': -0.4,
                    }),
              },
            },
          ],
        }, [provider, dark]);

  const displayActivity = useMemo(
    () =>
      selectedActivity
        ? routeForActivity(selectedActivity, allActivities)
        : null,
    [selectedActivity, allActivities]
  );
  const fallbackActivity =
    selectedActivity && !hasRoute(selectedActivity) ? displayActivity : null;

  const routes = useMemo(() => {
    const items = selectedActivity
      ? displayActivity
        ? [displayActivity]
        : []
      : activities;
    return items.flatMap((activity) => {
      const cached = routeCache.get(activity);
      if (cached) return cached;
      if (!activity.summary_polyline) return [];
      try {
        const coordinates = polyline
          .decode(activity.summary_polyline)
          .map(([lat, lng]) => [lng, lat])
          .filter(
            ([lng, lat]) =>
              Number.isFinite(lng) &&
              Number.isFinite(lat) &&
              Math.abs(lng) <= 180 &&
              Math.abs(lat) <= 90
          );
        if (coordinates.length < 2) return [];
        const features = [
          {
            type: 'Feature' as const,
            properties: { type: activity.type },
            geometry: { type: 'LineString' as const, coordinates },
          },
        ];
        routeCache.set(activity, features);
        return features;
      } catch {
        return [];
      }
    });
  }, [activities, selectedActivity, displayActivity]);

  const routeBounds = useMemo(() => {
    const bounds = new mapboxgl.LngLatBounds();
    for (const route of routes) {
      for (const coord of route.geometry.coordinates)
        bounds.extend(coord as [number, number]);
    }
    return bounds;
  }, [routes]);

  const fitRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || routeBounds.isEmpty()) return;
    map.fitBounds(routeBounds, {
      padding: { top: 35, bottom: 35, left: 35, right: 65 },
      maxZoom: selectedActivity ? 16 : 13,
      // Jump rather than animate: avoid cancelling the initial tile requests.
      duration: 0,
    });
  }, [routeBounds, selectedActivity]);

  const drawRoutes = useCallback(() => {
    const map = mapRef.current;
    if (!map || !styleReadyRef.current) return;
    const data = { type: 'FeatureCollection' as const, features: routes };
    const source = map.getSource('routes') as
      mapboxgl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('routes', { type: 'geojson', data });
      map.addLayer({
        id: 'routes',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match',
            ['get', 'type'],
            'Run',
            '#f97316',
            'Ride',
            '#3b82f6',
            '#4dd2ff',
          ],
        },
      });
    }
    map.setPaintProperty('routes', 'line-width', selectedActivity ? 3.5 : 2);
    map.setPaintProperty('routes', 'line-opacity', selectedActivity ? 1 : 0.7);
    if (fittedRef.current !== routes) {
      fittedRef.current = routes;
      fitRoutes();
    }
  }, [routes, selectedActivity, fitRoutes]);

  useEffect(() => {
    if (!containerRef.current || !panelRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      accessToken: MAPBOX_TOKEN,
      language: zh ? 'ja' : 'en',
      // Load the actual basemap immediately instead of an empty placeholder.
      style,
      center: [139.7, 35.7],
      zoom: 10,
      ...cameraRef.current,
      locale: zh
        ? {
            'Map.Title': 'ルートマップ',
            'NavigationControl.ZoomIn': '拡大',
            'NavigationControl.ZoomOut': '縮小',
            'NavigationControl.ResetBearing': '北を上に戻す',
            'FullscreenControl.Enter': '全画面表示',
            'FullscreenControl.Exit': '全画面表示を終了',
            'AttributionControl.ToggleAttribution': '地図の出典',
          }
        : {},
    });
    mapRef.current = map;
    appliedStyleRef.current = style;
    // Place the camera before the first map paint. The previous implementation
    // animated to these bounds during style.load and could leave a blank map.
    if (!routeBounds.isEmpty()) {
      const camera = map.cameraForBounds(routeBounds, {
        padding: { top: 35, bottom: 35, left: 35, right: 65 },
        maxZoom: 12,
      });
      if (camera) {
        map.jumpTo(camera);
        fittedRef.current = routes;
      }
    }
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.FullscreenControl({ container: panelRef.current }),
      'top-right'
    );
    map.addControl(
      new mapboxgl.ScaleControl({ unit: 'metric', maxWidth: 90 }),
      'bottom-left'
    );
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      cameraRef.current = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      };
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onError = (event: mapboxgl.ErrorEvent) => {
      // A map can still render when an individual resource fails to load.
      // Never mark the entire map as broken for a recoverable tile error.
      console.warn('Map resource warning:', event.error);
      if (provider === 'mapbox') {
        setProvider('osm');
      }
    };
    const onIdle = () => {
      if (map.isStyleLoaded()) setStatus('ready');
    };
    const onLoading = () => setStatus('loading');
    map.on('error', onError);
    map.on('idle', onIdle);
    map.once('styledataloading', onLoading);
    // The constructor already received the initial style. Do not replace it
    // immediately: that discards in-flight raster tile requests on first load.
    if (appliedStyleRef.current !== style) {
      appliedStyleRef.current = style;
      styleReadyRef.current = false;
      setStatus('loading');
      map.setStyle(style, {
        diff: false,
        localFontFamily: undefined,
        localIdeographFontFamily: 'sans-serif',
      });
    }
    const timer = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setStatus('error');
    }, 15000);
    return () => {
      window.clearTimeout(timer);
      map.off('error', onError);
      map.off('idle', onIdle);
      map.off('styledataloading', onLoading);
    };
  }, [style, provider, retry, zh]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onStyleLoad = () => {
      styleReadyRef.current = true;
      drawRoutes();
    };
    map.on('style.load', onStyleLoad);
    drawRoutes();
    return () => {
      map.off('style.load', onStyleLoad);
    };
  }, [drawRoutes, style, retry, zh]);

  useEffect(() => {
    let wasFullscreen = document.fullscreenElement === panelRef.current;
    let frame = 0;
    const onFullscreen = () => {
      const isFullscreen = document.fullscreenElement === panelRef.current;
      if (isFullscreen || wasFullscreen) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          mapRef.current?.resize();
          fitRoutes();
        });
      }
      wasFullscreen = isFullscreen;
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [fitRoutes]);

  return (
    <section
      ref={panelRef}
      className="route-map"
      aria-label={zh ? 'ルートマップ' : 'Route map'}
    >
      <div className="route-map-header">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">
            {zh ? 'ルートマップ' : 'Route map'}
          </h2>
          <p
            className="truncate text-xs text-[var(--color-muted)]"
            title={selectedActivity?.name}
          >
            {selectedActivity
              ? `${selectedActivity.name} · ${(selectedActivity.distance / 1000).toFixed(1)} km`
              : `${routes.length.toLocaleString()} ${zh ? '件の経路' : 'routes'}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {selectedActivity && onClearSelection && (
            <button className="route-map-action" onClick={onClearSelection}>
              {zh ? '一覧に戻る' : 'Overview'}
            </button>
          )}
          <button
            className="route-map-action"
            disabled={!routes.length}
            onClick={fitRoutes}
            title={zh ? 'すべての経路を表示' : 'Fit all current routes'}
          >
            {zh ? '経路全体を表示' : 'Fit routes'}
          </button>
        </div>
      </div>
      {fallbackActivity && (
        <p
          role="status"
          className="px-4 pb-2 text-xs text-[var(--color-muted)]"
        >
          {zh
            ? `このアクティビティにはGPS経路がありません。直近の別の経路を表示しています：${fallbackActivity.name}（${fallbackActivity.start_date_local}）。`
            : `This activity has no usable GPS route. Showing the most recent earlier mapped activity: ${fallbackActivity.name} (${fallbackActivity.start_date_local}).`}
        </p>
      )}
      <div className="route-map-body">
        <div ref={containerRef} className="h-full w-full" />
        {!routes.length && (
          <div className="route-map-empty" role="status">
            {zh
              ? selectedActivity
                ? 'このアクティビティにはGPS経路がありません'
                : '条件に一致するGPS経路がありません'
              : 'No GPS route available'}
          </div>
        )}
      </div>
      <div className="route-map-footer">
        <span role="status" aria-live="polite">
          {status === 'error'
            ? zh
              ? '地図を読み込めませんでした'
              : 'Basemap failed to load'
            : status === 'loading'
              ? zh
                ? '地図を読み込み中…'
                : 'Loading map…'
              : provider === 'osm'
                ? zh
                  ? '背景地図 · OpenStreetMap'
                  : 'Basemap · OpenStreetMap'
                : zh
                  ? '地図 · Mapbox'
                  : 'Basemap · Mapbox'}
        </span>
        {(status === 'error' || (provider === 'osm' && !!MAPBOX_TOKEN)) && (
          <button
            className="route-map-action"
            onClick={() => {
              setProvider(MAPBOX_TOKEN ? 'mapbox' : 'osm');
              setRetry((value) => value + 1);
            }}
          >
            {provider === 'osm' && MAPBOX_TOKEN
              ? zh
                ? 'Mapboxを再試行'
                : 'Retry Mapbox'
              : zh
                ? '再試行'
                : 'Retry'}
          </button>
        )}
      </div>
    </section>
  );
}
