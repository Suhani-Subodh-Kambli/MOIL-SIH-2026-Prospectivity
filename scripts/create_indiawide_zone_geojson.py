"""
MOIL SIH 2026
Create dashboard-ready GeoJSON for India-wide candidate zones.

Creates point-based zone representations using the centroid of each
candidate zone.

These points represent exploration-priority zones, not deposits.
"""

from pathlib import Path
import json

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_zones.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_zones.geojson"
)


def clean_value(value):

    if pd.isna(value):
        return None

    if hasattr(value, "item"):
        return value.item()

    return value


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE ZONE GEOJSON")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/cluster_indiawide_candidates.py"
        )

    df = pd.read_csv(INPUT)

    required = [
        "center_latitude",
        "center_longitude",
        "zone_id",
    ]

    missing = [
        c for c in required
        if c not in df.columns
    ]

    if missing:
        raise ValueError(
            f"Missing columns: {missing}"
        )

    features = []

    for _, row in df.iterrows():

        properties = {}

        for column in df.columns:

            if column in [
                "center_latitude",
                "center_longitude",
            ]:
                continue

            properties[column] = clean_value(
                row[column]
            )

        feature = {
            "type": "Feature",

            "geometry": {
                "type": "Point",
                "coordinates": [
                    float(row["center_longitude"]),
                    float(row["center_latitude"]),
                ],
            },

            "properties": properties,
        }

        features.append(feature)

    geojson = {
        "type": "FeatureCollection",
        "features": features,
    }

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        OUTPUT,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            geojson,
            file,
            indent=2,
            ensure_ascii=False
        )

    print(
        "\nZones exported:",
        len(features)
    )

    print("\nOutput:")
    print(OUTPUT)


if __name__ == "__main__":
    main()