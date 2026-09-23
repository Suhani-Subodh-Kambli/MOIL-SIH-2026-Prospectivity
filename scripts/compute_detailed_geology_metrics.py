"""
MOIL SIH 2026
Compute geological spatial metrics for detailed India-wide zones.

Uses ACTUAL NGDR 1:2M polygon geometries.

Creates:
    Geo_Boundary_Distance_km
    Geo_Boundary_Density_1km
    Geo_Boundary_Density_3km
    Lithology_Diversity_3km
    Formation_Diversity_3km

Input:
    outputs/indiawide/detailed_zone_enriched_features.csv
    data/indiawide/geology/NGDR_Geology_2M.geojsonl

Output:
    outputs/indiawide/detailed_zone_geology_metrics.csv
"""

from pathlib import Path
import json
import math
import re
import time

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

SAMPLES_FILE = (
    ROOT
    / "outputs"
    / "indiawide"
    / "detailed_zone_enriched_features.csv"
)

GEOLOGY_FILE = (
    ROOT
    / "data"
    / "indiawide"
    / "geology"
    / "NGDR_Geology_2M.geojsonl"
)

OUTPUT_FILE = (
    ROOT
    / "outputs"
    / "indiawide"
    / "detailed_zone_geology_metrics.csv"
)


# ------------------------------------------------------------
# Configuration
# ------------------------------------------------------------

# Detailed samples are around 3 x 25 km zones.
# We only need geology around those zones.

SEARCH_RADIUS_KM = 5.0

DENSITY_RADIUS_1KM = 1.0
DENSITY_RADIUS_3KM = 3.0

# Approximate km per degree.
KM_PER_DEG_LAT = 111.32

# Spatial index cell size.
GRID_SIZE_DEG = 0.05


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

def haversine_km(lat1, lon1, lat2, lon2):
    """
    Vector-friendly haversine distance.
    """
    R = 6371.0088

    lat1 = np.radians(lat1)
    lat2 = np.radians(lat2)

    dlat = lat2 - lat1
    dlon = np.radians(lon2) - np.radians(lon1)

    a = (
        np.sin(dlat / 2.0) ** 2
        +
        np.cos(lat1)
        * np.cos(lat2)
        * np.sin(dlon / 2.0) ** 2
    )

    return 2.0 * R * np.arcsin(
        np.sqrt(np.clip(a, 0, 1))
    )


def geometry_vertices(geometry):
    """
    Extract polygon boundary vertices from GeoJSON geometry.

    Supports:
        Polygon
        MultiPolygon
    """

    if not geometry:
        return []

    geom_type = geometry.get("type")
    coords = geometry.get("coordinates")

    if coords is None:
        return []

    vertices = []

    if geom_type == "Polygon":

        for ring in coords:
            for point in ring:
                if len(point) >= 2:
                    vertices.append(
                        (float(point[0]), float(point[1]))
                    )

    elif geom_type == "MultiPolygon":

        for polygon in coords:

            for ring in polygon:

                for point in ring:

                    if len(point) >= 2:
                        vertices.append(
                            (float(point[0]), float(point[1]))
                        )

    return vertices


def geometry_centroid(geometry):
    """
    Lightweight centroid approximation based on
    geometry vertices.

    This is used only for spatial indexing.
    """

    vertices = geometry_vertices(geometry)

    if not vertices:
        return None

    lon = np.mean([p[0] for p in vertices])
    lat = np.mean([p[1] for p in vertices])

    return lon, lat


def bbox_from_geometry(geometry):
    """
    Bounding box of polygon geometry.
    """

    vertices = geometry_vertices(geometry)

    if not vertices:
        return None

    lons = [p[0] for p in vertices]
    lats = [p[1] for p in vertices]

    return (
        min(lons),
        min(lats),
        max(lons),
        max(lats),
    )


