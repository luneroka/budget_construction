# Budget Workspace Integration Reference

## Objective

Replace the current mock-driven Budget Workspace with the real backend
implementation while preserving the existing UX and component
architecture whenever possible.

This document is the implementation reference for Codex and the progress
tracker for the integration.

------------------------------------------------------------------------

# Guiding Principles

-   Backend is the source of truth.
-   Do not modify backend behavior to fit the frontend.
-   Do not introduce duplicate client-side business logic.
-   Preserve the existing UX unless a backend constraint requires a
    change.
-   Prefer incremental integration over large refactors.
-   Keep TypeScript types strict.
-   Remove mocks only after equivalent backend functionality is
    verified.

------------------------------------------------------------------------

# Overall Workflow

## Phase 0 --- Compatibility Audit

Goal: Understand every mismatch before writing implementation code.

Tasks: - Inventory all Budget Workspace components. - Inventory all
backend endpoints. - Compare frontend types vs backend schemas. -
Identify missing fields. - Identify enum/value differences. - Identify
nullable fields. - Identify derived values already computed by
backend. - Produce a discrepancy report.

Deliverable: Compatibility matrix.

Status: - \[ \] Not Started - \[ \] In Progress - \[x\] Completed

------------------------------------------------------------------------

## Phase 1 --- Data Layer

Goal: Wire backend APIs without changing the UI.

Tasks: - Create/update API functions. - Create/update frontend types. -
Create React Query hooks. - Validate endpoint contracts. - Keep mock UI
untouched.

Deliverable: Working typed data layer.

Status: - \[ \] Not Started - \[ \] In Progress - \[x\] Completed

------------------------------------------------------------------------

## Phase 2 --- Read-only Workspace

Goal: Replace mock data progressively.

Suggested order:

1.  Project metadata
2.  Financial summary
3.  Budget line list
4.  Categories/groups
5.  Filters
6.  Sidebar
7.  Totals
8.  Statistics

Rules: - Replace one dataset at a time. - Validate. - Commit. -
Continue.

Status: - \[ \] Not Started - \[ \] In Progress - \[x\] Completed

------------------------------------------------------------------------

## Phase 3 --- Editing

Goal: Enable mutations.

Typical mutations: - Create budget line - Edit budget line - Delete
budget line - Duplicate budget line - Move/reorder line - Update
quantities - Update prices - Update notes

Rules: - One mutation at a time. - Verify cache updates. - Avoid
unnecessary invalidations.

Status: - \[ \] Not Started - \[ \] In Progress - \[x\] Completed

------------------------------------------------------------------------

## Phase 4 --- Calculations

Goal: Ensure frontend calculations match backend.

Verify: - Totals - Subtotals - VAT - Percentages - Margins - Financial
summaries - Derived values

If backend already computes a value: Use backend value.

Status: - \[ \] Not Started - \[ \] In Progress - \[ \] Completed

------------------------------------------------------------------------

## Phase 5 --- Cleanup

Tasks: - Remove mock services - Remove fake data - Remove temporary
adapters - Remove compatibility hacks - Simplify React Query - Final
regression tests

Status: - \[ \] Not Started - \[ \] In Progress - \[ \] Completed

------------------------------------------------------------------------

# Compatibility Report

## Chunk 1 Audit Summary

Status: Completed.

Scope:

-   Frontend Budget Workspace files inspected:
    `frontend/src/pages/BudgetPage.tsx`,
    `frontend/src/components/budget/*`,
    `frontend/src/hooks/useBudgetSelections.ts`,
    `frontend/src/hooks/useBudgetExpansion.ts`,
    `frontend/src/lib/budgetViewModel.ts`,
    `frontend/src/demo/types.ts`,
    `frontend/src/demo/adapters/buildBudgetWorkspace.ts`,
    `frontend/src/demo/scenarios/*`.
-   Existing frontend API files inspected:
    `frontend/src/api/client.ts`, `frontend/src/api/types.ts`,
    `frontend/src/api/projects.ts`, `frontend/src/api/suppliers.ts`,
    `frontend/src/api/documents.ts`.
-   Backend files inspected:
    `backend/app/routers/projects.py`,
    `backend/app/routers/budget_lines.py`,
    `backend/app/routers/transactions.py`,
    `backend/app/routers/documents.py`,
    `backend/app/routers/catalog.py`,
    related schemas, models, repositories, and financial services.

