"""
MOIL SIH 2026
Generate a human-readable India-wide exploration-zone report.
"""

from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_zones.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_exploration_zone_report.csv"
)


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE EXPLORATION ZONE REPORT")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/cluster_indiawide_candidates.py"
        )

    df = pd.read_csv(INPUT)

    report = pd.DataFrame()

    report["Zone_ID"] = df["zone_id"]

    report["Zone_Rank"] = df["zone_rank"]

    report["Center_Latitude"] = (
        df["center_latitude"]
    )

    report["Center_Longitude"] = (
        df["center_longitude"]
    )

    report["Candidate_Cell_Count"] = (
        df["cell_count"]
    )

    report["Maximum_Prospectivity_Score"] = (
        df["max_score"]
    )

    report["Mean_Prospectivity_Score"] = (
        df["mean_score"]
    )

    report["Median_Prospectivity_Score"] = (
        df["median_score"]
    )

    if "mean_Geological_Score" in df.columns:

        report["Mean_Geological_Score"] = (
            df["mean_Geological_Score"]
        )

    if "mean_Remote_Sensing_Score" in df.columns:

        report["Mean_Remote_Sensing_Score"] = (
            df["mean_Remote_Sensing_Score"]
        )

    if "mean_Terrain_Score" in df.columns:

        report["Mean_Terrain_Score"] = (
            df["mean_Terrain_Score"]
        )

    if "mean_Occurrence_Evidence" in df.columns:

        report["Mean_Occurrence_Evidence"] = (
            df["mean_Occurrence_Evidence"]
        )

    # ---------------------------------------------------------
    # Dominant geology
    # ---------------------------------------------------------

    geology_columns = [
        "dominant_group_name",
        "dominant_formation",
        "dominant_lithologic",
        "dominant_age",
    ]

    for column in geology_columns:

        if column in df.columns:

            report[
                column.replace(
                    "dominant_",
                    "Dominant_"
                )
            ] = df[column]

    # ---------------------------------------------------------
    # Save
    # ---------------------------------------------------------

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    report.to_csv(
        OUTPUT,
        index=False
    )

    print("\nZones:", len(report))

    print("\nTop 20 exploration zones:")

    print(
        report.head(20)
        .to_string(index=False)
    )

    print("\nOutput:")
    print(OUTPUT)


if __name__ == "__main__":
    main()