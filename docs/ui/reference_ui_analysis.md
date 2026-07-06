# Reference UI Analysis - CCIG Admin Dashboard -> Budget Construction Frontend

## Purpose

This document translates the CCIG admin dashboard reference UI in
`docs/untracked/reference-ui/` into an implementation guide for this repository's
`budget_construction` frontend.

The original generated analysis was useful for extracting the visual language,
but it did not have full access to this codebase. This version aligns the UI plan
with the actual FastAPI backend, current frontend stack, data model, API routes,
and financial workflow already implemented in the repository.

The target is not a CCIG-style donation admin clone. The target is a dense
construction-budget application for:

- projects and project templates
- catalog categories, subcategories, and products
- budget lines created from template products
- quotes, DIY estimates, and invoices
- supplier management
- transaction documents
- project-level financial summaries

---

## 1. Source Reference Files

Use these files as styling and component references:

- `docs/untracked/reference-ui/components/AdminLayout.tsx`
- `docs/untracked/reference-ui/components/NavLink.tsx`
- `docs/untracked/reference-ui/pages/admin/AdminDashboard.tsx`
- `docs/untracked/reference-ui/pages/admin/AdminDonations.tsx`
- `docs/untracked/reference-ui/pages/admin/AdminExpenses.tsx`
- `docs/untracked/reference-ui/pages/admin/AdminDonors.tsx`
- `docs/untracked/reference-ui/pages/admin/AdminNewDonation.tsx`
- `docs/untracked/reference-ui/pages/admin/AdminCerfa.tsx`
- `docs/untracked/reference-ui/components/ui/*`
- `docs/untracked/reference-ui/index.css`
- `docs/untracked/reference-ui/tailwind.config.ts`

The public CCIG website layout is intentionally out of scope. This app should
feel like an internal operating tool, not a marketing site.

---

## 2. Current Repository Facts

### 2.1 Frontend

The repository already has a frontend at `frontend/`. Do not recreate it.

Current stack from `frontend/package.json`:

- React `19`
- Vite `8`
- TypeScript `6`
- Tailwind CSS `4` via `@tailwindcss/vite`
- React Router DOM `7`
- TanStack Query `5`
- TanStack Table `8`
- Axios
- React Hook Form
- Zod
- React Hot Toast
- React Icons

Current frontend files are still the default Vite starter:

- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/index.css`
- `frontend/src/main.tsx`

Important implementation consequence:

- Reuse the existing Vite app.
- Replace the default starter UI.
- Keep the existing `@` alias configured in `frontend/vite.config.ts`.
- Tailwind is currently v4-first. Prefer Tailwind v4 `@theme` tokens in
  `src/index.css` rather than adding a Tailwind v3-style config unless the
  implementation deliberately chooses compatibility with imported shadcn
  primitives.
- Install only missing UI/chart/icon dependencies when implementing. At the time
  of this update, `lucide-react`, `recharts`, `clsx`, `tailwind-merge`, and
  `class-variance-authority` are not listed in `package.json`.

### 2.2 Backend

The backend is a FastAPI application under `backend/app`.

Main included routers from `backend/app/main.py`:

- `auth`
- `users`
- `categories`
- `subcategories`
- `products`
- `catalog`
- `templates`
- `template_items`
- `projects`
- `budget_lines`
- `transactions`
- `documents`
- `suppliers`
- `admin`

The backend already has authentication dependencies on most user-owned routes.
The first UI pass may remain mock-only, but its screen model should not conflict
with the API shape.

---

## 3. Actual Domain Model To Reflect In The UI

### 3.1 Projects

Backend files:

- `backend/app/models/project.py`
- `backend/app/schemas/project.py`
- `backend/app/routers/projects.py`

Core fields: project identity, owner, optional `template_id`, dates, location,
description, and `project_status`.

Valid `project_status` values:

- `draft`
- `active`
- `completed`
- `archived`

Key project routes:

```text
POST   /projects/
POST   /projects/from-template
GET    /projects/
GET    /projects/{project_id}
GET    /projects/{project_id}/financial-summary
PATCH  /projects/{project_id}
DELETE /projects/{project_id}
```

UI implication:

- The app needs a project context. Most construction budget screens are scoped to
  a selected project.
- The dashboard should be a project dashboard, not a global admin dashboard.
- A project switcher is more useful than a generic admin account block.

### 3.2 Catalog Hierarchy

Backend files:

- `backend/app/models/category.py`
- `backend/app/models/subcategory.py`
- `backend/app/models/product.py`
- `backend/app/schemas/catalog.py`
- `backend/app/routers/catalog.py`

Hierarchy:

```text
Category -> Subcategory -> Product
```

Catalog route:

```text
GET /catalog/tree
```

Product reads include hierarchy labels:

- `category_id`
- `category_name`
- `subcategory_id`
- `subcategory_name`
- `product_id`
- `name`

UI implication:

- Budget pages should group by category and product.
- Transaction creation should ask for a project product selected from the loaded
  template/catalog path, not an arbitrary text category.

### 3.3 Templates And Template Items

Backend files:

- `backend/app/models/template.py`
- `backend/app/models/template_item.py`
- `backend/app/schemas/template.py`
- `backend/app/schemas/template_item.py`
- `backend/app/routers/templates.py`
- `backend/app/routers/template_items.py`

Important workflow from `docs/untracked/budget_line_logic.md`:

- A project may be created from a template.
- A project can have `template_id`.
- Template items define the project's product scope.
- Loading a template should not create budget lines eagerly.
- Budget lines are created lazily when financial data starts.

Key routes:

```text
GET    /templates/
POST   /templates/
GET    /templates/{template_id}
PATCH  /templates/{template_id}
DELETE /templates/{template_id}