No implementation changes were made for this chunk.

## Endpoint Inventory

Backend endpoints needed by the Budget Workspace:

-   `GET /projects/`
-   `GET /projects/{project_id}`
-   `GET /projects/{project_id}/financial-summary`
-   `GET /projects/{project_id}/budget-lines/`
-   `POST /projects/{project_id}/budget-lines/`
-   `PATCH /projects/{project_id}/budget-lines/{budget_line_id}`
-   `DELETE /projects/{project_id}/budget-lines/{budget_line_id}`
-   `POST /projects/{project_id}/budget-lines/from-template/{template_id}`
-   `POST /projects/{project_id}/products/{product_id}/budget-lines/convert-to-breakdown`
-   `GET /projects/{project_id}/budget-lines/{budget_line_id}/transactions/`
-   `POST /projects/{project_id}/budget-lines/{budget_line_id}/transactions/`
-   `PATCH /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}`
-   `DELETE /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}`
-   `POST /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}/select-budget`
-   `DELETE /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}/select-budget`
-   `POST /projects/{project_id}/products/{product_id}/transactions/`
-   `GET /suppliers/`
-   `GET /transactions/{transaction_id}/documents`
-   `POST /transactions/{transaction_id}/documents`
-   `GET /documents/{document_id}`
-   `GET /documents/{document_id}/download-url`
-   `DELETE /documents/{document_id}`
-   `GET /catalog/tree`

Existing frontend API coverage:

-   Present: projects list, project financial summary, suppliers list,
    transaction documents, document download URL.
-   Missing: budget lines API, transactions API, catalog API, individual
    project read/update helpers, budget selection mutations, product
    conversion mutation, document upload/delete helpers.

## Compatibility Matrix

