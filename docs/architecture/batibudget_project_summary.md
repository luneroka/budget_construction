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

- which lots (trades, such as « Gros œuvre / Maçonnerie » or « Électricité ») the project involves;
- which validated quotes define the current planned budget of each lot;
- how much has actually been invoiced and paid;
- which suppliers, documents, and transactions relate to each lot;
- which lots are over or under budget;
- which financial actions still require attention.

---

## 2. Product Direction

### Primary audience

The first version is intended for private individuals managing the construction or renovation of a house. The architecture is multi-user and multi-project from the start, even though the initial use case is based on the original owner's workflow.

### Product positioning

BatiBudget is currently positioned as a construction budgeting and financial-control application rather than a general-purpose construction ERP or task-management platform.

The MVP focuses on:

- project onboarding with a project name and details, every project starting with the global lots;
- one categorizer, the **lot**: 25 global lots shared by every project, plus lots a project adds for itself;
- each lot organized by supplier: Lot → Fournisseur → devis / factures;
- quotes and invoices;
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

- a structured view of the project's scope, now by lot (the catalog tree of the workbook was retired in 2026-11, see §6.1);
- separate handling of quotes and invoices;
- detailed supplier information;
- transaction-level supporting documents;
- soft deletion rather than immediate destructive deletion;
- consolidated calculations by lot;
- search, filtering, reporting, and export capabilities.

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
- `is_admin` controls user management and the global lots (rename and reorder);
- user records support active, soft-deleted, restored, and permanently deleted states.

### `lots`

The one categorizer of transactions (spec `docs/specs/2026-11-18-lots.md`).

- A lot has a `code` stored as text (`"00"` stays `"00"`, at most 10 characters), a `designation` (at most 120) and a `sort_order`.
- A lot with no `project_id` is **global**: every project sees it. The 25 default global lots, `00` « Préparation de chantier » to `24` « Cheminée / Poêle », are created by the lots migration. Only an admin renames (code and designation) or reorders them; nobody adds or deletes one. Code and designation are each unique among global lots.
- A lot with a `project_id` belongs to that project only. Its code and designation are typed at creation and never renamed; at creation its code must differ from every global code and from the project's other lots. Project lots are listed after the global lots, ordered by code.
- An admin re-code of a global lot is not checked against project lots: a project may then show two lots with the same code, which stay separate lots.

### `project_hidden_lots`