GET    /templates/{template_id}/items/
POST   /templates/{template_id}/items/
POST   /templates/{template_id}/items/bulk
PATCH  /templates/{template_id}/items/{template_item_id}
DELETE /templates/{template_id}/items/{template_item_id}
```

UI implication:

- A future setup flow should include project creation and template selection.
- The initial UI skeleton can mock a selected project and template, but should
  use language like `Projet`, `Modèle`, and `Produits du projet`.

### 3.4 Budget Lines

Backend files:

- `backend/app/models/budget_line.py`
- `backend/app/schemas/budget_line.py`
- `backend/app/routers/budget_lines.py`
- `backend/app/services/budget_line.py`

Core fields: project, optional template item, catalog product, selected budget
transaction, display name, line type, sort order, product hierarchy, and
soft-delete timestamps.

Valid `item_type` values:

- `product`
- `breakdown`

Key routes:

```text
POST   /projects/{project_id}/budget-lines/
GET    /projects/{project_id}/budget-lines/
POST   /projects/{project_id}/budget-lines/from-template/{template_id}
GET    /projects/{project_id}/budget-lines/{budget_line_id}
PATCH  /projects/{project_id}/budget-lines/{budget_line_id}
DELETE /projects/{project_id}/budget-lines/{budget_line_id}
POST   /projects/{project_id}/products/{product_id}/budget-lines/convert-to-breakdown
```

Important rules:

- `BudgetLine` is the financial tracking unit.
- A budget line belongs to one project and one catalog product.
- A budget line can represent the whole product (`product`) or one specific
  breakdown item (`breakdown`).
- For a given project/product, the user cannot mix one whole-product line and
  multiple breakdown lines unless using the conversion workflow.
- `selected_quote_transaction_id` points to the chosen validated quote, if any.
- `selected_diy_estimate_transaction_id` points to the chosen DIY estimate, if
  any.
- The selected budget for a budget line is the sum of selected quote TTC plus
  selected DIY estimate TTC. Invoices are actual expenses and are never budget
  candidates.

UI implication:

- The old generated prompt's generic `/budget` table is too shallow. It should
  show products, budget lines, selected budget amount, quote totals, invoice
  totals, paid/unpaid amounts, and variance.
- Budget line rows should support product-vs-breakdown visual indentation.

### 3.5 Transactions

Backend files:

- `backend/app/models/transaction.py`
- `backend/app/schemas/transaction.py`
- `backend/app/routers/transactions.py`
- `backend/app/services/transaction.py`

Actual transaction types:

- `quote`
- `diy_estimate`
- `invoice`

Actual quote statuses:

- `to_confirm`
- `to_negotiate`
- `validated`

Actual invoice statuses:

- `unpaid`
- `on_hold`
- `paid`

Actual invoice types:

- `full`
- `deposit`
- `interim`
- `balance`

Actual payment methods:

- `cash`
- `card`
- `wire`

Core fields: budget line, optional supplier, transaction type, HT/TVA/TTC
amounts, issue/due/payment dates, description, type-specific statuses, payment
method, and timestamps.

Canonical creation route for the UI:

```text
POST /projects/{project_id}/products/{product_id}/transactions/
```

Budget-line-scoped route for existing lines:

```text
POST /projects/{project_id}/budget-lines/{budget_line_id}/transactions/
```

Other transaction routes:

```text
GET    /projects/{project_id}/budget-lines/{budget_line_id}/transactions/
GET    /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}
PATCH  /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}
DELETE /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}
POST   /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}/select-budget
```

Product-scoped creation adds two fields for quotes and DIY estimates:

- `budget_concern`: `entire_product` or `specific_element`
- `budget_line_name`: required only when `budget_concern = specific_element`

Important validation rules:

- `quote_status` is only allowed for `quote`.
- `invoice_status`, `invoice_type`, `payment_method`, and `payment_date` are
  only allowed for `invoice`.
- `due_date` is only allowed for `quote` and `invoice`.
- `select_as_budget` is allowed on create and is not persisted on the transaction
  row.
- Selecting a quote replaces only the selected quote for the budget line.
- Selecting a DIY estimate replaces only the selected DIY estimate for the budget
  line.
- Invoices cannot be selected as budget candidates.

UI implication:

- Avoid generic statuses like `Draft`, `Rejected`, `Complete`, `Credit note`, or
  `Partially paid` unless the backend adds them later.
- The transaction form must conditionally render quote fields, invoice fields,
  and DIY estimate fields.
- The transaction list should include enough context to identify the budget line,
  product, category, supplier, amount TTC, type, and type-specific status.

### 3.6 Suppliers

Backend files:

- `backend/app/models/supplier.py`
- `backend/app/models/supplier_contact.py`
- `backend/app/schemas/supplier.py`
- `backend/app/routers/suppliers.py`

Supplier core fields: owner, name, SIRET, comment, created/updated dates, and
soft-delete state. Contact people live under `contacts` as
`SupplierContact[]` with `name`, `phone_number`, `email`, and `is_primary`.
Supplier is the company; supplier contacts are the people working for it.

Supplier routes:

```text
POST   /suppliers/
GET    /suppliers/
GET    /suppliers/{supplier_id}
PATCH  /suppliers/{supplier_id}
DELETE /suppliers/{supplier_id}
```

UI implication:

- Supplier list columns should display the supplier company and only the primary
  contact: supplier, primary contact, phone, and email.
- Supplier create/edit UI should support adding multiple contacts and selecting
  exactly one primary contact.
- Do not invent supplier categories as persisted data. Supplier category can be
  inferred visually from transactions/catalog later, but it is not a supplier
  field today.

### 3.7 Documents

Backend files:

- `backend/app/models/document.py`
- `backend/app/schemas/document.py`
- `backend/app/routers/documents.py`

Core fields: transaction, owner, original/stored file names, storage path, MIME
type, file size, timestamps, and soft-delete state.

Document routes:

```text
POST   /transactions/{transaction_id}/documents
GET    /transactions/{transaction_id}/documents
GET    /documents/{document_id}
GET    /documents/{document_id}/download-url
DELETE /documents/{document_id}
DELETE /documents/{document_id}/permanent
```

Upload constraints:

- Max file size: 10 MB.
- Allowed MIME/content types: PDF, JPEG, PNG, HEIC.
- Backend validates file signature and extension match.

UI implication:

- Document status is not persisted as a document field. Use derived UI states:
  `attached`, `missing`, `deleted`, `upload_error`.
- A document table should display file name, MIME type, size, transaction id or
  transaction context, added date, and deleted state.

### 3.8 Financial Summary

Backend files:

- `backend/app/schemas/financial_engine.py`
- `backend/app/services/financial_engine.py`
- `backend/app/routers/projects.py`

Route:

```text
GET /projects/{project_id}/financial-summary
```

Project summary fields:

- `selected_budget_amount_ttc`
- `selected_quote_budget_amount_ttc`
- `selected_diy_budget_amount_ttc`
- `quote_amount_ttc`
- `validated_quote_amount_ttc`
- `diy_estimate_amount_ttc`
- `actual_cost_amount_ttc`
- `paid_invoice_amount_ttc`
- `unpaid_invoice_amount_ttc`
- `on_hold_invoice_amount_ttc`
- `selected_budget_variance_ttc`
- `selected_quote_budget_variance_ttc`
- `quote_count`
- `validated_quote_count`
- `diy_estimate_count`
- `invoice_count`
- `products`

Each product contains:

- `product_id`
- `product_name`
- `subcategory_name`
- `category_name`
- totals
- `budget_lines`

Each budget line summary contains:

- `budget_line_id`
- `name`
- `item_type`
- `selected_quote_transaction_id`
- `selected_diy_estimate_transaction_id`
- totals

UI implication:

- Dashboard KPIs should be based on these names, not generic "committed" labels
  that do not exist in the backend.
- Recommended KPI labels:
  - Budget sélectionné
  - Coût facturé
  - Factures payées
  - Factures à payer
  - Écart budget sélectionné
  - Devis à confirmer/négocier

---

## 4. Reference Design Language To Keep

### 4.1 Layout

Reference pattern:

- Full-screen shell: `min-h-screen flex font-body`
- Fixed-width left sidebar: `w-64`, sticky, full viewport height
- Main area: `flex-1 bg-background`
- Page padding: `p-8`
- Page titles: `font-heading text-3xl font-bold`
- Main content rhythm: `mb-8`, `space-y-6`, `gap-4`, `gap-6`

Budget Construction adaptation:

- Keep the desktop admin shell.
- Replace CCIG navigation with project-budget sections.
- Add a project context block in the sidebar header.
- Keep the workspace light gray with white bordered cards.
- Add responsive fallbacks because construction data entry may happen on laptop
  and tablet widths.

### 4.2 Typography

Reference:

- Heading font: `Playfair Display`, fallback `Georgia`, `serif`
- Body font: `Source Sans 3`, fallback `system-ui`, `sans-serif`

Implementation recommendation:

- Preserve the reference typography for the first restyle.
- Use `Source Sans 3` for all dense tables and forms.
- Use `Playfair Display` sparingly for page/card headings only.

### 4.3 Color Tokens

Reference tokens to reuse semantically:

| Token                |           HSL | Usage                            |
| -------------------- | ------------: | -------------------------------- |
| `background`         | `210 20% 98%` | Main app canvas                  |
| `foreground`         | `220 30% 15%` | Main text                        |
| `card`               |   `0 0% 100%` | Cards and table wrappers         |
| `primary`            | `220 45% 22%` | Navy primary actions, chart bars |
| `accent`             | `220 55% 42%` | Links, secondary emphasis        |
| `gold`               |  `40 65% 50%` | Key CTA, selected state          |
| `muted`              | `215 20% 95%` | Table headers, quiet backgrounds |
| `muted-foreground`   | `215 15% 50%` | Secondary text                   |
| `border`             | `215 20% 88%` | Card/table/input borders         |
| `success`            | `145 60% 40%` | Paid/validated                   |
| `warning`            |  `35 90% 55%` | Pending/on hold/to negotiate     |
| `destructive`        |   `0 72% 51%` | Over budget/errors/deleted       |
| `sidebar-background` | `220 45% 18%` | Sidebar                          |
| `sidebar-accent`     | `220 40% 25%` | Sidebar active/hover             |
| `sidebar-foreground` | `215 20% 90%` | Sidebar text                     |

Budget Construction semantic mapping:

| App concept                                       | Token                           |
| ------------------------------------------------- | ------------------------------- |
| App identity and primary navigation               | `primary`, `sidebar-background` |
| Main create/save CTA                              | `gold`                          |
| Links and secondary actions                       | `accent`                        |
| `paid`, `validated`, `completed`                  | `success`                       |
| `to_confirm`, `to_negotiate`, `unpaid`, `on_hold` | `warning`                       |
| over-budget variance, deleted rows, upload errors | `destructive`                   |
| quiet table headers and form sub-panels           | `muted`                         |

### 4.4 Tables

Reference style:

```text
Wrapper: bg-card border rounded-lg overflow-hidden
Horizontal overflow: overflow-x-auto on dense tables
Table: w-full text-sm
Header: thead bg-muted
Header cells: px-5 py-3 font-semibold text-left
Rows: border-t hover:bg-muted/50 transition-colors
Cells: px-5 py-3 or px-5 py-4
Important values: font-medium
Links: text-accent hover:underline font-medium
```

Use this style for:

- project switcher dialogs
- budget lines
- contextual transactions inside Budget
- suppliers
- documents
- settings/configuration tables such as catalog and templates

### 4.5 Forms

Reference style from `AdminNewDonation.tsx`:

- Page max width: `max-w-4xl`
- Back ghost icon button
- Form split into bordered section cards
- Section header with icon and title
- Body padding: `p-6`
- Field grids: `grid-cols-1 md:grid-cols-2` and `grid-cols-1 md:grid-cols-3`
- Final sticky or trailing action row with primary/outline/ghost buttons

Budget Construction transaction forms are contextual Budget modals or inline
panels, not standalone pages. Recommended transaction form sections:

1. Projet et produit
2. Portée budget (`entire_product` or `specific_element`)
3. Fournisseur
4. Type de transaction
5. Montants HT/TVA/TTC
6. Dates
7. Statut devis ou statut facture
8. Document joint
9. Description

### 4.6 Navigation

Primary navigation:

```text
Dashboard              /dashboard
Budget                 /budget
Fournisseurs           /suppliers
Documents              /documents
────────────────────────────────
Paramètres             /settings
```

Guidance:

- The active project is selected from a persistent Project Switcher located at the top of the sidebar.
- Changing the selected project refreshes all dashboard, budget, supplier and document data.
- Project management (create, duplicate, archive, delete) is intentionally separated from day-to-day navigation and should live behind the project switcher or a dedicated dialog.
- Catalog and Templates are configuration concepts rather than primary navigation.
- Reporting is provided through export actions from Dashboard and Budget instead of a dedicated Reports page.

#### 4.6.1 Sidebar Layout

The sidebar layout is structured as follows:

```text
┌──────────────────────────────┐
│ ▼ Maison Individuelle        │
│   245 000 € • Active         │
├──────────────────────────────┤
│ Dashboard                    │
│ Budget                       │
│ Suppliers                    │
│ Documents                    │
├──────────────────────────────┤
│ Settings                     │
├──────────────────────────────┤
│ Yoann Robert                 │
└──────────────────────────────┘
```

The Project Switcher occupies the top of the sidebar permanently. On application startup, it should restore the previously selected project, ensuring users return directly to their last active context.

### 4.7 Status Badges

Use backend-aligned statuses.

Recommended badge mapping:

```text
project_status:
draft      -> muted
active     -> accent
completed  -> success
archived   -> muted

