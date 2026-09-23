"""
MOIL SIH 2026
Select priority exploration zones for detailed analysis.

Input:
    India-wide clustered candidate zones

Output:
    A compact list of priority zones that will be processed using
    higher-resolution remote sensing and detailed geological analysis.

These are exploration-priority zones, not confirmed deposits.
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
    "indiawide_priority_zones.csv"
)


# Number of zones to send to detailed processing.
TOP_ZONES = 25


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE PRIORITY ZONE SELECTION")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/cluster_indiawide_candidates.py"
        )

    df = pd.read_csv(INPUT)

    print("\nCandidate zones:", len(df))

    required = [
        "zone_id",
        "center_latitude",
        "center_longitude",
        "max_score",
        "mean_score",
        "cell_count",
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
    # Numeric conversion
    # ---------------------------------------------------------

    numeric_columns = [
        "center_latitude",
        "center_longitude",
        "max_score",
        "mean_score",
        "cell_count",
    ]

    for column in numeric_columns:

        df[column] = pd.to_numeric(
            df[column],
            errors="coerce"
        )

    df = df.dropna(
        subset=numeric_columns
    ).copy()

    # ---------------------------------------------------------
    # Rank zones
    # ---------------------------------------------------------

    df = df.sort_values(
        [
            "max_score",
            "mean_score",
            "cell_count",
        ],
        ascending=False
    ).reset_index(drop=True)

    # ---------------------------------------------------------
    # Select top zones
    # ---------------------------------------------------------

    selected = df.head(
        TOP_ZONES
    ).copy()

    selected["priority_rank"] = (
        selected.index + 1
    )

    selected["priority_class"] = "HIGH"

    # ---------------------------------------------------------
    # Add processing radius
    # ---------------------------------------------------------

    # Each selected zone gets a 25 km analysis window.
    selected["analysis_radius_km"] = 25

    # ---------------------------------------------------------
    # Save
    # ---------------------------------------------------------

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    selected.to_csv(
        OUTPUT,
        index=False
    )

    print("\n" + "=" * 70)
    print("PRIORITY ZONE SELECTION COMPLETE")
    print("=" * 70)

    print(
        "Selected zones:",
        len(selected)
    )

    print("\nSelected zones:")

    display_columns = [
        "priority_rank",
        "zone_id",
        "center_latitude",
        "center_longitude",
        "max_score",
        "mean_score",
        "cell_count",
        "analysis_radius_km",
    ]

    available = [
        c for c in display_columns
        if c in selected.columns
    ]

    print(
        selected[available]
        .to_string(index=False)
    )

    print("\nOutput:")
    print(OUTPUT)


if __name__ == "__main__":
    main()