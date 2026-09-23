from pathlib import Path
import json
import csv

# ============================================================
# MOIL SIH 2026
# Prepare India-wide NGDR 1:2M geology
#
# Purpose:
#   Convert the huge GeoJSONL geology file into a compact
#   point/grid-friendly geology lookup dataset.
#
# No GDAL required.
# ============================================================

BASE = Path(__file__).resolve().parents[1]

INPUT = (
    BASE
    / "data"
    / "indiawide"
    / "geology"
    / "NGDR_Geology_2M.geojsonl"
)

OUTPUT = (
    BASE
    / "data"
    / "indiawide"
    / "geology"
    / "india_geology_2m_summary.csv"
)

print("=" * 60)
print("MOIL INDIA-WIDE GEOLOGY PREPARATION")
print("=" * 60)

if not INPUT.exists():
    raise FileNotFoundError(
        f"Input geology file not found:\n{INPUT}"
    )

print(f"Input : {INPUT}")
print(f"Output: {OUTPUT}")

rows = 0
valid = 0

field_names = set()

output_rows = []

with INPUT.open(
    "r",
    encoding="utf-8",
    errors="ignore"
) as f:

    for line in f:

        line = line.strip()

        if not line:
            continue

        rows += 1

        try:
            feature = json.loads(line)
        except Exception:
            continue

        geometry = feature.get("geometry")

        if not geometry:
            continue

        properties = feature.get(
            "properties",
            {}
        )

        if not isinstance(properties, dict):
            properties = {}

        geometry_type = geometry.get(
            "type"
        )

        coordinates = geometry.get(
            "coordinates"
        )

        # ----------------------------------------------------
        # Calculate a lightweight representative coordinate.
        #
        # We only need a representative location for national
        # screening. Detailed polygon intersection will happen
        # later for candidate regions.
        # ----------------------------------------------------

        lon = None
        lat = None

        try:

            if geometry_type == "Point":

                lon = float(coordinates[0])
                lat = float(coordinates[1])

            elif geometry_type in (
                "Polygon",
                "MultiPolygon"
            ):

                # Recursively collect coordinate pairs.
                points = []

                def collect(obj):

                    if (
                        isinstance(obj, list)
                        and len(obj) >= 2
                        and isinstance(obj[0], (int, float))
                        and isinstance(obj[1], (int, float))
                    ):
                        points.append(
                            (
                                float(obj[0]),
                                float(obj[1])
                            )
                        )
                        return

                    if isinstance(obj, list):

                        for child in obj:
                            collect(child)

                collect(coordinates)

                if points:

                    lon = sum(
                        p[0] for p in points
                    ) / len(points)

                    lat = sum(
                        p[1] for p in points
                    ) / len(points)

        except Exception:
            continue

        if lon is None or lat is None:
            continue

        # ----------------------------------------------------
        # Keep only India-scale coordinates.
        # ----------------------------------------------------

        if not (
            68 <= lon <= 97
            and
            6 <= lat <= 37
        ):
            continue

        row = {
            "longitude": lon,
            "latitude": lat,
            "age": properties.get("age"),
            "supergroup": properties.get("supergroup"),
            "group_name": properties.get("group_name"),
            "formation": properties.get("formation"),
            "lithologic": properties.get("lithologic"),
            "sub_group": properties.get("sub_group"),
            "intrusive": properties.get("intrusive"),
            "stratigraphy_new": properties.get(
                "stratigraphy_new"
            ),
        }

        output_rows.append(row)

        field_names.update(
            row.keys()
        )

        valid += 1

        if rows % 100000 == 0:

            print(
                f"Processed: {rows:,} | "
                f"Valid: {valid:,}"
            )


# ============================================================
# WRITE OUTPUT
# ============================================================

columns = [
    "longitude",
    "latitude",
    "age",
    "supergroup",
    "group_name",
    "formation",
    "lithologic",
    "sub_group",
    "intrusive",
    "stratigraphy_new",
]

OUTPUT.parent.mkdir(
    parents=True,
    exist_ok=True
)

with OUTPUT.open(
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=columns
    )

    writer.writeheader()

    writer.writerows(
        output_rows
    )


print()
print("=" * 60)
print("COMPLETE")
print("=" * 60)

print(
    f"Records processed : {rows:,}"
)

print(
    f"Valid India records: {valid:,}"
)

print(
    f"Saved to:\n{OUTPUT}"
)