transaction_type:
quote        -> accent
diy_estimate -> gold
invoice      -> primary

quote_status:
to_confirm   -> warning
to_negotiate -> warning
validated    -> success

invoice_status:
unpaid  -> warning
on_hold -> warning
paid    -> success

invoice_type:
full    -> muted
deposit -> accent
interim -> accent
balance -> gold

budget_line.item_type:
product   -> primary
breakdown -> muted

document derived states:
attached     -> success
missing      -> warning
deleted      -> muted
upload_error -> destructive
```

---

## 5. Initial Frontend Architecture

Recommended folder structure:

```text
frontend/src/
  main.tsx
  App.tsx
  index.css
  lib/
    format.ts
    mock-data.ts
    status.ts
    utils.ts
  components/
    layout/
      AppLayout.tsx
      SidebarNav.tsx
      ProjectSwitcher.tsx
    shared/
      PageHeader.tsx
      KpiCard.tsx
      ChartCard.tsx
      StatusBadge.tsx
      SectionCard.tsx
      TableToolbar.tsx
      ProgressBar.tsx
      TransactionModal.tsx
      ProjectDialog.tsx
    ui/
      badge.tsx
      button.tsx
      card.tsx
      checkbox.tsx
      input.tsx
      label.tsx
      select.tsx
      table.tsx
      textarea.tsx
  pages/
    DashboardPage.tsx
    BudgetPage.tsx
    SuppliersPage.tsx
    DocumentsPage.tsx
    SettingsPage.tsx
    NotFoundPage.tsx
