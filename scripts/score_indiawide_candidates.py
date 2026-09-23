"""
MOIL SIH 2026
India-wide manganese prospectivity screening

This is a coarse national screening layer.

It does NOT apply the Balaghat 117-feature XGBoost model directly.
The Balaghat model requires detailed geology/features that are not yet
available consistently across India.

This stage creates a transparent screening score from:
    - spectral alteration indicators
    - radar indicators
    - terrain
    - coarse geological evidence
    - occurrence evidence kept separately

Occurrence proximity is NOT included in the base screening score.
"""

from pathlib import Path
import pandas as pd
import numpy as np


ROOT = Path(__file__).resolve().parents[1]

INPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_geology_features.csv"
)

OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_candidate_scores.csv"
)

TOP_OUTPUT = (
    ROOT / "outputs" / "indiawide" /
    "indiawide_top_candidates.csv"
)


def numeric(df, column):
    if column not in df.columns:
        return pd.Series(
            np.nan,
            index=df.index
        )

    return pd.to_numeric(
        df[column],
        errors="coerce"
    )


def minmax(series):
    series = series.astype(float)

    valid = series.dropna()

    if len(valid) == 0:
        return pd.Series(
            0.5,
            index=series.index
        )

    low = valid.quantile(0.02)
    high = valid.quantile(0.98)

    if high <= low:
        return pd.Series(
            0.5,
            index=series.index
        )

    score = (
        (series - low) /
        (high - low)
    )

    return score.clip(0, 1).fillna(0.5)


def text_contains(series, patterns):

    text = (
        series
        .fillna("UNKNOWN")
        .astype(str)
        .str.upper()
    )

    pattern = "|".join(patterns)

    return text.str.contains(
        pattern,
        regex=True,
        na=False
    )


