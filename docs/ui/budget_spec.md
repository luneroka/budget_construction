# Budget Workspace Reference

## Status

The Budget Workspace runs entirely on real backend data. The mock-driven
implementation described in earlier revisions of this document has been fully
replaced and removed. This document now records the frontend/backend mapping
and the architectural decisions made during that integration, for anyone
extending the Budget Workspace later.

---

# Guiding Principles

- Backend is the source of truth.
- Do not modify backend behavior to fit the frontend.
- Do not introduce duplicate client-side business logic.
- Keep TypeScript types strict.

---

# Endpoint Inventory

Backend endpoints used by the Budget Workspace:

- `GET /projects/`
- `GET /projects/{project_id}`
- `GET /projects/{project_id}/financial-summary`
- `GET /projects/{project_id}/budget-lines/`
- `POST /projects/{project_id}/budget-lines/`
- `PATCH /projects/{project_id}/budget-lines/{budget_line_id}`
- `DELETE /projects/{project_id}/budget-lines/{budget_line_id}`
- `POST /projects/{project_id}/budget-lines/from-template/{template_id}`
- `POST /projects/{project_id}/products/{product_id}/budget-lines/convert-to-breakdown`
- `GET /projects/{project_id}/budget-lines/{budget_line_id}/transactions/`
- `POST /projects/{project_id}/budget-lines/{budget_line_id}/transactions/`
- `PATCH /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}`
- `DELETE /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}`
- `POST /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}/select-budget`
- `DELETE /projects/{project_id}/budget-lines/{budget_line_id}/transactions/{transaction_id}/select-budget`
- `POST /projects/{project_id}/products/{product_id}/transactions/`
- `GET /suppliers/`
- `GET /transactions/{transaction_id}/documents`
- `POST /transactions/{transaction_id}/documents`
- `GET /documents/{document_id}`
- `GET /documents/{document_id}/download-url`
- `DELETE /documents/{document_id}`
- `GET /catalog/tree`

## Compatibility Matrix

| Area                         | Frontend Model                                                                                                                 | Backend Reality                                                                                                                                                                                                                | Notes                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace source             | `BudgetPage` composes React Query reads from project, financial summary, budget lines, transactions, suppliers, and documents. | Backend exposes separate resources; there is no single "Budget Workspace" aggregate endpoint.                                                                                                                                  | Do not create a parallel backend endpoint unless explicitly required.                                                                                                          |
| IDs                          | View model may normalize IDs to strings for UI keys.                                                                           | Backend IDs are numeric for projects, products, budget lines, transactions, suppliers, documents, categories, and subcategories.                                                                                               | API types and mutation payloads must keep numeric IDs.                                                                                                                         |
| Project metadata             | Merges `ProjectRead` with `ProjectFinancialSummaryRead.selected_budget_amount_ttc`.                                            | `ProjectRead` allows nullable `description`, `location`, dates, and `template_id`; selected budget amount is not on `ProjectRead`.                                                                                             | Preserve nullable display fallbacks.                                                                                                                                           |
| Category tree                | Presentation categories are built by grouping financial summary products.                                                      | `financial-summary` returns products with `category_name`/`subcategory_name` but no category IDs or inactive empty products. `catalog/tree` returns the full catalog with IDs and active flags but no project financials.      | Use catalog tree only when empty catalog products must be shown or when product/category IDs are needed for creation.                                                          |
| Empty products               | Real read-only workspace only shows persisted project budget lines.                                                            | Financial summary only includes products with active budget lines. Catalog tree includes products independent of project budget lines.                                                                                         | Revisit only if a catalog/template browser is required.                                                                                                                        |
| Budget line read model       | Joins `BudgetLineRead`, `BudgetLineFinancialSummaryRead`, and per-line transactions into one view model.                       | `BudgetLineRead` has identity, product hierarchy, timestamps. `BudgetLineFinancialSummaryRead` has computed totals. Transactions are fetched separately, each carrying its own `is_selected_budget` flag.                      | Transactions are fetched lazily per budget line via `useBudgetLineTransactionsQuery`.                                                                                          |
| Budget line item mode        | UI actions call convert/create endpoints instead of mutating local structure.                                                  | Backend enforces either one whole-product line or multiple breakdown lines per product, not both. Conversion endpoint supports archive/reuse strategies.                                                                       | Rule is backend-owned.                                                                                                                                                         |
| Financial totals             | Frontend only does presentation grouping, labels, and formatting.                                                              | `financial_engine` computes project, product, and budget-line totals and variances.                                                                                                                                            | Never recompute totals client-side.                                                                                                                                            |
| Subcategory totals           | Frontend derives subcategory display totals from grouped products.                                                             | Backend does not return subcategory summary objects.                                                                                                                                                                           | This is presentation aggregation, not business calculation.                                                                                                                    |
| Transaction shape            | Supplier name and document state are derived client-side; selected state is a direct pass-through.                            | `TransactionRead` returns `supplier_id`, amounts, statuses, dates, timestamps, `is_selected_budget` — no supplier name or document state.                                                                                      | Derive supplier name from `GET /suppliers/`; map `is_selected_budget` straight to `select_as_budget`; derive document state from transaction documents.                        |
| Transaction amounts          | Normalized to number only in the view-model adapter.                                                                           | Backend Pydantic returns `Decimal`.                                                                                                                                                                                            | Avoid money math in the UI where backend totals exist.                                                                                                                         |
| Transaction lifecycle        | Mutation forms send only fields allowed for the transaction type and surface API validation errors.                            | Backend validates status/date constraints: quotes require quote status; invoices require invoice status/type; paid invoices require payment date; non-invoice fields are rejected where invalid.                               |                                                                                                                                                                                |
| Budget selection             | Selection is driven entirely by mutations and query invalidation.                                                              | Backend has select/unselect endpoints and validates candidates; DIY estimates and quotes in any status except rejected can be selected. Any number of quotes and DIY estimates can be selected simultaneously per budget line; there is no cap. A selected quote cannot be changed to rejected. | There is no local selection state; the backend is the source of truth.                                                                                                         |
| Product transaction creation | Product-scoped creation is used only for first/whole-product flows.                                                            | `POST /projects/{project_id}/products/{product_id}/transactions/`; quotes/DIY need `budget_concern`, specific element needs `budget_line_name`; invoice creation auto-creates/uses a whole-product line only when unambiguous. | For split products and existing breakdowns, target the selected budget-line endpoint instead.                                                                                  |
| Suppliers                    | Joined by ID in the view model.                                                                                                | `GET /suppliers/` returns suppliers with contacts; transactions reference suppliers by ID only.                                                                                                                                |                                                                                                                                                                                |
| Documents                    | `attached` derived from a non-empty document list; missing from an empty list.                                                 | Backend has per-transaction document list and document metadata; no aggregate document state exists on transactions.                                                                                                           | Deleted/upload_error are UI workflow states, not read-model fields.                                                                                                            |
| Soft deletes                 | Mutations invalidate financial summary, budget lines, transactions, and document queries affected by deletion.                 | Backend soft deletes budget lines, transactions, and documents; transaction deletion also unsets its own `is_selected_budget` flag and soft-deletes documents.                                                                  |                                                                                                                                                                                |
| Sorting                      | Backend order is kept unless UI needs explicit grouping order for category/subcategory presentation.                           | Budget lines ordered by `sort_order`, `id`; transactions ordered by `issued_date desc`, `id desc`; catalog tree includes `sort_order`.                                                                                         |                                                                                                                                                                                |
| Frontend API types           | `api/types.ts` includes project, supplier, document, financial summary, catalog, budget-line, and transaction types.           | Backend schemas as above.                                                                                                                                                                                                      |                                                                                                                                                                                |