```

The `components/layout/ProjectSwitcher.tsx` component is the primary project selector, and is displayed permanently in the sidebar. It allows users to switch between projects and access project management actions.

Do not create primary-route page components for projects, standalone
transactions, catalog, templates, or reports. Those concepts are handled through
the Project Switcher, Budget workspace, Settings, or export actions.

### 5.1 User Workflow

The primary user workflow for the application is as follows:

```text
Application starts
        ↓
Restore last selected project
        ↓
Dashboard
        ↓
Budget
        ↓
Expand Category
        ↓
Expand Product
        ↓
Expand Budget Line
        ↓
Add Quote / DIY Estimate / Invoice
        ↓
Budget recalculated
        ↓
Dashboard KPIs updated
```

This workflow should drive every UI decision. Users should spend most of their time in the Budget workspace, and rarely need to navigate away from Budget during day-to-day usage.

---

## 6. Mock Data Shape

Mock data should mirror backend fields so later API integration is mostly a data
source swap.

Recommended mock entities:

```ts
type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived';
type BudgetLineType = 'product' | 'breakdown';
type TransactionType = 'quote' | 'diy_estimate' | 'invoice';
type QuoteStatus = 'to_confirm' | 'to_negotiate' | 'validated';
type InvoiceStatus = 'unpaid' | 'on_hold' | 'paid';
type InvoiceType = 'full' | 'deposit' | 'interim' | 'balance';
type PaymentMethod = 'cash' | 'card' | 'wire';
```

Use French construction examples from the actual seed/demo domain:

- Terrain & Préparation
- Études & administratif
- Terrassement
- Maçonnerie
- Charpente & couverture
- Menuiseries
- Électricité
- Plomberie / chauffage
- Isolation / placo
- Sols / carrelage
- Cuisine / salle de bain
- Peinture
- Extérieurs / VRD
- Taxes, raccordements, assurances

Mock supplier examples may reuse the spirit of
`backend/app/seed/data/powerbi_demo.json`:

- Bureau d'études
- Rhône Terrassement
- Est Maçonnerie
- Charpente & Co.
- Leroy Menuiseries
- Garnier Elec'
- Dubois Plomberie
- Simon Iso Placo

Keep fields aligned with the backend:

```text
suppliers:
- id
- user_id
- name
- siret
- comment
- contacts
- created_at
- updated_at
- deleted_at