def main():

    print("=" * 70)
    print("MOIL INDIA-WIDE CANDIDATE SCORING")
    print("=" * 70)

    if not INPUT.exists():
        raise FileNotFoundError(
            f"\nMissing:\n{INPUT}\n\n"
            "Run first:\n"
            "python scripts/attach_indiawide_geology.py"
        )

    df = pd.read_csv(INPUT)

    print("\nInput shape:", df.shape)

    # =========================================================
    # 1. SPECTRAL EVIDENCE
    # =========================================================

    print("\nCalculating spectral evidence...")

    spectral_columns = [
        "Iron_Oxide_Index",
        "Clay_Alteration_Index",
        "Ferrous_Index",
        "SWIR_Red_Ratio",
        "SWIR_Green_Ratio",
        "NIR_SWIR2_Ratio",
        "B11_B12_NormDiff",
        "B8_B12_NormDiff",
        "B4_B2_NormDiff",
    ]

    spectral_scores = []

    for column in spectral_columns:

        if column in df.columns:
            spectral_scores.append(
                minmax(
                    numeric(df, column)
                )
            )

    if spectral_scores:
        df["Spectral_Score"] = pd.concat(
            spectral_scores,
            axis=1
        ).mean(axis=1)
    else:
        df["Spectral_Score"] = 0.5

    # =========================================================
    # 2. RADAR
    # =========================================================

    print("Calculating radar evidence...")

    radar_components = []

    for column in [
        "VV",
        "VH",
        "VV_VH_Difference",
    ]:

        if column in df.columns:
            radar_components.append(
                minmax(
                    numeric(df, column)
                )
            )

    if radar_components:

        df["Radar_Score"] = pd.concat(
            radar_components,
            axis=1
        ).mean(axis=1)

    else:

        df["Radar_Score"] = 0.5

    # =========================================================
    # 3. REMOTE SENSING SCORE
    # =========================================================

    df["Remote_Sensing_Score"] = (
        0.70 * df["Spectral_Score"]
        +
        0.30 * df["Radar_Score"]
    )

    # =========================================================
    # 4. TERRAIN
    # =========================================================

    print("Calculating terrain evidence...")

    terrain_components = []

    for column in [
        "Elevation",
        "Slope",
    ]:

        if column in df.columns:
            terrain_components.append(
                minmax(
                    numeric(df, column)
                )
            )

    if terrain_components:

        df["Terrain_Score"] = pd.concat(
            terrain_components,
            axis=1
        ).mean(axis=1)

    else:

        df["Terrain_Score"] = 0.5

    # =========================================================
    # 5. GEOLOGICAL EVIDENCE
    # =========================================================

    print("Calculating coarse geological evidence...")

    geo_score = pd.Series(
        0.0,
        index=df.index
    )

    # ---------------------------------------------------------
    # Metamorphic host lithologies
    # ---------------------------------------------------------

    if "lithologic" in df.columns:

        metamorphic = text_contains(
            df["lithologic"],
            [
                "SCHIST",
                "GNEISS",
                "AMPHIBOLITE",
                "QUARTZITE",
                "PHYLLITE",
                "GRANULITE",
                "MARBLE",
            ]
        )

        geo_score += (
            metamorphic.astype(float) * 0.40
        )

    # ---------------------------------------------------------
    # Precambrian age
    # ---------------------------------------------------------

    if "age" in df.columns:

        precambrian = text_contains(
            df["age"],
            [
                "ARCHAEAN",
                "PALEOPROTEROZOIC",
                "PALAEOPROTEROZOIC",
                "MESOPROTEROZOIC",
                "NEOPROTEROZOIC",
                "PRECAMBRIAN",
            ]
        )

        geo_score += (
            precambrian.astype(float) * 0.25
        )

    # ---------------------------------------------------------
    # Known regional geological groups
    # ---------------------------------------------------------

    group_columns = []

    for column in [
        "group_name",
        "supergroup",
        "formation",
    ]:

        if column in df.columns:
            group_columns.append(
                text_contains(
                    df[column],
                    [
                        "SAUSAR",
                        "TIRODI",
                        "AMGAON",
                        "KHAIRAGARH",
                        "KHARAGARH",
                        "AMARKANTAK",
                    ]
                )
            )

    if group_columns:

        known_group = pd.concat(
            group_columns,
            axis=1
        ).any(axis=1)

        geo_score += (
            known_group.astype(float) * 0.35
        )

    df["Geological_Score"] = geo_score.clip(
        0,
        1
    )

    # =========================================================
    # 6. GEOLOGY UNKNOWN FLAG
    # =========================================================

    if "Geology_Unknown" not in df.columns:
        df["Geology_Unknown"] = 1

    # =========================================================
    # 7. OCCURRENCE EVIDENCE
    # =========================================================

    print(
        "Calculating occurrence evidence separately..."
    )

    if "Distance_Mn_km" in df.columns:

        distance = numeric(
            df,
            "Distance_Mn_km"
        )

        df["Occurrence_Evidence"] = np.exp(
            -distance / 50.0
        )

    else:

        df["Occurrence_Evidence"] = 0.0

    # =========================================================
    # 8. BASE SCREENING SCORE
    # =========================================================

    print("\nCalculating base screening score...")

    df["Base_Screening_Score"] = (
        0.55 * df["Remote_Sensing_Score"]
        +
        0.30 * df["Geological_Score"]
        +
        0.15 * df["Terrain_Score"]
    )

    # =========================================================
    # 9. PERCENTILE / RANK SCORE
    # =========================================================

    df["Prospectivity_Screening_Score"] = (
        df["Base_Screening_Score"]
        .rank(
            method="average",
            pct=True
        )
        * 100
    )

    # =========================================================
    # 10. SCREENING CLASS
    # =========================================================

    df["Screening_Class"] = np.select(
        [
            df["Prospectivity_Screening_Score"] >= 90,
            df["Prospectivity_Screening_Score"] >= 75,
        ],
        [
            "HIGH",
            "MEDIUM",
        ],
        default="LOW"
    )

    # =========================================================
    # 11. SORT
    # =========================================================

    df = df.sort_values(
        "Prospectivity_Screening_Score",
        ascending=False
    ).reset_index(drop=True)

    # =========================================================
    # 12. SAVE FULL OUTPUT
    # =========================================================

    OUTPUT.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    df.to_csv(
        OUTPUT,
        index=False
    )

    # =========================================================
    # 13. TOP CANDIDATES
    # =========================================================

    top_n = min(
        1000,
        len(df)
    )

    top = df.head(top_n).copy()

    top.to_csv(
        TOP_OUTPUT,
        index=False
    )

    # =========================================================
    # 14. SUMMARY
    # =========================================================

    print("\n" + "=" * 70)
    print("INDIA-WIDE SCREENING COMPLETE")
    print("=" * 70)

    print("\nRows:", len(df))

    print("\nScreening classes:")

    print(
        df["Screening_Class"]
        .value_counts()
        .to_string()
    )

    print("\nMean scores:")

    print(
        df[
            [
                "Spectral_Score",
                "Radar_Score",
                "Remote_Sensing_Score",
                "Geological_Score",
                "Terrain_Score",
                "Occurrence_Evidence",
                "Prospectivity_Screening_Score",
            ]
        ]
        .mean()
        .to_string()
    )

    print("\nTop 10 candidate cells:")

    display_columns = [
        "latitude",
        "longitude",
        "Prospectivity_Screening_Score",
        "Screening_Class",
        "Geological_Score",
        "Remote_Sensing_Score",
        "Terrain_Score",
        "Occurrence_Evidence",
    ]

    available = [
        c for c in display_columns
        if c in top.columns
    ]

    print(
        top[available]
        .head(10)
        .to_string(index=False)
    )

    print("\nFull output:")
    print(OUTPUT)

    print("\nTop candidates:")
    print(TOP_OUTPUT)


if __name__ == "__main__":
    main()