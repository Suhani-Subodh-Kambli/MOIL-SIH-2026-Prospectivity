from pathlib import Path
import math
import pandas as pd


# ============================================================
# MOIL SIH 2026
# INDIA-WIDE MANGANESE OCCURRENCE EVIDENCE
# ============================================================

BASE = Path(__file__).resolve().parents[1]

SCREENING_FILE = (
    BASE
    / "outputs"
    / "indiawide"
    / "indiawide_remote_sensing_features.csv"
)

GSI_FILE = (
    BASE
    / "data"
    / "indiawide"
    / "occurrences"
    / "Manganese_Ore_1.xls"
)

OUTPUT_FILE = (
    BASE
    / "outputs"
    / "indiawide"
    / "indiawide_occurrence_evidence.csv"
)


print("=" * 70)
print("MOIL INDIA-WIDE MANGANESE OCCURRENCE EVIDENCE")
print("=" * 70)


# ============================================================
# CHECK INPUTS
# ============================================================

if not SCREENING_FILE.exists():

    raise FileNotFoundError(
        f"""
India-wide screening file not found:

{SCREENING_FILE}

First run:

python scripts\\merge_indiawide_tiles.py
"""
    )


if not GSI_FILE.exists():

    raise FileNotFoundError(
        f"""
GSI manganese file not found:

{GSI_FILE}
"""
    )


# ============================================================
# LOAD SCREENING
# ============================================================

print()
print("Loading India-wide screening data...")

df = pd.read_csv(
    SCREENING_FILE
)

print(
    f"Screening rows: {len(df):,}"
)


# ============================================================
# CHECK SCREENING COORDINATES
# ============================================================

required = {
    "longitude",
    "latitude"
}

missing = required - set(
    df.columns
)

if missing:

    raise ValueError(
        f"Missing screening columns: {missing}"
    )


df["longitude"] = pd.to_numeric(
    df["longitude"],
    errors="coerce"
)

df["latitude"] = pd.to_numeric(
    df["latitude"],
    errors="coerce"
)

df = df.dropna(
    subset=[
        "longitude",
        "latitude"
    ]
)


# ============================================================
# LOAD GSI
# ============================================================

print()
print("Loading GSI manganese occurrences...")

gsi = pd.read_excel(
    GSI_FILE,
    engine="xlrd"
)

print(
    f"GSI rows: {len(gsi):,}"
)

print(
    "GSI columns:"
)

print(
    list(gsi.columns)
)


# ============================================================
# FIND LAT/LON COLUMNS
# ============================================================

lat_candidates = [
    "LATDD",
    "LAT_DD",
    "LATITUDE",
    "Latitude",
    "latitude"
]

lon_candidates = [
    "LONDD",
    "LON_DD",
    "LONGITUDE",
    "Longitude",
    "longitude"
]


lat_col = None
lon_col = None


for column in lat_candidates:

    if column in gsi.columns:

        lat_col = column
        break


for column in lon_candidates:

    if column in gsi.columns:

        lon_col = column
        break


if lat_col is None or lon_col is None:

    raise ValueError(
        f"""
Could not find latitude/longitude columns.

Available columns:

{list(gsi.columns)}
"""
    )


print()
print(
    f"Latitude column : {lat_col}"
)

print(
    f"Longitude column: {lon_col}"
)


# ============================================================
# CLEAN GSI COORDINATES
# ============================================================

gsi[lat_col] = pd.to_numeric(
    gsi[lat_col],
    errors="coerce"
)

gsi[lon_col] = pd.to_numeric(
    gsi[lon_col],
    errors="coerce"
)

gsi = gsi.dropna(
    subset=[
        lat_col,
        lon_col
    ]
)


# India bounding box

gsi = gsi[
    gsi[lat_col].between(6, 37)
    &
    gsi[lon_col].between(68, 97)
].copy()


print(
    f"Valid India occurrences: {len(gsi):,}"
)


if len(gsi) == 0:

    raise ValueError(
        "No valid GSI manganese coordinates found."
    )


# ============================================================
# HAVERSINE DISTANCE
# ============================================================

def haversine_km(
    lat1,
    lon1,
    lat2,
    lon2
):

    radius = 6371.0088

    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)

    delta_lat = math.radians(
        lat2
        - math.degrees(lat1)
    )

    delta_lon = math.radians(
        lon2
        - math.degrees(
            math.radians(lon1)
        )
    )

    a = (
        math.sin(delta_lat / 2) ** 2
        +
        math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    return (
        2
        * radius
        * math.asin(
            math.sqrt(a)
        )
    )


# ============================================================
# OCCURRENCE COORDINATES
# ============================================================

occurrences = list(
    zip(
        gsi[lat_col].tolist(),
        gsi[lon_col].tolist()
    )
)


# ============================================================
# FIND NEAREST OCCURRENCE
# ============================================================

print()
print(
    "Calculating nearest manganese occurrence..."
)

distances = []

for index, row in df.iterrows():

    lat = float(
        row["latitude"]
    )

    lon = float(
        row["longitude"]
    )

    nearest = min(
        haversine_km(
            lat,
            lon,
            occurrence_lat,
            occurrence_lon
        )
        for occurrence_lat,
        occurrence_lon
        in occurrences
    )

    distances.append(
        nearest
    )

    if len(distances) % 10000 == 0:

        print(
            f"Processed: {len(distances):,}"
        )


df["Distance_Mn_km"] = distances


# ============================================================
# OCCURRENCE EVIDENCE FLAGS
# ============================================================

df["Within_10km_Mn"] = (
    df["Distance_Mn_km"] <= 10
).astype(int)

df["Within_25km_Mn"] = (
    df["Distance_Mn_km"] <= 25
).astype(int)

df["Within_50km_Mn"] = (
    df["Distance_Mn_km"] <= 50
).astype(int)


# ============================================================
# SAVE
# ============================================================

OUTPUT_FILE.parent.mkdir(
    parents=True,
    exist_ok=True
)

df.to_csv(
    OUTPUT_FILE,
    index=False
)


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 70)
print("COMPLETE")
print("=" * 70)

print(
    f"Output rows: {len(df):,}"
)

print(
    f"Nearest distance min: "
    f"{df['Distance_Mn_km'].min():.2f} km"
)

print(
    f"Nearest distance max: "
    f"{df['Distance_Mn_km'].max():.2f} km"
)

print(
    f"Within 10 km: "
    f"{df['Within_10km_Mn'].sum():,}"
)

print(
    f"Within 25 km: "
    f"{df['Within_25km_Mn'].sum():,}"
)

print(
    f"Within 50 km: "
    f"{df['Within_50km_Mn'].sum():,}"
)

print()
print(
    f"Saved:\n{OUTPUT_FILE}"
)