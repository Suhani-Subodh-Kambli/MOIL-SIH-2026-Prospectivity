"""
MOIL SIH 2026
India-wide candidate screening map
"""

from pathlib import Path

import pandas as pd
import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_scores.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_map.png"
)


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE CANDIDATE MAP")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/score_indiawide_candidates.py"
        )

    df = pd.read_csv(INPUT)

    df["latitude"] = pd.to_numeric(
        df["latitude"],
        errors="coerce"
    )

    df["longitude"] = pd.to_numeric(
        df["longitude"],
        errors="coerce"
    )

    df["Prospectivity_Screening_Score"] = pd.to_numeric(
        df["Prospectivity_Screening_Score"],
        errors="coerce"
    )

    df = df.dropna(
        subset=[
            "latitude",
            "longitude",
            "Prospectivity_Screening_Score",
        ]
    )

    print("Rows:", len(df))

    plt.figure(figsize=(14, 10))

    scatter = plt.scatter(
        df["longitude"],
        df["latitude"],
        c=df["Prospectivity_Screening_Score"],
        s=3,
        alpha=0.65,
        cmap="viridis"
    )

    plt.colorbar(
        scatter,
        label="Prospectivity Screening Score (0–100)"
    )

    plt.xlabel("Longitude")
    plt.ylabel("Latitude")

    plt.title(
        "MOIL SIH 2026 — India-wide Manganese "
        "Prospectivity Screening"
    )

    plt.grid(
        alpha=0.2
    )

    plt.tight_layout()

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    plt.savefig(
        OUTPUT,
        dpi=200,
        bbox_inches="tight"
    )

    plt.close()

    print("\nMap saved:")
    print(OUTPUT)


if __name__ == "__main__":
    main()