supplier contacts:
- id
- supplier_id
- name
- phone_number
- email
- is_primary
- created_at
- updated_at

transactions:
- id
- budget_line_id
- supplier_id
- transaction_type
- amount_ht
- vat_rate
- amount_vat
- amount_ttc
- issued_date
- due_date
- payment_date
- description
- quote_status
- invoice_status
- invoice_type
- payment_method

documents:
- id
- transaction_id
- user_id
- original_filename
- stored_filename
- file_path
- mime_type
- file_size
- created_at
- updated_at
- deleted_at
```

---

## 7. Screen Specifications

### 7.1 Dashboard

Route:

```text
/ and /dashboard
```

Purpose:

- Project-level financial overview for the selected project.

KPIs should reflect financial summary fields:

- Budget sélectionné: `selected_budget_amount_ttc`
- Coût facturé: `actual_cost_amount_ttc`
- Factures payées: `paid_invoice_amount_ttc`
- Factures à payer: `unpaid_invoice_amount_ttc`
- Factures en attente: `on_hold_invoice_amount_ttc`
- Écart budget: `selected_budget_variance_ttc`

Charts:

- Budget sélectionné vs coût facturé by category/product.
- Paid/unpaid/on-hold invoice distribution.
- Monthly invoice activity from mock data.
- Quote/DIY/invoice count summary.

Tables:

- Recent transactions, derived from mock data first and later from project-scoped
  budget-line transactions. This is a dashboard summary, not a standalone
  transactions page.
- Budget variances by product.

### 7.2 Project Switcher

The Project Switcher is permanently visible in the sidebar and serves as the primary way to select the active project. Users normally switch projects via this component instead of visiting a separate projects page.

Available actions from the Project Switcher:

- Create project
- Duplicate project
- Archive project
- Delete project

Template selection occurs only during project creation, not in day-to-day navigation. All project management actions are surfaced via the switcher or a dedicated dialog, not a standalone page.

### 7.3 Budget

Route:

```text
/budget
```

The Budget page is the main operational workspace of the application. It displays the full project hierarchy and allows users to review financial information and manage transactions contextually.

The page presents an accordion hierarchy:
Category → Product → Budget Line → Transactions.

Users browse and expand categories and products to see their associated budget lines. For each budget line, users can review all relevant financial fields and initiate transactions directly inline or via a contextual modal. Most transaction management happens contextually from this page, so users rarely need to leave it.

Transactions are created either inline or from a modal launched from the relevant budget line.

Backend compatibility notes:

- Data is sourced from `GET /projects/{project_id}/financial-summary`.
- Financial summary fields and backend enums are used for all calculations, summaries, and status displays.

Financial summary and progress indicators are shown for each budget line and aggregated at the product/category level.

Hierarchy example:

```text
Project
    Category
        Product
            Budget Line
                Quote
                Quote
                DIY Estimate
                Invoice
                Invoice
