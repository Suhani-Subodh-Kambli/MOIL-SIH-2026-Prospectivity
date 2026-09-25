import mongoose from "mongoose";

const productionRecordSchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },
  mine: { type: String, required: true, index: true },
  mine_type: { type: String, default: "Underground" },
  target_mt: { type: Number, required: true },
  actual_mt: { type: Number, required: true },
  shortfall_mt: { type: Number, default: 0 },
  shortfall_pct: { type: Number, default: 0 },
  equipment_downtime_hours: { type: Number, default: 0 },
  rainfall_mm: { type: Number, default: 0 },
  blasting_delay_hours: { type: Number, default: 0 },
  maintenance_hours: { type: Number, default: 0 },
  equipment_availability: { type: Number, default: 0.90 },
  production_ratio: { type: Number, default: 1.0 }
}, { timestamps: true });

productionRecordSchema.index({ mine: 1, date: 1 }, { unique: true });

export default mongoose.model("ProductionRecord", productionRecordSchema);