def point_to_boundary_distance_km(
    lat,
    lon,
    vertices,
):
    """
    Approximate distance from a sample point to the
    nearest polygon boundary vertex.

    For this application the metric is used as a
    geological boundary proximity indicator.

    The final distance is therefore explicitly
    vertex-based rather than pretending to be an
    exact GIS point-to-line distance.
    """

    if not vertices:
        return np.nan

    lons = np.array(
        [v[0] for v in vertices],
        dtype=float,
    )

    lats = np.array(
        [v[1] for v in vertices],
        dtype=float,
    )

    distances = haversine_km(
        lat,
        lon,
        lats,
        lons,
    )

    return float(np.min(distances))


def normalize_text(value):
    if value is None:
        return "UNKNOWN"

    value = str(value).strip()

    if not value:
        return "UNKNOWN"

    return value.upper()


# ------------------------------------------------------------
# Start
# ------------------------------------------------------------

start_time = time.time()

print("=" * 70)
print("MOIL DETAILED GEOLOGICAL SPATIAL METRICS")
print("=" * 70)


# ------------------------------------------------------------
# Load detailed samples
# ------------------------------------------------------------

print("\nLoading detailed enriched samples...")

df = pd.read_csv(SAMPLES_FILE)

print(f"Samples: {df.shape}")

if "latitude" not in df.columns:
    raise RuntimeError("latitude column missing.")

if "longitude" not in df.columns:
    raise RuntimeError("longitude column missing.")

df["latitude"] = pd.to_numeric(
    df["latitude"],
    errors="coerce",
)

df["longitude"] = pd.to_numeric(
    df["longitude"],
    errors="coerce",
)

df = df.dropna(
    subset=["latitude", "longitude"]
).reset_index(drop=True)

print(
    f"Valid coordinates: {len(df):,}"
)


# ------------------------------------------------------------
# Determine detailed-zone extent
# ------------------------------------------------------------

min_lat = df["latitude"].min()
max_lat = df["latitude"].max()
min_lon = df["longitude"].min()
max_lon = df["longitude"].max()

# Convert 5 km to approximate degree padding.
lat_padding = SEARCH_RADIUS_KM / KM_PER_DEG_LAT

mean_lat = (
    df["latitude"].min()
    + df["latitude"].max()
) / 2.0

lon_km_per_degree = (
    KM_PER_DEG_LAT
    * math.cos(math.radians(mean_lat))
)

lon_padding = (
    SEARCH_RADIUS_KM
    / max(lon_km_per_degree, 1e-6)
)

query_min_lat = min_lat - lat_padding
query_max_lat = max_lat + lat_padding

query_min_lon = min_lon - lon_padding
query_max_lon = max_lon + lon_padding

print("\nDetailed-zone extent:")

print(
    f"Latitude : {min_lat:.5f} → {max_lat:.5f}"
)

print(
    f"Longitude: {min_lon:.5f} → {max_lon:.5f}"
)

print("\nGeology query extent:")

print(
    f"Latitude : {query_min_lat:.5f} → "
    f"{query_max_lat:.5f}"
)

print(
    f"Longitude: {query_min_lon:.5f} → "
    f"{query_max_lon:.5f}"
)


# ------------------------------------------------------------
# Read NGDR polygons
# ------------------------------------------------------------

print("\nReading NGDR polygon geometries...")

if not GEOLOGY_FILE.exists():
    raise FileNotFoundError(
        f"Missing geology file:\n{GEOLOGY_FILE}"
    )


polygons = []

processed = 0
kept = 0
invalid = 0

