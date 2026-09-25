# OreTwin — SIH submission fix

This patch fixes the remaining judge-demo integration issues:

- Overview priority-zone cards are populated from the API instead of assuming CSV text is already JSON.
- The exploration API can build an India-wide screening grid from the eight existing Earth Engine tile CSVs using the saved Phase-4B XGBoost model.
- Point analysis is server-side and no longer reads only the top-10% target layer, so arbitrary coordinates do not automatically receive >90 scores.
- Manual latitude/longitude analysis is available.
- Rectangle and freehand polygon selections call the same server-side model grid.
- Production prediction is available to every authenticated prototype user.
- Expired JWTs automatically clear the browser session and return the user to sign-in.
- JWT sessions last 7 days for the SIH demo.

## Important scientific wording

The India-wide tile inference is a sparse screening layer. The tile data do not contain detailed lithology for every Indian sample, so missing geology is explicitly represented as UNKNOWN/neutral proxies. The output is a relative prospectivity ranking for exploration prioritization, not manganese concentration or a proven reserve.

## Install

Copy these folders into the project root, replacing the existing `client` and the listed server files:

- `client/`
- `server/src/routes/exploration.js`
- `server/src/routes/production.js`
- `server/src/routes/auth.js`
- `server/src/middleware/auth.js`
- `server/src/services/indiawide.js`
- `server/src/services/shortfall.js`
- `scripts/build_indiawide_api_grid.py`

The model files and the eight India-wide tile CSVs must remain in the main project:

- `models/moil_manganese_prospectivity_xgb_phase4b.joblib`
- `models/phase4b_preprocessor.joblib`
- `data/indiawide/moil_indiawide_2024_tile_1.csv` ... `_8.csv`

## Run

Terminal 1:

```powershell
cd C:\Projects\MOIL_SIH_2026\server
npm install
npm run dev
```

Terminal 2:

```powershell
cd C:\Projects\MOIL_SIH_2026\client
npm install
npm run dev
```

Open `http://localhost:5173`.

The first authenticated request to the exploration grid may take a little longer because OreTwin scores the eight India-wide tile CSVs once and caches the result in `outputs/indiawide/api_screening_grid.csv`.

## If you want to pre-build before opening the UI

```powershell
cd C:\Projects\MOIL_SIH_2026
python scripts\build_indiawide_api_grid.py
```

Then start the server and client.
