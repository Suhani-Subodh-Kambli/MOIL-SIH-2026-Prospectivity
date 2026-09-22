from pathlib import Path
import json
import warnings

import joblib
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


# ============================================================
# PATHS
# ============================================================

ROOT = Path(__file__).resolve().parents[1]

INPUT_FILE = ROOT / "outputs" / "indiawide" / "detailed_zone_geology_fixed.csv"

MODEL_FILE = ROOT / "models" / "moil_manganese_prospectivity_xgb_phase4b.joblib"
PREPROCESSOR_FILE = ROOT / "models" / "phase4b_preprocessor.joblib"
FEATURE_COLUMNS_FILE = ROOT / "models" / "phase4b_feature_columns.json"

OUTPUT_DIR = ROOT / "outputs" / "indiawide"

OUTPUT_PREDICTIONS = OUTPUT_DIR / "detailed_zone_predictions.csv"
OUTPUT_TOP_TARGETS = OUTPUT_DIR / "detailed_zone_top_targets.csv"
OUTPUT_TARGET_ZONES = OUTPUT_DIR / "detailed_zone_target_zones.csv"
OUTPUT_GEOJSON = OUTPUT_DIR / "detailed_zone_targets.geojson"


# ============================================================
# EXPECTED RAW FEATURES USED DURING PHASE 4B TRAINING
# ============================================================

NUMERIC_FEATURES = [
    "Aspect",
    "B11",
    "B12",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "B8",
    "B8A",
    "Elevation",
    "NDVI",
    "NIR_Red_Ratio",
    "Red_Green_Ratio",
    "SWIR_NIR_Ratio",
    "SWIR_Ratio",
    "Slope",
    "VH",
    "VV",
    "VV_VH_Difference",
    "NDMI",
    "NBR",
    "NDRE",
    "Iron_Oxide_Index",
    "Clay_Alteration_Index",
    "Ferrous_Index",
    "SWIR_Red_Ratio",
    "SWIR_Green_Ratio",
    "NIR_SWIR2_Ratio",
    "BSI",
    "B11_B12_NormDiff",
    "B8_B12_NormDiff",
    "B4_B2_NormDiff",
    "Sausar_Group_Proxy",
    "Metamorphic_Host_Proxy",
    "Geology_Unknown",
    "Geo_Boundary_Distance_km",
    "Geo_Boundary_Density_1km",
    "Geo_Boundary_Density_3km",
    "Lithology_Diversity_3km",
    "Formation_Diversity_3km",
    "Aspect_Sin",
    "Aspect_Cos",
]

CATEGORICAL_FEATURES = [
    "geo_age",
    "geo_supergroup",
    "geo_group",
    "geo_formation",
    "geo_lithology",
    "geo_intrusive",
    "geo_stratigraphy",
]

RAW_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


# ============================================================
# HELPERS
# ============================================================

def safe_numeric(df, column):
    """Convert a column to numeric; create NaN if unavailable."""
    if column not in df.columns:
        df[column] = np.nan
    else:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    return df


def safe_categorical(df, column):
    """
    Preserve real categorical information if available.
    Otherwise use explicit UNKNOWN.
    """
    if column not in df.columns:
        df[column] = "UNKNOWN"
    else:
        df[column] = df[column].fillna("UNKNOWN").astype(str)

        # Treat textual missing markers as UNKNOWN.
        df[column] = df[column].replace(
            {
                "nan": "UNKNOWN",
                "NaN": "UNKNOWN",
                "None": "UNKNOWN",
                "": "UNKNOWN",
            }
        )

    return df


def percentile_score(values):
    """
    Convert model probability/ranking to a 0-100 percentile score.

    This is an exploration-priority score, NOT a probability
    of manganese occurrence and NOT manganese concentration.
    """
    series = pd.Series(values)

    # Rank-based percentile.
    score = series.rank(method="average", pct=True) * 100.0

    return score.to_numpy()


