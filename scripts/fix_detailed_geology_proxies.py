from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.neighbors import BallTree


ROOT = Path(__file__).resolve().parents[1]

SAMPLES = ROOT / "outputs" / "indiawide" / "detailed_zone_samples.csv"
METRICS = ROOT / "outputs" / "indiawide" / "detailed_zone_geology_metrics.csv"
SUMMARY = ROOT / "data" / "indiawide" / "geology" / "india_geology_2m_summary.csv"

OUT = ROOT / "outputs" / "indiawide" / "detailed_zone_geology_fixed.csv"


# =========================================================
# CONFIG
# =========================================================

EARTH_RADIUS_KM = 6371.0088

NEAREST_MAX_KM = 10.0
DIVERSITY_RADIUS_KM = 3.0


# =========================================================
# LOAD
# =========================================================

print("Loading detailed samples...")
samples = pd.read_csv(SAMPLES)

print("Samples:", samples.shape)


print("Loading existing geometry metrics...")
metrics = pd.read_csv(METRICS)

print("Metrics:", metrics.shape)


print("Loading NGDR summary...")
geo = pd.read_csv(SUMMARY)

print("NGDR:", geo.shape)
print("Columns:", list(geo.columns))


# =========================================================
# CHECK GEOLOGY DATA
# =========================================================

required = [
    "latitude",
    "longitude",
    "age",
    "supergroup",
    "group_name",
    "formation",
    "lithologic",
    "stratigraphy_new",
]

missing = [
    c for c in required
    if c not in geo.columns
]

if missing:
    raise RuntimeError(
        f"Missing NGDR columns: {missing}"
    )


# =========================================================
# CLEAN GEOLOGY
# =========================================================

geo["latitude"] = pd.to_numeric(
    geo["latitude"],
    errors="coerce"
)

geo["longitude"] = pd.to_numeric(
    geo["longitude"],
    errors="coerce"
)

geo = geo.dropna(
    subset=["latitude", "longitude"]
).copy()

text_columns = [
    "age",
    "supergroup",
    "group_name",
    "formation",
    "lithologic",
    "stratigraphy_new",
]

for c in text_columns:
    geo[c] = (
        geo[c]
        .fillna("UNKNOWN")
        .astype(str)
        .str.strip()
    )

print("Valid geology records:", len(geo))


# =========================================================
# CLEAN SAMPLES
# =========================================================

samples["latitude"] = pd.to_numeric(
    samples["latitude"],
    errors="coerce"
)

samples["longitude"] = pd.to_numeric(
    samples["longitude"],
    errors="coerce"
)


# =========================================================
# MERGE EXISTING BOUNDARY METRICS
# =========================================================

metric_columns = [
    "zone_id",
    "latitude",
    "longitude",
    "Geo_Boundary_Distance_km",
    "Geo_Boundary_Density_1km",
    "Geo_Boundary_Density_3km",
]

metric_columns = [
    c for c in metric_columns
    if c in metrics.columns
]

df = samples.merge(
    metrics[metric_columns],
    on=["zone_id", "latitude", "longitude"],
    how="left",
    suffixes=("", "_metric")
)

print("Merged dataset:", df.shape)


# =========================================================
# BUILD BALL TREE
# =========================================================

print("Building Haversine spatial index...")

geo_coords = np.radians(
    geo[
        ["latitude", "longitude"]
    ].to_numpy()
)

sample_coords = np.radians(
    df[
        ["latitude", "longitude"]
    ].to_numpy()
)

tree = BallTree(
    geo_coords,
    metric="haversine"
)


# =========================================================
# NEAREST GEOLOGY
# =========================================================

print("Finding nearest geology records...")

nearest_distance_rad, nearest_index = tree.query(
    sample_coords,
    k=1
)

nearest_distance_km = (
    nearest_distance_rad[:, 0]
    * EARTH_RADIUS_KM
)

nearest_index = nearest_index[:, 0]

nearest_valid = (
    nearest_distance_km <= NEAREST_MAX_KM
)

print(
    "Samples with geology within",
    NEAREST_MAX_KM,
    "km:",
    int(nearest_valid.sum()),
    "/",
    len(df)
)


# =========================================================
# DIRECT GEOLOGY ATTRIBUTES
# =========================================================