## Architectural Mismatches / Decisions

- There is no backend "Budget Workspace" aggregate endpoint. The frontend
  composes existing endpoints rather than modifying backend behavior.
- Preserving a display of empty catalog products would require joining
  `GET /catalog/tree` with project budget lines and financial summary; the
  backend financial summary alone cannot show products with no budget
  lines. The real read-only workspace intentionally does not display
  synthetic empty catalog products.
- `document_state` is not a backend field. It is derived from document
  queries and treated as transient upload UI state.

---

# Component Mapping

| Component / Module        | Backend Endpoint(s)                                                                                                                                                     | Query Hook                                                          | Mutation                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `BudgetPage`              | `GET /projects/{id}`, `GET /projects/{id}/financial-summary`, `GET /projects/{id}/budget-lines/`, transaction reads, suppliers, documents, optional `GET /catalog/tree` | Composed hooks                                                      | None directly                                                                                                  |
| `BudgetSummaryCards`      | `GET /projects/{id}/financial-summary`                                                                                                                                  | `useProjectFinancialSummaryQuery`                                   | None                                                                                                           |
| `BudgetTree`              | Financial summary + budget lines + optional catalog tree                                                                                                                | Budget workspace composition hook                                   | None directly                                                                                                  |
| `BudgetTreeRows`          | Financial summary + budget lines                                                                                                                                        | Budget workspace composition hook                                   | Product conversion, budget-line create for breakdown actions                                                   |
| `TransactionsPanel`       | `GET /projects/{id}/budget-lines/{line_id}/transactions/`, `GET /transactions/{transaction_id}/documents`, `GET /suppliers/`                                            | `useBudgetLineTransactionsQuery`, document queries, suppliers query | Select/unselect budget, delete transaction                                                                     |
| `TransactionModal`        | Transaction create/update endpoints, suppliers                                                                                                                          | Suppliers query plus current transaction context                    | Create transaction for product, create transaction for budget line, update transaction, select/unselect budget |
| `TransactionReviewModal`  | Existing transaction context; update endpoint                                                                                                                           | Optional transaction detail query                                   | Patch transaction, select/unselect budget                                                                      |
| `DeleteTransactionDialog` | `DELETE /projects/{id}/budget-lines/{line_id}/transactions/{transaction_id}`                                                                                            | None                                                                | Delete transaction                                                                                             |
| `ProductStructureDialog`  | `POST /projects/{id}/products/{product_id}/budget-lines/convert-to-breakdown`, `POST /projects/{id}/budget-lines/`                                                      | None                                                                | Convert product line, create breakdown line                                                                    |
| `useBudgetExpansion`      | UI-only                                                                                                                                                                 | None                                                                | None                                                                                                           |

---

# Rules for Future Changes

Always:

- Follow the existing architecture.
- Reuse existing providers and hooks.
- Keep React Query idiomatic.
- Keep components focused.
- Stop and report architectural mismatches instead of inventing
  workarounds.

Never:

- Modify backend behavior to fit the frontend.
- Duplicate backend calculations.
- Introduce parallel application state for data the backend already owns.
