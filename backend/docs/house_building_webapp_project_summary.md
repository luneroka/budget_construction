# Budget Chantier — Excel to Web App Migration

## Project Overview

This project started as an advanced Excel-based budgeting and construction tracking system designed for private individuals building or renovating a house.

The current Excel solution already includes:

- Budget planning and monitoring
- Quote and invoice tracking
- Supplier management
- File attachment handling
- Product and category hierarchy
- Aggregated cost calculations
- Search and filtering tools
- Dashboard-ready datasets

The objective is now to evolve this Excel system into a modern full-stack web application.

---

# Project Vision

The web application aims to become a complete construction project management platform focused on:

- Budget tracking
- Expense monitoring
- Quote and invoice management
- Supplier management
- Construction progress tracking
- Dashboard analytics
- Photo and document management
- Project planning capabilities

The long-term objective is to transform a highly optimized personal Excel workflow into a scalable multi-user web platform.

---

# Existing Excel Architecture

## Main Entities Identified

| Excel Table | Purpose |
|---|---|
| dim_produits | Product/category reference table |
| tbl_sous_produits | User-defined granular sub-products |
| input_staging | Raw user transaction input |
| input_staging_enriched | Transactions enriched with file metadata |
| fact_transactions | Cleaned transaction fact table |
| fact_couts | Aggregated cost metrics |
| tbl_fournisseurs | Supplier directory |
| r_search_filters | Search UI state |
| r_search_results | Search output table |

---

# Proposed Web Application Architecture

## Backend Stack

### Python + FastAPI

FastAPI is recommended because:

- Strong fit for data-centric applications
- Excellent performance
- Automatic API documentation
- Clean architecture for REST APIs
- Strong typing support
- Excellent compatibility with future AI/document processing

Compared to alternatives:

- Flask is simpler but less structured for larger APIs
- Django is powerful but heavier than necessary for this project

### PostgreSQL

PostgreSQL is recommended because:

- Excellent relational database support
- Strong analytical query capabilities
- Reliable aggregation and reporting
- Well-suited for structured business data

Compared to alternatives:

- SQLite is suitable only for small/local MVPs
- MySQL is valid but generally less flexible for analytics-heavy systems

### SQLAlchemy / SQLModel

Recommended because:

- Enables Python-based database modeling
- Strong integration with FastAPI
- Easier maintenance than raw SQL
- Type-safe models and validation

### Alembic Migrations

Recommended because:

- Tracks database schema evolution
- Enables safe upgrades and deployment
- Essential for long-term maintainability

### File Storage

Recommended approach:

#### Supabase Storage

Primary document storage for:

- Quotes
- Invoices
- Attachments
- Excel exports
- Construction documents

Advantages:

- Easy setup
- Private buckets
- Signed URLs
- PostgreSQL ecosystem integration
- Strong MVP and production fit

#### Cloudinary (Optional)

Recommended for:

- Construction progress photos
- Image optimization
- Gallery previews
- Media transformations

---

# Frontend Stack

## React + Vite

Recommended because:

- Already aligned with existing React knowledge
- Fast development experience
- Lightweight setup
- Excellent separation from backend API

Compared to alternatives:

- Next.js is more powerful but unnecessary for the first version

## TypeScript

Recommended because:

- Strong type safety
- Easier large-scale refactoring
- Better maintainability for structured business entities

## TanStack Query

Recommended because:

- Simplifies API data fetching
- Handles caching automatically
- Manages loading/error states cleanly
- Excellent for CRUD-heavy applications

## React Hook Form

Recommended because:

- Lightweight and performant
- Ideal for large forms
- Reduces form boilerplate

## Zod Validation

Recommended because:

- Shared validation logic
- Strong TypeScript compatibility
- Clean schema-based validation

## Recharts

Recommended because:

- Easy dashboard integration
- Sufficient for business analytics dashboards
- Clean React integration

---

# Proposed Backend Data Model

## Main Entities

```text
projects
categories
subcategories
products
sub_products
suppliers
transactions
documents
cost_aggregates
users
```

## Example Transaction Model

```text
transactions
- id
- project_id
- product_id
- sub_product_id
- supplier_id
- type
- reference
- quantity
- unit_price
- total_price
- comment
- transaction_date
- is_deleted
- created_at
- updated_at
```

## Example Document Model

```text
documents
- id
- transaction_id
- filename
- storage_url
- storage_provider
- mime_type
- uploaded_at
```

---

# Migration Strategy

## What Should Be Reused

The following concepts are strong and should be preserved:

- Category/subcategory/product hierarchy
- Transaction types (quotes, invoices, DIY)
- Supplier management
- Soft-delete approach using is_deleted
- Cost aggregation logic
- Sub-product granularity system
- Dashboard-oriented data structure

## What Should Be Reworked

The following parts are Excel-specific and should become backend logic:

- VBA macros
- Power Query pipelines
- Search worksheet UI
- Google Sheet synchronization workaround
- Formula-based business logic

---

# Suggested Development Roadmap

## Phase 1 — Core MVP

Features:

- Product/category management
- Supplier management
- Transaction CRUD
- File upload system
- Cost aggregation
- Budget monitoring

Objective:

Replicate and stabilize the current Excel functionality.

---

## Phase 2 — Dashboard & Analytics

Features:

- Budget vs actual cost dashboards
- Category breakdowns
- Timeline cost evolution
- Remaining budget indicators
- Interactive charts

Objective:

Transform raw data into decision-making tools.

---

## Phase 3 — Project Management Features

Features:

- Construction phases
- Task tracking
- Progress status
- Photo documentation
- Timeline views
- Progress history

Objective:

Expand from budgeting tool to construction management platform.

---

## Phase 4 — Multi-User Platform

Features:

- Authentication
- Multiple projects
- Project sharing
- Role management
- Exports
- AI-assisted document extraction

Objective:

Evolve toward a scalable SaaS platform.

---

# Technical Value of the Project

This project demonstrates:

- Real-world business logic
- Data modeling skills
- Full-stack architecture design
- Dashboard and analytics integration
- File management systems
- Excel-to-web migration capabilities
- Backend API development
- Relational database design
- Frontend state management
- Scalable application planning

The project is especially valuable for positioning toward:

- Data Analyst roles
- Full-stack developer roles
- Business application development
- Internal tooling platforms
- Construction-tech or property-tech products

---

# Recommended Stack Summary

```text
Backend
- Python
- FastAPI
- PostgreSQL
- SQLModel / SQLAlchemy
- Alembic
- Supabase Storage

Frontend
- React
- Vite
- TypeScript
- TanStack Query
- React Hook Form
- Zod
- Recharts
```

---

# Potential Product Positioning

Possible product directions:

- Personal house construction budgeting tool
- Construction management assistant
- Property renovation tracker
- Budget and invoice management platform
- Construction dashboard system
- Lightweight construction ERP for individuals

Potential project names:

- Budget Chantier
- MaisonPilot
- BâtiBudget
- Suivi Chantier
- PilotMaison

