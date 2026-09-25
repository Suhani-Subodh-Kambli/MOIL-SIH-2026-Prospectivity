import React, { useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, Popup, Rectangle, TileLayer, useMapEvents } from 'react-leaflet';

function toPoint(feature) {
  const g = feature?.geometry;
  const p = feature?.properties || {};
  if (!g) return null;
  if (g.type === 'Point' && Array.isArray(g.coordinates)) return { lat: +g.coordinates[1], lon: +g.coordinates[0], score: +(p.prospectivity_score ?? p.score ?? 0) };
  if (g.type === 'Polygon' && Array.isArray(g.coordinates?.[0])) {
    const ring = g.coordinates[0];
    if (!ring.length) return null;
    const lon = ring.reduce((s, c) => s + Number(c[0]), 0) / ring.length;
    const lat = ring.reduce((s, c) => s + Number(c[1]), 0) / ring.length;
    return { lat, lon, score: +(p.prospectivity_score ?? p.score ?? 0) };
  }
  return null;
}

function MapInteractions({ mode, selection, locked, onSelectionChange }) {
  const [draft, setDraft] = useState(null);
  const startRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  useMapEvents({
    click(e) {
      if (locked || mode !== 'point' || drawingRef.current) return;
      onSelectionChange({ kind: 'point', lat: e.latlng.lat, lon: e.latlng.lng });
    },
    mousedown(e) {
      if (locked || mode === 'point') return;
      drawingRef.current = true;
      startRef.current = e.latlng;
      lastPointRef.current = e.latlng;
      if (mode === 'rectangle') {
        setDraft({ kind: 'rectangle', start: e.latlng, current: e.latlng });
      } else {
        setDraft({ kind: 'polygon', path: [[e.latlng.lat, e.latlng.lng]] });
      }
      e.target.dragging?.disable();
    },
    mousemove(e) {
      if (!drawingRef.current) return;
      if (mode === 'rectangle') {
        setDraft({ kind: 'rectangle', start: startRef.current, current: e.latlng });
      } else {
        const last = lastPointRef.current;
        const moved = last ? distanceMeters(last.lat, last.lng, e.latlng.lat, e.latlng.lng) : 999;
        if (moved >= 120) {
          lastPointRef.current = e.latlng;
          setDraft(prev => ({ kind: 'polygon', path: [...(prev?.path || []), [e.latlng.lat, e.latlng.lng]] }));
        }
      }
    },
    mouseup(e) {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      e.target.dragging?.enable();
      if (mode === 'rectangle' && startRef.current) {
        const a = startRef.current, b = e.latlng;
        const bounds = [[Math.min(a.lat, b.lat), Math.min(a.lng, b.lng)], [Math.max(a.lat, b.lat), Math.max(a.lng, b.lng)]];
        const width = Math.abs(a.lng - b.lng), height = Math.abs(a.lat - b.lat);
        if (width > 0.01 && height > 0.01) onSelectionChange({ kind: 'rectangle', bounds });
        setDraft(null);
      } else if (mode === 'polygon') {
        const path = [...(draft?.path || []), [e.latlng.lat, e.latlng.lng]];
        if (path.length >= 3) onSelectionChange({ kind: 'polygon', path });
        setDraft(null);
      }
      startRef.current = null;
      lastPointRef.current = null;
    },
  });

  const shape = draft || selection;
  return <>
    {shape?.kind === 'point' && <CircleMarker center={[shape.lat, shape.lon]} radius={7} pathOptions={{ color: '#fff', fillColor: '#e7b45a', fillOpacity: 1, weight: 2 }} />}
    {shape?.kind === 'rectangle' && (() => {
      const bounds = draft ? [
        [Math.min(draft.start.lat, draft.current.lat), Math.min(draft.start.lng, draft.current.lng)],
        [Math.max(draft.start.lat, draft.current.lat), Math.max(draft.start.lng, draft.current.lng)]
      ] : shape.bounds;
      return <Rectangle bounds={bounds} pathOptions={{ color: '#e7b45a', weight: 2, dashArray: '7 5', fillOpacity: .08 }} />;
    })()}
    {shape?.kind === 'polygon' && <Polygon positions={shape.path} pathOptions={{ color: '#e7b45a', weight: 2, dashArray: '7 5', fillOpacity: .08 }} />}
  </>;
}

