"""
MOIL SIH 2026
India-wide candidate-zone clustering

Converts high-scoring screening cells into spatially coherent
candidate exploration zones.

Important:
    These are exploration-priority zones, NOT confirmed manganese reserves.
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_scores.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_zones.csv"
)


# ------------------------------------------------------------
# SETTINGS
# ------------------------------------------------------------

# Only cluster the top 10% of screening cells.
SCORE_THRESHOLD = 90.0

# Approximate spatial clustering radius.
# 0.30 degrees is roughly 30 km at Indian latitudes.
CLUSTER_RADIUS_KM = 30.0

# Minimum high-score cells required to form a zone.
MIN_SAMPLES = 3


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE CANDIDATE-ZONE CLUSTERING")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/score_indiawide_candidates.py"
        )

    df = pd.read_csv(INPUT)

    print("\nInput rows:", len(df))

    required = [
        "latitude",
        "longitude",
        "Prospectivity_Screening_Score",
    ]

    missing = [
        c for c in required
        if c not in df.columns
    ]

    if missing:
        raise ValueError(
            f"Missing required columns: {missing}"
        )

    # ---------------------------------------------------------
    # Numeric conversion
    # ---------------------------------------------------------

    for column in required:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    df = df.dropna(
        subset=required
    ).copy()

    # ---------------------------------------------------------
    # Select high-priority cells
    # ---------------------------------------------------------

    candidates = df[
        df["Prospectivity_Screening_Score"]
        >= SCORE_THRESHOLD
    ].copy()

    print(
        "High-score candidate cells:",
        len(candidates)
    )

    if len(candidates) < MIN_SAMPLES:
        raise ValueError(
            "Not enough high-score cells for clustering."
        )

    # ---------------------------------------------------------
    # Convert coordinates to approximate km
    # ---------------------------------------------------------

    mean_lat = candidates["latitude"].mean()

    lat_km = 111.0

    lon_km = 111.0 * np.cos(
        np.radians(mean_lat)
    )

    coordinates = np.column_stack(
        [
            candidates["longitude"] * lon_km,
            candidates["latitude"] * lat_km,
        ]
    )

    # ---------------------------------------------------------
    # DBSCAN
    # ---------------------------------------------------------

    print(
        f"\nClustering radius: "
        f"{CLUSTER_RADIUS_KM} km"
    )

    clustering = DBSCAN(
        eps=CLUSTER_RADIUS_KM,
        min_samples=MIN_SAMPLES,
        metric="euclidean"
    )

    labels = clustering.fit_predict(
        coordinates
    )

    candidates["cluster_id"] = labels

    # Remove DBSCAN noise.
    candidates = candidates[
        candidates["cluster_id"] >= 0
    ].copy()

    print(
        "Clustered candidate cells:",
        len(candidates)
    )

    if candidates.empty:

        print(
            "\nNo spatially coherent clusters found."
        )

        empty = pd.DataFrame()

        empty.to_csv(
            OUTPUT,
            index=False
        )

        return

    # ---------------------------------------------------------
    # Build zone summaries
    # ---------------------------------------------------------

    zones = []

    for cluster_id, group in candidates.groupby(
        "cluster_id"
    ):

        zone = {
            "zone_id":
                f"INDIA_ZONE_{int(cluster_id) + 1:03d}",

            "cluster_id":
                int(cluster_id),

            "cell_count":
                len(group),

            "center_latitude":
                group["latitude"].mean(),

            "center_longitude":
                group["longitude"].mean(),

            "max_score":
                group[
                    "Prospectivity_Screening_Score"
                ].max(),

            "mean_score":
                group[
                    "Prospectivity_Screening_Score"
                ].mean(),

            "median_score":
                group[
                    "Prospectivity_Screening_Score"
                ].median(),
        }

        # -----------------------------------------------------
        # Optional evidence summaries
        # -----------------------------------------------------

        for column in [
            "Geological_Score",
            "Remote_Sensing_Score",
            "Spectral_Score",
            "Radar_Score",
            "Terrain_Score",
            "Occurrence_Evidence",
        ]:

            if column in group.columns:

                zone[
                    f"mean_{column}"
                ] = group[column].mean()

        # -----------------------------------------------------
        # Most common geology
        # -----------------------------------------------------

        for column in [
            "state",
            "group_name",
            "formation",
            "lithologic",
            "age",
        ]:

            if column in group.columns:

                mode = (
                    group[column]
                    .dropna()
                    .astype(str)
                    .mode()
                )

                if len(mode) > 0:
                    zone[
                        f"dominant_{column}"
                    ] = mode.iloc[0]

        zones.append(zone)

    zones = pd.DataFrame(zones)

    # ---------------------------------------------------------
    # Zone density / priority
    # ---------------------------------------------------------

    zones["zone_density"] = (
        zones["cell_count"]
        /
        zones["cell_count"].max()
    )

    # Keep the score itself as the main ranking quantity.
    zones = zones.sort_values(
        [
            "max_score",
            "mean_score",
            "cell_count",
        ],
        ascending=False
    ).reset_index(drop=True)

    zones["zone_rank"] = (
        zones.index + 1
    )

    # ---------------------------------------------------------
    # Save
    # ---------------------------------------------------------

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    zones.to_csv(
        OUTPUT,
        index=False
    )

    # ---------------------------------------------------------
    # Summary
    # ---------------------------------------------------------

    print("\n" + "=" * 70)
    print("CANDIDATE-ZONE CLUSTERING COMPLETE")
    print("=" * 70)

    print(
        "Candidate cells:",
        len(candidates)
    )

    print(
        "Candidate zones:",
        len(zones)
    )

    print("\nTop zones:")

    display_columns = [
        "zone_rank",
        "zone_id",
        "cell_count",
        "center_latitude",
        "center_longitude",
        "max_score",
        "mean_score",
    ]

    available = [
        c for c in display_columns
        if c in zones.columns
    ]

    print(
        zones[available]
        .head(20)
        .to_string(index=False)
    )

    print("\nOutput:")
    print(OUTPUT)


if __name__ == "__main__":
    main()