with open(
    GEOLOGY_FILE,
    "r",
    encoding="utf-8",
) as f:

    for line in f:

        line = line.strip()

        if not line:
            continue

        processed += 1

        try:
            obj = json.loads(line)

        except Exception:
            invalid += 1
            continue


        geometry = obj.get("geometry")

        if not geometry:
            invalid += 1
            continue


        bbox = bbox_from_geometry(geometry)

        if bbox is None:
            invalid += 1
            continue


        minx, miny, maxx, maxy = bbox


        # Bounding-box filter.
        if maxx < query_min_lon:
            continue

        if minx > query_max_lon:
            continue

        if maxy < query_min_lat:
            continue

        if miny > query_max_lat:
            continue


        props = obj.get(
            "properties",
            {}
        )


        vertices = geometry_vertices(
            geometry
        )

        if not vertices:
            continue


        # Store only required information.
        polygons.append(
            {
                "vertices": vertices,
                "bbox": bbox,
                "lithology": normalize_text(
                    props.get("lithologic")
                    or props.get("lithology")
                ),
                "formation": normalize_text(
                    props.get("formation")
                ),
            }
        )

        kept += 1


print(
    f"Processed NGDR records: {processed:,}"
)

print(
    f"Candidate polygons retained: {kept:,}"
)

print(
    f"Invalid/skipped records: {invalid:,}"
)


if not polygons:
    raise RuntimeError(
        "No NGDR polygons intersect the detailed-zone extent."
    )


# ------------------------------------------------------------
# Build spatial grid index
# ------------------------------------------------------------

print("\nBuilding polygon spatial index...")

spatial_index = {}


def cell_key(lat, lon):

    return (
        int(math.floor(lat / GRID_SIZE_DEG)),
        int(math.floor(lon / GRID_SIZE_DEG)),
    )


for poly_id, poly in enumerate(polygons):

    minx, miny, maxx, maxy = poly["bbox"]

    min_cell_lat = int(
        math.floor(miny / GRID_SIZE_DEG)
    )

    max_cell_lat = int(
        math.floor(maxy / GRID_SIZE_DEG)
    )

    min_cell_lon = int(
        math.floor(minx / GRID_SIZE_DEG)
    )

    max_cell_lon = int(
        math.floor(maxx / GRID_SIZE_DEG)
    )


    for ilat in range(
        min_cell_lat,
        max_cell_lat + 1,
    ):

        for ilon in range(
            min_cell_lon,
            max_cell_lon + 1,
        ):

            key = (ilat, ilon)

            if key not in spatial_index:
                spatial_index[key] = []

            spatial_index[key].append(
                poly_id
            )


print(
    f"Spatial index cells: "
    f"{len(spatial_index):,}"
)


# ------------------------------------------------------------
# Metrics calculation
# ------------------------------------------------------------

print("\nCalculating metrics for samples...")

print(
    "This uses actual NGDR polygon boundaries."
)

n = len(df)

boundary_distance = np.full(
    n,
    np.nan,
    dtype=float,
)

boundary_density_1km = np.zeros(
    n,
    dtype=float,
)

boundary_density_3km = np.zeros(
    n,
    dtype=float,
)

lithology_diversity_3km = np.zeros(
    n,
    dtype=float,
)

formation_diversity_3km = np.zeros(
    n,
    dtype=float,
)


# ------------------------------------------------------------
# Process samples
# ------------------------------------------------------------

progress_step = max(
    1,
    n // 20
)