export default function MapView({ targets, grid, zones = [], occurrences = [], mode = null, selection = null, locked = false, onSelectionChange, onZoneSelect, compact = false }) {
  const source = grid?.features?.length ? grid : targets;
  const points = useMemo(() => (source?.features || []).map((f, i) => {
    const p = toPoint(f); return p ? { ...p, i } : null;
  }).filter(Boolean), [source]);
  const visible = useMemo(() => downsample(points, compact ? 900 : 2400), [points, compact]);
  const zs = useMemo(() => (Array.isArray(zones) ? zones.map((z, i) => ({ i, lat: +(z.center_lat ?? z.latitude ?? z.lat), lon: +(z.center_lon ?? z.longitude ?? z.lon), score: +(z.mean_score ?? z.score ?? 0), max: +(z.max_score ?? z.max ?? NaN), high: +(z.high_cells ?? z.high ?? NaN), fraction: +(z.high_fraction ?? z.fraction ?? NaN), name: z.zone_id || `Priority Zone ${i + 1}` })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon)) : []), [zones]);
  const center = [22.5, 79.5];

  return <div className={'mapbox ' + (compact ? 'compactMap' : '')}>
    <MapContainer center={center} zoom={5} minZoom={4} doubleClickZoom={false} className="map">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {mode && onSelectionChange && <MapInteractions mode={mode} selection={selection} locked={locked} onSelectionChange={onSelectionChange} />}
      {zs.map(z => <CircleMarker key={'z' + z.i} center={[z.lat, z.lon]} radius={compact ? 9 : 13} pathOptions={{ color: '#e7b45a', fillColor: '#e7b45a', fillOpacity: .9, weight: 2 }} eventHandlers={{ click: () => onZoneSelect?.(z) }}><Popup><div className="mapPopup"><b>{z.name}</b><strong>{z.score.toFixed(1)}/100</strong><span>Mean prospectivity</span><button onClick={() => onZoneSelect?.(z)}>Open zone analysis →</button></div></Popup></CircleMarker>)}
      {visible.map(p => <CircleMarker key={'p' + p.i} center={[p.lat, p.lon]} radius={p.score >= 90 ? (compact ? 3 : 4) : 2} pathOptions={{ color: p.score >= 90 ? '#e7b45a' : '#5fd19b', fillColor: p.score >= 90 ? '#e7b45a' : '#5fd19b', fillOpacity: .55, weight: 0 }}><Popup><div className="mapPopup"><b>{p.score >= 90 ? 'High-priority target' : 'Modelled cell'}</b><strong>{p.score.toFixed(1)}/100</strong><span>Relative prospectivity score</span><span>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</span></div></Popup></CircleMarker>)}
      {occurrences.map((o, i) => <CircleMarker key={'o' + i} center={[o.lat, o.lon]} radius={4} pathOptions={{ color: '#998cff', fillColor: '#998cff', fillOpacity: .9, weight: 1 }}><Popup><div className="mapPopup"><b>Known manganese occurrence</b><strong>{o.name}</strong><span>GSI occurrence reference</span></div></Popup></CircleMarker>)}
    </MapContainer>
    <div className="legend"><span className="lg goldDot">●</span> High-priority &nbsp; <span className="lg greenDot">●</span> Screening cells &nbsp; <span className="lg violetDot">●</span> Known occurrence</div>
    {mode && <div className="mapMode">{mode === 'point' ? '⌖ POINT MODE' : mode === 'rectangle' ? '□ DRAG RECTANGLE' : '◇ DRAG POLYGON'}</div>}
  </div>;
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
function downsample(points, max) { if (points.length <= max) return points; const step = points.length / max; return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]); }