| Area | Frontend Assumption | Backend Reality | Compatible | Action |
| --- | --- | --- | --- | --- |
| Workspace source | `BudgetPage` reads one mock `budgetWorkspaceViewModel` containing project, categories, financial summary, products, budget lines, transactions, suppliers, and document state. | Backend exposes separate resources. No single workspace endpoint exists. | Partial | Chunk 2 should compose React Query reads from project, financial summary, budget lines, transactions, suppliers, and documents. Do not create a parallel backend endpoint unless explicitly required later. |
| IDs | Demo IDs are strings and often slug-derived (`project.key`, `budget-line-*`, slugged product/category IDs). Expansion and selection state use string IDs. | Backend IDs are numeric for projects, products, budget lines, transactions, suppliers, documents, categories, and subcategories. | Partial | Frontend view model may normalize IDs to strings for UI keys, but API types and mutation payloads must keep numeric IDs. |
| Project metadata | `ProjectViewModel` requires non-null `description`, `location`, `start_date`, `end_date`, `template_id`, and `selected_budget_amount_ttc`. | `ProjectRead` allows nullable `description`, `location`, dates, and `template_id`; selected budget amount is not on `ProjectRead`. | Partial | Merge `ProjectRead` with `ProjectFinancialSummaryRead.selected_budget_amount_ttc`; preserve nullable display fallbacks. |
| Category tree | UI expects categories with nested products and category totals. | `financial-summary` returns products with `category_name`/`subcategory_name`, but no category IDs or inactive empty products. `catalog/tree` returns full catalog with IDs and active flags but no project financials. | Partial | Build presentation categories by grouping financial summary products; use catalog tree only when empty catalog products must be shown or when product IDs/category IDs are needed for creation. |
| Empty products | Demo scenarios can show products with no budget lines. | Financial summary only includes products with active budget lines. Catalog tree includes products independent of project budget lines. | Partial | If the UX must preserve empty products, compose catalog tree with budget lines/financial summary. Otherwise real read-only workspace will only show project budget lines. Decision required before Chunk 3. |
| Budget line read model | `BudgetLineSummaryViewModel` combines identity, selection IDs, financial totals, and transactions. | `BudgetLineRead` has identity, product hierarchy, selection IDs, timestamps. `BudgetLineFinancialSummaryRead` has computed totals. Transactions are separate. | Partial | Chunk 2 adapter should join `BudgetLineRead`, `BudgetLineFinancialSummaryRead`, and per-line transactions into the current view model. |
| Budget line item mode | UI models `product` versus `breakdown` and has decomposition actions. | Backend enforces either one whole-product line or multiple breakdown lines per product, not both. Conversion endpoint supports archive/reuse strategies. | Compatible | Keep this rule backend-owned. UI actions should call convert/create endpoints instead of mutating local structure. |
| Financial totals | Demo adapters calculate totals, invoice sums, selected budget amounts, variances, and counts. | `financial_engine` already computes project, product, and budget-line totals and variances. | Compatible with change | Replace frontend financial calculations with backend summary values. Keep only presentation grouping, labels, and formatting in frontend. |
| Subcategory totals | Frontend derives subcategory totals from grouped products. | Backend does not return subcategory summary objects. | Compatible | Continue deriving subcategory display totals from backend product summaries. This is presentation aggregation, not business calculation. |
| Transaction shape | UI expects `supplier_name`, `select_as_budget`, `document_state`, and nullable status fields. | `TransactionRead` returns `supplier_id`, amounts, statuses, dates, timestamps. It does not include supplier name, `select_as_budget`, or document state. Selection lives on `BudgetLineRead` / financial line summary. Documents are fetched separately. | Partial | Derive supplier name from `GET /suppliers/`; derive selected state by comparing transaction ID to budget-line selection IDs; derive document state from transaction documents. |
| Transaction amounts | UI stores amounts as numbers. API type aliases `ApiDecimal` as string. | Backend Pydantic returns `Decimal`; JSON should be handled as decimal strings or numbers depending encoder behavior. | Partial | Keep API decimal type strict and normalize to number only in a view-model adapter. Avoid money math in UI where backend totals exist. |
| Transaction lifecycle | Modal allows type-specific fields and mock payload preview. | Backend validates status/date constraints: quotes require quote status; invoices require invoice status/type; paid invoices require payment date; non-invoice fields are rejected where invalid. | Mostly compatible | Chunk 4 mutation forms must send only fields allowed for the transaction type and surface API validation errors. |
| Budget selection | `useBudgetSelections` changes selected quote/DIY candidate locally. | Backend has select/unselect endpoints and validates candidates. Only validated quotes and DIY estimates can be selected. | Partial | Replace local selection state with mutations and query invalidation/cache updates. Do not keep local selected budget as source of truth. |
| Product transaction creation | Mock route supports product-scoped creation and `budget_concern`. | Backend supports `POST /projects/{project_id}/products/{product_id}/transactions/`; quotes/DIY need `budget_concern`, specific element needs `budget_line_name`; invoice creation auto-creates/uses a whole-product line only when unambiguous. | Compatible with constraints | Use product-scoped creation only for first/whole-product flows. For split products and existing breakdowns, target the selected budget-line endpoint. |
| Suppliers | UI expects supplier rows and contact info, plus `supplier_name` on transaction rows. | `GET /suppliers/` returns suppliers with contacts; transactions reference suppliers by ID only. | Compatible | Join suppliers by ID in the view model. |
| Documents | UI currently displays coarse `attached/missing/deleted/upload_error` state per transaction. | Backend has per-transaction document list and document metadata. No aggregate document state exists on transactions. Upload can fail at storage time. | Partial | Derive `attached` from non-empty document list; derive missing from empty list. Deleted/upload_error are UI workflow states, not read-model fields. |
| Soft deletes | UI delete dialog currently closes without mutation. | Backend soft deletes budget lines, transactions, and documents; transaction deletion also clears selected budget references and soft-deletes documents. | Compatible | Mutations must invalidate financial summary, budget lines, transactions, and document queries affected by deletion. |
| Sorting | Demo adapter preserves catalog order and transaction seed order. | Budget lines ordered by `sort_order`, `id`; transactions ordered by `issued_date desc`, `id desc`; catalog tree includes `sort_order`. | Compatible | Keep backend order unless UI needs explicit grouping order for category/subcategory presentation. |
| Authentication/read gating | Existing API hooks are gated by `VITE_ENABLE_API_READS`. | Backend endpoints require auth except catalog tree. | Compatible | Chunk 2 should reuse existing auth provider, API client, query client, and read gating. |
| Frontend API types | `api/types.ts` already includes project, supplier, document, and financial summary types. | Missing API types for catalog, product hierarchy in budget lines, budget-line CRUD, transaction CRUD, and mutations. `GeneratedProjectRead.budget_lines` is `unknown[]`. | Partial | Add missing strict API types in Chunk 2 before wiring hooks. |

## Architectural Mismatches / Decisions

