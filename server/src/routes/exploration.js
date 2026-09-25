import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";
import {
  ensureIndiawideGrid,
  getIndiaBoundary,
  getOccurrences,
  pointAnalysis,
  areaAnalysis
} from "../services/indiawide.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../../../");

function firstExisting(paths) { return paths.find(p => fs.existsSync(p)); }

router.get("/boundary", requireAuth, (req, res) => {
  const boundary = getIndiaBoundary();
  if (!boundary) return res.status(404).json({ message: "India boundary data is unavailable." });
  res.json(boundary);
});

router.get("/occurrences", requireAuth, (req, res) => {
  res.json({ count: getOccurrences().length, occurrences: getOccurrences() });
});

router.get("/targets", requireAuth, async (req, res) => {
  try {
    const grid = await ensureIndiawideGrid();
    const high = grid
      .filter(p => p.score >= 90)
      .map(p => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { prospectivity_score: p.score, probability: p.probability, source: p.source }
      }));
    res.json({ type: "FeatureCollection", features: high });
  } catch (e) {
    res.status(503).json({ message: e.message });
  }
});

router.get("/grid", requireAuth, async (req, res) => {
  try {
    const points = await ensureIndiawideGrid();
    const high = points.filter(p => p.score >= 90);
    const normal = points.filter(p => p.score < 90);
    const normalLimit = Math.max(0, 5000 - high.length);
    const visibleNormal = normal.length <= normalLimit
      ? normal
      : evenlySample(normal, normalLimit);

    const visible = [...high, ...visibleNormal];
    res.json({
      available: true,
      count: points.length,
      high_count: high.length,
      visualized_count: visible.length,
      features: visible.map(p => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          prospectivity_score: p.score,
          probability: p.probability,
          source: p.source,
          high_priority: p.score >= 90
        }
      }))
    });
  } catch (e) {
    res.status(503).json({ available: false, message: e.message });
  }
});

router.get("/zones", requireAuth, async (req, res) => {
  const file = firstExisting([
    path.join(root, "outputs/indiawide/detailed_zone_target_zones.csv"),
    path.join(root, "outputs/phase5_target_zones.csv")
  ]);
  if (!file) return res.json([]);
  try {
    const zones = parseCsv(fs.readFileSync(file, "utf8")).map(coerceZone)
      .filter(z => Number.isFinite(z.center_lat) && Number.isFinite(z.center_lon));
    res.json(zones);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

router.post("/analyze", requireAuth, async (req, res) => {
  try {
    const s = req.body || {};
    const grid = await ensureIndiawideGrid();
    const occurrences = getOccurrences();

    if (s.kind === "point") {
      const lat = Number(s.lat), lon = Number(s.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return res.status(400).json({ message: "Enter valid latitude and longitude." });
      }
      if (lat < 6 || lat > 38 || lon < 68 || lon > 98) {
        return res.status(400).json({ message: "Enter coordinates within the India screening extent." });
      }
      return res.json(pointAnalysis(grid, lat, lon, 250, occurrences));
    }

    if (s.kind === "rectangle" && Array.isArray(s.bounds) && s.bounds.length === 2) {
      return res.json(areaAnalysis(grid, s, occurrences));
    }

    if (s.kind === "polygon" && Array.isArray(s.path) && s.path.length >= 3) {
      return res.json(areaAnalysis(grid, s, occurrences));
    }

    return res.status(400).json({ message: "A valid point, rectangle or polygon selection is required." });
  } catch (e) {
    res.status(503).json({ message: e.message });
  }
});

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const grid = await ensureIndiawideGrid();
    const scores = grid.map(p => p.score).filter(Number.isFinite);
    const high = scores.filter(s => s >= 90).length;
    res.json({
      cells: scores.length,
      high,
      high_fraction: scores.length ? high / scores.length : 0,
      score_min: scores.length ? Math.min(...scores) : 0,
      score_max: scores.length ? Math.max(...scores) : 0,
      score_mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      occurrence_count: getOccurrences().length,
      country_filter: "India boundary"
    });
  } catch (e) {
    res.status(503).json({ message: e.message });
  }
});

router.get("/health", (req, res) => res.json({ module: "exploration", status: "ready" }));

function evenlySample(items, count) {
  if (count <= 0) return [];
  if (items.length <= count) return items;
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.min(items.length - 1, Math.floor(i * step))]);
}

function coerceZone(z) {
  return {
    ...z,
    center_lat: Number(z.center_lat),
    center_lon: Number(z.center_lon),
    mean_score: Number(z.mean_score),
    median_score: Number(z.median_score),
    max_score: Number(z.max_score),
    high_cells: Number(z.high_priority_cells ?? z.high_cells ?? 0),
    high_priority_cells: Number(z.high_priority_cells ?? z.high_cells ?? 0),
    high_fraction: Number(z.high_priority_fraction ?? z.high_fraction ?? 0),
    high_priority_fraction: Number(z.high_priority_fraction ?? z.high_fraction ?? 0),
    sample_count: Number(z.sample_count ?? 0),
    mean_probability: Number(z.mean_probability ?? 0),
    max_probability: Number(z.max_probability ?? 0)
  };
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

export default router;
