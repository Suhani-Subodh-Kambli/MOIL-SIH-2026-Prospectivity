import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import ProductionRecord from "../models/ProductionRecord.js";
import { isDbConnected } from "../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

export async function seedDatabase() {
  if (!isDbConnected()) return;

  try {
    // 1. Ensure Standard Demo Users Exist
    const demoEmail = "demo@oretwin.ai";
    const existingDemo = await User.findOne({ email: demoEmail });
    if (!existingDemo) {
      const hash = await bcrypt.hash("password123", 10);
      await User.create({
        name: "MOIL Executive",
        email: demoEmail,
        passwordHash: hash,
        role: "admin"
      });
      console.log(`[Seed] Created standard demo account: ${demoEmail} (pwd: password123)`);
    }

    // 2. Seed MOIL Historical Production Records if empty
    const recordCount = await ProductionRecord.countDocuments();
    if (recordCount === 0) {
      const csvPath = path.join(ROOT, "data", "production", "production_history.csv");
      if (fs.existsSync(csvPath)) {
        const text = fs.readFileSync(csvPath, "utf8");
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim());
        
        const docs = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map(p => p.trim());
          if (parts.length === headers.length) {
            const row = Object.fromEntries(headers.map((h, idx) => [h, parts[idx]]));
            docs.push({
              date: row.date,
              mine: row.mine,
              mine_type: row.mine_type || "Underground",
              target_mt: Number(row.target_mt),
              actual_mt: Number(row.actual_mt),
              shortfall_mt: Number(row.shortfall_mt || 0),
              shortfall_pct: Number(row.shortfall_pct || 0),
              equipment_downtime_hours: Number(row.equipment_downtime_hours || 0),
              rainfall_mm: Number(row.rainfall_mm || 0),
              blasting_delay_hours: Number(row.blasting_delay_hours || 0),
              maintenance_hours: Number(row.maintenance_hours || 0),
              equipment_availability: Number(row.equipment_availability || 0.90),
              production_ratio: Number(row.production_ratio || 1.0)
            });
          }
        }
        
        if (docs.length > 0) {
          await ProductionRecord.insertMany(docs);
          console.log(`[Seed] Seeded ${docs.length} MOIL historical production records into MongoDB collection 'productionrecords'`);
        }
      }
    }
  } catch (error) {
    console.error("[Seed] Error seeding database:", error.message);
  }
}