-   There is no backend "Budget Workspace" aggregate endpoint. The frontend
    should initially compose existing endpoints rather than modifying backend
    behavior.
-   Preserving the current display of empty catalog products requires joining
    `GET /catalog/tree` with project budget lines and financial summary.
    The backend financial summary alone cannot show products with no budget
    lines. Chunk 3 uses persisted project budget lines only; synthetic empty
    catalog products are not displayed in the real read-only workspace.
-   The current mock view model embeds transactions under financial summary
    rows, but the backend summary intentionally omits transactions. Chunk 2
    decided to fetch transactions lazily per budget line through
    `useBudgetLineTransactionsQuery`. Project-level transaction counts should
    come from `ProjectFinancialSummaryRead`.
-   `document_state` is not a backend field. It must be derived from document
    queries or treated as transient upload UI state.
-   Local budget selection state must be removed when real mutations are wired;
    the backend selection fields are the source of truth.

## Chunk 2 Data Layer Summary

Status: Completed.

Scope:

-   Added missing strict frontend API types for catalog tree, product
    hierarchy, budget lines, product-to-breakdown conversion, transactions,
    project updates, and generated-project budget lines.
-   Added shared `apiPatch` and `apiDelete` helpers.
-   Added `frontend/src/api/catalog.ts` for `GET /catalog/tree`.
-   Added `frontend/src/api/budget-lines.ts` for budget-line reads, CRUD,
    template loading, and product conversion.
-   Added `frontend/src/api/transactions.ts` for transaction reads, creates,
    updates, deletes, and budget candidate select/unselect mutations.
-   Extended `frontend/src/api/projects.ts` with project detail and update
    helpers/hooks.
-   Extended `frontend/src/api/documents.ts` with document detail, upload,
    and delete helpers/hooks.

Validation:

-   `pnpm build` completed successfully from `frontend/`.
-   The existing Vite chunk-size warning remains; no new build failure was
    introduced.

No Budget Workspace UI data source was changed in this chunk. The current mock
workspace remains intact until Chunk 3.

## Chunk 3 Read-only Workspace Summary

Status: Completed.

Scope:

-   Added a backend-to-Budget Workspace adapter in
    `frontend/src/lib/budgetWorkspaceApiAdapter.ts`.
-   Replaced `BudgetPage`'s direct mock workspace import with real selected
    project data from `GET /projects/{project_id}`,
    `GET /projects/{project_id}/financial-summary`, and
    `GET /projects/{project_id}/budget-lines/`.
-   Kept backend-computed totals as the source of truth. The frontend only
    groups products into category sections for presentation.
-   Added loading, error, no-project, and empty-budget states for the Budget
    page.
-   Wired expanded transaction panels to fetch
    `GET /projects/{project_id}/budget-lines/{budget_line_id}/transactions/`
    lazily, plus suppliers for supplier names.
-   Set the real workspace path to read-only: add/decompose/edit/delete/select
    controls are hidden or disabled until Chunk 4 mutations.
-   Left the demo adapter files in place for non-Budget pages and later
    cleanup.

Validation:

-   `pnpm build` completed successfully from `frontend/`.
-   The existing Vite chunk-size warning remains.

No backend files were changed.

## Chunk 4 Editing And Mutations Summary

Status: Completed.

Scope:

-   Replaced transaction creation mock payloads with real API calls:
    `POST /projects/{project_id}/budget-lines/{budget_line_id}/transactions/`
    and `POST /projects/{project_id}/products/{product_id}/transactions/`.
-   Replaced transaction edit mock payloads with real
    `PATCH /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}`.
-   Wired transaction soft-delete to
    `DELETE /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}`.
-   Wired selected-budget toggling to the backend select/unselect endpoints.
-   Replaced product-structure demonstration actions with real budget-line
    creation and product-line conversion mutations.
-   Added shared Budget Workspace cache invalidation for project metadata,
    financial summary, budget lines, and transaction rows after mutations.
-   Kept backend validation as the source of truth and surfaced API errors in
    dialogs.

Validation:

-   `pnpm build` completed successfully from `frontend/`.
-   Local smoke check returned `200 OK` for `/budget`.
-   The existing Vite chunk-size warning remains.

No backend files were changed.

------------------------------------------------------------------------

# Component Mapping

