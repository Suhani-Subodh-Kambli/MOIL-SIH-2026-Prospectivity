"""
MOIL SIH 2026
Create Earth Engine analysis windows for priority zones.

Each priority zone receives a geographic bounding box.

The resulting CSV can be used to create detailed Sentinel-2,
Sentinel-1 and terrain analysis in Google Earth Engine.
"""

from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_priority_zones.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_zone_analysis_windows.csv"
)


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE ZONE ANALYSIS WINDOWS")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/select_indiawide_priority_zones.py"
        )

    df = pd.read_csv(INPUT)

    required = [
        "zone_id",
        "center_latitude",
        "center_longitude",
    ]

    missing = [
        c for c in required
        if c not in df.columns
    ]

    if missing:
        raise ValueError(
            f"Missing columns: {missing}"
        )

    # ---------------------------------------------------------
    # Convert to numeric
    # ---------------------------------------------------------

    for column in [
        "center_latitude",
        "center_longitude",
    ]:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    df = df.dropna(
        subset=[
            "center_latitude",
            "center_longitude",
        ]
    ).copy()

    # ---------------------------------------------------------
    # Analysis radius
    # ---------------------------------------------------------

    radius_km = 25

    if "analysis_radius_km" in df.columns:

        df["analysis_radius_km"] = pd.to_numeric(
            df["analysis_radius_km"],
            errors="coerce"
        )

        df["analysis_radius_km"] = (
            df["analysis_radius_km"]
            .fillna(radius_km)
        )

    else:

        df["analysis_radius_km"] = radius_km

    # Approximate conversion.
    # 1 degree latitude ≈ 111 km.
    df["lat_radius_deg"] = (
        df["analysis_radius_km"] / 111.0
    )

    # Longitude conversion depends on latitude.
    import numpy as np

    df["lon_radius_deg"] = (
        df["analysis_radius_km"]
        /
        (
            111.0
            *
            np.cos(
                np.radians(
                    df["center_latitude"]
                )
            )
        )
    )

    # ---------------------------------------------------------
    # Bounding boxes
    # ---------------------------------------------------------

    df["min_latitude"] = (
        df["center_latitude"]
        - df["lat_radius_deg"]
    )

    df["max_latitude"] = (
        df["center_latitude"]
        + df["lat_radius_deg"]
    )

    df["min_longitude"] = (
        df["center_longitude"]
        - df["lon_radius_deg"]
    )

    df["max_longitude"] = (
        df["center_longitude"]
        + df["lon_radius_deg"]
    )

    # ---------------------------------------------------------
    # Create EE rectangle string
    # ---------------------------------------------------------

    def make_rectangle(row):

        return (
            "ee.Geometry.Rectangle(["
            f"{row['min_longitude']:.6f}, "
            f"{row['min_latitude']:.6f}, "
            f"{row['max_longitude']:.6f}, "
            f"{row['max_latitude']:.6f}"
            "])"
        )

    df["gee_geometry"] = df.apply(
        make_rectangle,
        axis=1
    )

    # ---------------------------------------------------------
    # Save
    # ---------------------------------------------------------

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    df.to_csv(
        OUTPUT,
        index=False
    )

    print("\n" + "=" * 70)
    print("ZONE WINDOWS CREATED")
    print("=" * 70)

    print(
        "Zones:",
        len(df)
    )

    print("\nExample:")

    print(
        df[
            [
                "zone_id",
                "center_latitude",
                "center_longitude",
                "min_latitude",
                "max_latitude",
                "min_longitude",
                "max_longitude",
            ]
        ]
        .head(10)
        .to_string(index=False)
    )

    print("\nOutput:")
    print(OUTPUT)


if __name__ == "__main__":
    main()