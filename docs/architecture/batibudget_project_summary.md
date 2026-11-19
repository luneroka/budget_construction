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
- `is_admin` controls user management and the global lots (add, rename, reorder and delete);
- user records support active, soft-deleted, restored, and permanently deleted states.

### `lots`

The one categorizer of transactions (spec `docs/specs/2026-11-18-lots.md`).

- A lot has a `code` stored as text (`"00"` stays `"00"`, at most 10 characters), a `designation` (at most 120) and a `sort_order`.
- A lot with no `project_id` is **global**: every project sees it. The 25 default global lots, `00` « Préparation de chantier » to `24` « Cheminée / Poêle », are created by the lots migration. Only an admin adds, renames (code and designation), reorders or deletes them (`docs/specs/2026-11-19-global-lots-crud.md`). A new lot is listed last and every project sees it at once. A lot that any transaction uses, active or in a trash, cannot be deleted; a delete is final and takes the lot's `project_hidden_lots` and `supplier_lots` rows with it, never a supplier, transaction or document. Code and designation are each unique among global lots.
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

### `supplier_documents`

A supplier's library of paperwork, owned by the supplier's user and shared, like the supplier, across that user's projects.

- `type` (required, a PostgreSQL enum stored as stable English keys): `rib` (RIB), `kbis` (Kbis), `decennial_insurance` (Attestation décennale), `urssaf_certificate` (Attestation URSSAF) or `other` (Autre). There is no uniqueness per type: a supplier may hold several documents of the same type, an old and a renewed attestation say.
- `expiry_date` (optional, a date with no time): the document is valid through that day. The UI flags it « Expiré » from the day after and « Expire bientôt » from 30 days before it to the day itself, against the user's own date.
- the same file metadata as `documents` below (original filename, storage key, R2 path, MIME type, size), timestamps and soft deletion.

Only the type and the expiry date can be edited (`PATCH /supplier-documents/{id}`); a file is replaced by deleting the document and adding a new one. The revision `a02a0ce02bd7` added both columns and made every existing row a RIB, since the supplier's single document was its RIB until then.

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

### 6.4 Coût prévu: quotes and invoices, the larger per supplier

The app is a store of quotes and invoices per lot, not a balanced budget: a lot with only invoices (materials bought in a shop) is not over budget. Since `docs/specs/2026-11-19-money-model-and-screens.md`, four figures:

```text
Coût prévu (per lot)  = sum over the lot's suppliers, « Sans fournisseur » as one group, of
                        max(TTC of its active validated quotes in the lot,
                            TTC of its active invoices in the lot)
Facturé (per lot)     = TTC of every active invoice
Payé (per lot)        = TTC of the active paid invoices
À payer (per lot)     = TTC of the active unpaid and on-hold invoices   (Payé + À payer = Facturé)
Project figures       = sums over the visible lots
Supplier figures      = sums of its per-lot figures over the visible lots
```

The max is taken per supplier and per lot: a supplier in two lots contributes two maxes, and its own Coût prévu (supplier page, Bilan) is their sum, so a supplier's figures add up to the Lots page. A lot with quotes only plans its quotes; a lot with invoices only plans its invoices. Quote statuses other than `validated` never count. The validated quotes' total stays as a reference figure (« Devis validés », supplier Bilan). There is no overrun signal any more: « Reste à facturer » and its « Dépassement » flag are gone.

A quote's status is the only budget decision: there is no separate selection flag any more. Every visible lot appears in the engine's output, with zero figures when empty.

### 6.5 Invoices represent actual cost

Every active invoice contributes to « Facturé », the actual project cost, regardless of whether it is paid, unpaid, or on hold, the dashboard's charts included.

Payment status divides « Facturé » into « Payé » (paid) and « À payer » (unpaid and on hold); the engine also keeps the unpaid and on-hold totals apart.

Deposits, interim payments, and balances are multiple invoice transactions in the same lot, usually from the same supplier.

### 6.6 Financial amounts are backend-controlled

The backend calculates or validates VAT and TTC values from the submitted HT amount and VAT rate. Inconsistent client-provided totals are rejected.

The frontend displays the results but is not the source of truth for project financial calculations.

### 6.7 Soft deletion and trash

Soft deletion is used for recoverable business records. The project-scoped trash currently covers:

- transactions;
- documents;
- suppliers associated with the project context;
- supplier documents.

Restoring a transaction unhides its lot in the project if it was hidden, and assigns its supplier to the lot again if the pair was removed. Supplier documents go to the trash too (« Document fournisseur »); restoring a supplier restores every soft-deleted document of that supplier, including ones binned one by one before it, and a document whose supplier is in the trash waits for the supplier's restore. A restored document keeps its type and expiry date.

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
- old retained quotes become `validated`; old DIY estimates become quotes (`validated` if they were retained, `to_confirm` otherwise) with a note appended to their description; quotes already validated but not retained are unchanged and counted in « Devis retenus », the budget figure of the time (now the validated quotes feed Coût prévu, §6.4). The counts of each conversion are logged;
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

1. The Lots page (`/lots`) heads with the project's Coût prévu, Facturé, Payé and À payer (§6.4), then lists every visible lot with its Prévu, Facturé and À payer (stressed when non-zero), empty lots included and drawn with a dashed border.
2. From there the user adds a project lot, hides a lot without active transactions, or shows a hidden one again.
3. A lot's page (`/lots/:lotId`) shows one card per supplier, plus « Sans fournisseur » when some transactions have none. Each card heads with its Prévu, Facturé and À payer in the lot and lists its quotes and its invoices, with add-devis / add-facture actions; a supplier can be added to the lot before any transaction, and removed while it has none. A lot that is not visible in the project answers not found.
4. Each quote offers « Ajouter une facture pour ce devis » (§5 `transactions`).
5. New transactions and status changes immediately affect the financial engine.

