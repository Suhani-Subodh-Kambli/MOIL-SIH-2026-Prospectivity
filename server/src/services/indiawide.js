import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const CACHE = path.join(ROOT, "outputs", "indiawide", "api_screening_grid.csv");
const BOUNDARY_FILE = path.join(ROOT, "data", "indiawide", "india_boundary.geojson");
const OCCURRENCES_FILE = path.join(ROOT, "data", "indiawide", "occurrences", "occurrences.json");

let cached = null;
let building = null;
let boundary = null;
let occurrences = null;

export function gridPath() { return CACHE; }

export async function ensureIndiawideGrid() {
  if (cached?.length) return cached;
  if (fs.existsSync(CACHE)) {
    cached = readGrid(CACHE);
    if (cached.length) return cached;
  }
  if (!building) {
    building = runBuilder().then(() => {
      if (!fs.existsSync(CACHE)) throw new Error("India-wide screening grid was not produced.");
      cached = readGrid(CACHE);
      if (!cached.length) throw new Error("India-wide screening grid contains no valid India cells.");
      return cached;
    }).finally(() => { building = null; });
  }
  return building;
}

export function getIndiaBoundary() {
  if (!boundary && fs.existsSync(BOUNDARY_FILE)) boundary = JSON.parse(fs.readFileSync(BOUNDARY_FILE, "utf8"));
  return boundary;
}

export function getOccurrences() {
  if (!occurrences && fs.existsSync(OCCURRENCES_FILE)) occurrences = JSON.parse(fs.readFileSync(OCCURRENCES_FILE, "utf8"));
  return occurrences || [];
}

function runBuilder() {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_EXECUTABLE || "python";
    const script = path.join(ROOT, "scripts", "build_indiawide_api_grid.py");
    const child = spawn(python, [script], { cwd: ROOT });
    let stderr = "";
    child.stdout.on("data", d => process.stdout.write(`[indiawide] ${d}`));
    child.stderr.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr || `India-wide inference exited with code ${code}`)));
  });
}

function readGrid(file) {
  const text = fs.readFileSync(file, "utf8");
  const rows = parseCsv(text);
  return rows.map(r => ({
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    score: Number(r.prospectivity_score),
    probability: Number(r.probability),
    source: r.source_tile || r.source || "India-wide screening"
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.score) && isIndiaPoint(p.lat, p.lon));
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (c === '"') {
      if (quoted && next === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i += 1;
      row.push(field); field = "";
      if (row.some(v => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); if (row.some(v => v !== "")) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""])));
}

function isIndiaPoint(lat, lon) {
  const fc = getIndiaBoundary();
  if (!fc?.features?.length) return lat >= 6 && lat <= 38 && lon >= 68 && lon <= 98;
  return fc.features.some(f => geometryContains(f.geometry, lat, lon));
}

function geometryContains(geometry, lat, lon) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates, lat, lon);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(p => polygonContains(p, lat, lon));
  return false;
}

function polygonContains(rings, lat, lon) {
  if (!rings?.length || !ringContains(rings[0], lat, lon)) return false;
  for (let i = 1; i < rings.length; i += 1) if (ringContains(rings[i], lat, lon)) return false;
  return true;
}

function ringContains(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]), yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]), yj = Number(ring[j][1]);
    const hit = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

export function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

