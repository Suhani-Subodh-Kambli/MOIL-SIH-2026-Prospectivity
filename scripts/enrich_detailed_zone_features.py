"""
MOIL SIH 2026
Detailed Zone Feature Enrichment

Adds:
1. Sentinel-2 derived features
2. Coarse NGDR geological attributes
3. Geological proxy features
4. BSI
5. Aspect sin/cos

IMPORTANT:
The following features are intentionally NOT fabricated from
2M centroid data:

- Geo_Boundary_Distance_km
- Geo_Boundary_Density_1km
- Geo_Boundary_Density_3km
- Lithology_Diversity_3km
- Formation_Diversity_3km

Those are calculated separately from actual geological polygons.
"""

from pathlib import Path
import json
import math

import numpy as np
import pandas as pd
import joblib


ROOT = Path(__file__).resolve().parents[1]

INPUT = ROOT / "outputs" / "indiawide" / "detailed_zone_samples.csv"
GEOLOGY_SUMMARY = (
    ROOT
    / "data"
    / "indiawide"
    / "geology"
    / "india_geology_2m_summary.csv"
)

OUTPUT = (
    ROOT
    / "outputs"
    / "indiawide"
    / "detailed_zone_enriched_features.csv"
)

AUDIT_OUTPUT = (
    ROOT
    / "outputs"
    / "indiawide"
    / "detailed_zone_feature_audit.csv"
)

MODEL = ROOT / "models" / "phase4b_preprocessor.joblib"


print("=" * 70)
print("MOIL DETAILED ZONE FEATURE ENRICHMENT")
print("=" * 70)


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

def safe_numeric(df, column):
    if column in df.columns:
        return pd.to_numeric(df[column], errors="coerce")
    return pd.Series(np.nan, index=df.index)


