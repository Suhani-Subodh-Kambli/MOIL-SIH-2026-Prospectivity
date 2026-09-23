"""
MOIL SIH 2026
India-wide geology attachment

Purpose:
    Attach coarse NGDR 1:2M geological information to the India-wide
    remote-sensing + occurrence screening grid.

Important:
    This is a coarse screening approximation using 0.10-degree spatial bins.
    It is NOT a precise polygon intersection.
"""

from pathlib import Path
import pandas as pd
import numpy as np


ROOT = Path(__file__).resolve().parents[1]

INPUT_SCREENING = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_occurrence_evidence.csv"
)

INPUT_GEOLOGY = (
    ROOT / "data" / "indiawide" / "geology" /
    "india_geology_2m_summary.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_geology_features.csv"
)

GRID_SIZE = 0.10


def find_column(df, candidates):
    lookup = {str(c).strip().lower(): c for c in df.columns}

    for candidate in candidates:
        key = candidate.strip().lower()
        if key in lookup:
            return lookup[key]

    return None


def normalize_text(value):
    if pd.isna(value):
        return "UNKNOWN"

    text = str(value).strip()

    if not text or text.lower() in {
        "nan",
        "none",
        "null",
        "unknown",
    }:
        return "UNKNOWN"

    return text.upper()


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE GEOLOGY ATTACHMENT")
    print("=" * 70)

    # ---------------------------------------------------------
    # 1. Check files
    # ---------------------------------------------------------

    if not INPUT_SCREENING.exists():
        raise FileNotFoundError(
            f"\nMissing screening file:\n{INPUT_SCREENING}\n\n"
            "Run first:\n"
            "python scripts/build_indiawide_occurrence_evidence.py"
        )

    if not INPUT_GEOLOGY.exists():
        raise FileNotFoundError(
            f"\nMissing geology summary:\n{INPUT_GEOLOGY}\n\n"
            "Run first:\n"
            "python scripts/prepare_indiawide_geology.py"
        )

    # ---------------------------------------------------------
    # 2. Load screening data
    # ---------------------------------------------------------

    print("\nLoading India-wide screening data...")

    screening = pd.read_csv(INPUT_SCREENING)

    print("Screening shape:", screening.shape)

    lat_col = find_column(
        screening,
        ["latitude", "lat", "LAT", "Latitude"]
    )

    lon_col = find_column(
        screening,
        ["longitude", "lon", "LON", "Longitude"]
    )

    if lat_col is None or lon_col is None:
        raise ValueError(
            "Could not find latitude/longitude columns in screening file."
        )

    screening["latitude"] = pd.to_numeric(
        screening[lat_col],
        errors="coerce"
    )

    screening["longitude"] = pd.to_numeric(
        screening[lon_col],
        errors="coerce"
    )

    screening = screening.dropna(
        subset=["latitude", "longitude"]
    ).copy()

    print("Valid screening rows:", len(screening))

    # ---------------------------------------------------------
    # 3. Load geology summary
    # ---------------------------------------------------------

    print("\nLoading NGDR geology summary...")

    geology = pd.read_csv(INPUT_GEOLOGY)

    print("Geology shape:", geology.shape)

    geo_lat = find_column(
        geology,
        ["latitude", "lat", "LAT", "Latitude"]
    )

    geo_lon = find_column(
        geology,
        ["longitude", "lon", "LON", "Longitude"]
    )

    if geo_lat is None or geo_lon is None:
        raise ValueError(
            "Could not find latitude/longitude columns in geology summary."
        )

    geology["latitude"] = pd.to_numeric(
        geology[geo_lat],
        errors="coerce"
    )

    geology["longitude"] = pd.to_numeric(
        geology[geo_lon],
        errors="coerce"
    )

    geology = geology.dropna(
        subset=["latitude", "longitude"]
    ).copy()

    print("Valid geology records:", len(geology))

    # ---------------------------------------------------------
    # 4. Normalize geology attributes
    # ---------------------------------------------------------

    geology_columns = [
        "age",
        "supergroup",
        "group_name",
        "formation",
        "lithologic",
        "sub_group",
        "intrusive",
        "stratigraphy_new",
    ]

    for column in geology_columns:
        if column not in geology.columns:
            geology[column] = "UNKNOWN"

        geology[column] = geology[column].apply(normalize_text)

    # ---------------------------------------------------------
    # 5. Create spatial bins
    # ---------------------------------------------------------

    print("\nCreating 0.10-degree spatial bins...")

    screening["lat_bin"] = (
        np.floor(screening["latitude"] / GRID_SIZE)
        * GRID_SIZE
    )

    screening["lon_bin"] = (
        np.floor(screening["longitude"] / GRID_SIZE)
        * GRID_SIZE
    )

    geology["lat_bin"] = (
        np.floor(geology["latitude"] / GRID_SIZE)
        * GRID_SIZE
    )

    geology["lon_bin"] = (
        np.floor(geology["longitude"] / GRID_SIZE)
        * GRID_SIZE
    )

    # ---------------------------------------------------------
    # 6. Select representative geology record per grid cell
    # ---------------------------------------------------------

    geology_features = [
        "age",
        "supergroup",
        "group_name",
        "formation",
        "lithologic",
        "sub_group",
        "intrusive",
        "stratigraphy_new",
    ]

    print("Building representative geology grid...")

    geology_grid = (
        geology
        .sort_values(["lat_bin", "lon_bin"])
        .groupby(
            ["lat_bin", "lon_bin"],
            as_index=False
        )
        .first()
    )

    geology_grid = geology_grid[
        ["lat_bin", "lon_bin"] + geology_features
    ]

    print(
        "Geology spatial cells:",
        len(geology_grid)
    )

    # ---------------------------------------------------------
    # 7. Attach geology
    # ---------------------------------------------------------

    print("\nAttaching geology to screening cells...")

    result = screening.merge(
        geology_grid,
        on=["lat_bin", "lon_bin"],
        how="left",
        suffixes=("", "_geo")
    )

    # ---------------------------------------------------------
    # 8. Handle missing geology
    # ---------------------------------------------------------

    for column in geology_features:

        if column not in result.columns:
            result[column] = "UNKNOWN"

        result[column] = (
            result[column]
            .fillna("UNKNOWN")
            .apply(normalize_text)
        )

    result["Geology_Unknown"] = (
        result["lithologic"].eq("UNKNOWN")
        .astype(int)
    )

    # ---------------------------------------------------------
    # 9. Remove helper columns
    # ---------------------------------------------------------

    result = result.drop(
        columns=["lat_bin", "lon_bin"],
        errors="ignore"
    )

    # ---------------------------------------------------------
    # 10. Save
    # ---------------------------------------------------------

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    result.to_csv(
        OUTPUT,
        index=False
    )

    # ---------------------------------------------------------
    # 11. Summary
    # ---------------------------------------------------------

    print("\n" + "=" * 70)
    print("GEOLOGY ATTACHMENT COMPLETE")
    print("=" * 70)

    print("Final shape:", result.shape)

    print(
        "Known geology:",
        int((result["Geology_Unknown"] == 0).sum())
    )

    print(
        "Unknown geology:",
        int((result["Geology_Unknown"] == 1).sum())
    )

    print("\nTop lithologies:")

    print(
        result["lithologic"]
        .value_counts()
        .head(15)
        .to_string()
    )

    print("\nTop geological groups:")

    print(
        result["group_name"]
        .value_counts()
        .head(15)
        .to_string()
    )

    print("\nOutput:")
    print(OUTPUT)


if __name__ == "__main__":
    main()