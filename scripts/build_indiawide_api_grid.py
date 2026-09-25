"""Build the India-wide screening grid used by the OreTwin API.

It consumes the 8 Earth Engine tile CSVs already produced by the project,
reconstructs the Phase-4B model input schema, runs the saved XGBoost model,
and writes a compact CSV for interactive point/area analysis.

Important: the tile data do not contain detailed lithology for every Indian
cell. Missing geological fields are explicitly represented as UNKNOWN / neutral
proxies. This is an India-wide screening layer, not a reserve estimate.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import json
import numpy as np
import pandas as pd
import joblib
from shapely.geometry import Point, shape
import json

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "outputs" / "indiawide" / "api_screening_grid.csv"
MODEL = ROOT / "models" / "moil_manganese_prospectivity_xgb_phase4b.joblib"
PREPROCESSOR = ROOT / "models" / "phase4b_preprocessor.joblib"
TILES = ROOT / "data" / "indiawide"
BOUNDARY = TILES / "india_boundary.geojson"

NUMERIC = [
    "Aspect","B11","B12","B2","B3","B4","B5","B6","B7","B8","B8A","Elevation",
    "NDVI","NIR_Red_Ratio","Red_Green_Ratio","SWIR_NIR_Ratio","SWIR_Ratio","Slope","VH","VV",
    "VV_VH_Difference","NDMI","NBR","NDRE","Iron_Oxide_Index","Clay_Alteration_Index","Ferrous_Index",
    "SWIR_Red_Ratio","SWIR_Green_Ratio","NIR_SWIR2_Ratio","BSI","B11_B12_NormDiff","B8_B12_NormDiff",
    "B4_B2_NormDiff","Sausar_Group_Proxy","Metamorphic_Host_Proxy","Geology_Unknown",
    "Geo_Boundary_Distance_km","Geo_Boundary_Density_1km","Geo_Boundary_Density_3km",
    "Lithology_Diversity_3km","Formation_Diversity_3km","Aspect_Sin","Aspect_Cos",
]
CATEGORICAL = ["geo_age","geo_supergroup","geo_group","geo_formation","geo_lithology","geo_intrusive","geo_stratigraphy"]


def safe_ratio(a, b):
    a = pd.to_numeric(a, errors="coerce").to_numpy(dtype=float)
    b = pd.to_numeric(b, errors="coerce").to_numpy(dtype=float)
    return np.divide(a, b, out=np.zeros_like(a), where=np.abs(b) > 1e-9)


def nd(a, b):
    a = pd.to_numeric(a, errors="coerce").to_numpy(dtype=float)
    b = pd.to_numeric(b, errors="coerce").to_numpy(dtype=float)
    den = a + b
    return np.divide(a - b, den, out=np.zeros_like(a), where=np.abs(den) > 1e-9)


def find_col(df, names):
    norm = {str(c).strip().lower().replace(" ", "_"): c for c in df.columns}
    for n in names:
        k = n.lower().replace(" ", "_")
        if k in norm:
            return norm[k]
    return None


def load_tiles():
    files = sorted(TILES.glob("moil_indiawide_2024_tile_*.csv"))
    if not files:
        raise FileNotFoundError(
            f"No India-wide tile CSVs found in {TILES}. Expected tile_1.csv ... tile_8.csv."
        )
    frames = []
    for f in files:
        df = pd.read_csv(f)
        df["source_tile"] = f.stem
        frames.append(df)
        print(f"Loaded {f.name}: {len(df):,} rows")
    out = pd.concat(frames, ignore_index=True)
    lat_col = find_col(out, ["latitude", "lat"])
    lon_col = find_col(out, ["longitude", "lon", "lng"])
    if not lat_col or not lon_col:
        raise ValueError("Tile CSVs must contain latitude/longitude columns.")
    out["latitude"] = pd.to_numeric(out[lat_col], errors="coerce")
    out["longitude"] = pd.to_numeric(out[lon_col], errors="coerce")
    out = out.dropna(subset=["latitude", "longitude"]).copy()
    return out



def load_detailed_predictions():
    candidates = [
        ROOT / "outputs" / "indiawide" / "detailed_zone_predictions.csv",
        ROOT / "outputs" / "indiawide" / "detailed_zone_samples.csv",
    ]
    for f in candidates:
        if not f.exists():
            continue
        try:
            d = pd.read_csv(f)
        except Exception:
            continue
        lat = find_col(d, ["latitude", "lat"])
        lon = find_col(d, ["longitude", "lon", "lng"])
        score = find_col(d, ["prospectivity_score", "score"])
        prob = find_col(d, ["probability", "predicted_probability", "model_probability"])
        if not lat or not lon or not score:
            continue
        out = pd.DataFrame({
            "latitude": pd.to_numeric(d[lat], errors="coerce"),
            "longitude": pd.to_numeric(d[lon], errors="coerce"),
            "prospectivity_score": pd.to_numeric(d[score], errors="coerce"),
            "probability": pd.to_numeric(d[prob], errors="coerce") if prob else np.nan,
            "source_tile": "detailed-zone-inference",
        })
        out = out.dropna(subset=["latitude", "longitude", "prospectivity_score"])
        if len(out):
            print(f"Loaded detailed inference layer: {f.name} ({len(out):,} rows)")
            return out
    return pd.DataFrame(columns=["latitude", "longitude", "prospectivity_score", "probability", "source_tile"])

def prepare_raw(df, expected):
    raw = pd.DataFrame(index=df.index)

    # Copy fields that already exist.
    for col in expected:
        if col in df.columns:
            raw[col] = df[col]

    # Spectral indices used by Phase 4B. These are recreated from the same bands
    # used in the GEE India-wide screening script.
    for name, a, b in [
        ("NDVI", "B8", "B4"),
        ("NIR_Red_Ratio", "B8", "B4"),
        ("Red_Green_Ratio", "B4", "B3"),
        ("SWIR_NIR_Ratio", "B11", "B8"),
        ("SWIR_Ratio", "B12", "B11"),
        ("Iron_Oxide_Index", "B4", "B2"),
        ("Clay_Alteration_Index", "B11", "B12"),
        ("Ferrous_Index", "B12", "B8"),
        ("SWIR_Red_Ratio", "B11", "B4"),
        ("SWIR_Green_Ratio", "B11", "B3"),
        ("NIR_SWIR2_Ratio", "B8", "B12"),
    ]:
        if name not in raw.columns and a in df.columns and b in df.columns:
            raw[name] = safe_ratio(df[a], df[b])
    for name, a, b in [
        ("B11_B12_NormDiff", "B11", "B12"),
        ("B8_B12_NormDiff", "B8", "B12"),
        ("B4_B2_NormDiff", "B4", "B2"),
    ]:
        if name not in raw.columns and a in df.columns and b in df.columns:
            raw[name] = nd(df[a], df[b])

    if "BSI" not in raw.columns and all(c in df.columns for c in ["B11","B4","B8","B2"]):
        b11, b4, b8, b2 = [pd.to_numeric(df[c], errors="coerce").to_numpy(float) for c in ["B11","B4","B8","B2"]]
        raw["BSI"] = np.divide((b11 + b4) - (b8 + b2), (b11 + b4) + (b8 + b2), out=np.zeros(len(df)), where=np.abs((b11+b4+b8+b2))>1e-9)

    if "Aspect_Sin" not in raw.columns and "Aspect" in df.columns:
        a = pd.to_numeric(df["Aspect"], errors="coerce").fillna(0).to_numpy(float) * np.pi / 180.0
        raw["Aspect_Sin"] = np.sin(a)
        raw["Aspect_Cos"] = np.cos(a)

    # India-wide tiles do not carry the Balaghat lithology join. Make that
    # limitation explicit instead of pretending the geology is known.
    neutral_numeric = {
        "Sausar_Group_Proxy": 0.0,
        "Metamorphic_Host_Proxy": 0.0,
        "Geology_Unknown": 1.0,
        "Geo_Boundary_Distance_km": 5.0,
        "Geo_Boundary_Density_1km": 0.0,
        "Geo_Boundary_Density_3km": 0.0,
        "Lithology_Diversity_3km": 0.0,
        "Formation_Diversity_3km": 0.0,
    }
    for col, value in neutral_numeric.items():
        if col not in raw.columns:
            raw[col] = value
    for col in CATEGORICAL:
        if col not in raw.columns:
            raw[col] = "UNKNOWN"
        raw[col] = raw[col].fillna("UNKNOWN").replace("", "UNKNOWN").astype(str)

    for col in expected:
        if col not in raw.columns:
            raw[col] = np.nan
    raw = raw[expected].copy()
    return raw



def load_india_boundary():
    if not BOUNDARY.exists():
        raise FileNotFoundError(f"India boundary not found: {BOUNDARY}")
    data = json.loads(BOUNDARY.read_text(encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in data.get("features", []) if f.get("geometry")]
    if not geoms:
        raise ValueError("India boundary GeoJSON contains no geometries.")
    return geoms


def filter_to_india(df):
    geoms = load_india_boundary()
    keep = []
    for lat, lon in zip(df["latitude"].to_numpy(), df["longitude"].to_numpy()):
        pt = Point(float(lon), float(lat))
        keep.append(any(g.contains(pt) or g.touches(pt) for g in geoms))
    out = df.loc[np.asarray(keep)].copy()
    print(f"India boundary filter: {len(df):,} -> {len(out):,} cells")
    if out.empty:
        raise ValueError("India boundary filter removed every screening cell.")
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    if not MODEL.exists() or not PREPROCESSOR.exists():
        raise FileNotFoundError("Phase-4B model/preprocessor not found in models/.")

    df = load_tiles()
    df = filter_to_india(df)
    pre = joblib.load(PREPROCESSOR)
    model = joblib.load(MODEL)
    expected = list(pre.feature_names_in_)
    raw = prepare_raw(df, expected)
    X = pre.transform(raw)
    prob = model.predict_proba(X)[:, 1]

    # Relative score is ranked within the India-only screening population.
    # This prevents neighboring-country tile samples from changing India's
    # percentile scale.
    order = pd.Series(prob).rank(method="average", pct=True).to_numpy() * 100.0
    out = pd.DataFrame({
        "latitude": df["latitude"].to_numpy(),
        "longitude": df["longitude"].to_numpy(),
        "probability": prob,
        "prospectivity_score": order,
        "source_tile": df["source_tile"].to_numpy(),
    })
    out = out.drop_duplicates(subset=["latitude","longitude"]).reset_index(drop=True)

    # If the project has already generated detailed 25-km-zone inference,
    # merge it into the API layer. This makes Balaghat / detailed zones
    # analyzable at the same time as the sparse India-wide screening layer.
    detailed = load_detailed_predictions()
    if len(detailed):
        out = pd.concat([out, detailed], ignore_index=True)
        # Detailed inference wins where the same coordinate exists.
        out["_detail"] = out["source_tile"].eq("detailed-zone-inference")
        out = (out.sort_values("_detail", ascending=False)
                 .drop_duplicates(subset=["latitude", "longitude"], keep="first")
                 .drop(columns=["_detail"])
                 .reset_index(drop=True))
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(args.output, index=False)
    meta = Path(args.output).with_suffix(".json")
    meta.write_text(json.dumps({
        "rows": int(len(out)),
        "model": str(MODEL.relative_to(ROOT)),
        "preprocessor": str(PREPROCESSOR.relative_to(ROOT)),
        "interpretation": "India-wide relative screening from the eight Earth Engine tiles, augmented by any available detailed-zone inference. The India-wide tile layer uses explicit UNKNOWN geology where detailed joins are unavailable.",
        "score_threshold_high": 90,
    }, indent=2))
    print(f"Wrote {len(out):,} scored India-wide screening cells to {args.output}")


if __name__ == "__main__":
    main()
