import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Minus, Plus } from 'lucide-react';

const TILE_SIZE = 256;
const DEFAULT_CENTER = { latitude: -16.5, longitude: -68.15 };
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;

type Point = { x: number; y: number };
type Center = { latitude: number; longitude: number };
type Props = {
  latitude: number | null;
  longitude: number | null;
  onSelect: (latitude: number, longitude: number) => void;
};

function project({ latitude, longitude }: Center, zoom: number): Point {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sin = Math.sin((safeLatitude * Math.PI) / 180);
  return {
    x: ((longitude + 180) / 360) * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize,
  };
}

function unproject(point: Point, zoom: number): Center {
  const worldSize = TILE_SIZE * 2 ** zoom;
  const x = ((point.x % worldSize) + worldSize) % worldSize;
  const y = Math.max(0, Math.min(worldSize, point.y));
  return {
    latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldSize))) * 180) / Math.PI,
    longitude: (x / worldSize) * 360 - 180,
  };
}

export default function LocationMap({ latitude, longitude, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 600, height: 300 });
  const [center, setCenter] = useState<Center>(
    latitude !== null && longitude !== null ? { latitude, longitude } : DEFAULT_CENTER
  );
  const [zoom, setZoom] = useState(13);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasSelection, setHasSelection] = useState(latitude !== null && longitude !== null);

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    setSize({ width: element.clientWidth, height: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      setCenter({ latitude, longitude });
      setHasSelection(true);
    } else {
      setHasSelection(false);
    }
  }, [latitude, longitude]);

  const centerPoint = project(center, zoom);
  const tiles = useMemo(() => {
    const worldTiles = 2 ** zoom;
    const firstX = Math.floor((centerPoint.x - size.width / 2) / TILE_SIZE) - 1;
    const lastX = Math.floor((centerPoint.x + size.width / 2) / TILE_SIZE) + 1;
    const firstY = Math.floor((centerPoint.y - size.height / 2) / TILE_SIZE) - 1;
    const lastY = Math.floor((centerPoint.y + size.height / 2) / TILE_SIZE) + 1;
    const visibleTiles: Array<{ key: string; url: string; left: number; top: number }> = [];

    for (let tileX = firstX; tileX <= lastX; tileX += 1) {
      for (let tileY = firstY; tileY <= lastY; tileY += 1) {
        if (tileY < 0 || tileY >= worldTiles) continue;
        const wrappedX = ((tileX % worldTiles) + worldTiles) % worldTiles;
        visibleTiles.push({
          key: `${zoom}/${tileX}/${tileY}`,
          url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`,
          left: tileX * TILE_SIZE - centerPoint.x + size.width / 2,
          top: tileY * TILE_SIZE - centerPoint.y + size.height / 2,
        });
      }
    }
    return visibleTiles;
  }, [centerPoint.x, centerPoint.y, size.height, size.width, zoom]);

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start || !mapRef.current) return;
    pointerStart.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const point = project(center, zoom);
    let nextCenter: Center;

    if (start.moved) {
      nextCenter = unproject({ x: point.x - dx, y: point.y - dy }, zoom);
    } else {
      const bounds = mapRef.current.getBoundingClientRect();
      nextCenter = unproject({
        x: point.x + event.clientX - bounds.left - size.width / 2,
        y: point.y + event.clientY - bounds.top - size.height / 2,
      }, zoom);
    }

    setCenter(nextCenter);
    setDragOffset({ x: 0, y: 0 });
    setHasSelection(true);
    onSelect(Number(nextCenter.latitude.toFixed(6)), Number(nextCenter.longitude.toFixed(6)));
  };

  const setMapZoom = (nextZoom: number) => {
    const safeZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    setZoom(safeZoom);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) start.moved = true;
    setDragOffset({ x: dx, y: dy });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-lg">
      <div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-900/90 px-3 py-2">
        <div>
          <p className="text-sm font-semibold text-white">Ubicación de la tienda</p>
          <p className="text-[11px] text-slate-400">Toca el mapa o arrástralo para colocar el pin</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-1">
          <button type="button" onClick={() => setMapZoom(zoom - 1)} aria-label="Alejar mapa" className="rounded p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-7 text-center text-[11px] text-slate-400">{zoom}×</span>
          <button type="button" onClick={() => setMapZoom(zoom + 1)} aria-label="Acercar mapa" className="rounded p-1.5 text-slate-300 hover:bg-slate-700 hover:text-white">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={mapRef}
        className={`relative h-64 select-none overflow-hidden bg-slate-700 sm:h-80 ${pointerStart.current ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('a')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerStart.current = { x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={() => {
          pointerStart.current = null;
          setDragOffset({ x: 0, y: 0 });
        }}
      >
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        >
          {tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute h-64 w-64 max-w-none"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>

        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow-lg">
          <MapPin className={`h-10 w-10 ${hasSelection ? 'fill-orange-500 text-orange-300' : 'fill-slate-500 text-white'}`} />
        </div>
        {!hasSelection && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs text-white shadow">
            Toca el mapa para elegir la ubicación
          </div>
        )}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute bottom-1 right-1 z-20 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-700"
        >
          © OpenStreetMap contributors
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 px-3 py-2 text-xs">
        <span className={hasSelection ? 'text-cyan-300' : 'text-slate-400'}>
          {hasSelection ? `${center.latitude.toFixed(6)}, ${center.longitude.toFixed(6)}` : 'Aún no seleccionas un pin'}
        </span>
        <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">
          Abrir Google Maps
        </a>
      </div>
    </div>
  );
}
