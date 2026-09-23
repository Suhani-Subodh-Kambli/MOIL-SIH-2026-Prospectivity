"""
MOIL SIH 2026
Detailed priority-zone sample preparation.

Reads detailed Sentinel-2 + Sentinel-1 + SRTM samples exported
from Google Earth Engine.

Important:
    Earth Engine sample() with geometries:true stores the sample
    geometry in the ".geo" column rather than separate latitude/
    longitude columns.

This script:
    1. Finds all detailed zone CSVs.
    2. Merges them.
    3. Extracts latitude/longitude from .geo.
    4. Removes duplicate coordinates.
    5. Checks the existing Phase 4B model requirements.
    6. Reports available/missing raw model features.
    7. Saves a clean combined dataset.
"""

from pathlib import Path
import json

import joblib
import pandas as pd
import numpy as np


ROOT = Path(__file__).resolve().parents[1]

INPUT_DIR = (
    ROOT
    / "data"
    / "indiawide"
    / "detailed"
)

OUTPUT_DIR = (
    ROOT
    / "outputs"
    / "indiawide"
)

MERGED_OUTPUT = (
    OUTPUT_DIR
    / "detailed_zone_samples.csv"
)

AVAILABLE_OUTPUT = (
    OUTPUT_DIR
    / "detailed_zone_available_features.csv"
)

MISSING_OUTPUT = (
    OUTPUT_DIR
    / "detailed_zone_missing_features.csv"
)

PREPROCESSOR = (
    ROOT
    / "models"
    / "phase4b_preprocessor.joblib"
)


# ============================================================
# HELPERS
# ============================================================

def find_column(df, candidates):

    lookup = {
        str(column).strip().lower(): column
        for column in df.columns
    }

    for candidate in candidates:

        key = candidate.strip().lower()

        if key in lookup:
            return lookup[key]

    return None


def extract_coordinates_from_geo(df):

    """
    Extract longitude/latitude from Earth Engine's .geo column.

    Typical Earth Engine format:

    {"type":"Point","coordinates":[80.123,21.456]}

    Some exports may store the geometry as a string containing
    a GeoJSON object.
    """

    if ".geo" not in df.columns:

        return False

    print(
        "\nExtracting coordinates from Earth Engine .geo column..."
    )

    longitudes = []
    latitudes = []

    valid = 0
    invalid = 0

    for value in df[".geo"]:

        try:

            if pd.isna(value):

                longitudes.append(np.nan)
                latitudes.append(np.nan)
                invalid += 1
                continue

            # Already a Python dictionary.
            if isinstance(value, dict):

                geometry = value

            else:

                geometry = json.loads(
                    str(value)
                )

            coordinates = geometry.get(
                "coordinates"
            )

            if (
                coordinates is None
                or len(coordinates) < 2
            ):

                longitudes.append(np.nan)
                latitudes.append(np.nan)
                invalid += 1
                continue

            lon = float(
                coordinates[0]
            )

            lat = float(
                coordinates[1]
            )

            longitudes.append(lon)
            latitudes.append(lat)

            valid += 1

        except Exception:

            longitudes.append(np.nan)
            latitudes.append(np.nan)

            invalid += 1

    df["longitude"] = longitudes
    df["latitude"] = latitudes

    print(
        "Valid .geo coordinates:",
        valid
    )

    print(
        "Invalid .geo coordinates:",
        invalid
    )

    return True


