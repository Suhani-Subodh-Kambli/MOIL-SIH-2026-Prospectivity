import mongoose from "mongoose";

const scenarioSchema = new mongoose.Schema({
  userId: { type: String, required: false, index: true },
  userName: { type: String, default: "Anonymous" },
  mine: { type: String, default: "Balaghat", index: true },
  target_mt: { type: Number, required: true },
  forecast_mt: { type: Number, required: true },
  predicted_shortfall_mt: { type: Number, required: true },
  shortfall_percent: { type: Number, required: true },
  risk: { type: String, required: true },
  top_drivers: [{
    factor: String,
    impact_index: Number
  }],
  recommended_actions: [String],
  input: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

export default mongoose.model("ProductionScenario", scenarioSchema);
