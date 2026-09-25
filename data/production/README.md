# Production data

For a real production model, place a CSV named `production_history.csv` here.

Required columns:

- date
- mine
- target_mt
- actual_mt
- equipment_downtime_hours
- rainfall_mm
- blasting_delay_hours
- maintenance_hours
- equipment_availability
- production_ratio

`production_ratio` should be:

actual_mt / target_mt

Until real historical data is supplied, the API uses deterministic synthetic data only to demonstrate the complete ML workflow. This must be replaced/validated with real mine records before operational deployment.