def make_geojson(df):
    """Create a simple GeoJSON FeatureCollection from scored points."""

    features = []

    for _, row in df.iterrows():

        lon = float(row["longitude"])
        lat = float(row["latitude"])

        properties = {
            "zone_id": str(row.get("zone_id", "")),
            "prospectivity_score": float(row["prospectivity_score"]),
            "model_probability": float(row["model_probability"]),
            "priority_class": str(row["priority_class"]),
        }

        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [lon, lat],
                },
                "properties": properties,
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("MOIL SIH 2026 - DETAILED INDIA-WIDE PROSPECTIVITY INFERENCE")
    print("=" * 70)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # --------------------------------------------------------
    # 1. Load files
    # --------------------------------------------------------

    print("\nLoading detailed samples...")
    df = pd.read_csv(INPUT_FILE)

    print("Input shape:", df.shape)

    print("\nLoading model...")
    model = joblib.load(MODEL_FILE)

    print("Loading preprocessor...")
    preprocessor = joblib.load(PREPROCESSOR_FILE)

    print("Loading saved feature columns...")
    with open(FEATURE_COLUMNS_FILE, "r", encoding="utf-8") as f:
        expected_transformed_features = json.load(f)

    print("Expected transformed features:", len(expected_transformed_features))

    # --------------------------------------------------------
    # 2. Preserve location / zone metadata
    # --------------------------------------------------------

    required_location = ["longitude", "latitude"]

    for column in required_location:
        if column not in df.columns:
            raise ValueError(
                f"Required location column missing: {column}"
            )

    if "zone_id" not in df.columns:
        df["zone_id"] = "UNKNOWN_ZONE"

    # --------------------------------------------------------
    # 3. Verify / recreate derived spectral features if needed
    # --------------------------------------------------------

    # These should already exist in the GEE detailed samples.
    # If one is missing, recreate it from the raw bands where
    # possible.

    def ratio(a, b):
        return df[a] / df[b].replace(0, np.nan)

    def normalized_difference(a, b):
        denominator = df[a] + df[b]
        return (df[a] - df[b]) / denominator.replace(0, np.nan)

    if "NDVI" not in df.columns:
        df["NDVI"] = normalized_difference("B8", "B4")

    if "NDMI" not in df.columns:
        df["NDMI"] = normalized_difference("B8", "B11")

    if "NBR" not in df.columns:
        df["NBR"] = normalized_difference("B8", "B12")

    if "NDRE" not in df.columns:
        df["NDRE"] = normalized_difference("B8A", "B5")

    if "NIR_Red_Ratio" not in df.columns:
        df["NIR_Red_Ratio"] = ratio("B8", "B4")

    if "Red_Green_Ratio" not in df.columns:
        df["Red_Green_Ratio"] = ratio("B4", "B3")

    if "SWIR_NIR_Ratio" not in df.columns:
        df["SWIR_NIR_Ratio"] = ratio("B11", "B8")

    if "SWIR_Ratio" not in df.columns:
        df["SWIR_Ratio"] = ratio("B12", "B11")

    if "Iron_Oxide_Index" not in df.columns:
        df["Iron_Oxide_Index"] = ratio("B4", "B2")

    if "Clay_Alteration_Index" not in df.columns:
        df["Clay_Alteration_Index"] = ratio("B11", "B12")

    if "Ferrous_Index" not in df.columns:
        df["Ferrous_Index"] = ratio("B12", "B8")

    if "SWIR_Red_Ratio" not in df.columns:
        df["SWIR_Red_Ratio"] = ratio("B11", "B4")

    if "SWIR_Green_Ratio" not in df.columns:
        df["SWIR_Green_Ratio"] = ratio("B11", "B3")

    if "NIR_SWIR2_Ratio" not in df.columns:
        df["NIR_SWIR2_Ratio"] = ratio("B8", "B12")

    if "BSI" not in df.columns:
        numerator = (df["B11"] + df["B4"]) - (df["B8"] + df["B2"])
        denominator = (df["B11"] + df["B4"]) + (df["B8"] + df["B2"])
        df["BSI"] = numerator / denominator.replace(0, np.nan)

    if "B11_B12_NormDiff" not in df.columns:
        df["B11_B12_NormDiff"] = normalized_difference("B11", "B12")

    if "B8_B12_NormDiff" not in df.columns:
        df["B8_B12_NormDiff"] = normalized_difference("B8", "B12")

    if "B4_B2_NormDiff" not in df.columns:
        df["B4_B2_NormDiff"] = normalized_difference("B4", "B2")

    # --------------------------------------------------------
    # 4. Make sure terrain trigonometric features exist
    # --------------------------------------------------------

    if "Aspect_Sin" not in df.columns:
        df["Aspect_Sin"] = np.sin(
            np.deg2rad(df["Aspect"])
        )

    if "Aspect_Cos" not in df.columns:
        df["Aspect_Cos"] = np.cos(
            np.deg2rad(df["Aspect"])
        )

    # --------------------------------------------------------
    # 5. Make missing geology fields explicit
    # --------------------------------------------------------

    print("\nPreparing geology fields...")

    for column in CATEGORICAL_FEATURES:
        df = safe_categorical(df, column)

    # Since the current India-wide 2M layer does not provide
    # lithology / formation / group / stratigraphy, mark those
    # fields explicitly UNKNOWN rather than fabricating values.

    unavailable_geology = [
        "geo_group",
        "geo_formation",
        "geo_lithology",
        "geo_intrusive",
        "geo_stratigraphy",
    ]

    for column in unavailable_geology:
        df[column] = "UNKNOWN"

    # age and supergroup may contain genuine NGDR information.
    # Keep those values when available.

    df["geo_age"] = (
        df["geo_age"]
        .replace(
            {
                "nan": np.nan,
                "None": np.nan,
                "": np.nan,
            }
        )
    )

    df["geo_supergroup"] = (
        df["geo_supergroup"]
        .replace(
            {
                "nan": np.nan,
                "None": np.nan,
                "": np.nan,
            }
        )
    )

    # --------------------------------------------------------
    # 6. Geological numeric proxies
    # --------------------------------------------------------

    if "Geology_Unknown" not in df.columns:
        df["Geology_Unknown"] = (
            (df["geo_age"].isna()) &
            (df["geo_supergroup"].isna())
        ).astype(float)

    if "Sausar_Group_Proxy" not in df.columns:
        df["Sausar_Group_Proxy"] = (
            df["geo_group"]
            .astype(str)
            .str.upper()
            .eq("SAUSAR")
            .astype(float)
        )

    if "Metamorphic_Host_Proxy" not in df.columns:
        metamorphic_terms = (
            "SCHIST",
            "GNEISS",
            "AMPHIBOLITE",
            "QUARTZITE",
            "PHYLLITE",
            "GRANULITE",
            "MARBLE",
            "MIGMATITE",
        )

        df["Metamorphic_Host_Proxy"] = (
            df["geo_lithology"]
            .astype(str)
            .str.upper()
            .apply(
                lambda x: float(any(term in x for term in metamorphic_terms))
            )
        )

    # The detailed 2M layer does not provide true local
    # lithology/formation diversity. Do not fabricate it.
    if "Lithology_Diversity_3km" not in df.columns:
        df["Lithology_Diversity_3km"] = np.nan

    if "Formation_Diversity_3km" not in df.columns:
        df["Formation_Diversity_3km"] = np.nan

    # --------------------------------------------------------
    # 7. Numeric feature alignment
    # --------------------------------------------------------

    print("\nChecking numeric features...")

    for column in NUMERIC_FEATURES:
        df = safe_numeric(df, column)

    # --------------------------------------------------------
    # 8. Build exact raw model matrix
    # --------------------------------------------------------

    missing_raw = [
        column
        for column in RAW_FEATURES
        if column not in df.columns
    ]

    if missing_raw:
        raise ValueError(
            "Missing raw model features:\n"
            + "\n".join(missing_raw)
        )

    X_raw = df[RAW_FEATURES].copy()

    print("Raw feature matrix:", X_raw.shape)
    print("Expected raw feature count:", len(RAW_FEATURES))

    if X_raw.shape[1] != 51:
        raise ValueError(
            f"Expected 51 raw features, got {X_raw.shape[1]}"
        )

    print("Raw feature alignment: PASS")

    # --------------------------------------------------------
    # 9. Transform with EXACT saved preprocessor
    # --------------------------------------------------------

    print("\nTransforming with saved Phase 4B preprocessor...")

    X_transformed = preprocessor.transform(X_raw)

    print("Transformed matrix:", X_transformed.shape)

    transformed_names = list(
        preprocessor.get_feature_names_out()
    )

    if transformed_names != expected_transformed_features:
        raise ValueError(
            "Saved feature-column order does not match "
            "the preprocessor output."
        )

    if X_transformed.shape[1] != 117:
        raise ValueError(
            f"Expected 117 transformed features, "
            f"got {X_transformed.shape[1]}"
        )

    print("Transformed feature verification: PASS")

    # --------------------------------------------------------
    # 10. XGBoost inference
    # --------------------------------------------------------

    print("\nRunning XGBoost inference...")

    probabilities = model.predict_proba(X_transformed)[:, 1]

    print(
        "Probability range:",
        float(np.min(probabilities)),
        "to",
        float(np.max(probabilities)),
    )

    print(
        "Mean probability:",
        float(np.mean(probabilities)),
    )

    # --------------------------------------------------------
    # 11. Prospectivity score
    # --------------------------------------------------------

    df["model_probability"] = probabilities

    df["prospectivity_score"] = percentile_score(
        probabilities
    )

    # Top 10% = exploration-priority class.
    df["priority_class"] = np.select(
        [
            df["prospectivity_score"] >= 90,
            df["prospectivity_score"] >= 75,
        ],
        [
            "HIGH",
            "MEDIUM",
        ],
        default="LOW",
    )

    print(
        "\nProspectivity score:",
        float(df["prospectivity_score"].min()),
        "to",
        float(df["prospectivity_score"].max()),
    )

    print(
        "HIGH-priority cells:",
        int((df["priority_class"] == "HIGH").sum()),
    )

    # --------------------------------------------------------
    # 12. Save complete predictions
    # --------------------------------------------------------

    df.to_csv(
        OUTPUT_PREDICTIONS,
        index=False,
    )

    print(
        "\nSaved:",
        OUTPUT_PREDICTIONS,
    )

    # --------------------------------------------------------
    # 13. Top 10% target cells
    # --------------------------------------------------------

    top_targets = (
        df[df["prospectivity_score"] >= 90]
        .sort_values(
            "prospectivity_score",
            ascending=False,
        )
        .copy()
    )

    top_targets.to_csv(
        OUTPUT_TOP_TARGETS,
        index=False,
    )

    print(
        "Saved:",
        OUTPUT_TOP_TARGETS,
    )

    # --------------------------------------------------------
    # 14. Aggregate by priority zone
    # --------------------------------------------------------

    zone_rows = []

    for zone_id, group in df.groupby("zone_id"):

        zone_rows.append(
            {
                "zone_id": zone_id,
                "sample_count": len(group),
                "mean_score": group["prospectivity_score"].mean(),
                "median_score": group["prospectivity_score"].median(),
                "max_score": group["prospectivity_score"].max(),
                "high_priority_cells": int(
                    (group["prospectivity_score"] >= 90).sum()
                ),
                "high_priority_fraction": (
                    group["prospectivity_score"].ge(90).mean()
                ),
                "mean_probability": group["model_probability"].mean(),
                "max_probability": group["model_probability"].max(),
            }
        )

    zone_summary = pd.DataFrame(zone_rows)

    zone_summary = zone_summary.sort_values(
        "mean_score",
        ascending=False,
    )

    zone_summary.to_csv(
        OUTPUT_TARGET_ZONES,
        index=False,
    )

    print(
        "Saved:",
        OUTPUT_TARGET_ZONES,
    )

    # --------------------------------------------------------
    # 15. GeoJSON for React map
    # --------------------------------------------------------

    geojson_df = top_targets[
        [
            "zone_id",
            "longitude",
            "latitude",
            "prospectivity_score",
            "model_probability",
            "priority_class",
        ]
    ].copy()

    geojson = make_geojson(geojson_df)

    with open(
        OUTPUT_GEOJSON,
        "w",
        encoding="utf-8",
    ) as f:
        json.dump(
            geojson,
            f,
            indent=2,
        )

    print(
        "Saved:",
        OUTPUT_GEOJSON,
    )

    # --------------------------------------------------------
    # 16. Final summary
    # --------------------------------------------------------

    print("\n" + "=" * 70)
    print("INDIA-WIDE DETAILED INFERENCE COMPLETE")
    print("=" * 70)

    print("Samples:", len(df))
    print("Zones:", df["zone_id"].nunique())
    print(
        "HIGH-priority cells:",
        len(top_targets),
    )

    print("\nZone summary:")
    print(
        zone_summary.to_string(index=False)
    )

    print(
        "\nIMPORTANT:"
        "\nProspectivity score = relative exploration priority."
        "\nIt is NOT manganese concentration."
        "\nIt is NOT a reserve estimate."
        "\nIt does NOT prove a deposit."
    )


if __name__ == "__main__":
    main()