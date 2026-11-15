import { useEffect, useRef } from 'react';
import {
  CELL_SIZE, densityColor, unproject, type DensityResult,
} from '../core/routeDensity';

export interface DensityLeafletMap {
  getSize(): { x: number; y: number };
  latLngToContainerPoint(point: [number, number]): { x: number; y: number };
  on(event: string, callback: () => void): this;
  off(event: string, callback: () => void): this;
}

/**
 * One non-interactive canvas instead of thousands of Leaflet marker layers.
 * Hide stale pixels while panning; repaint only after map bounds settle.
 */
export function RouteDensityOverlay({
  map,
  density,
}: {
  map: DensityLeafletMap | null;
  density: DensityResult | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!map || !canvas || !density) return;

    let animationFrame = 0;
    const draw = () => {
      const size = map.getSize();
      if (size.x <= 0 || size.y <= 0) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(size.x * ratio);
      canvas.height = Math.ceil(size.y * ratio);
      canvas.style.width = size.x + 'px';
      canvas.style.height = size.y + 'px';
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      for (const cell of density.cells) {
        const northwest = map.latLngToContainerPoint(
          unproject(cell.x * CELL_SIZE, cell.y * CELL_SIZE)
        );
        const southeast = map.latLngToContainerPoint(
          unproject((cell.x + 1) * CELL_SIZE, (cell.y + 1) * CELL_SIZE)
        );
        const x = Math.min(northwest.x, southeast.x);
        const y = Math.min(northwest.y, southeast.y);
        const width = Math.max(1, Math.abs(southeast.x - northwest.x));
        const height = Math.max(1, Math.abs(southeast.y - northwest.y));
        if (x > size.x || y > size.y || x + width < 0 || y + height < 0) continue;
        context.fillStyle = densityColor(cell.count);
        context.globalAlpha = cell.count === 1 ? 0.53 : cell.count <= 3 ? 0.7 : 0.86;
        context.fillRect(x, y, width, height);
      }
      context.globalAlpha = 1;
      canvas.style.opacity = '1';
    };
    const redraw = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(draw);
    };
    const hide = () => { canvas.style.opacity = '0'; };
    map.on('movestart', hide);
    map.on('moveend', redraw);
    map.on('zoomend', redraw);
    map.on('resize', redraw);
    redraw();
    return () => {
      map.off('movestart', hide);
      map.off('moveend', redraw);
      map.off('zoomend', redraw);
      map.off('resize', redraw);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [map, density]);

  return <canvas ref={ref} className="route-map-density-canvas" aria-hidden="true" />;
}