Per-project visibility: a row hides one lot (global or the project's own) in one project. A lot with active transactions in the project cannot be hidden; restoring a trashed transaction unhides its lot. Hidden lots are left out of the Lots page, the lot pickers, the dashboard and the project totals.

### `supplier_lots`

The (project, supplier, lot) assignment behind « Lot → Fournisseur ». Creating or updating a transaction with a supplier assigns that pair if missing; a supplier can also be assigned by hand before any transaction. Unassigning is refused while the supplier has active transactions in that lot in the project. A supplier whose last transaction leaves the lot stays assigned.

### `projects`

A project belongs to one user.

Important fields include:

- name;
- description;
- location;
- start and end dates stored as dates rather than datetimes;
- project status: `draft`, `active`, `completed`, or `archived`;
- timestamps and `deleted_at`.

Project names are unique per active user, not globally unique across the platform. `POST /projects` creates no lot rows: a new project sees every global lot. (Legacy: `template_id` stays in the table, unused, until the cleanup migration.)

### `transactions`

Transactions are financial records of one project, each in exactly one lot.

- `project_id` is required and carries ownership: every check (transactions, documents, trash, exports, financial engine) goes transaction → project, because a global lot proves nothing about who owns the row.
- `lot_id` is required; the lot must be global or belong to the same project, and visible there.
- `title` (« libellé », at most 255 characters) and `reference` (« référence », at most 100) are optional free text, trimmed, an empty value stored as null. `description` stays as free notes. When the title is empty the UI shows « Devis · {fournisseur} », « Facture · {fournisseur} », or just « Devis » / « Facture ».
- The supplier is optional.

Supported transaction types:

- `quote` — a supplier quote;
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

Database constraints prevent transaction-specific fields from being used with incompatible transaction types, and `ck_transactions_type_quote_or_invoice` allows only `quote` and `invoice`.

An invoice for a quote is an ordinary invoice: « Ajouter une facture pour ce devis » opens the invoice form with the quote's lot, supplier, libellé, VAT rate and amount HT, all editable, and nothing links the two rows.

### Legacy tables and columns (kept until the cleanup migration)

The catalog-tree structure was replaced by lots in 2026-11. These stay in the database, unused by application code, until a later cleanup migration drops them:

- Legacy: `categories`, `subcategories`, `products`, `templates`, `template_items` and `budget_lines` (the old « budget line », a project's tracking unit for one catalog product, whole or broken down), and `projects.template_id`;
- Legacy: `transactions.budget_line_id`, now nullable, set only on transactions from before lots;
- Legacy: `transactions.is_selected_budget`, the old « retenir comme budget » flag, still read by the 6 production `analytics` views (which therefore only see transactions from before the change);
- Legacy: the `diy_estimate` value of the PostgreSQL `transaction_type` enum, refused by the API and by `ck_transactions_type_quote_or_invoice`.

Their API endpoints (catalog, templates, template items, budget lines, the product-scoped transaction route and project creation from a template) were removed with the change.

### `suppliers` and `supplier_contacts`

A supplier represents a company owned by a user and reusable across that user's projects.

Supplier information includes:

- company name;
- optional SIRET;
- optional « N° RNE » (`rne_number`): free text, at most 50 characters, trimmed, empty stored as null, independent of the SIRET (nothing is derived or cross-checked);
- notes;
- timestamps and soft deletion.

A supplier is shared across its user's projects; its lots (`supplier_lots`) are per project.

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

### 6.1 Lots are the one categorizer

Every transaction sits in exactly one lot, global or the project's own, visible in the project. The catalog tree (category → subcategory → product → budget line) and the template that scoped it are gone from the application (legacy tables, §5). A new project starts with every global lot; it can hide lots it does not need and add its own. Users never rename or reorder a lot: an admin does it for global lots, and a mistyped project lot is hidden and re-added.

### 6.2 Each lot is organized by supplier

Inside a lot, transactions are grouped by supplier, with a « Sans fournisseur » group for those without one. The (project, supplier, lot) assignment exists even before the first transaction and outlives the supplier's last one in the lot (§5 `supplier_lots`).

### 6.3 Hiding a lot

A lot with active transactions in the project cannot be hidden. A lot whose transactions are all soft-deleted can, and restoring one unhides it. Hidden lots are excluded from the Lots page, the pickers, the dashboard and the totals; since a hidden lot never has active transactions, nothing that counts is ever hidden.

### 6.4 Validated quotes define the budget

```text
Devis retenus (per lot)   = sum of TTC of the active validated quotes
Facturé (per lot)         = sum of TTC of every active invoice
Reste à facturer          = Devis retenus − Facturé   (negative: dépassement)
Project total             = sum over the visible lots
```

A quote's status is the only budget decision: there is no separate selection flag any more. Every visible lot appears in the engine's output, with zero totals when empty.

### 6.5 Invoices represent actual cost

Every active invoice contributes to « Facturé », the actual project cost, regardless of whether it is paid, unpaid, or on hold. The engine implements this everywhere since the lots change, the dashboard's « Dépenses dans le temps » and « Répartition par fournisseur » included (they counted paid invoices only before).

Payment status is used to divide « Facturé » into operational totals:

- paid invoices;
- unpaid invoices;
- invoices on hold.

Deposits, interim payments, and balances are multiple invoice transactions in the same lot, usually from the same supplier.

### 6.6 Financial amounts are backend-controlled

The backend calculates or validates VAT and TTC values from the submitted HT amount and VAT rate. Inconsistent client-provided totals are rejected.

The frontend displays the results but is not the source of truth for project financial calculations.

### 6.7 Soft deletion and trash

Soft deletion is used for recoverable business records. The project-scoped trash currently covers:

- transactions;
- documents;
- suppliers associated with the project context.

Restoring a transaction unhides its lot in the project if it was hidden, and assigns its supplier to the lot again if the pair was removed.

The trash supports:

- listing deleted records;
- restoring eligible records;
- dependency-aware restoration, such as requiring a parent transaction to be restored before its document;
- individual permanent deletion;
- emptying the project trash.

Permanent document deletion also removes the corresponding file from Cloudflare R2.

### 6.8 The lots migration (2026-11)

The Alembic revision `ee6e9f1f2f1b` moved production data from the catalog tree to lots. Its decisions, approved in `docs/specs/2026-11-18-lots.md`:

- it creates the 25 global lots, the visibility and assignment tables, the transaction columns and the supplier RNE column; documents, their `transaction_id` and every R2 object are left untouched, and the legacy tables stay;
- `transactions.project_id` comes from the old budget line's project; every migrated transaction gets `title` = its old budget line name, cut to 255 characters;
- each transaction's lot (active and soft-deleted alike) comes from its old product, by the approved mapping (spec Appendix B): per sous-catégorie, with product-level exceptions, matched on category, sous-catégorie and product names. If a product used by any transaction falls outside the mapping, the migration stops and names it instead of guessing; products nobody used are ignored;
- old retained quotes become `validated`; old DIY estimates become quotes (`validated` if they were retained, `to_confirm` otherwise) with a note appended to their description; quotes already validated but not retained are unchanged and now count in Devis retenus. The counts of each conversion are logged;
- one supplier ↔ lot assignment is created per (project, supplier, lot) pair found;
- the downgrade restores the previous schema: transactions created after the upgrade (no budget line) are deleted and the former DIY estimates go back to DIY estimates. The real rollback path is the pre-deploy backup, kept under a permanent name.

The migration carries its own copy of the default lots and of the mapping, so later application changes cannot alter what it does. `backend/tests/migrations/test_lots_migration.py` runs it on a populated database (upgrade, downgrade, upgrade, and the stop on an unmapped product).

### 6.9 Dev seeds

None runs in production. `seed_powerbi_demo.py` writes project and lot on its transactions (its data file still names catalog products; `app/seed/catalog_lots.py` maps them with the migration's rules). `seed_catalog.py` and `seed_template.py` are legacy: they fill the legacy catalog and template tables, which the application no longer reads.

---

## 7. Main Application Workflows

### Project onboarding

1. The user logs in (accounts are created by an admin invitation).
2. The application loads the user's projects.
3. A user with no project is required to complete project onboarding.
4. The user enters the project name, description, and location; there is no template step.
5. The backend creates the project (`POST /projects`); it sees every global lot at once.
6. The project becomes available in the application-wide project switcher, and the user lands on the Lots page.

### Lots workspace

1. The Lots page (`/lots`) lists every visible lot with its Devis retenus, Facturé, payé and Reste à facturer, empty lots included, with a project total; a lot in overrun is flagged « Dépassement ».
2. From there the user adds a project lot, hides a lot without active transactions, or shows a hidden one again.
3. A lot's page (`/lots/:lotId`) shows one card per supplier, plus « Sans fournisseur » when some transactions have none. Each card lists its quotes and its invoices, with add-devis / add-facture actions; a supplier can be added to the lot before any transaction, and removed while it has none. A lot that is not visible in the project answers not found.
4. Each quote offers « Ajouter une facture pour ce devis » (§5 `transactions`).
5. New transactions and status changes immediately affect the financial engine.

The admin screen « Lots » (`/settings/lots`, next to user management, visible to admins only) renames and reorders the global lots.

### Transaction workspace

The transaction page provides a project-wide view of financial records with lot, libellé, référence, supplier, status, amount, date, and document context, and a lot filter.

The workflow supports:

- creating and editing transactions, including moving one to another lot;
- quote and invoice status management;
- linking an existing supplier;
- creating a supplier directly from the transaction form;
- attaching and reviewing documents;
- filtering and searching project transactions (the search matches the libellé and the référence).

### Supplier management

Users maintain a reusable supplier directory containing company details and multiple contacts. Supplier names are unique per active user rather than globally unique. The Fournisseurs page has a lot filter and a « Lots » column of badges for the selected project; a supplier's page shows its transactions with lot, libellé and référence, and its SIRET and N° RNE.

### Document management

Documents are uploaded in relation to a transaction, stored in Cloudflare R2, and exposed through authenticated backend endpoints for metadata, retrieval, and deletion.

### Financial dashboard

The dashboard uses the central financial engine to provide:

- Devis retenus;
- Facturé (every active invoice);
- Reste à facturer;
- invoicing progress (Facturé / Devis retenus);
- spending over time (Facturé by month);
- « Budget vs dépenses réelles »: a bar chart of Devis retenus vs Facturé per lot, lots with a non-zero amount only;
- « Répartition par lot »: a treemap of Facturé per lot;
- Facturé distribution by supplier;
- unpaid invoice widgets;
- quotes to confirm or negotiate;
- missing-document alerts;
- recent transactions;
- « Top 5 Écarts budgétaires »: the lots in overrun, worst first.

### Accounting export

The application can generate a project accounting CSV filtered by date range and transaction type (all, invoices, quotes). Its columns name the lot (« Lot code », « Lot »), the « Title » and the « Reference »; « Supplier SIRET » holds the supplier's SIRET. Export generation is performed by the backend so the file reflects the same validated project data used by the financial engine.

### Issue reporting

Authenticated users can submit bug or issue reports directly from the application. Reports include category, description, contextual metadata, and optional attachments, and are delivered through Resend to the configured support address.

---

## 8. Frontend Information Architecture

The authenticated frontend currently contains the following principal routes:

```text
/dashboard
/lots
/lots/:lotId
/transactions
/suppliers
/documents
/trash
/settings
/settings/user
/settings/projects
/settings/exports
/settings/users        (admins)
/settings/lots         (admins)
```

`/budget`, the pre-lots page, redirects to `/lots`.

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
- lot pickers and lot filters fed by the project's visible lots;
- project-aware data fetching and cache invalidation through TanStack Query.

The UI should remain an interface over backend contracts. Financial rules, ownership checks, valid status transitions, and scope validation must not be reimplemented independently in page components.

---

## 9. API and Service Responsibilities

The API currently exposes functional areas for:

- authentication and users;
- admin user management;
- projects;
- project lots and their visibility (`/projects/{id}/lots`), supplier ↔ lot assignments (`/projects/{id}/supplier-lots`), and the admin global lots (`/admin/lots`);
- project-scoped transactions (`/projects/{id}/transactions`);
- suppliers and supplier contacts;
- documents and secure download flows;
- financial summaries and dashboard projections;
- accounting exports;
- issue reporting;
- project trash and restoration.

Important orchestration services include:

- lot availability, visibility and supplier assignment rules;
- document storage operations;
- user lifecycle operations;
- centralized financial aggregation;
- export generation;
- password recovery and application email delivery.

---

## 10. Financial Engine

The financial engine is the authoritative calculation layer for project and lot totals (§6.4).

Per visible lot and for the project, it calculates:

- Devis retenus: TTC of the active validated quotes;
- Facturé: TTC of every active invoice, split into paid, unpaid, and on hold;
- Reste à facturer, with an overrun flag when negative;
- invoicing progress;
- quote, validated quote, and invoice counts.

It reads a project's active transactions through `transactions.project_id`, with their active documents, and leaves hidden lots out. The same engine powers the Lots pages, the dashboard read models and the accounting export, so they cannot disagree.

---

## 11. Ownership, Authorization, and Data Integrity

### Ownership

- Projects belong to users.
- Suppliers belong to users and can be reused across their projects.
- Transactions carry their own `project_id` and inherit ownership through it; lots are global or project-owned and prove no ownership by themselves.
- Project lots, lot visibility and supplier ↔ lot assignments belong to their project.
- Documents store their user ownership and transaction relationship.

Every project-specific query and mutation must verify the authenticated user owns the project or related resource.

### Authorization

- Normal users can manage their own projects and related data.
- Administrative authorization is required to rename or reorder the global lots.
- Separate admin endpoints support user lifecycle management.

### Database integrity

The schema uses:

- foreign keys and explicit delete behavior;
- check constraints for financial values and transaction-specific fields;
- composite uniqueness constraints;
- partial unique indexes that ignore soft-deleted records;
- partial performance indexes for active transactions and documents;
- a check constraint allowing only `quote` and `invoice` transactions.

Application validation remains necessary for cross-row business rules such as a transaction's lot belonging to its project and being visible there, a project lot's code differing from the global codes, and the hide and unassign refusals.

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
- global lots, project lots, per-project visibility and supplier ↔ lot assignments, with the admin lots screen;
- project CRUD;
- project-scoped transaction workflows in lots, with libellé and référence;
- supplier companies, multiple supplier contacts, and the N° RNE;
- quote and invoice workflows, and the invoice prefilled from a quote;
- Cloudflare R2 document upload and download flows;
- central project financial engine;
- dashboard financial projections and operational widgets;
- accounting CSV exports;
- project-scoped trash, restoration, and permanent deletion;
- in-app issue-report submission;
- authenticated React application shell and project switcher;
- project onboarding;
- dashboard, lots, transactions, suppliers, documents, trash, and settings pages;
- production Docker/Caddy configuration, health checks, configuration validation, and deployment documentation.

The main remaining work is no longer basic architecture selection. It is product completion and release hardening: final integration checks, UX refinement, test coverage, data seeding and validation, production secrets and DNS configuration, deployment, monitoring, backup verification, and real-user validation.

---

## 15. Decisions Superseded Since the Original Summary

The original document contained several early proposals that are no longer current:

| Earlier proposal or working assumption                                     | Current decision                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Generic project name such as Budget Chantier                               | Product is branded **BatiBudget**, with `batibudget.com` acquired                                                  |
| `project_items` and `sub_products` as separate or loosely defined concepts | Legacy (superseded in 2026-11): project financial units were finalized as `budget_lines`, typed as whole-product or breakdown |
| One selected budget transaction per budget line                            | Legacy (superseded in 2026-11): any number of quotes and DIY estimates could be selected per budget line           |
| Catalog tree, templates, budget lines and selected budget (until 2026-11)  | Global lots organized by supplier; validated quotes are the budget; every active invoice is Facturé                |
| Supabase Storage, with optional Cloudinary                                 | Cloudflare R2 is the confirmed document storage provider                                                           |
| Multi-user authentication as a later phase                                 | Authentication, ownership, admin authorization, and password recovery are core implemented foundations             |
| Dashboard and analytics as a distant second phase                          | The financial engine and dashboard-specific API projections are already implemented                                |
| Template loading might duplicate the catalog into project rows             | Legacy (superseded in 2026-11): templates defined scope and budget lines were created lazily                       |
| A general construction-management platform as the immediate target         | The MVP remains focused on budget, transactions, suppliers, documents, and financial control                       |
| Development-only architecture                                              | Production Docker Compose, Caddy, health checks, migrations, backups, and configuration validation are now defined |

---

## 16. Future Product Extensions

Possible later additions, after the financial MVP is stable, include:

- allocating one transaction across several lots;
- grouping the Fournisseurs page by lot;
- project sharing and role-based collaboration;
- contractor or household-member access;
- construction task planning and milestone tracking;
- progress photos and chronological site history;
- OCR and automated extraction from quotes and invoices;
- budget recommendations and anomaly detection;
- additional export formats and accountant integrations;
- notifications for due invoices, missing documents, and budget overruns;
- subscription and SaaS administration features.

These extensions must build on the existing ownership, lot, transaction, and financial-engine foundations rather than bypassing them.

---

## 17. One-Sentence Product Description

BatiBudget is a full-stack application that helps individuals structure a house-building project by lot and supplier, define its planned budget from validated quotes, track invoices and payments, manage suppliers and documents, and monitor financial performance from one project workspace.
