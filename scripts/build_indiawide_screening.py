"""
MOIL SIH 2026
India-wide manganese prospectivity screening

Phase 6

Reads:
    data/indiawide/moil_indiawide_2024_screening_5km.csv

Creates:
    outputs/indiawide_screening_features.csv
    outputs/indiawide_candidate_cells.csv
    outputs/indiawide_screening_map.png

Important:
    This is a screening stage only.

    It does NOT claim that the Balaghat-trained geological
    prospectivity model has been validated across India.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT
    / "data"
    / "indiawide"
    / "moil_indiawide_2024_screening_5km.csv"
)

OUTPUT_DIR = ROOT / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ------------------------------------------------------------
# 1. LOAD DATA
# ------------------------------------------------------------

print("Loading India-wide screening dataset...")

df = pd.read_csv(INPUT)

print("Shape:", df.shape)

required = [
    "grid_lon",
    "grid_lat",
    "NDVI",
    "NDMI",
    "NBR",
    "NDRE",
    "Iron_Oxide_Index",
    "Clay_Alteration_Index",
    "Ferrous_Index",
    "SWIR_NIR_Ratio",
    "SWIR_Red_Ratio",
    "SWIR_Green_Ratio",
    "NIR_SWIR2_Ratio",
    "VV",
    "VH",
    "VV_VH_Difference",
    "Elevation",
    "Slope",
]

missing = [
    column
    for column in required
    if column not in df.columns
]

if missing:
    raise ValueError(
        f"Missing required columns: {missing}"
    )


# ------------------------------------------------------------
# 2. CLEAN NUMERIC DATA
# ------------------------------------------------------------

numeric_columns = [
    column
    for column in required
    if column not in ["grid_lon", "grid_lat"]
]

for column in numeric_columns:
    df[column] = pd.to_numeric(
        df[column],
        errors="coerce"
    )

df = df.dropna(
    subset=[
        "grid_lon",
        "grid_lat"
    ]
).copy()


# ------------------------------------------------------------
# 3. ROBUST NORMALIZATION
# ------------------------------------------------------------
#
# We don't use simple min-max scaling because extreme
# outliers can dominate national-scale satellite features.
#
# Percentile scaling converts each feature to approximately
# 0-1 based on the India-wide distribution.
# ------------------------------------------------------------

def percentile_scale(series):
    values = series.to_numpy(dtype=float)

    valid = np.isfinite(values)

    if valid.sum() == 0:
        return pd.Series(
            np.nan,
            index=series.index
        )

    p05 = np.nanpercentile(
        values[valid],
        5
    )

    p95 = np.nanpercentile(
        values[valid],
        95
    )

    if p95 <= p05:
        return pd.Series(
            0.5,
            index=series.index
        )

    scaled = (
        (series - p05)
        / (p95 - p05)
    )

    return scaled.clip(0, 1)


for column in numeric_columns:

    df[f"{column}_scaled"] = percentile_scale(
        df[column]
    )


# ------------------------------------------------------------
# 4. SPECTRAL ALTERATION SIGNAL
# ------------------------------------------------------------

spectral_columns = [
    "Iron_Oxide_Index",
    "Clay_Alteration_Index",
    "Ferrous_Index",
    "SWIR_NIR_Ratio",
    "SWIR_Red_Ratio",
    "SWIR_Green_Ratio",
    "NIR_SWIR2_Ratio",
]

df["Spectral_Score"] = (
    df[
        [
            f"{column}_scaled"
            for column in spectral_columns
        ]
    ]
    .mean(axis=1)
)


# ------------------------------------------------------------
# 5. RADAR / STRUCTURAL SIGNAL
# ------------------------------------------------------------

radar_columns = [
    "VV",
    "VH",
    "VV_VH_Difference",
]

df["Radar_Score"] = (
    df[
        [
            f"{column}_scaled"
            for column in radar_columns
        ]
    ]
    .mean(axis=1)
)


# ------------------------------------------------------------
# 6. TERRAIN SIGNAL
# ------------------------------------------------------------

terrain_columns = [
    "Elevation",
    "Slope",
]

df["Terrain_Score"] = (
    df[
        [
            f"{column}_scaled"
            for column in terrain_columns
        ]
    ]
    .mean(axis=1)
)


# ------------------------------------------------------------
# 7. VEGETATION / SURFACE CONTEXT
# ------------------------------------------------------------

vegetation_columns = [
    "NDVI",
    "NDMI",
    "NBR",
    "NDRE",
]

df["Surface_Context_Score"] = (
    df[
        [
            f"{column}_scaled"
            for column in vegetation_columns
        ]
    ]
    .mean(axis=1)
)


# ------------------------------------------------------------
# 8. INDIA-WIDE SCREENING SCORE
# ------------------------------------------------------------
#
# This is NOT manganese probability.
#
# It is only a screening index based on remote sensing,
# radar and terrain signals.
#
# Geological evidence will be added in the next phase.
# ------------------------------------------------------------

df["screening_raw"] = (
    0.55 * df["Spectral_Score"]
    +
    0.25 * df["Radar_Score"]
    +
    0.20 * df["Terrain_Score"]
)


# ------------------------------------------------------------
# 9. NORMALIZE TO 0-100
# ------------------------------------------------------------

df["screening_score"] = (
    percentile_scale(
        df["screening_raw"]
    )
    * 100
)


# ------------------------------------------------------------
# 10. TARGET CLASSES
# ------------------------------------------------------------
#
# Top 10% = national screening priority.
#
# This does NOT mean 90% manganese probability.
# ------------------------------------------------------------

threshold = df["screening_score"].quantile(
    0.90
)

df["screening_priority"] = np.where(
    df["screening_score"] >= threshold,
    "HIGH",
    "NORMAL"
)

print(
    f"Top-10% screening threshold: "
    f"{threshold:.2f}"
)

print(
    "High-priority cells:",
    (df["screening_priority"] == "HIGH").sum()
)


# ------------------------------------------------------------
# 11. SORT
# ------------------------------------------------------------

df = df.sort_values(
    "screening_score",
    ascending=False
).reset_index(drop=True)


# ------------------------------------------------------------
# 12. SAVE COMPLETE DATASET
# ------------------------------------------------------------

output_features = (
    OUTPUT_DIR
    / "indiawide_screening_features.csv"
)

df.to_csv(
    output_features,
    index=False
)

print(
    "Saved:",
    output_features
)


# ------------------------------------------------------------
# 13. SAVE TOP CANDIDATES
# ------------------------------------------------------------

candidate_columns = [
    "cell_id",
    "grid_lon",
    "grid_lat",
    "screening_score",
    "screening_priority",
    "Spectral_Score",
    "Radar_Score",
    "Terrain_Score",
    "Surface_Context_Score",
]

candidate_columns = [
    column
    for column in candidate_columns
    if column in df.columns
]

top_candidates = df[
    candidate_columns
].head(1000)

candidate_output = (
    OUTPUT_DIR
    / "indiawide_candidate_cells.csv"
)

top_candidates.to_csv(
    candidate_output,
    index=False
)

print(
    "Saved:",
    candidate_output
)


# ------------------------------------------------------------
# 14. PLOT INDIA-WIDE SCREENING MAP
# ------------------------------------------------------------

plt.figure(
    figsize=(12, 10)
)

scatter = plt.scatter(
    df["grid_lon"],
    df["grid_lat"],
    c=df["screening_score"],
    s=4,
    alpha=0.7
)

plt.colorbar(
    scatter,
    label="India-wide screening score"
)

plt.xlabel("Longitude")
plt.ylabel("Latitude")

plt.title(
    "MOIL SIH 2026 - India-wide "
    "Manganese Screening"
)

plt.tight_layout()

map_output = (
    OUTPUT_DIR
    / "indiawide_screening_map.png"
)

plt.savefig(
    map_output,
    dpi=200
)

plt.close()

print(
    "Saved:",
    map_output
)


# ------------------------------------------------------------
# 15. SUMMARY
# ------------------------------------------------------------

summary = pd.DataFrame(
    {
        "metric": [
            "Total screening cells",
            "High-priority cells",
            "High-priority percentage",
            "Screening threshold",
            "Maximum score",
            "Mean score",
            "Median score",
        ],
        "value": [
            len(df),
            int(
                (
                    df["screening_priority"]
                    == "HIGH"
                ).sum()
            ),
            (
                (
                    df["screening_priority"]
                    == "HIGH"
                ).mean()
                * 100
            ),
            threshold,
            df["screening_score"].max(),
            df["screening_score"].mean(),
            df["screening_score"].median(),
        ],
    }
)

summary_output = (
    OUTPUT_DIR
    / "indiawide_screening_summary.csv"
)

summary.to_csv(
    summary_output,
    index=False
)

print(
    "Saved:",
    summary_output
)

print()
print("INDIA-WIDE SCREENING COMPLETE")