import React, { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polygon, Polyline, Popup, TileLayer, useMapEvents } from 'react-leaflet';

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

function MapInteractions({ mode, points, onAnalysis }) {
  const [first, setFirst] = useState(null);
  const [vertices, setVertices] = useState([]);

  useMapEvents({
    click(e) {
      if (mode === 'point') {
        const nearest = nearestPoint(points, e.latlng.lat, e.latlng.lng);
        onAnalysis({
          kind: 'point', lat: e.latlng.lat, lon: e.latlng.lng,
          score: nearest?.score, distanceKm: nearest ? distanceKm(e.latlng.lat, e.latlng.lng, nearest.lat, nearest.lon) : null,
        });
        return;
      }
      if (mode === 'rectangle') {
        if (!first) { setFirst(e.latlng); return; }
        const bounds = [
          [Math.min(first.lat, e.latlng.lat), Math.min(first.lng, e.latlng.lng)],
          [Math.min(first.lat, e.latlng.lat), Math.max(first.lng, e.latlng.lng)],
          [Math.max(first.lat, e.latlng.lat), Math.max(first.lng, e.latlng.lng)],
          [Math.max(first.lat, e.latlng.lat), Math.min(first.lng, e.latlng.lng)],
        ];
        finishArea(points.filter(p => insideRect(p, bounds)), 'rectangle', onAnalysis);
        setFirst(null);
        return;
      }
      if (mode === 'polygon') setVertices(v => [...v, [e.latlng.lat, e.latlng.lng]]);
    },
    dblclick(e) {
      if (mode !== 'polygon' || vertices.length < 3) return;
      const ring = [...vertices, [e.latlng.lat, e.latlng.lng]];
      finishArea(points.filter(p => insidePolygon(p.lat, p.lon, ring)), 'polygon', onAnalysis);
      setVertices([]);
      e.originalEvent?.preventDefault?.();
    },
  });

  return <>
    {first && <CircleMarker center={[first.lat, first.lng]} radius={5} pathOptions={{ color: '#e7b45a', fillColor: '#e7b45a', fillOpacity: 1 }} />}
    {vertices.length > 0 && <Polyline positions={vertices} pathOptions={{ color: '#e7b45a', weight: 2, dashArray: '5 5' }} />}
    {vertices.map((v, i) => <CircleMarker key={i} center={v} radius={4} pathOptions={{ color: '#e7b45a', fillColor: '#e7b45a', fillOpacity: 1 }} />)}
  </>;
}

export default function MapView({ targets, zones = [], occurrences = [], mode = null, onAnalysis, onZoneSelect, compact = false }) {
  const points = useMemo(() => (targets?.features || []).map((f, i) => {
    const p = toPoint(f); return p ? { ...p, i } : null;
  }).filter(Boolean), [targets]);
  const visible = useMemo(() => downsample(points, compact ? 900 : 1800), [points, compact]);
  const zs = useMemo(() => (Array.isArray(zones) ? zones.map((z, i) => ({ i, lat: +(z.center_lat ?? z.latitude ?? z.lat), lon: +(z.center_lon ?? z.longitude ?? z.lon), score: +(z.mean_score ?? z.score ?? 0), max: +(z.max_score ?? z.max ?? NaN), high: +(z.high_cells ?? z.high ?? NaN), fraction: +(z.high_fraction ?? z.fraction ?? NaN), name: z.zone_id || `Priority Zone ${i + 1}` })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon)) : []), [zones]);
  const center = [22.5, 79.5];

  return <div className={'mapbox ' + (compact ? 'compactMap' : '')}>
    <MapContainer center={center} zoom={5} minZoom={4} doubleClickZoom={false} className="map">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {mode && onAnalysis && <MapInteractions mode={mode} points={points} onAnalysis={onAnalysis} />}
      {zs.map(z => <CircleMarker key={'z' + z.i} center={[z.lat, z.lon]} radius={compact ? 9 : 13} pathOptions={{ color: '#e7b45a', fillColor: '#e7b45a', fillOpacity: .9, weight: 2 }} eventHandlers={{ click: () => onZoneSelect?.(z) }}><Popup><div className="mapPopup"><b>{z.name}</b><strong>{z.score.toFixed(1)}/100</strong><span>Mean prospectivity</span><button onClick={() => onZoneSelect?.(z)}>Open zone analysis →</button></div></Popup></CircleMarker>)}
      {visible.map(p => <CircleMarker key={'p' + p.i} center={[p.lat, p.lon]} radius={p.score >= 90 ? (compact ? 3 : 4) : 2} pathOptions={{ color: p.score >= 90 ? '#e7b45a' : '#5fd19b', fillColor: p.score >= 90 ? '#e7b45a' : '#5fd19b', fillOpacity: .55, weight: 0 }}><Popup><div className="mapPopup"><b>AI-ranked target</b><strong>{p.score.toFixed(1)}/100</strong><span>Relative prospectivity score</span><span>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</span></div></Popup></CircleMarker>)}
      {occurrences.map((o, i) => <CircleMarker key={'o' + i} center={[o.lat, o.lon]} radius={4} pathOptions={{ color: '#998cff', fillColor: '#998cff', fillOpacity: .9, weight: 1 }}><Popup><div className="mapPopup"><b>Known manganese occurrence</b><strong>{o.name}</strong><span>GSI occurrence reference</span></div></Popup></CircleMarker>)}
    </MapContainer>
    <div className="legend"><span className="lg goldDot">●</span> High-priority &nbsp; <span className="lg greenDot">●</span> Screening cells &nbsp; <span className="lg violetDot">●</span> Known occurrence</div>
    {mode && <div className="mapMode">{mode === 'point' ? '⌖ POINT MODE' : mode === 'rectangle' ? '□ RECTANGLE MODE' : '◇ POLYGON MODE'}</div>}
  </div>;
}

function finishArea(points, kind, onAnalysis) {
  if (!points.length) return onAnalysis({ kind, count: 0, mean: 0, max: 0, high: 0, highFraction: 0 });
  const scores = points.map(p => p.score).filter(Number.isFinite);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const high = scores.filter(s => s >= 90).length;
  onAnalysis({ kind, count: scores.length, mean, max, high, highFraction: high / scores.length * 100 });
}
function nearestPoint(points, lat, lon) { let best = null, d = Infinity; for (const p of points) { const x = distanceKm(lat, lon, p.lat, p.lon); if (x < d) { d = x; best = p; } } return best; }
function distanceKm(aLat, aLon, bLat, bLon) { const R = 6371, r = Math.PI / 180, dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r; const q = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q)); }
function insideRect(p, bounds) { return p.lat >= bounds[0][0] && p.lat <= bounds[2][0] && p.lon >= bounds[0][1] && p.lon <= bounds[1][1]; }
function insidePolygon(lat, lon, polygon) { let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const xi = polygon[i][1], yi = polygon[i][0], xj = polygon[j][1], yj = polygon[j][0]; const intersect = ((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi); if (intersect) inside = !inside; } return inside; }
function downsample(points, max) { if (points.length <= max) return points; const step = points.length / max; return Array.from({ length: max }, (_, i) => points[Math.floor(i * step)]); }
