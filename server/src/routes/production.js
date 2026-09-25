import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { requireAuth } from "../middleware/auth.js";
import { runShortfallPrediction } from "../services/shortfall.js";
import ProductionRecord from "../models/ProductionRecord.js";
import ProductionScenario from "../models/ProductionScenario.js";
import { isDbConnected } from "../db.js";

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// 1. Run AI Scenario Prediction & persist scenario in MongoDB
router.post("/predict", requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const prediction = await runShortfallPrediction(payload);

    // Persist scenario to MongoDB if database is connected
    if (isDbConnected() && prediction && prediction.status === "success") {
      try {
        await ProductionScenario.create({
          userId: req.user?.id || req.user?._id,
          userName: req.user?.name || "User",
          mine: payload.mine || "Balaghat",
          target_mt: prediction.target_mt,
          forecast_mt: prediction.forecast_mt,
          predicted_shortfall_mt: prediction.predicted_shortfall_mt,
          shortfall_percent: prediction.shortfall_percent,
          risk: prediction.risk,
          top_drivers: prediction.top_drivers,
          recommended_actions: prediction.recommended_actions,
          input: payload
        });
      } catch (dbErr) {
        console.warn("[Scenario] Could not save scenario to DB:", dbErr.message);
      }
    }

    res.json(prediction);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 2. Fetch Historical Mine Production Records from MongoDB
router.get("/history", requireAuth, async (req, res) => {
  try {
    const { mine, limit = 100 } = req.query;
    const query = {};
    if (mine && mine !== "all") query.mine = mine;

    if (isDbConnected()) {
      const records = await ProductionRecord.find(query)
        .sort({ date: -1 })
        .limit(Number(limit));
      return res.json({
        source: "mongodb",
        count: records.length,
        records
      });
    }

    // Fallback to CSV if MongoDB is disconnected
    const csvPath = path.join(ROOT, "data", "production", "production_history.csv");
    if (fs.existsSync(csvPath)) {
      const text = fs.readFileSync(csvPath, "utf8");
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim());
      let rows = lines.slice(1).map(line => {
        const parts = line.split(",").map(p => p.trim());
        return Object.fromEntries(headers.map((h, i) => [h, parts[i]]));
      });
      if (mine && mine !== "all") {
        rows = rows.filter(r => r.mine.toLowerCase() === mine.toLowerCase());
      }
      return res.json({
        source: "csv_fallback",
        count: rows.length,
        records: rows.slice(0, Number(limit))
      });
    }

    res.json({ source: "empty", count: 0, records: [] });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 3. Get Mine Aggregate Statistics
router.get("/mines", requireAuth, async (req, res) => {
  try {
    if (isDbConnected()) {
      const stats = await ProductionRecord.aggregate([
        {
          $group: {
            _id: "$mine",
            mine_type: { $first: "$mine_type" },
            record_count: { $sum: 1 },
            avg_target: { $avg: "$target_mt" },
            avg_actual: { $avg: "$actual_mt" },
            avg_shortfall_pct: { $avg: "$shortfall_pct" },
            avg_equipment_avail: { $avg: "$equipment_availability" },
            total_production: { $sum: "$actual_mt" }
          }
        },
        { $sort: { avg_actual: -1 } }
      ]);
      return res.json(stats.map(s => ({
        mine: s._id,
        mine_type: s.mine_type,
        record_count: s.record_count,
        avg_target: Math.round(s.avg_target),
        avg_actual: Math.round(s.avg_actual),
        avg_shortfall_pct: Number(s.avg_shortfall_pct.toFixed(2)),
        avg_equipment_avail: Number(s.avg_equipment_avail.toFixed(3)),
        total_production: Math.round(s.total_production)
      })));
    }

    // Default static summary if offline
    res.json([
      { mine: "Balaghat", mine_type: "Underground", avg_target: 41494, avg_actual: 39080, avg_shortfall_pct: 6.07 },
      { mine: "Dongri Buzurg", mine_type: "Opencast", avg_target: 34092, avg_actual: 29304, avg_shortfall_pct: 14.97 },
      { mine: "Chikla", mine_type: "Underground", avg_target: 16375, avg_actual: 15337, avg_shortfall_pct: 6.70 },
      { mine: "Tirodi", mine_type: "Opencast", avg_target: 13842, avg_actual: 12286, avg_shortfall_pct: 12.03 },
      { mine: "Gumgaon", mine_type: "Underground", avg_target: 12000, avg_actual: 11429, avg_shortfall_pct: 5.16 },
      { mine: "Kandri", mine_type: "Opencast", avg_target: 10646, avg_actual: 9659, avg_shortfall_pct: 10.00 },
      { mine: "Ukwa", mine_type: "Underground", avg_target: 10375, avg_actual: 9845, avg_shortfall_pct: 5.34 },
      { mine: "Mansar", mine_type: "Opencast", avg_target: 9050, avg_actual: 8345, avg_shortfall_pct: 8.61 }
    ]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 4. Retrieve Saved User Scenarios from MongoDB
router.get("/scenarios", requireAuth, async (req, res) => {
  try {
    if (isDbConnected()) {
      const scenarios = await ProductionScenario.find({
        userId: req.user?.id || req.user?._id
      }).sort({ createdAt: -1 }).limit(20);
      return res.json(scenarios);
    }
    res.json([]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 5. Add a New Mine Production Record to MongoDB
router.post("/records", requireAuth, async (req, res) => {
  try {
    const { mine, date, target_mt, actual_mt, equipment_downtime_hours, rainfall_mm, blasting_delay_hours, maintenance_hours, equipment_availability } = req.body || {};
    if (!mine || !date || target_mt == null || actual_mt == null) {
      return res.status(400).json({ message: "mine, date, target_mt, and actual_mt are required." });
    }

    const target = Number(target_mt);
    const actual = Number(actual_mt);
    const shortfall = Math.max(0, target - actual);
    const shortfall_pct = target > 0 ? (shortfall / target) * 100 : 0;
    const ratio = target > 0 ? actual / target : 1;

    const record = await ProductionRecord.findOneAndUpdate(
      { mine, date },
      {
        mine,
        date,
        target_mt: target,
        actual_mt: actual,
        shortfall_mt: shortfall,
        shortfall_pct: Number(shortfall_pct.toFixed(2)),
        equipment_downtime_hours: Number(equipment_downtime_hours || 0),
        rainfall_mm: Number(rainfall_mm || 0),
        blasting_delay_hours: Number(blasting_delay_hours || 0),
        maintenance_hours: Number(maintenance_hours || 0),
        equipment_availability: Number(equipment_availability || 0.90),
        production_ratio: Number(ratio.toFixed(4))
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: "Record saved successfully to MongoDB", record });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 6. Get Model Evaluation Metrics
router.get("/metrics", requireAuth, (req, res) => {
  const metricsPath = path.join(ROOT, "models", "production_shortfall_metrics.json");
  if (fs.existsSync(metricsPath)) {
    return res.json(JSON.parse(fs.readFileSync(metricsPath, "utf8")));
  }
  res.json({ model_type: "RandomForestRegressor", status: "calibrated" });
});

// 7. Demo endpoint
router.get("/demo", requireAuth, async (req, res) => {
  try {
    res.json(await runShortfallPrediction({
      mine: "Balaghat",
      target_mt: 38000,
      equipment_downtime_hours: 32,
      rainfall_mm: 68,
      blasting_delay_hours: 8,
      maintenance_hours: 16,
      equipment_availability: 0.81
    }));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// 8. Health Check
router.get("/health", async (req, res) => {
  const count = isDbConnected() ? await ProductionRecord.countDocuments() : 0;
  res.json({
    module: "production-shortfall",
    status: "ready",
    mongodb_connected: isDbConnected(),
    production_records_count: count
  });
});

export default router;
