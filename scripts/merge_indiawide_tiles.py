from pathlib import Path
import pandas as pd

# ============================================================
# MOIL SIH 2026
# Merge India-wide GEE screening tiles
# ============================================================

BASE = Path(__file__).resolve().parents[1]

DATA_DIR = (
    BASE
    / "data"
    / "indiawide"
)

OUTPUT_DIR = (
    BASE
    / "outputs"
    / "indiawide"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

print("=" * 60)
print("MERGING INDIA-WIDE GEE TILES")
print("=" * 60)

frames = []

for tile_number in range(1, 9):

    path = (
        DATA_DIR
        / f"moil_indiawide_2024_tile_{tile_number}.csv"
    )

    if not path.exists():

        print(
            f"WARNING: Missing tile {tile_number}"
        )

        continue

    print(
        f"Reading tile {tile_number}: {path.name}"
    )

    df = pd.read_csv(path)

    df["tile"] = tile_number

    print(
        f"  rows = {len(df):,}"
    )

    frames.append(df)


if not frames:

    raise FileNotFoundError(
        "No India-wide tile CSV files found."
    )


combined = pd.concat(
    frames,
    ignore_index=True
)


# ------------------------------------------------------------
# Remove exact duplicate coordinates
# ------------------------------------------------------------

if {
    "longitude",
    "latitude"
}.issubset(combined.columns):

    before = len(combined)

    combined = combined.drop_duplicates(
        subset=[
            "longitude",
            "latitude"
        ]
    )

    after = len(combined)

    print()
    print(
        f"Duplicate coordinates removed: "
        f"{before - after:,}"
    )


# ------------------------------------------------------------
# Save
# ------------------------------------------------------------

output = (
    OUTPUT_DIR
    / "indiawide_remote_sensing_features.csv"
)

combined.to_csv(
    output,
    index=False
)


print()
print("=" * 60)
print("MERGE COMPLETE")
print("=" * 60)

print(
    f"Rows    : {len(combined):,}"
)

print(
    f"Columns : {len(combined.columns)}"
)

print(
    f"Saved   : {output}"
)

print()
print("Columns:")
print(
    list(combined.columns)
)