def first_existing(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None


def normalize_text(value):
    if pd.isna(value):
        return "UNKNOWN"

    value = str(value).strip()

    if not value:
        return "UNKNOWN"

    return value


# ------------------------------------------------------------
# Load detailed samples
# ------------------------------------------------------------

print("\nLoading detailed samples...")

df = pd.read_csv(INPUT)

print(f"Detailed samples: {df.shape}")


# ------------------------------------------------------------
# Coordinates
# ------------------------------------------------------------

if "latitude" not in df.columns or "longitude" not in df.columns:

    if ".geo" not in df.columns:
        raise RuntimeError(
            "No latitude/longitude and no .geo geometry column found."
        )

    print("Extracting coordinates from .geo...")

    def extract_lon(x):
        try:
            obj = json.loads(x)
            return obj["coordinates"][0]
        except Exception:
            return np.nan

    def extract_lat(x):
        try:
            obj = json.loads(x)
            return obj["coordinates"][1]
        except Exception:
            return np.nan

    df["longitude"] = df[".geo"].apply(extract_lon)
    df["latitude"] = df[".geo"].apply(extract_lat)


df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")


# ------------------------------------------------------------
# Spectral feature reconstruction
# ------------------------------------------------------------

print("\nChecking spectral features...")


# NDMI
if "NDMI" not in df.columns:
    df["NDMI"] = (
        (safe_numeric(df, "B8") - safe_numeric(df, "B11"))
        /
        (
            safe_numeric(df, "B8")
            + safe_numeric(df, "B11")
            + 1e-9
        )
    )


# NBR
if "NBR" not in df.columns:
    df["NBR"] = (
        (safe_numeric(df, "B8") - safe_numeric(df, "B12"))
        /
        (
            safe_numeric(df, "B8")
            + safe_numeric(df, "B12")
            + 1e-9
        )
    )


# NDRE
if "NDRE" not in df.columns:
    df["NDRE"] = (
        (safe_numeric(df, "B8A") - safe_numeric(df, "B5"))
        /
        (
            safe_numeric(df, "B8A")
            + safe_numeric(df, "B5")
            + 1e-9
        )
    )


# Iron Oxide Index
if "Iron_Oxide_Index" not in df.columns:
    df["Iron_Oxide_Index"] = (
        safe_numeric(df, "B4")
        /
        (safe_numeric(df, "B2") + 1e-9)
    )


# Clay alteration
if "Clay_Alteration_Index" not in df.columns:
    df["Clay_Alteration_Index"] = (
        safe_numeric(df, "B11")
        /
        (safe_numeric(df, "B12") + 1e-9)
    )


# Ferrous index
if "Ferrous_Index" not in df.columns:
    df["Ferrous_Index"] = (
        safe_numeric(df, "B12")
        /
        (safe_numeric(df, "B8") + 1e-9)
    )


# SWIR ratios
if "SWIR_Red_Ratio" not in df.columns:
    df["SWIR_Red_Ratio"] = (
        safe_numeric(df, "B11")
        /
        (safe_numeric(df, "B4") + 1e-9)
    )


if "SWIR_Green_Ratio" not in df.columns:
    df["SWIR_Green_Ratio"] = (
        safe_numeric(df, "B11")
        /
        (safe_numeric(df, "B3") + 1e-9)
    )


if "NIR_SWIR2_Ratio" not in df.columns:
    df["NIR_SWIR2_Ratio"] = (
        safe_numeric(df, "B8")
        /
        (safe_numeric(df, "B12") + 1e-9)
    )


# Normalized differences
if "B11_B12_NormDiff" not in df.columns:
    df["B11_B12_NormDiff"] = (
        (safe_numeric(df, "B11") - safe_numeric(df, "B12"))
        /
        (
            safe_numeric(df, "B11")
            + safe_numeric(df, "B12")
            + 1e-9
        )
    )


if "B8_B12_NormDiff" not in df.columns:
    df["B8_B12_NormDiff"] = (
        (safe_numeric(df, "B8") - safe_numeric(df, "B12"))
        /
        (
            safe_numeric(df, "B8")
            + safe_numeric(df, "B12")
            + 1e-9
        )
    )


if "B4_B2_NormDiff" not in df.columns:
    df["B4_B2_NormDiff"] = (
        (safe_numeric(df, "B4") - safe_numeric(df, "B2"))
        /
        (
            safe_numeric(df, "B4")
            + safe_numeric(df, "B2")
            + 1e-9
        )
    )


# ------------------------------------------------------------
# BSI
# ------------------------------------------------------------

print("\nCreating Bare Soil Index (BSI)...")

# Standard BSI:
#
# ((SWIR1 + RED) - (NIR + BLUE))
# --------------------------------
# ((SWIR1 + RED) + (NIR + BLUE))
#
# Sentinel-2:
# SWIR1 = B11
# RED   = B4
# NIR   = B8
# BLUE  = B2

if "BSI" not in df.columns:

    b11 = safe_numeric(df, "B11")
    b4 = safe_numeric(df, "B4")
    b8 = safe_numeric(df, "B8")
    b2 = safe_numeric(df, "B2")

    df["BSI"] = (
        (b11 + b4 - b8 - b2)
        /
        (b11 + b4 + b8 + b2 + 1e-9)
    )


# ------------------------------------------------------------
# Aspect transformations
# ------------------------------------------------------------

if "Aspect_Sin" not in df.columns:
    aspect_rad = np.deg2rad(safe_numeric(df, "Aspect"))
    df["Aspect_Sin"] = np.sin(aspect_rad)

if "Aspect_Cos" not in df.columns:
    aspect_rad = np.deg2rad(safe_numeric(df, "Aspect"))
    df["Aspect_Cos"] = np.cos(aspect_rad)


# ------------------------------------------------------------
# Load coarse geology summary
# ------------------------------------------------------------

print("\nLoading national NGDR geology...")

if not GEOLOGY_SUMMARY.exists():
    raise FileNotFoundError(
        f"Missing geology summary:\n{GEOLOGY_SUMMARY}"
    )

geo = pd.read_csv(GEOLOGY_SUMMARY)

print(f"Geology records: {len(geo)}")


# ------------------------------------------------------------
# Identify geology coordinate columns
# ------------------------------------------------------------

geo_lat_col = first_existing(
    geo,
    [
        "latitude",
        "lat",
        "LAT",
        "Latitude",
        "center_lat",
        "centroid_lat",
    ],
)

geo_lon_col = first_existing(
    geo,
    [
        "longitude",
        "lon",
        "LON",
        "Longitude",
        "center_lon",
        "centroid_lon",
    ],
)

if geo_lat_col is None or geo_lon_col is None:
    raise RuntimeError(
        "Could not identify latitude/longitude columns "
        "in india_geology_2m_summary.csv.\n"
        f"Columns found:\n{list(geo.columns)}"
    )


geo["geo_lat"] = pd.to_numeric(
    geo[geo_lat_col],
    errors="coerce"
)

geo["geo_lon"] = pd.to_numeric(
    geo[geo_lon_col],
    errors="coerce"
)

geo = geo.dropna(subset=["geo_lat", "geo_lon"]).copy()


# ------------------------------------------------------------
# Create coarse spatial bins
# ------------------------------------------------------------

print("\nCreating coarse geology grid...")

BIN_SIZE = 0.10

df["_lat_bin"] = (
    np.floor(df["latitude"] / BIN_SIZE)
    * BIN_SIZE
).round(4)

df["_lon_bin"] = (
    np.floor(df["longitude"] / BIN_SIZE)
    * BIN_SIZE
).round(4)

geo["_lat_bin"] = (
    np.floor(geo["geo_lat"] / BIN_SIZE)
    * BIN_SIZE
).round(4)

geo["_lon_bin"] = (
    np.floor(geo["geo_lon"] / BIN_SIZE)
    * BIN_SIZE
).round(4)


# Keep one geology record per grid cell
geo = (
    geo
    .sort_values(["_lat_bin", "_lon_bin"])
    .drop_duplicates(
        subset=["_lat_bin", "_lon_bin"],
        keep="first"
    )
)

print(f"Coarse geology cells: {len(geo)}")


# ------------------------------------------------------------
# Attach geology attributes
# ------------------------------------------------------------

print("\nAttaching geological attributes...")


GEOLOGY_FIELDS = {
    "geo_age": [
        "age",
        "AGE",
    ],
    "geo_supergroup": [
        "supergroup",
        "SUPERGROUP",
    ],
    "geo_group": [
        "group_name",
        "group",
        "GROUP_NAME",
    ],
    "geo_formation": [
        "formation",
        "FORMATION",
    ],
    "geo_lithology": [
        "lithologic",
        "lithology",
        "LITHOLOGIC",
    ],
    "geo_intrusive": [
        "intrusive",
        "INTRUSIVE",
    ],
    "geo_stratigraphy": [
        "stratigraphy_new",
        "stratigraphy",
        "STRATIGRAPHY_NEW",
    ],
}


for output_col, candidates in GEOLOGY_FIELDS.items():

    source_col = first_existing(geo, candidates)

    if source_col is None:
        print(
            f"WARNING: No source column found for {output_col}"
        )

        df[output_col] = "UNKNOWN"

    else:

        lookup = geo[
            ["_lat_bin", "_lon_bin", source_col]
        ].copy()

        lookup[source_col] = (
            lookup[source_col]
            .apply(normalize_text)
        )

        lookup = lookup.rename(
            columns={source_col: output_col}
        )

        df = df.merge(
            lookup,
            on=["_lat_bin", "_lon_bin"],
            how="left",
        )

        df[output_col] = (
            df[output_col]
            .fillna("UNKNOWN")
            .apply(normalize_text)
        )


# ------------------------------------------------------------
# Geological proxies
# ------------------------------------------------------------

print("\nCreating geological proxy features...")


def contains_any(series, patterns):

    regex = "|".join(patterns)

    return (
        series
        .fillna("UNKNOWN")
        .astype(str)
        .str.upper()
        .str.contains(
            regex,
            regex=True,
            na=False,
        )
    )


# Sausar proxy
df["Sausar_Group_Proxy"] = (
    df["geo_group"]
    .str.upper()
    .str.contains(
        "SAUSAR",
        na=False
    )
    .astype(float)
)


# Metamorphic-host proxy
metamorphic_pattern = (
    "SCHIST|GNEISS|AMPHIBOLITE|"
    "QUARTZITE|PHYLLITE|GRANULITE|MARBLE"
)

df["Metamorphic_Host_Proxy"] = (
    contains_any(
        df["geo_lithology"],
        [
            "SCHIST",
            "GNEISS",
            "AMPHIBOLITE",
            "QUARTZITE",
            "PHYLLITE",
            "GRANULITE",
            "MARBLE",
        ],
    )
    .astype(float)
)


# Unknown geology
df["Geology_Unknown"] = (
    (
        df["geo_lithology"].eq("UNKNOWN")
        |
        df["geo_group"].eq("UNKNOWN")
        |
        df["geo_formation"].eq("UNKNOWN")
    )
    .astype(float)
)


# ------------------------------------------------------------
# Remove helper columns
# ------------------------------------------------------------

df.drop(
    columns=[
        "_lat_bin",
        "_lon_bin",
    ],
    inplace=True,
    errors="ignore",
)


# ------------------------------------------------------------
# Model compatibility
# ------------------------------------------------------------

print("\nChecking model feature compatibility...")

preprocessor = joblib.load(MODEL)

expected_features = list(
    preprocessor.feature_names_in_
)

available_features = [
    f for f in expected_features
    if f in df.columns
]

missing_features = [
    f for f in expected_features
    if f not in df.columns
]


# ------------------------------------------------------------
# Save
# ------------------------------------------------------------

df.to_csv(
    OUTPUT,
    index=False
)


# ------------------------------------------------------------
# Audit
# ------------------------------------------------------------

audit_rows = []

for feature in expected_features:

    if feature in df.columns:

        if feature in [
            "geo_age",
            "geo_supergroup",
            "geo_group",
            "geo_formation",
            "geo_lithology",
            "geo_intrusive",
            "geo_stratigraphy",
        ]:
            source = "coarse_NGDR_2M"

        elif feature == "BSI":
            source = "derived_Sentinel2"

        elif feature in [
            "Sausar_Group_Proxy",
            "Metamorphic_Host_Proxy",
            "Geology_Unknown",
        ]:
            source = "coarse_NGDR_2M"

        elif feature in [
            "Geo_Boundary_Distance_km",
            "Geo_Boundary_Density_1km",
            "Geo_Boundary_Density_3km",
            "Lithology_Diversity_3km",
            "Formation_Diversity_3km",
        ]:
            source = "NOT_AVAILABLE"

        else:
            source = "detailed_GEE"

        available = True

    else:

        source = "NOT_AVAILABLE"
        available = False

    audit_rows.append(
        {
            "feature": feature,
            "available": available,
            "source": source,
        }
    )


audit = pd.DataFrame(audit_rows)

audit.to_csv(
    AUDIT_OUTPUT,
    index=False
)


# ------------------------------------------------------------
# Final report
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("DETAILED ZONE ENRICHMENT COMPLETE")
print("=" * 70)

print(f"\nOutput: {OUTPUT}")
print(f"Rows: {len(df):,}")
print(f"Columns: {len(df.columns)}")

print(
    f"\nExpected model raw features: "
    f"{len(expected_features)}"
)

print(
    f"Available: "
    f"{len(available_features)}"
)

print(
    f"Still missing: "
    f"{len(missing_features)}"
)

if missing_features:

    print("\nStill-missing model features:")

    for feature in missing_features:
        print(f"  - {feature}")

else:

    print("\nALL RAW MODEL FEATURES AVAILABLE.")


print(f"\nFeature audit: {AUDIT_OUTPUT}")