for i in range(n):

    lat = float(
        df.iloc[i]["latitude"]
    )

    lon = float(
        df.iloc[i]["longitude"]
    )


    # Search cells covering approximately 5 km.
    lat_radius_deg = (
        SEARCH_RADIUS_KM
        / KM_PER_DEG_LAT
    )

    lon_radius_deg = (
        SEARCH_RADIUS_KM
        /
        max(
            KM_PER_DEG_LAT
            * math.cos(
                math.radians(lat)
            ),
            1e-6,
        )
    )


    min_cell_lat = int(
        math.floor(
            (lat - lat_radius_deg)
            / GRID_SIZE_DEG
        )
    )

    max_cell_lat = int(
        math.floor(
            (lat + lat_radius_deg)
            / GRID_SIZE_DEG
        )
    )

    min_cell_lon = int(
        math.floor(
            (lon - lon_radius_deg)
            / GRID_SIZE_DEG
        )
    )

    max_cell_lon = int(
        math.floor(
            (lon + lon_radius_deg)
            / GRID_SIZE_DEG
        )
    )


    candidate_ids = set()


    for ilat in range(
        min_cell_lat,
        max_cell_lat + 1,
    ):

        for ilon in range(
            min_cell_lon,
            max_cell_lon + 1,
        ):

            ids = spatial_index.get(
                (ilat, ilon)
            )

            if ids:
                candidate_ids.update(
                    ids
                )


    if not candidate_ids:
        continue


    distances = []

    lithologies = set()

    formations = set()


    for poly_id in candidate_ids:

        poly = polygons[poly_id]

        minx, miny, maxx, maxy = poly["bbox"]


        # Quick bbox rejection.
        if (
            lon < minx - lon_radius_deg
            or lon > maxx + lon_radius_deg
            or lat < miny - lat_radius_deg
            or lat > maxy + lat_radius_deg
        ):
            continue


        distance = point_to_boundary_distance_km(
            lat,
            lon,
            poly["vertices"],
        )


        if np.isfinite(distance):

            if distance <= SEARCH_RADIUS_KM:

                distances.append(
                    distance
                )

                if (
                    distance
                    <= DENSITY_RADIUS_1KM
                ):

                    boundary_density_1km[i] += 1

                if (
                    distance
                    <= DENSITY_RADIUS_3KM
                ):

                    boundary_density_3km[i] += 1

                    lithology = (
                        poly["lithology"]
                    )

                    formation = (
                        poly["formation"]
                    )

                    if lithology != "UNKNOWN":
                        lithologies.add(
                            lithology
                        )

                    if formation != "UNKNOWN":
                        formations.add(
                            formation
                        )


    if distances:

        boundary_distance[i] = min(
            distances
        )


    lithology_diversity_3km[i] = len(
        lithologies
    )

    formation_diversity_3km[i] = len(
        formations
    )


    if (
        i % progress_step == 0
        or i == n - 1
    ):

        percent = (
            (i + 1)
            / n
            * 100
        )

        print(
            f"Progress: "
            f"{percent:6.1f}% "
            f"({i + 1:,}/{n:,})"
        )


# ------------------------------------------------------------
# Attach metrics
# ------------------------------------------------------------

df["Geo_Boundary_Distance_km"] = (
    boundary_distance
)

df["Geo_Boundary_Density_1km"] = (
    boundary_density_1km
)

df["Geo_Boundary_Density_3km"] = (
    boundary_density_3km
)

df["Lithology_Diversity_3km"] = (
    lithology_diversity_3km
)

df["Formation_Diversity_3km"] = (
    formation_diversity_3km
)


# ------------------------------------------------------------
# Save
# ------------------------------------------------------------

df.to_csv(
    OUTPUT_FILE,
    index=False,
)


# ------------------------------------------------------------
# Statistics
# ------------------------------------------------------------

print("\n" + "=" * 70)
print("GEOLOGICAL SPATIAL METRICS COMPLETE")
print("=" * 70)

print(
    f"\nOutput: {OUTPUT_FILE}"
)

print(
    f"Rows: {len(df):,}"
)

print("\nMetric statistics:")

for col in [
    "Geo_Boundary_Distance_km",
    "Geo_Boundary_Density_1km",
    "Geo_Boundary_Density_3km",
    "Lithology_Diversity_3km",
    "Formation_Diversity_3km",
]:

    series = pd.to_numeric(
        df[col],
        errors="coerce"
    )

    print(
        f"\n{col}"
    )

    print(
        f"  Missing: "
        f"{series.isna().sum():,}"
    )

    print(
        f"  Min: "
        f"{series.min():.4f}"
    )

    print(
        f"  Median: "
        f"{series.median():.4f}"
    )

    print(
        f"  Mean: "
        f"{series.mean():.4f}"
    )

    print(
        f"  Max: "
        f"{series.max():.4f}"
    )


elapsed = time.time() - start_time

print(
    f"\nElapsed time: "
    f"{elapsed / 60:.2f} minutes"
)

print("\nDone.")