```

Every transaction belongs to exactly one Budget Line and inherits its project and product context.

#### Transactions Within Budget

Transactions are contextual children of Budget Lines. Creation and management of transactions happens either inline within the Budget page or via a modal launched from a budget line.

Key points:

- Transactions are always associated with a specific budget line and cannot exist independently.
- Creation of a transaction is done contextually from the Budget workspace, not from a standalone CRUD page.
- The same backend rules apply: quote, DIY estimate, and invoice fields are conditionally shown according to transaction type.
- The UI should avoid implementing a separate transactions list or creation page; all transaction actions start from the Budget page.

#### Modal-based interactions

The following actions should be performed using modals (or drawers) rather than full-page forms:

- Create transaction
- Edit transaction
- View transaction
- Upload document
- Preview document
- Create supplier (optional quick action)

Full-page forms should be avoided whenever possible.

### 7.4 Suppliers

Route:

```text
/suppliers
```

Columns:

- Fournisseur
- Contact principal
- Téléphone
- Email

Do not include persisted supplier category or total amount as base supplier
fields. Those can be derived analytics later.

### 7.5 Documents

Route:

```text
/documents
```

Columns:

- Fichier
- Type MIME
- Taille
- Transaction
- Ajouté le
- État

Actions:

- Télécharger plus tard via `/documents/{document_id}/download-url`
- Supprimer plus tard via `/documents/{document_id}`
- Téléverser depuis le détail d'une transaction ou le formulaire de transaction

Backend note:

- The backend currently exposes documents by transaction, not a global
  `GET /documents/` list. The first Documents page should use mock data or a
  frontend aggregation shape until a list endpoint or richer transaction query is
  added.

### 7.6 Settings, Catalog, and Templates

Settings is the only primary navigation entry for configuration. Catalog and
Templates are administrative configuration features accessed from Settings or
during project creation, and are intentionally absent from the primary
navigation.

### 7.7 Page Responsibilities

| Page      | Primary responsibility                                  |
| --------- | ------------------------------------------------------- |
| Dashboard | High-level financial overview and alerts                |
| Budget    | Daily operational workspace for project cost management |
| Suppliers | Supplier directory and management                       |
| Documents | Search, preview and manage uploaded files               |
| Settings  | Application and administrative configuration            |

Every feature should naturally fit into one of these responsibilities. If a
feature does not clearly belong to a primary page, implement it as a modal,
drawer, or contextual panel instead of a new page.

### 7.8 UI Implementation Priority

The recommended UI implementation order is:

1. Design tokens
2. Application shell
3. Sidebar and Project Switcher
4. Shared UI components
5. Dashboard
6. Budget workspace
7. Transaction modal
8. Suppliers
9. Documents
10. Settings
11. Backend integration

Codex should complete one stage before moving to the next.

---

## 8. Implementation Prompt Chunks

The original prompt was too large to execute comfortably. Use these chunks one
at a time in later Codex sessions. Each chunk should be implemented, built, and
committed/checked before continuing to the next.

### Chunk 1 - Frontend Reset And Design Tokens

Goal:

Replace the default Vite starter with the reference admin design foundation.

Tasks:

- Work only in `frontend/`.
- Keep the existing React/Vite/TypeScript/Tailwind 4 project.
- Remove default starter UI from `src/App.tsx`, `src/App.css`, and
  `src/index.css`.
- Add the reference CSS variables from `docs/untracked/reference-ui/index.css`.
- Adapt them to Tailwind 4. Use `@import 'tailwindcss';` and define theme tokens
  in `src/index.css` so classes like `bg-background`, `text-foreground`,
  `bg-card`, `text-muted-foreground`, `bg-sidebar`, and `text-gold` work.
- Import `Playfair Display` and `Source Sans 3`.
- Add base body styles matching the reference.
- Add utility helpers in `src/lib/utils.ts` if using `cn`.
- Install missing component helper dependencies only if needed:
  `clsx`, `tailwind-merge`, `class-variance-authority`.
- Run `npm run build`.

Acceptance:

- The app builds.
- The starter Vite screen is gone.
- Token classes render through Tailwind 4.
- No backend files are changed.

### Chunk 2 - App Shell And Routing

Goal:

Create the admin-style app shell and route skeleton.

Tasks:

- Add React Router routes in `src/App.tsx`.
- Create `components/layout/AppLayout.tsx`.
- Create `components/layout/SidebarNav.tsx`.
- Create `components/layout/ProjectSwitcher.tsx` (the primary project selector, always visible in the sidebar).
- ProjectSwitcher should display the active project, support changing projects
  from mock data, and persist the selected project id in local storage.
- Project management actions can open a lightweight placeholder dialog; do not
  add a Projects route.
- Create placeholder pages for:
  - `DashboardPage`
  - `BudgetPage`
  - `SuppliersPage`
  - `DocumentsPage`
  - `SettingsPage`
  - `NotFoundPage`
- Routes:
  - `/` and `/dashboard` -> DashboardPage
  - `/budget` -> BudgetPage
  - `/suppliers` -> SuppliersPage
  - `/documents` -> DocumentsPage
  - `/settings` -> SettingsPage
  - `*` -> NotFoundPage
- Use the reference sidebar layout:
  - `min-h-screen flex font-body`
  - `w-64 bg-sidebar text-sidebar-foreground sticky top-0 h-screen`
  - active nav state with `bg-sidebar-accent text-gold font-medium border-l-2 border-gold`
  - `main.flex-1.bg-background`
  - inner page padding `p-8`
- Use icons. Prefer installing `lucide-react` for consistency with the reference.
- Run `npm run build`.

Acceptance:

- All routes render.
- Sidebar active states work.
- Layout resembles the CCIG admin shell, with the Project Switcher always present in the sidebar.

### Chunk 3 - Shared UI Primitives

Goal:

Add reusable UI building blocks before implementing real pages.

Tasks:

- Create shadcn-style local primitives:
  - `components/ui/button.tsx`
  - `components/ui/input.tsx`
  - `components/ui/label.tsx`
  - `components/ui/select.tsx`
  - `components/ui/textarea.tsx`
  - `components/ui/checkbox.tsx`
  - `components/ui/card.tsx`
  - `components/ui/table.tsx`
  - `components/ui/badge.tsx`
- Create shared components:
  - `PageHeader`
  - `KpiCard`
  - `ChartCard`
  - `StatusBadge`
  - `SectionCard`
  - `TableToolbar`
  - `ProgressBar`
- StatusBadge must use backend-aligned statuses from section 4.7.
- Keep card radius restrained. Use borders rather than heavy shadows.
- Run `npm run build`.

Acceptance:

- Components compile in isolation.
- Placeholder pages can import and render shared components.
- No unsupported backend statuses are introduced as primary states.

### Chunk 4 - Backend-Shaped Mock Data

Goal:

Create realistic construction data shaped like the current backend by reusing
the existing backend seed data first. During the UI phase,
`backend/app/seed/data/catalog.json` and
`backend/app/seed/data/powerbi_demo.json` are the single source of truth for demo
domain data. The frontend should consume copied seed files through adapters
instead of manually recreating the same project, catalog, supplier, budget, and
transaction domain. The objective is to minimize duplicated mock maintenance.

Tasks:

- Copy the backend seed files into the frontend demo data folder for frontend
  development:

```text
frontend/src/
  demo/
    adapters/
      buildBudgetWorkspace.ts
      buildDashboard.ts
      buildSuppliers.ts
      buildDocuments.ts
    data/
      catalog.json
      powerbi_demo.json
  lib/
    format.ts
