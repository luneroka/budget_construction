# Export Feature Strategy

## Goal

Provide an Export section within the application Settings (/settings/exports) allowing users to generate professional exports from their construction project without duplicating business logic.

All exports must rely on the Financial Engine and existing Dashboard read models whenever possible. The frontend must never recompute financial values for export purposes.

The Export feature is intentionally split into three implementation chunks because it serves three different user needs.

---

# General Principles

- Expose exports from **Settings > Exports** (/settings/exports) to centralize all export-related features in a single location.
- Reuse existing backend services and projections.
- Do not duplicate SQL queries already implemented by the Financial Engine.
- Only active (non-deleted) entities are included in exports. Trash content is excluded.
- Every export is project-scoped.

---

# Settings → Exports

The Export section is accessible from Settings and presents three export cards, each targeting a different user need.

## CSV

Export accounting transactions.

## PNG

Export a Dashboard snapshot.

## PDF

Generate a professional project report.

---

# Chunk 1 — Accounting CSV Export

Status: Completed.

## Goal

Provide accountants with a clean CSV export of project transactions.

## Backend

- Create an export endpoint returning CSV.
- Reuse existing transaction queries.
- Support date range filtering.
- Support transaction type filtering.
- Do not duplicate Financial Engine logic.

## Frontend

Allow users to choose:

- Start date
- End date
- Transaction type:
  - All
  - Invoices
  - Quotes
  - DIY Estimates

Then download the generated CSV.

## Suggested Columns

The CSV should expose almost every useful transaction field rather than a reduced accounting view. This makes the export suitable for accountants while also allowing advanced users to filter, pivot and analyze the data in Excel or BI tools.

Suggested columns:

- Transaction ID
- Transaction type
- Supplier
- Project
- Category
- Subcategory
- Product
- Budget line
- Amount HT
- VAT rate (%)
- VAT amount
- Amount TTC
- Issued date
- Due date
- Payment date
- Quote status
- Invoice status
- Invoice type
- Payment method
- Description
- Supplier reference (if available)
- Document present (Yes/No)
- Document filename(s)
- Original document filename(s)
- Created at
- Updated at

Do not export soft-delete metadata (`deleted_at`) because Trash content is intentionally excluded from exports.

Whenever possible, export human-readable values rather than internal database identifiers. For example, export the project name, supplier name, category, subcategory, product and budget line names instead of their corresponding IDs. The objective is for the CSV to be immediately usable in Excel without requiring additional lookups or joins.

Order the columns so they remain easy to read in Excel, grouping identifiers first, financial values together, dates together, statuses together, then metadata.

## Deliverable

A production-ready CSV export suitable for accounting.

---

# Chunk 2 — Dashboard PNG Export

Status: Completed.

## Goal

Allow users to export the current Dashboard as a single image.

## Philosophy

Reuse the existing Dashboard UI.

No backend image generation is required.

Generate the PNG directly from the rendered Dashboard.

## Contents

- KPI cards
- Charts

The export should fit on a single image suitable for emailing or sharing.

## Deliverable

One-click Dashboard PNG export.

---

# Chunk 3 — Executive PDF Report

Status: Not started. The Settings > Exports PDF card exists as a disabled
placeholder in the UI.

## Goal

Generate a professional project report.

This is intentionally deferred until after CSV and PNG because it requires additional product decisions.

## Expected Contents

- Project information
- Financial KPIs
- Dashboard charts
- Category analysis
- Supplier analysis
- Budget highlights
- Largest budget variances
- Recent activity
- Financial summary

## Principles

- Reuse Financial Engine projections.
- Reuse Dashboard read models whenever possible.
- Avoid creating PDF-specific business calculations.

## Deliverable

A polished PDF suitable for project follow-up, customer communication and long-term archiving.

---

# Navigation Philosophy

Exports are considered project-level utilities rather than daily operational workflows. For that reason they are grouped under Settings instead of the main navigation. This keeps the primary navigation focused on managing the construction project while still making exports easy to discover from a single dedicated location.

# Future Considerations

Potential future exports:

- Excel workbook
- Accountant-specific formats
- Scheduled reports
- Email delivery
- Multi-project reports

These are explicitly out of scope for v1.
