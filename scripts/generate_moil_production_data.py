"""
Generate realistic, calibrated mine-level historical production dataset for MOIL Limited.
Calibrated based on MOIL published annual production figures across its 8 major operating mines:
1. Balaghat (Underground)
2. Dongri Buzurg (Opencast)
3. Chikla (Underground)
4. Tirodi (Opencast)
5. Gumgaon (Underground)
6. Kandri (Opencast/UG)
7. Mansar (Opencast/UG)
8. Ukwa (Underground)

Period: 2021-01 to 2024-12 (48 months per mine = 384 comprehensive monthly records)
"""

import os
import numpy as np
import pandas as pd

def generate_moil_dataset():
    rng = np.random.default_rng(2026)
    
    mines = {
        "Balaghat": {"type": "Underground", "base_target": 38000, "rain_sensitivity": 0.3, "equip_hours_mean": 24},
        "Dongri Buzurg": {"type": "Opencast", "base_target": 32000, "rain_sensitivity": 1.2, "equip_hours_mean": 32},
        "Chikla": {"type": "Underground", "base_target": 15000, "rain_sensitivity": 0.4, "equip_hours_mean": 20},
        "Tirodi": {"type": "Opencast", "base_target": 13000, "rain_sensitivity": 1.0, "equip_hours_mean": 26},
        "Gumgaon": {"type": "Underground", "base_target": 11000, "rain_sensitivity": 0.35, "equip_hours_mean": 18},
        "Kandri": {"type": "Opencast", "base_target": 10000, "rain_sensitivity": 0.9, "equip_hours_mean": 22},
        "Mansar": {"type": "Opencast", "base_target": 8500, "rain_sensitivity": 0.85, "equip_hours_mean": 20},
        "Ukwa": {"type": "Underground", "base_target": 9500, "rain_sensitivity": 0.3, "equip_hours_mean": 19},
    }
    
    dates = pd.date_range(start="2021-01-01", end="2024-12-01", freq="MS")
    rows = []
    
    for dt in dates:
        month = dt.month
        year = dt.year
        
        # Central India (Vidarbha / Balaghat) monsoon seasonality
        if month in [6]:
            base_rain = rng.uniform(40, 120)
        elif month in [7, 8]:
            base_rain = rng.uniform(180, 420)
        elif month in [9]:
            base_rain = rng.uniform(80, 200)
        elif month in [10]:
            base_rain = rng.uniform(10, 50)
        else:
            base_rain = rng.uniform(0, 15)
            
        for mine_name, cfg in mines.items():
            # Annual capacity growth
            growth_factor = 1.0 + (year - 2021) * 0.04
            # Seasonal production push in Q4 (Jan-March)
            season_boost = 1.12 if month in [1, 2, 3] else (0.85 if month in [7, 8] and cfg["type"] == "Opencast" else 1.0)
            
            target = round(cfg["base_target"] * growth_factor * season_boost, -2)
            
            # Rainfall at the mine
            rain = max(0.0, float(base_rain + rng.normal(0, 15)))
            
            # Operational downtime
            equip_downtime = max(0.0, float(rng.gamma(2.0, cfg["equip_hours_mean"] / 2.0)))
            maint_hours = max(2.0, float(rng.uniform(8, 36)))
            blasting_delays = max(0.0, float(rng.exponential(4.0) if cfg["type"] == "Opencast" else rng.exponential(2.5)))
            
            # Monsoon adds flooding and transport delay
            if month in [7, 8] and cfg["type"] == "Opencast":
                blasting_delays += rng.uniform(8, 25)
                equip_downtime += rng.uniform(12, 35)
                
            # Equipment availability
            equip_avail = float(np.clip(0.96 - (equip_downtime / 300.0) - (maint_hours / 400.0) + rng.normal(0, 0.015), 0.62, 0.98))
            
            # Production efficiency ratio calculation
            rain_impact = (rain / 200.0) * 0.12 * cfg["rain_sensitivity"]
            downtime_impact = (equip_downtime / 100.0) * 0.14
            blast_impact = (blasting_delays / 50.0) * 0.08
            avail_boost = (equip_avail - 0.85) * 0.5
            
            noise = rng.normal(0, 0.02)
            ratio = float(np.clip(1.0 - rain_impact - downtime_impact - blast_impact + avail_boost + noise, 0.45, 1.10))
            
            actual = round(target * ratio, -1)
            ratio = round(actual / target, 4)
            shortfall = max(0.0, target - actual)
            shortfall_pct = round((shortfall / target) * 100.0, 2)
            
            rows.append({
                "date": dt.strftime("%Y-%m-%d"),
                "mine": mine_name,
                "mine_type": cfg["type"],
                "target_mt": int(target),
                "actual_mt": int(actual),
                "shortfall_mt": int(shortfall),
                "shortfall_pct": shortfall_pct,
                "equipment_downtime_hours": round(equip_downtime, 1),
                "rainfall_mm": round(rain, 1),
                "blasting_delay_hours": round(blasting_delays, 1),
                "maintenance_hours": round(maint_hours, 1),
                "equipment_availability": round(equip_avail, 4),
                "production_ratio": ratio
            })
            
    df = pd.DataFrame(rows)
    out_path = os.path.join("data", "production", "production_history.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df.to_csv(out_path, index=False)
    print(f"Generated {len(df)} records across {len(mines)} MOIL mines.")
    print(f"Saved to {out_path}")
    print("\nSummary per mine:")
    print(df.groupby("mine")[["target_mt", "actual_mt", "shortfall_pct", "equipment_availability"]].mean().round(2))

if __name__ == "__main__":
    generate_moil_dataset()
