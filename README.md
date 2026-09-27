# OreTwin: AI & Space Tech for Mine Intelligence 🚀

**Smart India Hackathon (SIH) 2026**
* **Problem Statement ID:** 26009
* **Problem Statement:** Using AI/ML and Space Technology to Identify Manganese Reserves and Overcome Production Shortfalls.
* **Organization:** MOIL Limited / Ministry of Steel

## 📖 Overview
OreTwin is a "Prospect-to-Pit" AI Digital Twin that solves two massive bottlenecks in the Indian mining sector: 
1. **Slow Exploration:** Traditional drilling is time-consuming and expensive.
2. **Unexpected Shortfalls:** Unplanned equipment downtime and severe weather cause sudden production deficits.

Our dual-engine platform utilizes **Space Technology** (Google Earth Engine, Sentinel-1, Sentinel-2, SRTM) to accurately map and score greenfield manganese reserves across India, and **Machine Learning** (Random Forest) calibrated on MOIL historic records to predict operational shortfalls before they occur.

## 🌟 Unique Value Proposition (UVP)
* **Zero-Leakage Spatial AI:** Our XGBoost exploration model was rigorously cross-validated to recognize true geological signatures, preventing proximity data leakage.
* **1-Click Stress Testing:** Simulates monsoon floods and major machine breakdowns instantly to generate exact MT (Metric Tonne) shortfall forecasts.
* **Prescriptive Action Engine:** Doesn't just report numbers—it diagnoses the "Top Drivers" (e.g., Rainfall Impact) and recommends plain-language corrective actions.

## 📊 Datasets Used
* **Exploration:** Sentinel-2 (Multispectral L2A), Sentinel-1 (Radar SAR), NASA SRTM (Elevation/Slope), GSI National Geological Data Repository (NGDR) for ground-truth occurrence labels.
* **Production:** Synthesized and calibrated MOIL historical shift records (2021-2024) covering 8 major mines, strictly aligned with MOIL Annual Reports.

## 🛠️ Tech Stack
* **Frontend:** React 19, Vite, Leaflet Maps
* **Backend:** Node.js, Express.js, Python (scikit-learn, XGBoost)
* **Database:** MongoDB
* **Space Data/GIS:** Google Earth Engine (GEE), GDAL