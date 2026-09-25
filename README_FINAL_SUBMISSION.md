# OreTwin — SIH 2026 Final Submission Patch

This patch synchronizes the OreTwin React frontend, Node API, India-wide screening layer and production-shortfall demo.

## What this final patch fixes

### India-wide exploration
- Filters the API screening grid to an India geographic boundary before it reaches the browser.
- Re-ranks the prospectivity score **within India**, so the 90+ threshold means the top 10% of India-only screening cells.
- Prevents neighboring-country samples from appearing as Indian high-priority targets.
- Keeps high-priority cells visible separately from the blue screening background.
- Loads all 33 GSI manganese occurrences from `Manganese_Ore_1.xls`, converted once to JSON for the web app.
- Shows the India boundary on both maps.
- Keeps the three detailed priority zones and correctly reads their `high_priority_cells` / `high_priority_fraction` fields.

### Point / rectangle / polygon analysis
- Removes the `localLeadThreshold is not defined` frontend failure.
- Fixes the server-side point-analysis syntax/API contract.
- Rectangle and polygon analysis now works with normalized bounds.
- Small selections automatically use nearby screened cells within 50 km when fewer than 10 cells fall inside the drawn boundary. The UI explicitly labels this as local coverage extension.
- Displays both:
  - global high-priority percentage (score >= 90)
  - local top-lead percentage (local 90th percentile)
- Adds nearby GSI occurrence context, so the Balaghat pilot can show known manganese evidence even when the current India-wide model score is not high.
- No score is artificially boosted to make Balaghat look good.

### Production shortfall
- Includes the working Random Forest prototype.
- `NONE` risk is available for normal operating conditions (<5% predicted shortfall).
- Normal / Moderate / Stress presets are included.
- Normal conditions no longer show meaningless zero-impact driver rows.
- Demo/synthetic training is explicitly disclosed.

### Overview
- Removes the System Readiness section.
- Uses live API statistics rather than hard-coded 60,000 / 6,001 values.
- Uses distinct map layers:
  - gold = high-priority screening cells
  - blue = screening cells
  - violet = GSI occurrences
  - outlined gold = detailed priority zones

## Important scientific guardrail

OreTwin is an **AI-assisted mineral prospectivity screening and decision-support prototype**.

The 0–100 score is a relative ranking. It is not:
- manganese concentration,
- ore grade,
- tonnage,
- a proven reserve,
- or a replacement for geological field validation/drilling.

The current India-wide model uses the available satellite/terrain screening data and explicit unknown geology where detailed nationwide geological joins are unavailable.

## Apply

From the extracted patch directory, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_FINAL_FIX.ps1
```

The script targets:

```text
C:\Projects\MOIL_SIH_2026
```

It does not copy `node_modules`.

## Start

### Backend

```powershell
cd C:\Projects\MOIL_SIH_2026\server
npm install
copy .env.example .env
npm run dev
```

### Frontend

Open another PowerShell:

```powershell
cd C:\Projects\MOIL_SIH_2026\client
npm install
copy .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

The API runs on:

```text
http://localhost:5000
```

## Demo flow

1. Register/sign in.
2. Open **Overview**.
3. Open **Exploration**.
4. Default coordinates point to the Balaghat/Tirodi pilot.
5. Click **Analyze coordinates**.
6. Try:
   - point mode,
   - rectangle,
   - polygon.
7. Open one of the three detailed priority zones.
8. Open **Production**.
9. Run **Normal operations** → expected `NO MATERIAL RISK`.
10. Run **Moderate disruption**.
11. Run **Stress test** → expected higher risk.

## Final project principle

The dashboard visualizes the project's actual generated India-wide screening output. It does not fabricate high-priority locations or alter scores to make a target look successful.
