import React, { useEffect, useRef, useState } from "react";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polygon,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents
} from "react-leaflet";
import L from "leaflet";

function toPoint(feature) {
  const g = feature?.geometry;
  const p = feature?.properties || {};
  if (!g) return null;
  if (g.type === "Point" && Array.isArray(g.coordinates)) {
    return {
      lat: Number(g.coordinates[1]),
      lon: Number(g.coordinates[0]),
      score: Number(p.prospectivity_score ?? p.score ?? 0),
      high: Boolean(p.high_priority) || Number(p.prospectivity_score ?? p.score ?? 0) >= 90
    };
  }
  return null;
}

function IndiaView() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(L.latLngBounds([5.5, 67.5], [37.5, 98.5]));
    
  }, [map]);
  return null;
}

function DragSelection({ mode, selection, locked, onSelectionChange }) {
  const map = useMap();
  const [draft, setDraft] = useState(null);
  const drawing = useRef(false);
  const start = useRef(null);
  const path = useRef([]);
  const last = useRef(null);

  useEffect(() => {
    if (locked || mode === "point") return undefined;

    const move = (e) => {
      if (!drawing.current) return;
      const latlng = map.mouseEventToLatLng(e);
      if (mode === "rectangle") {
        setDraft({ kind: "rectangle", start: start.current, current: latlng });
        return;
      }
      const prev = last.current;
      if (!prev || distanceMeters(prev.lat, prev.lng, latlng.lat, latlng.lng) >= 90) {
        last.current = latlng;
        path.current.push([latlng.lat, latlng.lng]);
        setDraft({ kind: "polygon", path: [...path.current] });
      }
    };

    const up = (e) => {
      if (!drawing.current) return;
      drawing.current = false;
      map.dragging.enable();
      const end = map.mouseEventToLatLng(e);

      if (mode === "rectangle" && start.current) {
        const a = start.current;
        const bounds = [
          [Math.min(a.lat, end.lat), Math.min(a.lng, end.lng)],
          [Math.max(a.lat, end.lat), Math.max(a.lng, end.lng)]
        ];
        if (Math.abs(a.lng - end.lng) >= 0.02 && Math.abs(a.lat - end.lat) >= 0.02) {
          onSelectionChange({ kind: "rectangle", bounds });
        }
      } else if (mode === "polygon") {
        const finalPath = [...path.current, [end.lat, end.lng]];
        if (finalPath.length >= 3) onSelectionChange({ kind: "polygon", path: finalPath });
      }

      setDraft(null);
      start.current = null;
      path.current = [];
      last.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    const down = (e) => {
      if (e.button !== 0 || drawing.current) return;
      const latlng = map.mouseEventToLatLng(e);
      drawing.current = true;
      start.current = latlng;
      last.current = latlng;
      path.current = [[latlng.lat, latlng.lng]];
      map.dragging.disable();
      setDraft(mode === "rectangle"
        ? { kind: "rectangle", start: latlng, current: latlng }
        : { kind: "polygon", path: [[latlng.lat, latlng.lng]] });
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    };

    const container = map.getContainer();
    container.addEventListener("mousedown", down);
    return () => {
      container.removeEventListener("mousedown", down);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (drawing.current) map.dragging.enable();
    };
  }, [map, mode, locked, onSelectionChange]);

  useMapEvents({
    click(e) {
      if (!locked && mode === "point") {
        onSelectionChange({ kind: "point", lat: e.latlng.lat, lon: e.latlng.lng });
      }
    }
  });

  const shape = draft || selection;
  return <>
    {shape?.kind === "point" && <CircleMarker center={[shape.lat, shape.lon]} radius={7} pathOptions={{ color: "#fff", fillColor: "#e7b45a", fillOpacity: 1, weight: 2 }} />}
    {shape?.kind === "rectangle" && (() => {
      const bounds = draft
        ? [[Math.min(draft.start.lat, draft.current.lat), Math.min(draft.start.lng, draft.current.lng)], [Math.max(draft.start.lat, draft.current.lat), Math.max(draft.start.lng, draft.current.lng)]]
        : shape.bounds;
      return <Rectangle bounds={bounds} pathOptions={{ color: "#e7b45a", weight: 2, dashArray: "7 5", fillOpacity: 0.10 }} />;
    })()}
    {shape?.kind === "polygon" && <Polygon positions={shape.path} pathOptions={{ color: "#e7b45a", weight: 2, dashArray: "7 5", fillOpacity: 0.10 }} />}
  </>;
}

export default function MapView({
  grid,
  zones = [],
  occurrences = [],
  boundary = null,
  mode = null,
  selection = null,
  locked = false,
  onSelectionChange,
  onZoneSelect,
  compact = false
}) {
  const points = (grid?.features || []).map(toPoint).filter(Boolean);
  const zs = zones.map((z, i) => ({
    i,
    lat: Number(z.center_lat ?? z.latitude ?? z.lat),
    lon: Number(z.center_lon ?? z.longitude ?? z.lon),
    score: Number(z.mean_score ?? z.score ?? 0),
    max: Number(z.max_score ?? z.max ?? 0),
    high: Number(z.high_cells ?? z.high_priority_cells ?? z.high ?? 0),
    fraction: Number(z.high_fraction ?? z.high_priority_fraction ?? z.fraction ?? 0),
    name: z.zone_id || z.name || `Priority Zone ${i + 1}`
  })).filter(z => Number.isFinite(z.lat) && Number.isFinite(z.lon));

  const center = [22.5, 79.5];

  return <div className={`mapbox ${compact ? "compactMap" : ""}`}>
    <MapContainer center={center} zoom={5} minZoom={4.5} maxZoom={10} doubleClickZoom={false} className="map">
      <IndiaView />
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {boundary && <GeoJSON data={boundary} style={{ color: "#e7b45a", weight: 1.2, opacity: 0.8, fillColor: "#e7b45a", fillOpacity: 0.025, interactive: false }} />}

      {points.map((p, i) => (
        <CircleMarker
          key={`p${i}`}
          center={[p.lat, p.lon]}
          radius={p.high ? (compact ? 4 : 4.5) : (compact ? 1.8 : 2.2)}
          pathOptions={{
            color: p.high ? "#e7b45a" : "#55a9ff",
            fillColor: p.high ? "#e7b45a" : "#55a9ff",
            fillOpacity: p.high ? 0.9 : 0.30,
            weight: p.high ? 1 : 0
          }}
        >
          <Popup>
            <div className="mapPopup">
              <b>{p.high ? "High-priority screening cell" : "India screening cell"}</b>
              <strong>{p.score.toFixed(1)}/100</strong>
              <span>Relative India-wide prospectivity score</span>
              <span>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {zs.map(z => (
        <CircleMarker
          key={`z${z.i}`}
          center={[z.lat, z.lon]}
          radius={compact ? 11 : 15}
          pathOptions={{ color: "#f4c15d", fillColor: "#f4c15d", fillOpacity: 0.06, weight: 3 }}
          eventHandlers={{ click: () => onZoneSelect?.(z) }}
        >
          <Popup>
            <div className="mapPopup">
              <b>{z.name}</b>
              <strong>{z.score.toFixed(1)}/100</strong>
              <span>{z.high.toLocaleString()} high cells · {(z.fraction * 100).toFixed(1)}% high</span>
              <button onClick={() => onZoneSelect?.(z)}>Open zone analysis →</button>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {occurrences.map((o, i) => (
        <CircleMarker
          key={`o${i}`}
          center={[Number(o.lat), Number(o.lon)]}
          radius={compact ? 4.5 : 5.5}
          pathOptions={{ color: "#9d7cff", fillColor: "#9d7cff", fillOpacity: 0.95, weight: 1.5 }}
        >
          <Popup>
            <div className="mapPopup">
              <b>Known manganese occurrence</b>
              <strong>{o.name}</strong>
              <span>{o.state || "India"}</span>
              <span>GSI occurrence reference</span>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {mode && onSelectionChange && <DragSelection mode={mode} selection={selection} locked={locked} onSelectionChange={onSelectionChange} />}
    </MapContainer>

    <div className="legend">
      <span className="lg goldDot">●</span> High-priority
      &nbsp; <span className="lg blueDot">●</span> Screening cells
      &nbsp; <span className="lg violetDot">●</span> GSI occurrence
      &nbsp; <span className="lg zoneDotLegend">◯</span> Priority zone
    </div>
    {mode && <div className="mapMode">{mode === "point" ? "⌖ POINT MODE" : mode === "rectangle" ? "□ DRAG RECTANGLE" : "◇ DRAG POLYGON"}</div>}
  </div>;
}

function distanceMeters(aLat, aLon, bLat, bLon) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}