def get_expected_features(preprocessor):

    """
    Recover the raw input feature names expected by the saved
    Phase 4B preprocessor.
    """

    expected_features = []

    # --------------------------------------------------------
    # Preferred method
    # --------------------------------------------------------

    if hasattr(
        preprocessor,
        "feature_names_in_"
    ):

        expected_features = list(
            preprocessor.feature_names_in_
        )

    # --------------------------------------------------------
    # ColumnTransformer fallback
    # --------------------------------------------------------

    elif hasattr(
        preprocessor,
        "transformers_"
    ):

        for (
            transformer_name,
            transformer,
            columns
        ) in preprocessor.transformers_:

            if transformer == "drop":
                continue

            if columns is None:
                continue

            if isinstance(
                columns,
                list
            ):

                expected_features.extend(
                    columns
                )

            elif hasattr(
                columns,
                "tolist"
            ):

                expected_features.extend(
                    columns.tolist()
                )

    return list(
        dict.fromkeys(
            expected_features
        )
    )


# ============================================================
# MAIN
# ============================================================

def main():

    print("=" * 70)
    print("MOIL DETAILED ZONE SAMPLE PREPARATION")
    print("=" * 70)

    # ========================================================
    # 1. INPUT DIRECTORY
    # ========================================================

    if not INPUT_DIR.exists():

        raise FileNotFoundError(
            f"\nMissing directory:\n{INPUT_DIR}\n\n"
            "Create it and place the GEE CSV exports there."
        )

    csv_files = sorted(
        INPUT_DIR.glob("*.csv")
    )

    if not csv_files:

        raise FileNotFoundError(
            f"\nNo CSV files found in:\n{INPUT_DIR}\n\n"
            "Download the detailed GEE CSV exports first."
        )

    print("\nDetailed CSV files found:")

    for file in csv_files:

        print(
            "  ",
            file.name
        )

    # ========================================================
    # 2. LOAD FILES
    # ========================================================

    frames = []

    for file in csv_files:

        print(
            f"\nReading {file.name}..."
        )

        df = pd.read_csv(
            file
        )

        print(
            "  Shape:",
            df.shape
        )

        # Keep source information.
        df["source_file"] = (
            file.name
        )

        frames.append(
            df
        )

    # ========================================================
    # 3. MERGE
    # ========================================================

    combined = pd.concat(
        frames,
        ignore_index=True
    )

    print(
        "\nCombined shape:",
        combined.shape
    )

    # ========================================================
    # 4. COORDINATES
    # ========================================================

    # First check whether normal coordinates already exist.

    latitude_column = find_column(
        combined,
        [
            "latitude",
            "lat",
            "y",
        ]
    )

    longitude_column = find_column(
        combined,
        [
            "longitude",
            "lon",
            "x",
        ]
    )

    if (
        latitude_column is not None
        and longitude_column is not None
    ):

        print(
            "\nLatitude/longitude columns found directly:"
        )

        print(
            "  Latitude:",
            latitude_column
        )

        print(
            "  Longitude:",
            longitude_column
        )

        combined["latitude"] = pd.to_numeric(
            combined[latitude_column],
            errors="coerce"
        )

        combined["longitude"] = pd.to_numeric(
            combined[longitude_column],
            errors="coerce"
        )

    else:

        # Earth Engine normally reaches this branch.

        if ".geo" not in combined.columns:

            raise ValueError(
                "\nNo latitude/longitude columns and no .geo column "
                "were found.\n\n"
                "The GEE export must use:\n"
                "geometries: true"
            )

        extract_coordinates_from_geo(
            combined
        )

    # ========================================================
    # 5. VALID COORDINATES
    # ========================================================

    combined = combined.dropna(
        subset=[
            "latitude",
            "longitude",
        ]
    ).copy()

    print(
        "\nRows with valid coordinates:",
        len(combined)
    )

    # ========================================================
    # 6. COORDINATE SANITY CHECK
    # ========================================================

    invalid_coordinates = (
        (combined["latitude"] < -90)
        |
        (combined["latitude"] > 90)
        |
        (combined["longitude"] < -180)
        |
        (combined["longitude"] > 180)
    )

    if invalid_coordinates.any():

        print(
            "Removing invalid coordinate rows:",
            int(invalid_coordinates.sum())
        )

        combined = combined[
            ~invalid_coordinates
        ].copy()

    # ========================================================
    # 7. REMOVE DUPLICATES
    # ========================================================

    before = len(
        combined
    )

    combined = combined.drop_duplicates(
        subset=[
            "latitude",
            "longitude",
        ]
    ).reset_index(
        drop=True
    )

    after = len(
        combined
    )

    print(
        "\nDuplicate coordinate rows removed:",
        before - after
    )

    print(
        "Clean combined rows:",
        after
    )

    # ========================================================
    # 8. ZONE INFORMATION
    # ========================================================

    if "zone_id" in combined.columns:

        print(
            "\nSamples per zone:"
        )

        print(
            combined["zone_id"]
            .value_counts()
            .to_string()
        )

    # ========================================================
    # 9. FEATURE LIST
    # ========================================================

    print(
        "\nExported feature columns:"
    )

    for column in combined.columns:

        print(
            " ",
            column
        )

    # ========================================================
    # 10. LOAD PREPROCESSOR
    # ========================================================

    if not PREPROCESSOR.exists():

        raise FileNotFoundError(
            f"\nMissing model preprocessor:\n"
            f"{PREPROCESSOR}"
        )

    print(
        "\nLoading Phase 4B preprocessor..."
    )

    preprocessor = joblib.load(
        PREPROCESSOR
    )

    # ========================================================
    # 11. EXPECTED RAW FEATURES
    # ========================================================

    expected_features = (
        get_expected_features(
            preprocessor
        )
    )

    if not expected_features:

        raise RuntimeError(
            "\nCould not determine raw feature names "
            "from the Phase 4B preprocessor."
        )

    print(
        "\nExpected raw model features:",
        len(expected_features)
    )

    # ========================================================
    # 12. AVAILABLE / MISSING
    # ========================================================

    available = [
        feature
        for feature in expected_features
        if feature in combined.columns
    ]

    missing = [
        feature
        for feature in expected_features
        if feature not in combined.columns
    ]

    print(
        "\nAvailable model features:",
        len(available)
    )

    print(
        "Missing model features:",
        len(missing)
    )

    # ========================================================
    # 13. FEATURE AUDIT
    # ========================================================

    feature_audit = pd.DataFrame(
        {
            "feature": expected_features,

            "available": [
                feature in combined.columns
                for feature in expected_features
            ],
        }
    )

    # ========================================================
    # 14. CREATE OUTPUT DIRECTORY
    # ========================================================

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    # ========================================================
    # 15. SAVE AUDITS
    # ========================================================

    feature_audit.to_csv(
        AVAILABLE_OUTPUT,
        index=False
    )

    pd.DataFrame(
        {
            "missing_feature": missing
        }
    ).to_csv(
        MISSING_OUTPUT,
        index=False
    )

    # ========================================================
    # 16. SAVE MERGED DATA
    # ========================================================

    combined.to_csv(
        MERGED_OUTPUT,
        index=False
    )

    # ========================================================
    # 17. SUMMARY
    # ========================================================

    print("\n" + "=" * 70)
    print("DETAILED SAMPLE PREPARATION COMPLETE")
    print("=" * 70)

    print(
        "\nMerged dataset:"
    )

    print(
        MERGED_OUTPUT
    )

    print(
        "\nRows:",
        len(combined)
    )

    print(
        "Columns:",
        len(combined.columns)
    )

    print(
        "\nModel features available:",
        len(available),
        "/",
        len(expected_features)
    )

    if missing:

        print(
            "\nMISSING FEATURES:"
        )

        for feature in missing:

            print(
                "  -",
                feature
            )

    else:

        print(
            "\nALL MODEL FEATURES ARE AVAILABLE."
        )

    print(
        "\nFeature audit:"
    )

    print(
        AVAILABLE_OUTPUT
    )

    print(
        "\nMissing-feature report:"
    )

    print(
        MISSING_OUTPUT
    )


if __name__ == "__main__":
    main()