# BatiBudget — Project Summary

**Domain:** `batibudget.com`  
**Public repository:** [github.com/luneroka/budget_construction](https://github.com/luneroka/budget_construction)
**Project status:** Active development and production preparation  
**Origin:** Migration and redesign of the original Excel-based construction budget tool

---

## 1. Project Overview

BatiBudget is a full-stack web application designed to centralize and simplify budget planning, quote comparison, supplier management, invoice tracking, document storage, and financial reporting for house construction and renovation projects.

The application originates from a mature Excel workbook built with structured tables, Power Query, formulas, and VBA. The web application does not reproduce the workbook screen by screen. It preserves the proven business logic while replacing spreadsheet-specific mechanisms with a normalized database, a secure API, dedicated business services, and a modern project-based user interface.

The product is budget-first. Its primary purpose is to help an individual understand:

- what work and products are included in a construction project;
- which quotes or DIY estimates define the current planned budget;
- how much has actually been invoiced and paid;
- which suppliers, documents, and transactions relate to each budget item;
- where the project is over or under budget;
- which financial actions still require attention.

---

## 2. Product Direction

### Primary audience

The first version is intended for private individuals managing the construction or renovation of a house. The architecture is multi-user and multi-project from the start, even though the initial use case is based on the original owner's workflow.

### Product positioning

BatiBudget is currently positioned as a construction budgeting and financial-control application rather than a general-purpose construction ERP or task-management platform.

The MVP focuses on:

- project onboarding from a predefined construction template;
- structured construction scope through categories, subcategories, and products;
- budget lines representing whole products or detailed breakdown items;
- quotes, DIY estimates, and invoices;
- supplier and contact management;
- document storage and retrieval;
- financial summaries, dashboards, alerts, and accounting exports.

Broader project-management functions such as task scheduling, work-progress tracking, planning dependencies, shared contractor workspaces, and photo timelines remain possible future extensions but are not part of the core financial model.

### Language conventions

- The user interface is written in French.
- Source code, database names, API fields, and technical documentation use English.
- The public product name is **BatiBudget**, aligned with the acquired domain `batibudget.com`.

---

## 3. Migration from the Excel Prototype

### Concepts retained

The following principles from the Excel tool remain central:

- a structured category, subcategory, and product hierarchy;
- separate handling of quotes, DIY estimates, and invoices;
- detailed supplier information;
- transaction-level supporting documents;
- soft deletion rather than immediate destructive deletion;
- consolidated calculations by product and category;
- search, filtering, reporting, and export capabilities;
- the ability to manage a product either globally or through detailed sub-items.

### Excel-specific mechanisms replaced

The following elements are no longer part of the target architecture:

- VBA macros as the business workflow layer;
- Power Query as the application data pipeline;
- worksheet formulas as the financial calculation engine;
- search and input worksheets as the user interface;
- local file paths embedded in workbook data;
- spreadsheet synchronization workarounds.

These responsibilities are now divided between the PostgreSQL database, FastAPI repositories and services, Cloudflare R2 storage, and the React frontend.

---

## 4. Confirmed Technical Architecture

| Layer                   | Confirmed technology and responsibility                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frontend                | React, TypeScript, Vite, React Router, TanStack Query, TanStack Table, React Hook Form, Zod, Recharts, Tailwind CSS, Axios |
| Backend API             | Python, FastAPI, Pydantic, async SQLAlchemy, asyncpg                                                                       |
| Database                | PostgreSQL with Alembic migrations, constraints, partial indexes, and soft-delete-aware uniqueness rules                   |
| Authentication          | JWT bearer authentication with registration, login, current-user protection, password reset, and admin authorization       |
| Document storage        | Private Cloudflare R2 object storage accessed through the backend                                                          |
| Email delivery          | Resend for password recovery and in-app issue reports                                                                      |
| Development environment | Docker Compose with separate frontend, backend, PostgreSQL, and test database services                                     |
| Production environment  | Docker Compose on an Ubuntu server, with Caddy serving the SPA, terminating HTTPS, and proxying `/api/*` to FastAPI        |
| Testing and quality     | Pytest and pytest-asyncio on the backend; Ruff/Black and frontend linting/formatting workflows                             |

### Backend organization

The backend follows a layered structure:

```text
models -> schemas -> repositories -> services -> routers
```

- **Models** define persisted database entities and relationships.
- **Schemas** define validated API inputs and outputs.
- **Repositories** contain database access and persistence rules.
- **Services** coordinate workflows and centralize business logic.
- **Routers** expose authenticated HTTP endpoints without duplicating domain logic.

The financial calculations are deliberately centralized in a financial engine rather than recalculated independently by individual endpoints or frontend components.

---

## 5. Confirmed Domain Model

### `users`

Represents application accounts.

Key decisions:

- users authenticate through email and password;
- passwords are stored as hashes;
- users can own multiple projects and suppliers;
- `is_admin` controls privileged catalog, template, and user-management actions;
- user records support active, soft-deleted, restored, and permanently deleted states.

### `categories`, `subcategories`, and `products`

These tables form the global construction catalog.

```text
Category -> Subcategory -> Product
```

Examples include the initial top-level categories:

- Extérieurs
- Finitions
- Gros œuvre
- Menuiseries
- Second œuvre
- Terrain & Préparation
- Viabilisation

Key decisions:

- the catalog is application-wide rather than duplicated for every project;
- catalog writes are administrative operations;
- ordering is explicit through `sort_order`;
- records can be deactivated without deleting historical references;
- uniqueness is enforced within the appropriate parent scope.

### `templates` and `template_items`

Templates define which catalog products are available within a project.

```text
Template -> TemplateItem -> Product
```

Key decisions:

- templates are reusable and managed by an administrator;
- a template item references one catalog product and can define a default name, order, and required status;
- duplicate products are forbidden within the same template;
- the initial V1 template is **Maison complète**, intended to contain the complete supported construction catalog;
- templates define project scope but do not duplicate the category hierarchy.

### `projects`

A project belongs to one user and may be associated with one template.

Important fields include:

- name;
- description;
- location;
- start and end dates stored as dates rather than datetimes;
- project status: `draft`, `active`, `completed`, or `archived`;
- `template_id`;
- timestamps and `deleted_at`.

Project names are unique per active user, not globally unique across the platform.

### `budget_lines`

`budget_lines` are the project-specific financial tracking units. This entity replaces the earlier working name `project_items` and formalizes the role previously played by Excel sub-products.

A budget line:

- belongs to a project;
- references a catalog product;
- references the matching template item;
- has a display name and sort order;
- is either a whole-product line or a breakdown line;
- contains the transactions used for planning and actual-cost tracking;
- stores the selected quote and selected DIY estimate pointers.

Budget lines do not form a recursive parent/child tree. The catalog product remains the aggregation level, and all detailed breakdown lines reference that product directly.

### `transactions`

Transactions are financial records attached to a budget line.

Supported transaction types:

- `quote` — a supplier quote and potential budget component;
- `diy_estimate` — an estimated cost for work or purchases handled directly by the user;
- `invoice` — an actual financial expense.

Core financial fields include:

- amount excluding tax (`amount_ht`);
- VAT rate and VAT amount;
- amount including tax (`amount_ttc`);
- issue date;
- optional due date and payment date;
- supplier;
- description;
- timestamps and soft deletion.

Status-specific fields include:

- quote status: `to_confirm`, `to_negotiate`, `validated`, or `rejected`;
- invoice status: `unpaid`, `on_hold`, or `paid`;
- invoice type: `full`, `deposit`, `interim`, or `balance`;
- payment method: `cash`, `card`, or `wire`.

Database constraints prevent transaction-specific fields from being used with incompatible transaction types.

### `suppliers` and `supplier_contacts`

A supplier represents a company owned by a user and reusable across that user's projects.

Supplier information includes:

- company name;
- optional SIRET;
- notes;
- timestamps and soft deletion.

Contacts are stored separately so one company can have multiple people associated with it. A contact may include a name, phone number, and email address. When contacts are supplied, application and database rules enforce a single primary contact.

### `documents`

Documents are linked to transactions and users.

Stored metadata includes:

- original filename;
- generated storage filename or key;
- Cloudflare R2 path;
- MIME type;
- file size;
- timestamps and soft deletion.

The database stores metadata only. The actual file remains in private object storage rather than on the application server or inside the database.

---

## 6. Core Business Rules

### 6.1 Template-scoped project structure

A project must have an active template before product-based budget data can be created.

The template determines which products are valid for the project. Users cannot create budget lines for arbitrary catalog products outside that template in V1.

The project onboarding workflow creates the project and associates the selected template. Loading a template establishes the available scope but does not pre-populate a large set of empty budget lines.

### 6.2 Lazy budget-line creation

Budget lines are created only when financial tracking begins for a product, either explicitly or when the first relevant transaction is added.

The primary workflow is product-scoped:

```http
POST /projects/{project_id}/products/{product_id}/transactions/
```

The backend validates project ownership, template membership, active catalog records, and the chosen budget mode before creating or reusing the correct budget line.

### 6.3 Whole-product versus breakdown mode

For a given project and product, the user must choose one mode:

- one `product` budget line representing the complete product; or
- multiple `breakdown` budget lines representing specific components.

Example:

```text
Électroménager
├── Whole-product mode: Électroménager

or

Électroménager
├── Four
├── Réfrigérateur
└── Plaque de cuisson
```

The two modes cannot coexist for the same active project/product pair. Converting from one mode to the other requires the existing financial structure to be removed or handled through a dedicated conversion workflow.

### 6.4 Quotes and DIY estimates define the selected budget

A budget line can contain several competing quotes and DIY estimates.

The selected budget is stored as a boolean on each transaction: `is_selected_budget`. There is no cap on how many quotes and DIY estimates can be selected for the same budget line — any validated quote or DIY estimate can be marked selected independently, and all of them contribute to the budget line's total.

```text
Selected budget TTC
= sum of TTC of every selected quote
+ sum of TTC of every selected DIY estimate
```

Invoices are never selected as budget candidates.

### 6.5 Invoices represent actual cost

Every active invoice contributes to actual project cost, regardless of whether it is paid, unpaid, or on hold.

Payment status is used to divide the actual cost into operational totals:

- paid invoices;
- unpaid invoices;
- invoices on hold.

Deposits, interim payments, and balances are multiple invoice transactions on the same budget line. They must not create artificial breakdown lines.

### 6.6 Financial amounts are backend-controlled

The backend calculates or validates VAT and TTC values from the submitted HT amount and VAT rate. Inconsistent client-provided totals are rejected.

The frontend displays the results but is not the source of truth for project financial calculations.

### 6.7 Soft deletion and trash

Soft deletion is used for recoverable business records. The project-scoped trash currently covers:

- transactions;
- documents;
- suppliers associated with the project context.

The trash supports:

- listing deleted records;
- restoring eligible records;
- dependency-aware restoration, such as requiring a parent transaction to be restored before its document;
- individual permanent deletion;
- emptying the project trash.

Permanent document deletion also removes the corresponding file from Cloudflare R2.

---

## 7. Main Application Workflows

### Project onboarding

1. The user registers or logs in.
2. The application loads the user's projects and available active templates.
3. A user with no project is required to complete project onboarding.
4. The user enters the project name, description, and location.
5. The user selects a template, initially expected to be **Maison complète**.
6. The backend creates the project and associates the template.
7. The project becomes available in the application-wide project switcher.

### Budget workspace

1. The frontend displays the complete template hierarchy by category, subcategory, and product.
2. Products are visible even when they do not yet contain a budget line or transaction.
3. The user searches or navigates to a product.
4. The user adds a quote, DIY estimate, or invoice.
5. For the first quote or DIY estimate, the user specifies whether it concerns the whole product or a specific breakdown item.
6. The backend creates or reuses the compatible budget line.
7. Selected budget candidates and actual invoices immediately affect the financial engine.

### Transaction workspace

The transaction page provides a project-wide view of financial records with product, category, budget-line, supplier, status, amount, date, and document context.

The workflow supports:

- creating and editing transactions;
- selecting or unselecting budget candidates;
- quote and invoice status management;
- linking an existing supplier;
- creating a supplier directly from the transaction form;
- attaching and reviewing documents;
- filtering and searching project transactions.

### Supplier management

Users maintain a reusable supplier directory containing company details and multiple contacts. Supplier names are unique per active user rather than globally unique.

### Document management

Documents are uploaded in relation to a transaction, stored in Cloudflare R2, and exposed through authenticated backend endpoints for metadata, retrieval, and deletion.

### Financial dashboard

The dashboard uses the central financial engine to provide:

- selected budget;
- actual invoiced cost;
- remaining budget;
- budget variance;
- budget completion percentage;
- spending over time;
- budget versus actual by category;
- actual-cost distribution by category and supplier;
- unpaid invoice widgets;
- quotes to confirm or negotiate;
- missing-document alerts;
- recent transactions;
- products exceeding their selected budget.

### Accounting export

The application can generate a project accounting CSV filtered by date range and transaction type. Export generation is performed by the backend so the file reflects the same validated project data used by the financial engine.

### Issue reporting

Authenticated users can submit bug or issue reports directly from the application. Reports include category, description, contextual metadata, and optional attachments, and are delivered through Resend to the configured support address.

---

## 8. Frontend Information Architecture

The authenticated frontend currently contains the following principal routes:

```text
/dashboard
/budget
/transactions
/suppliers
/documents
/trash
/settings
/settings/user
/settings/projects
/settings/exports
```

Authentication routes include:

```text
/login
/auth/reset-password
```

The frontend shell includes:

- a responsive application layout;
- a retractable sidebar;
- a project switcher;
- protected routes;
- project onboarding;
- shared form, table, dialog, drawer, and notification components;
- search and breadcrumb support in the budget hierarchy;
- project-aware data fetching and cache invalidation through TanStack Query.

The UI should remain an interface over backend contracts. Financial rules, ownership checks, valid status transitions, and scope validation must not be reimplemented independently in page components.

---

## 9. API and Service Responsibilities

The API currently exposes functional areas for:

- authentication and users;
- admin user management;
- categories, subcategories, products, and catalog tree reads;
- templates and template items;
- projects and project generation from templates;
- budget lines;
- project-, product-, and budget-line-scoped transactions;
- suppliers and supplier contacts;
- documents and secure download flows;
- financial summaries and dashboard projections;
- accounting exports;
- issue reporting;
- project trash and restoration.

Important orchestration services include:

- project generation from a template;
- product-scoped transaction creation;
- budget-line creation and mode validation;
- selected-budget management;
- document storage operations;
- user lifecycle operations;
- centralized financial aggregation;
- export generation;
- password recovery and application email delivery.

---

## 10. Financial Engine

The financial engine is the authoritative calculation layer for project, product, and budget-line totals.

It calculates:

- selected quote budget TTC;
- selected DIY budget TTC;
- combined selected budget TTC;
- all quote and validated quote totals;
- all DIY estimate totals;
- actual invoice cost TTC;
- paid, unpaid, and on-hold invoice totals;
- remaining selected budget;
- selected-budget variance;
- selected-quote variance;
- budget completion percentage;
- transaction counts.

The same engine powers detailed financial summaries and dashboard-specific read models. This avoids discrepancies between the budget workspace, transaction list, dashboard, and future exports.

---

## 11. Ownership, Authorization, and Data Integrity

### Ownership

- Projects belong to users.
- Suppliers belong to users and can be reused across their projects.
- Budget lines inherit ownership through their project.
- Transactions inherit ownership through their budget line and project.
- Documents store their user ownership and transaction relationship.

Every project-specific query and mutation must verify the authenticated user owns the project or related resource.

### Authorization

- Normal users can manage their own projects and related data.
- Administrative authorization is required to create or modify global templates and catalog structure.
- Separate admin endpoints support user lifecycle management.

### Database integrity

The schema uses:

- foreign keys and explicit delete behavior;
- check constraints for financial values and transaction-specific fields;
- composite uniqueness constraints;
- partial unique indexes that ignore soft-deleted records;
- partial performance indexes for active transactions and documents;
- explicit selected-transaction foreign keys on budget lines.

Application validation remains necessary for cross-row business rules such as whole-product versus breakdown exclusivity and selected-budget eligibility.

---

## 12. Storage and Email Decisions

### Cloudflare R2

Cloudflare R2 replaced the earlier Supabase Storage and optional Cloudinary proposals.

R2 is the confirmed storage provider for:

- quotes;
- invoices;
- transaction attachments;
- other project financial documents.

The application server stores no durable uploaded files. Production credentials are bucket-scoped and kept in environment configuration.

### Resend

Resend is used for:

- password-reset emails;
- issue-report delivery;
- future transactional application emails where required.

Password-recovery responses remain generic so the API does not reveal whether an email address exists.

---

## 13. Deployment Architecture

### Local development

The development stack runs through Docker Compose with hot reload for the React frontend and FastAPI backend. PostgreSQL and a separate test database run as containers.

### Production

The confirmed production design is:

```text
Internet
  -> Caddy on ports 80/443
      -> React static application
      -> /api/* reverse proxy to FastAPI
          -> PostgreSQL on the private Docker network
          -> Cloudflare R2 for documents
          -> Resend for email
```

Key production decisions:

- Caddy is the only publicly exposed container;
- HTTPS certificates are managed automatically;
- the frontend uses the same-origin `/api` path;
- FastAPI and PostgreSQL are not published directly to the internet;
- an Alembic migration service runs before the API starts;
- liveness and database-readiness endpoints are available;
- production configuration is validated at application startup;
- database backups must be stored outside the Docker volume and restore-tested;
- R2 requires its own retention and lifecycle policy.

The acquired domain `batibudget.com` will replace placeholder production hostnames during deployment configuration.

---

## 14. Current Implementation State

The project has progressed beyond an architectural proposal. The following areas are implemented or substantially wired:

- PostgreSQL domain model and Alembic migrations;
- registration, login, JWT protection, current-user workflows, and password recovery;
- user and admin lifecycle endpoints;
- catalog, templates, and template items;
- project CRUD and project creation from a template;
- product-scoped and budget-line-scoped transaction workflows;
- lazy budget-line creation and whole-product/breakdown validation;
- supplier companies and multiple supplier contacts;
- quote, DIY estimate, and invoice workflows;
- independent selected quote and selected DIY budget components;
- Cloudflare R2 document upload and download flows;
- central project financial engine;
- dashboard financial projections and operational widgets;
- accounting CSV exports;
- project-scoped trash, restoration, and permanent deletion;
- in-app issue-report submission;
- authenticated React application shell and project switcher;
- project onboarding;
- dashboard, budget, transactions, suppliers, documents, trash, and settings pages;
- production Docker/Caddy configuration, health checks, configuration validation, and deployment documentation.

The main remaining work is no longer basic architecture selection. It is product completion and release hardening: final integration checks, UX refinement, test coverage, data seeding and validation, production secrets and DNS configuration, deployment, monitoring, backup verification, and real-user validation.

---

## 15. Decisions Superseded Since the Original Summary

The original document contained several early proposals that are no longer current:

| Earlier proposal or working assumption                                     | Current decision                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Generic project name such as Budget Chantier                               | Product is branded **BatiBudget**, with `batibudget.com` acquired                                                  |
| `project_items` and `sub_products` as separate or loosely defined concepts | Project financial units are finalized as `budget_lines`, typed as whole-product or breakdown                       |
| One selected budget transaction per budget line                            | Any number of validated quotes and DIY estimates can be independently selected per budget line; all contribute to the budget |
| Supabase Storage, with optional Cloudinary                                 | Cloudflare R2 is the confirmed document storage provider                                                           |
| Multi-user authentication as a later phase                                 | Authentication, ownership, admin authorization, and password recovery are core implemented foundations             |
| Dashboard and analytics as a distant second phase                          | The financial engine and dashboard-specific API projections are already implemented                                |
| Template loading might duplicate the catalog into project rows             | Templates define scope; budget lines are created lazily only when financial tracking begins                        |
| A general construction-management platform as the immediate target         | The MVP remains focused on budget, transactions, suppliers, documents, and financial control                       |
| Development-only architecture                                              | Production Docker Compose, Caddy, health checks, migrations, backups, and configuration validation are now defined |

---

## 16. Future Product Extensions

Possible later additions, after the financial MVP is stable, include:

- custom user-defined products outside the predefined template catalog;
- controlled conversion between whole-product and breakdown modes;
- project sharing and role-based collaboration;
- contractor or household-member access;
- construction task planning and milestone tracking;
- progress photos and chronological site history;
- OCR and automated extraction from quotes and invoices;
- budget recommendations and anomaly detection;
- additional export formats and accountant integrations;
- notifications for due invoices, missing documents, and budget overruns;
- subscription and SaaS administration features.

These extensions must build on the existing ownership, template, budget-line, transaction, and financial-engine foundations rather than bypassing them.

---

## 17. One-Sentence Product Description

BatiBudget is a full-stack application that helps individuals structure a house-building project, define its planned budget from quotes and DIY estimates, track invoices and payments, manage suppliers and documents, and monitor financial performance from one project workspace.