| Component / Module | Backend Endpoint(s) | Query Hook Needed | Mutation Needed | Status |
| --- | --- | --- | --- | --- |
| `BudgetPage` | `GET /projects/{id}`, `GET /projects/{id}/financial-summary`, `GET /projects/{id}/budget-lines/`, transaction reads, suppliers, documents, optional `GET /catalog/tree` | `useBudgetWorkspaceQuery` or composed hooks | None directly | Audited |
| `BudgetSummaryCards` | `GET /projects/{id}/financial-summary` | Existing `useProjectFinancialSummaryQuery` can supply data | None | Audited |
| `BudgetTree` | Financial summary + budget lines + optional catalog tree | Budget workspace composition hook | None directly | Audited |
| `BudgetTreeRows` | Financial summary + budget lines | Budget workspace composition hook | Product conversion, budget-line create for breakdown actions | Audited |
| `TransactionsPanel` | `GET /projects/{id}/budget-lines/{line_id}/transactions/`, `GET /transactions/{transaction_id}/documents`, `GET /suppliers/` | `useBudgetLineTransactionsQuery`, document queries, suppliers query | Select/unselect budget, delete transaction | Audited |
| `TransactionModal` | Transaction create/update endpoints, suppliers | Suppliers query plus current transaction context | Create transaction for product, create transaction for budget line, update transaction, select/unselect budget | Audited |
| `TransactionReviewModal` | Existing transaction context; update endpoint | Optional transaction detail query | Patch transaction, select/unselect budget | Audited |
| `DeleteTransactionDialog` | `DELETE /projects/{id}/budget-lines/{line_id}/transactions/{transaction_id}` | None | Delete transaction | Audited |
| `ProductStructureDialog` | `POST /projects/{id}/products/{product_id}/budget-lines/convert-to-breakdown`, `POST /projects/{id}/budget-lines/` | None | Convert product line, create breakdown line | Audited |
| `useBudgetSelections` | Selection fields on budget lines plus select/unselect endpoints | Should be replaced or reduced to optimistic mutation helper | Select/unselect budget | Audited |
| `useBudgetExpansion` | UI-only | None | None | Compatible |

------------------------------------------------------------------------

# Progress Tracker

## Completed

-   Chunk 1 compatibility audit.
-   Frontend Budget Workspace component inventory.
-   Backend endpoint/schema inventory.
-   Frontend/backend compatibility matrix.
-   Component-to-endpoint mapping.
-   Chunk 2 data layer.
-   Strict frontend API types for the Budget Workspace backend contract.
-   React Query hooks for catalog, budget lines, transactions, document
    mutations, project detail/update, and existing summary resources.
-   Chunk 3 read-only Budget Workspace integration.
-   Real project metadata, backend financial summary, budget-line hierarchy,
    and lazy real transaction rows are displayed in the Budget page.
-   Chunk 4 editing and mutations.
-   Transaction create/update/delete, selected-budget toggles, budget-line
    creation, and product conversion are wired to backend endpoints.

## Current Task

-   Chunk 4 complete. Budget Workspace editing uses backend mutations.

## Next Task

-   Chunk 5: verify frontend display values against backend financial
    calculations and remove any remaining duplicated calculation behavior.

## Blocking Issues

-   Empty catalog products are intentionally not shown in Chunk 3. Revisit only
    if the product-management workflow requires a catalog/template browser.
-   Transactions will be fetched lazily per budget line unless Chunk 3 exposes
    a concrete UX requirement for eager transaction loading.

------------------------------------------------------------------------

# Rules for Codex

Always:

-   Follow the existing architecture.
-   Reuse existing providers.
-   Reuse existing hooks.
-   Keep React Query idiomatic.
-   Keep components focused.
-   Stop and report architectural mismatches instead of inventing
    workarounds.

Never:

-   Modify backend behavior.
-   Duplicate backend calculations.
-   Introduce parallel application state.
-   Replace multiple datasets in one step.
-   Remove mocks before verification.

------------------------------------------------------------------------

# Suggested Chunk Plan

## Chunk 1

Compatibility audit only.

Deliverable: Compatibility report. No implementation.

## Chunk 2

Data layer.

Deliverable: API, types, React Query hooks.

## Chunk 3

Read-only Budget Workspace.

Deliverable: Real data displayed.

## Chunk 4

Editing and mutations.

Deliverable: CRUD fully operational.

## Chunk 5

Calculations verification.

Deliverable: Verified totals and summaries.

## Chunk 6

Cleanup and mock removal.

Deliverable: Production-ready Budget Workspace.