```

- `frontend/src/demo/data/catalog.json` is copied from
  `backend/app/seed/data/catalog.json`.
- `frontend/src/demo/data/powerbi_demo.json` is copied from
  `backend/app/seed/data/powerbi_demo.json`.
- Components must never consume raw seed JSON directly.
- Adapter functions transform backend-shaped demo data into frontend View Models.
- Adapters must be pure transformation functions: no async work, no mutation of
  inputs, and no hidden side effects.
- View Models should preserve backend IDs whenever possible so later API
  integration does not require UI identity rewrites.
- Derive these View Models from backend seed data:
  - Projects
  - Catalog hierarchy
  - Templates
  - Budget hierarchy
  - Suppliers
  - Transactions
  - Financial summary
- Keep only these frontend-derived UI states outside the backend seed source:
  - document attachment display states
  - chart series
  - accordion expansion state
  - currently selected project
  - current filters
  - current sorting
  - current search text
- Use exact backend enum values:
  - `draft`, `active`, `completed`, `archived`
  - `product`, `breakdown`
  - `quote`, `diy_estimate`, `invoice`
  - `to_confirm`, `to_negotiate`, `validated`
  - `unpaid`, `on_hold`, `paid`
  - `full`, `deposit`, `interim`, `balance`
  - `cash`, `card`, `wire`
- Include helper formatters in `src/lib/format.ts`:
  - EUR currency
  - dates
  - file sizes
  - percent/progress values
- Run `npm run build`.

### Demo Data Adapter Layer

Adapters convert backend seed entities into UI-oriented View Models. React
components should consume View Models only, not raw backend seed objects.
Adapters are pure functions: they receive seed-shaped data, return View Models,
and do not fetch, mutate, or persist anything.

Recommended View Models:

- `DashboardViewModel`
- `BudgetWorkspaceViewModel`
- `SupplierTableViewModel`
- `DocumentsViewModel`

The Budget adapter should transform transaction-centric demo data into the
hierarchy expected by the UI:

```text
Project
    Category
        Product
            Budget Line
                Transactions