The admin screen « Lots » (`/settings/lots`, next to user management, visible to admins only) adds, renames, reorders and deletes the global lots.

### Transaction workspace (« Devis et factures »)

The « Devis et factures » page (`/devis-factures`; « Transactions » and `/transactions` before the money-model change, which still redirect, query string and hash kept) provides a project-wide view of financial records with lot, libellé, référence, supplier, status, amount, date, and document context, and a lot filter.

The workflow supports:

- creating and editing transactions, including moving one to another lot;
- quote and invoice status management;
- linking an existing supplier;
- creating a supplier directly from the transaction form, by its name only in an inline panel; it is assigned to the transaction's lot when the quote or invoice is saved;
- attaching and reviewing documents;
- filtering and searching project transactions (the search matches the libellé and the référence).

### Supplier management

Users maintain a reusable supplier directory containing company details and multiple contacts. Supplier names are unique per active user rather than globally unique. The Fournisseurs page has a lot filter and a « Lots » column of badges for the selected project, and its « RIB » column opens the supplier's newest document of type RIB.

A supplier's page is a short header and three tabs, each its own URL:

- the header: the supplier's name and comment, its lots in the project as badges (the same assignments as the « Lots » column), « Écrire » and « Modifier ». « Écrire » is a small menu of the contacts with an email (« name — email »), each opening `mailto:`; with one email it opens it directly, with none it is hidden;
- « Synthèse » (`/suppliers/:id`): four cards, Coordonnées (SIRET, N° RNE, address), Contacts (the primary contact, the others one click away), Bilan (Coût prévu, Devis validés as a reference, Facturé, Payé and À payer for this supplier in the project, by the §6.4 rules, Coût prévu first and larger, no progress bar) and Documents (which of the five types are present, the next expiry and its signal);
- « Devis et factures (n) » (`/suppliers/:id/devis-factures`; `/suppliers/:id/transactions` redirects): the supplier's quotes and invoices in the project with lot, libellé and référence;
- « Documents (n) »: the supplier's documents with their type, file, upload date and expiry, to add (file, type, optional expiry date), view, download, edit (type and expiry only) and delete.

The supplier form is a page: `/suppliers/new` (« Nouveau fournisseur » on the list) and `/suppliers/:id/edit` (« Modifier »). Its sections are Entreprise (name, SIRET, N° RNE, comment), Adresse, Contacts (one primary contact) and « Lots du projet », a checklist of the current project's visible lots. The ticked lots are saved with the supplier in the same request (`project_lots` on `POST /suppliers/` and `PATCH /suppliers/{id}`, one commit): a lot where the supplier has active quotes or invoices cannot be unticked (`409 supplier_lot_has_active_transactions`), and an assignment in a hidden lot is never removed. Enregistrer and Annuler go back to the page that opened the form (supplier page or list); leaving with unsaved edits asks first. Documents are added from the Documents tab.

### Document management

Documents are uploaded in relation to a transaction, or to a supplier (§5 `supplier_documents`), stored in Cloudflare R2, and exposed through authenticated backend endpoints for metadata, retrieval, and deletion. The Documents page lists both; a supplier document is named by its type and its supplier, with its file name under it.

### Financial dashboard

The dashboard uses the central financial engine to provide:

- Coût prévu, Facturé, Payé and À payer (§6.4), with no progress bar;
- « Facturé par lot »: Payé and À payer stacked per lot, the lots with something invoiced only;
- « Dépenses dans le temps »: Facturé by month, every active invoice;
- « Répartition par fournisseur »: Facturé per supplier, top 10;
- the action center: unpaid invoices; quotes to confirm or negotiate (one widget); missing documents; supplier documents to renew, the dated documents of the active suppliers assigned to a visible lot of the project, flagged expired or expiring within 30 days on the user's own date (the same rule as the supplier page).

Every chart and widget tells an empty result (a short message naming what is missing) from a load failure (a message and « Réessayer »).

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
/devis-factures
/suppliers
/suppliers/new
/suppliers/:supplierId                (Synthèse)
/suppliers/:supplierId/edit
/suppliers/:supplierId/devis-factures
/suppliers/:supplierId/documents
/documents
/trash
/settings
/settings/user
/settings/projects
/settings/exports
/settings/users        (admins)
/settings/lots         (admins)
```

`/budget`, the pre-lots page, redirects to `/lots`; `/transactions` and `/suppliers/:supplierId/transactions` redirect to their « Devis et factures » routes.

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

- Coût prévu: per supplier group, the larger of its validated quotes and its invoices, summed over the groups;
- the validated quotes' total, as a reference;
- Facturé: TTC of every active invoice, split into Payé (paid) and À payer (unpaid and on hold), the unpaid and on-hold totals kept apart too;
- quote, validated quote, and invoice counts;
- each supplier's figures in each lot, and over the project's visible lots.

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
| Devis retenus as the budget, Reste à facturer and overrun (2026-11 lots)   | Coût prévu = per supplier and lot, the larger of validated quotes and invoices; Facturé split Payé / À payer (§6.4) |
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