geo_fields = [
    "age",
    "supergroup",
    "group_name",
    "formation",
    "lithologic",
    "stratigraphy_new",
]

for field in geo_fields:

    values = np.full(
        len(df),
        "UNKNOWN",
        dtype=object
    )

    values[nearest_valid] = geo.iloc[
        nearest_index[nearest_valid]
    ][field].to_numpy()

    df[field] = values


# =========================================================
# MODEL COLUMN NAMES
# =========================================================

df["geo_age"] = df["age"]

df["geo_supergroup"] = df["supergroup"]

df["geo_group"] = df["group_name"]

df["geo_formation"] = df["formation"]

df["geo_lithology"] = df["lithologic"]

df["geo_stratigraphy"] = df["stratigraphy_new"]


# =========================================================
# 3 KM GEOLOGICAL DIVERSITY
# =========================================================

print(
    "Calculating geological diversity within",
    DIVERSITY_RADIUS_KM,
    "km..."
)

radius_rad = (
    DIVERSITY_RADIUS_KM
    / EARTH_RADIUS_KM
)

neighbor_lists = tree.query_radius(
    sample_coords,
    r=radius_rad
)


lithology_diversity = np.zeros(
    len(df),
    dtype=np.int16
)

formation_diversity = np.zeros(
    len(df),
    dtype=np.int16
)


for i, indices in enumerate(neighbor_lists):

    if len(indices) == 0:
        continue

    part = geo.iloc[indices]

    lithologies = set(
        x
        for x in part["lithologic"]
        if x not in ("UNKNOWN", "", "nan")
    )

    formations = set(
        x
        for x in part["formation"]
        if x not in ("UNKNOWN", "", "nan")
    )

    lithology_diversity[i] = len(
        lithologies
    )

    formation_diversity[i] = len(
        formations
    )


df["Lithology_Diversity_3km"] = (
    lithology_diversity
)

df["Formation_Diversity_3km"] = (
    formation_diversity
)


# =========================================================
# GEOLOGY UNKNOWN
# =========================================================

categorical_fields = [
    "geo_age",
    "geo_supergroup",
    "geo_group",
    "geo_formation",
    "geo_lithology",
    "geo_stratigraphy",
]

df["Geology_Unknown"] = (
    df[categorical_fields]
    .eq("UNKNOWN")
    .all(axis=1)
    .astype(int)
)


# =========================================================
# NUMERIC CLEANUP
# =========================================================

numeric_fields = [
    "Geo_Boundary_Distance_km",
    "Geo_Boundary_Density_1km",
    "Geo_Boundary_Density_3km",
    "Lithology_Diversity_3km",
    "Formation_Diversity_3km",
]

for c in numeric_fields:

    if c not in df.columns:
        df[c] = np.nan

    df[c] = pd.to_numeric(
        df[c],
        errors="coerce"
    )


# =========================================================
# SAVE
# =========================================================

df.to_csv(
    OUT,
    index=False
)


# =========================================================
# REPORT
# =========================================================

print()
print("=" * 55)
print("CORRECTED GEOLOGY DATASET")
print("=" * 55)

print("Output:", OUT)

print("Shape:", df.shape)

print()
print(
    "Nearest geology coverage:",
    f"{nearest_valid.mean() * 100:.2f}%"
)

print()
print("Diversity statistics:")

print(
    df[
        [
            "Lithology_Diversity_3km",
            "Formation_Diversity_3km",
        ]
    ].describe()
)

print()
print(
    "Non-zero lithology diversity:",
    int(
        (
            df["Lithology_Diversity_3km"] > 0
        ).sum()
    )
)

print(
    "Non-zero formation diversity:",
    int(
        (
            df["Formation_Diversity_3km"] > 0
        ).sum()
    )
)

print()
print("Top lithologies:")

print(
    df["geo_lithology"]
    .value_counts()
    .head(15)
)

print()
print("Top formations:")

print(
    df["geo_formation"]
    .value_counts()
    .head(15)
)

print()
print(
    "Geology unknown:",
    f"{df['Geology_Unknown'].mean() * 100:.2f}%"
)

print()
print("=" * 55)
print("DONE")
print("=" * 55)