```

This transformation must happen once inside the adapter layer. React components
must not rebuild this hierarchy repeatedly.

### Single Source of Truth

- `catalog.json` remains the reference for categories, subcategories, and
  products.
- `powerbi_demo.json` remains the reference for projects, suppliers,
  transactions, and financial examples.
- Adding or modifying demo records should happen in the backend seed first
  whenever practical.
- The frontend should introduce derived UI data only when no backend equivalent
  exists.

When backend integration begins, adapters remain in place and only their data
source changes. Seed JSON files are replaced by API responses, while View Models
stay unchanged. This minimizes UI refactoring.

Acceptance:

- Backend seed files are the authoritative demo source.
- Mock data is traceable back to `catalog.json` and `powerbi_demo.json` wherever
  seed coverage exists.
- React components consume View Models instead of raw backend entities.
- Hierarchical Budget data is built once by adapters.
- Mock data mirrors backend field names and enum values.
- Derived frontend-only mock data is minimal and clearly marked.
- Replacing seed JSON with API responses should require minimal UI changes.
- Pages can be implemented without inventing incompatible fields or a second
  fake project domain.

### Chunk 5 - Dashboard Only

Goal:

Implement the main financial overview screen.

Tasks:

- Install `recharts` if not already available.
- Implement `DashboardPage`:
  - KPIs from financial summary fields.
  - Responsive grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
  - Chart cards for budget vs actual, invoice status distribution, monthly
    invoice activity, and transaction counts.
  - Recent transactions table.
- Use Recharts `ResponsiveContainer`.
- Use HSL token colors rather than raw hex colors.
- Run `npm run build`.

Acceptance:

- Dashboard page is visually dense and useful.
- Labels map to actual backend financial fields.
- No mock-only business state conflicts with backend enums.

### Chunk 6 - Budget Workspace Only

Goal:

Implement the Budget workspace for daily project cost management.

Tasks:

- Implement `BudgetPage`:
  - Use financial summary products and budget lines.
  - Show category, subcategory, product, line, line type, selected budget,
    validated quotes, DIY estimate, invoiced amount, paid, unpaid, variance,
    progress.
  - Indent breakdown lines under product context.
  - Render transactions as contextual children of budget lines, initially using
    mock data attached to each line.
  - Add row-level actions to create a quote, DIY estimate, or invoice from a
    specific budget line.
  - Highlight negative variance with destructive styling.
- Run `npm run build`.

Acceptance:

- Budget is the main operational workspace.
- Financial fields and hierarchy match backend summary.
- No mock-only business state conflicts with backend enums.

### Chunk 7 - Contextual Transaction Modal

Goal:

Implement backend-compatible transaction creation and review inside the Budget
workspace.

Tasks:

- Add a `TransactionModal` or inline transaction form launched from a budget
  line row in `BudgetPage`.
- Add a compact transaction child table under each expanded budget line:
  - Date
  - Type
  - Fournisseur
  - Description
  - Montant TTC
  - Statut devis
  - Statut facture
  - Document
- The modal/form must know its current project, product, and budget line context.
- Use section-card form structure inside the modal or drawer:
  - Conditional fields:
    - quote -> quote status and due date
    - invoice -> invoice status, invoice type, payment method, due/payment dates
    - DIY estimate -> no quote/invoice status, can select as budget
- Support the budget-line-scoped payload shape for existing lines:
  `/projects/{project_id}/budget-lines/{budget_line_id}/transactions/`.
- When creating the first transaction for a project product, keep compatibility
  with the product-scoped route:
  `/projects/{project_id}/products/{product_id}/transactions/`.
- Mock submit only.
- Do not create `/transactions` or `/transactions/new` routes.
- Run `npm run build`.

Acceptance:

- No standalone transactions list or creation page exists.
- Transaction actions start from the Budget page.
- The form cannot create impossible payloads such as `payment_date` on a quote.
- Quote/DIY selected-budget behavior is represented.
- Invoices are not selectable as budget candidates.

### Chunk 8 - Suppliers and Documents

Goal:

Implement the remaining operational pages using the same design system.

Tasks:

- Implement `SuppliersPage` with exact backend supplier fields.
- Implement `DocumentsPage` with exact backend document fields and derived document states.
- Keep `SettingsPage` simple but polished.
- Settings may include entry points or placeholder cards for catalog and template
  configuration, but those are not primary nav routes.
- Run `npm run build`.

Acceptance:

- Pages are consistent with the CCIG admin style.
- Supplier page does not persist fake supplier categories or totals as real fields.
- Document page distinguishes backend fields from derived UI state.

---

## 9. Things Not To Do

- Do not recreate the frontend project.
- Do not modify backend files during UI-only chunks.
- Do not introduce Next.js, Material UI, Chakra UI, Bootstrap, or another design
  system.
- Do not use CCIG donation terms in the final UI.
- Do not add primary routes or sidebar items for Projects, Transactions, New
  Transaction, Catalog, Templates, or Reports.
- Do not invent transaction types outside `quote`, `diy_estimate`, and `invoice`.
- Do not invent persisted statuses like `partially_paid`, `rejected`, `credit_note`, or `draft` for transactions.
- Do not treat supplier category or supplier total amount as persisted supplier fields.
- Do not make a landing/marketing page.
- Do not connect write operations to the API until forms and auth behavior are intentionally planned.

---

## 10. Validation Checklist For Each Chunk

Run from `frontend/`:

```text
npm run build
```

When a dev server is needed:

```text
npm run dev
```

Check:

- No blank route.
- No TypeScript errors.
- No Tailwind token classes missing.
- Dense tables do not overflow the viewport without a scroll wrapper.
- Text fits in buttons, sidebar items, badges, and table cells.
- Color use is token-based.
- The page still reads as a construction budget tool, not a charity dashboard.

## 11. Transition to next task - First API Integration Layer

Goal:

Prepare the frontend for backend integration by introducing the API layer, query infrastructure, and application state management while preserving the existing mock-driven UI. This task focuses on read-only integration and establishing the infrastructure required for later authentication and CRUD operations.

Tasks:

- Add an API client module using existing `axios` or fetch.
- Add TanStack Query provider if not already added.
- Define TypeScript API types matching schemas documented above.
- Add read-only query functions for:
  - `GET /projects/`
  - `GET /projects/{project_id}/financial-summary`
  - `GET /suppliers/`
- Add document query helpers only in transaction context:
  - `GET /transactions/{transaction_id}/documents`
  - `GET /documents/{document_id}/download-url`
- Keep all create/update/delete operations mocked. Write operations will be connected later during the feature-specific implementation tasks (Transaction Workspace, Suppliers Management, Documents Management, etc.).
- Do not remove mock data yet. Add a clear switch or keep API functions unused until auth and environment configuration are ready.
- Respect current auth requirements; do not fake production auth tokens in code.
- Run `npm run build`.

Acceptance:

- API types and query functions compile.
- Existing pages continue to work using mock data when the backend is unavailable.
- Integration path is clear and backend-compatible.