function nearestOccurrence(lat, lon, items) {
  let best = null, bestD = Infinity;
  for (const o of items) {
    const d = distanceKm(lat, lon, o.lat, o.lon);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best ? { distanceKm: bestD, occurrence: best } : null;
}

export function pointAnalysis(points, lat, lon, maxDistanceKm = 250, occurrencesList = getOccurrences()) {
  let best = null, bestD = Infinity;
  for (const p of points) {
    const d = distanceKm(lat, lon, p.lat, p.lon);
    if (d < bestD) { bestD = d; best = p; }
  }
  const occurrence = nearestOccurrence(lat, lon, occurrencesList);
  if (!best || bestD > maxDistanceKm) {
    return { kind: "point", lat, lon, score: null, probability: null, distanceKm: best ? bestD : null, coverage: "none", occurrence, message: `No screened sample within ${maxDistanceKm} km.` };
  }
  return { kind: "point", lat, lon, score: best.score, probability: best.probability, distanceKm: bestD, source: best.source, coverage: "nearest-sample", occurrence };
}

export function areaAnalysis(points, selection, occurrencesList = getOccurrences()) {
  const inside = points.filter(p => selection.kind === "rectangle" ? insideRect(p, selection.bounds) : insidePolygon(p.lat, p.lon, selection.path));
  const minimumUsefulCells = 10;

  if (inside.length >= minimumUsefulCells) {
    return stats(inside, selection.kind, "inside", occurrencesList, selection);
  }

  const center = selectionCenter(selection);
  const radius = 50;
  const nearby = points.map(p => ({ ...p, _d: distanceKm(center.lat, center.lon, p.lat, p.lon) }))
    .filter(p => p._d <= radius).sort((a, b) => a._d - b._d).slice(0, 500);

  if (!nearby.length) {
    return { kind: selection.kind, coverage: "none", count: 0, requestedCount: inside.length, mean: 0, max: 0, high: 0, highFraction: 0, localLeadThreshold: null, localLeads: 0, localLeadFraction: 0, occurrenceCount: occurrencesInSelectionOrNearby(selection, center, occurrencesList) };
  }

  const result = stats(nearby, selection.kind, "nearby", occurrencesList, selection);
  result.requestedCount = inside.length;
  result.nearestDistanceKm = nearby[0]._d;
  result.coverageRadiusKm = radius;
  return result;
}

function stats(points, kind, coverage, occurrencesList, selection) {
  const scores = points.map(p => p.score).filter(Number.isFinite).sort((a, b) => a - b);
  if (!scores.length) return { kind, coverage, count: 0, mean: 0, max: 0, high: 0, highFraction: 0, localLeadThreshold: null, localLeads: 0, localLeadFraction: 0, occurrenceCount: 0 };
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const high = scores.filter(s => s >= 90).length;
  const idx = Math.min(scores.length - 1, Math.max(0, Math.ceil(scores.length * 0.90) - 1));
  const localThreshold = scores[idx];
  const localLeads = scores.filter(s => s >= localThreshold).length;
  const center = selectionCenter(selection);
  return {
    kind, coverage, count: scores.length, mean, max, high,
    highFraction: high / scores.length * 100,
    localLeadThreshold: localThreshold,
    localLeads,
    localLeadFraction: localLeads / scores.length * 100,
    occurrenceCount: occurrencesInSelectionOrNearby(selection, center, occurrencesList)
  };
}

function occurrencesInSelectionOrNearby(selection, center, occurrencesList) {
  if (selection.kind === "rectangle") return occurrencesList.filter(o => insideRect(o, selection.bounds)).length;
  if (selection.kind === "polygon") return occurrencesList.filter(o => insidePolygon(o.lat, o.lon, selection.path)).length;
  return occurrencesList.filter(o => distanceKm(center.lat, center.lon, o.lat, o.lon) <= 25).length;
}

function selectionCenter(s) {
  if (s.kind === "point") return { lat: s.lat, lon: s.lon };
  if (s.kind === "rectangle") return { lat: (s.bounds[0][0] + s.bounds[1][0]) / 2, lon: (s.bounds[0][1] + s.bounds[1][1]) / 2 };
  const lat = s.path.reduce((a, p) => a + p[0], 0) / s.path.length;
  const lon = s.path.reduce((a, p) => a + p[1], 0) / s.path.length;
  return { lat, lon };
}

function insideRect(p, bounds) {
  const minLat = Math.min(bounds[0][0], bounds[1][0]), maxLat = Math.max(bounds[0][0], bounds[1][0]);
  const minLon = Math.min(bounds[0][1], bounds[1][1]), maxLon = Math.max(bounds[0][1], bounds[1][1]);
  return p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon;
}

function insidePolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][1], yi = polygon[i][0], xj = polygon[j][1], yj = polygon[j][0];
    const hit = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}
