# Analytics Layer

This folder contains the SQL assets used to transform the operational PostgreSQL database into a reporting layer for Power BI.

The application stores normalized operational data in the public schema. The analytics schema exposes BI-ready views consumed by Power BI.

## Flow

FastAPI app → PostgreSQL public schema → PostgreSQL analytics schema → Power BI

## Views

- analytics.vw_project_summary
- analytics.vw_transactions_fact
- analytics.vw_project_items_fact
- analytics.vw_supplier_performance
- analytics.vw_monthly_cashflow

## Analytics & Power BI

The project includes an analytics layer designed for Power BI reporting.

A demo dataset can be generated with:

`python -m app.seed.seed_powerbi_demo --reset`

The data is stored in PostgreSQL and exposed through SQL views in the `analytics` schema. Power BI connects to these views to build budget tracking, cashflow, supplier performance and variance dashboards.
