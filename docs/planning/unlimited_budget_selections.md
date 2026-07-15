# Allow unlimited selected quotes + DIY estimates per budget line

**Status: planned, not yet implemented.** This is an approved implementation
plan saved for later execution — nothing in this document reflects the
current codebase state. Cross-check file paths/line numbers against the code
before implementing, since they may drift.

## Context

Today a budget line can have **at most one selected quote and at most one
selected DIY estimate** contributing to its budget. This isn't an app-level
rule that rejects a second selection — it's baked into the data model: each
`budget_line` row has two *scalar* nullable FK columns,
`selected_quote_transaction_id` and `selected_diy_estimate_transaction_id`,
enforced by Postgres partial-unique indexes and a trigger
(`backend/alembic/versions/a5f6b7c8d9e0_split_budget_line_selected_candidates.py`).
Because each column can only point at one transaction, selecting a second
quote silently **overwrites** the first (confirmed by
`test_select_budget_candidate_keeps_quote_and_diy_selections` in
`backend/tests/api/test_transaction_routes.py:415-463`).

The goal is to relax this: any number of quotes and DIY estimates should be
selectable as budget for the same line, with no cap. This also needs to be
"documented and visible in the code" — right now the 1-per-type limit is an
implicit consequence of column shape, not a readable rule.

Git history shows this schema was already boolean-based once
(`transactions.is_selected_budget`, in the original
`af18ade45655_create_transactions_table.py` migration) before two later
migrations moved selection onto `budget_lines` scalar FKs specifically to
support "one quote + one DIY simultaneously." Going to "unlimited" is a
return to that boolean-per-transaction shape, minus the old "one selected
transaction per budget line" uniqueness constraint. This isn't a new pattern
being introduced — it's reusing a design this codebase has already built and
tested once (`backend/alembic/versions/b7e4c8d9a123_move_selected_budget_to_budget_lines.py`
has the exact reverse migration to crib from), which keeps risk low.

As a side effect, this removes a fair amount of duplicated
"compare-transaction-id-to-a-scalar-FK" logic that's currently spread across
3 backend read paths and 3 frontend files (see below) — selection becomes a
plain boolean on each transaction instead of something every consumer has to
re-derive by comparison. It also fixes a latent display bug: the "budget
sélectionné" label in `TransactionsPanel.tsx` currently always reads "Aucun
budget sélectionné" regardless of actual selection, because it reads
`budgetLine.transactions`, which the adapter always sets to `[]`
(`budgetWorkspaceApiAdapter.ts:110`).

## Approach: boolean `is_selected_budget` on `Transaction`, no uniqueness

Add `Transaction.is_selected_budget: bool` (default `False`), keep the
existing DB check constraint pattern (`NOT is_selected_budget OR
transaction_type IN ('quote', 'diy_estimate')`), and **do not** add any
uniqueness constraint — that absence *is* the "unlimited" rule, and it should
be called out with a comment at the point it matters (the migration and the
`BudgetLine` model). Remove `budget_lines.selected_quote_transaction_id` /
`selected_diy_estimate_transaction_id` and their triggers/indexes entirely.

### 1. Migration (new file, down_revision = current head `d9a1c3f6b284`)

Model it directly on `b7e4c8d9a123`'s `downgrade()` (adds the boolean column
back) combined with `a5f6b7c8d9e0`'s teardown of the composite FK/trigger
(its `upgrade()` does the drop, minus recreating the single-FK version).
Concretely, `upgrade()`:

1. Drop analytics views (`_drop_analytics_views()` pattern, reused verbatim).
2. `op.add_column('transactions', sa.Column('is_selected_budget', sa.Boolean(), server_default='false', nullable=False))`.
3. `op.create_check_constraint('ck_transactions_selected_budget_candidate', 'transactions', "NOT is_selected_budget OR transaction_type IN ('quote', 'diy_estimate')")`.
4. Backfill: `UPDATE transactions t SET is_selected_budget = TRUE FROM budget_lines bl WHERE (bl.selected_quote_transaction_id = t.id OR bl.selected_diy_estimate_transaction_id = t.id) AND bl.deleted_at IS NULL AND t.deleted_at IS NULL`.
5. Drop trigger + function `enforce_budget_line_selected_budget_candidates` (`_drop_composite_selected_budget_trigger()` pattern).
6. Drop indexes `uq_budget_lines_selected_quote_transaction` / `uq_budget_lines_selected_diy_estimate_transaction`.
7. Drop FK constraints + columns `selected_quote_transaction_id` / `selected_diy_estimate_transaction_id` on `budget_lines`.
8. Regenerate analytics views using the **raw** `_budget_line_view_sql(filename)` helper (no `is_selected_budget` substitution needed — the source `.sql` templates already reference `t.is_selected_budget` directly, confirmed in `backend/analytics/sql/vw_transactions_fact.sql:42` and `vw_project_items_fact.sql:25`/`vw_project_summary.sql:24`).
9. Leave a one-line comment on the check constraint noting deliberately no uniqueness — that's the "unlimited" rule.

`downgrade()`: recreate the two FK columns/indexes/trigger (copy from
`a5f6b7c8d9e0.upgrade()`), collapse potentially-many selections back to one
scalar per type using `DISTINCT ON (budget_line_id) ... ORDER BY budget_line_id, id`
per type (same pattern as `b7e4c8d9a123`'s upgrade backfill) — lossy by
nature, that's expected for a downgrade — then drop the check constraint and
column, and regenerate the composite views.

### 2. Backend models

- `backend/app/models/transaction.py`: add `is_selected_budget: Mapped[bool]` column + the check constraint in `__table_args__`.
- `backend/app/models/budget_line.py`: delete `selected_quote_transaction_id`, `selected_diy_estimate_transaction_id`, their two indexes, and the `selected_quote_transaction`/`selected_diy_estimate_transaction` relationships.

### 3. Backend repository (`backend/app/repositories/transaction.py`)

- `validate_selected_budget_candidate`: unchanged (type/quote-status eligibility check).
- `_set_selected_budget_candidate` / `_clear_selected_budget_candidate_if_matches`: replace the `UPDATE budget_lines ...` statements with a direct `transaction.is_selected_budget = True/False` assignment (or a targeted `UPDATE transactions WHERE id = ...`). No more budget-line lookups, no more "clear if matches" — just set the flag on the one transaction being toggled.
- `_ensure_selected_budget_candidate_remains_valid`: replace the `SELECT BudgetLine.id WHERE selected_quote_transaction_id == transaction.id` query with a simple in-memory check on `transaction.is_selected_budget` — no query needed at all.
- `create_transaction`, `update_transaction`, `select_budget_candidate`, `unselect_budget_candidate`, `soft_delete_transaction`: update their calls to the simplified helpers above; behavior otherwise the same.

### 4. Backend schemas (`backend/app/schemas/transaction.py`)

- Add `is_selected_budget: bool = False` to `TransactionReadBase` (or `TransactionRead`) so every transaction read model carries its own selection state.
- Remove `selected_quote_transaction_id` / `selected_diy_estimate_transaction_id` from `ProjectTransactionRead` — no longer needed once each transaction reports its own flag.
- `backend/app/schemas/financial_engine.py`: remove the same two fields from `BudgetLineFinancialSummaryRead`.

### 5. Backend routers

- `backend/app/routers/transactions.py::_to_project_transaction_read`: delete the `selected_quote_transaction_id=budget_line.selected_quote_transaction_id, selected_diy_estimate_transaction_id=...` lines (lines 55-58) — `is_selected_budget` now comes through automatically via `TransactionRead.model_validate(transaction)`.
- `backend/app/routers/integrity.py::CONSTRAINT_MESSAGES`: remove the two now-nonexistent index-name entries (`uq_budget_lines_selected_quote_transaction`, `uq_budget_lines_selected_diy_estimate_transaction`).

### 6. Financial engine (`backend/app/services/financial_engine.py`)

- `_calculate_budget_line_totals` (~line 625-645): replace the scalar-FK comparison with `is_selected=transaction.is_selected_budget`. `FinancialTotals.add_transaction`/`merge` already sum generically — no change needed there, multiple selected transactions of the same type simply add up.
- `budget_line_financials_to_read_model` (~line 714-727): drop the two `selected_*_transaction_id=budget_line.selected_*` lines to match the schema change in step 4.

### 7. Frontend types & adapters

- `frontend/src/types/budget.ts`: remove `selected_quote_transaction_id` / `selected_diy_estimate_transaction_id` from `BudgetLine`.
- `frontend/src/api/types.ts`: remove the matching fields from the `ProjectTransactionRead`-like and `BudgetLineFinancialSummaryRead`-like response types; add `is_selected_budget: boolean` (or reuse existing naming) to the transaction read type.
- `frontend/src/lib/budgetWorkspaceApiAdapter.ts::transactionToDomain` (lines 198-235): change `select_as_budget` from the scalar-comparison expression to a direct pass-through of `transaction.is_selected_budget`. Also drop the now-dead `selected_quote_transaction_id`/`selected_diy_estimate_transaction_id` mapping in `budgetLineToDomain` (lines 94-112).
- `frontend/src/lib/transactionWorkspace.ts::buildTransactionRow` (lines 102-185): same simplification — `select_as_budget: transaction.is_selected_budget` instead of the two-way ID comparison; drop the two ID fields from the constructed `budgetLine` object.

### 8. `frontend/src/lib/budgetDomain.ts`

- Delete `BudgetSelectionState`, `isSelectedBudgetTransaction`, and `getSelectedBudgetParts` — no longer needed since selection is a plain field on `Transaction`.
- Rewrite `formatSelectedBudgetSource` to take a transaction list instead of a `BudgetLine`, and count instead of assuming ≤1:
  ```ts
  export function formatSelectedBudgetSource(transactions: Transaction[]) {
    const quoteCount = transactions.filter(
      (t) => t.transaction_type === 'quote' && t.select_as_budget,
    ).length
    const diyCount = transactions.filter(
      (t) => t.transaction_type === 'diy_estimate' && t.select_as_budget,
    ).length
    const parts = [
      quoteCount > 0 ? `${quoteCount} devis` : null,
      diyCount > 0
        ? `${diyCount} estimation${diyCount > 1 ? 's' : ''} DIY`
        : null,
    ].filter(Boolean)
    return parts.length > 0 ? parts.join(' + ') : 'Aucun budget sélectionné'
  }
  ```
- `canToggleBudgetSelection` stays as-is (pure type/status eligibility, unrelated to the cap).

### 9. `frontend/src/components/budget/TransactionsPanel.tsx`

- Replace `isSelectedBudgetTransaction(transaction, budgetSelection)` with `transaction.select_as_budget` directly (line 102-105, 301-304).
- Call `formatSelectedBudgetSource(transactions)` with the panel's already-fetched `transactions` array (the local variable built at lines 250-266) instead of `props.budgetLine` — this also fixes the always-empty-array display bug noted above.
- Drop the now-unused `budgetSelection` prop from `TransactionsPanelProps` and its threading.

### 10. `frontend/src/components/budget/TransactionModal.tsx` (`TransactionReviewModal`)

- Its `isBudgetSelected` / `canToggleBudgetSelection` props stay as props (they're already booleans passed in by the caller) — no internal change needed beyond what callers now pass in (see below).

### 11. Callers: `BudgetPage.tsx`, `TransactionsPage.tsx`, `DashboardPage.tsx`, `BudgetTree.tsx`

Each of these currently has a `getBudgetSelection`/inline helper that builds a
`BudgetSelectionState` from `budgetLine.selected_*_transaction_id` and feeds
it to `isSelectedBudgetTransaction(...)` to compute the `isBudgetSelected`
prop passed into `TransactionReviewModal`. Replace with the transaction's own
`select_as_budget` field directly, e.g.
`isBudgetSelected={transactionReview.context.transaction.select_as_budget}`.
This also removes:
- `BudgetPage.tsx`'s `getBudgetSelection` (lines 101-107) and the no-op
  `getLineWithBudgetSelection`/`toggleBudgetSelection` stubs (lines 109-118,
  already dead — the comment there says "Chunk 4 will wire mutations" and it
  never got wired).
- `DashboardPage.tsx`'s equivalent helper (~lines 97-102).
- `TransactionsPage.tsx`'s equivalent helper (~lines 107-111).
- `BudgetTree.tsx`'s `budgetSelection`/`getBudgetSelection`/`getLineWithBudgetSelection` props and their threading (props type ~lines 41-42, usages ~429, 480, 502, 530).

### 12. Docs

- `docs/database/schema.dbml`: remove the two `selected_*_transaction_id` columns, their two unique-index notes, and the two `Ref:` lines on `budget_lines` (~lines 189-190, 202-203, 216-222, 296-297); add `is_selected_budget boolean` to the `transactions` table definition with a short note that multiple quotes/DIY estimates can be selected per budget line.
- `docs/architecture/batibudget_project_summary.md`: rewrite section "6.4 Quotes and DIY estimates define the selected budget" (~line 312-329) to describe the boolean-per-transaction model and explicitly state there's no cap on how many quotes/DIY estimates can be selected; add a new row to the "Section 15. Decisions Superseded" table (~line 668) superseding the current "one validated quote and one DIY estimate" row.
- `docs/ui/budget_spec.md`: update the "Transaction shape" row (~line 63) — selection no longer needs to be derived by comparing IDs, it's a direct `is_selected_budget`/`select_as_budget` field on the transaction now.

### 13. Tests

- `backend/tests/api/test_transaction_routes.py`: rewrite `test_select_budget_candidate_keeps_quote_and_diy_selections` (lines 415-463) to assert that selecting a *second* quote leaves the *first* quote still selected (both `is_selected_budget = True`), rather than asserting a silent swap. Add a case selecting 2+ DIY estimates simultaneously.
- `backend/tests/api/test_financial_engine_routes.py`: update the fixture setup (~lines 152-154) that directly assigns `budget_line.selected_quote_transaction_id = ...` to instead set `transaction.is_selected_budget = True` on the relevant rows; extend one test to select multiple quotes for the same line and assert `selected_quote_budget_amount_ttc` sums all of them.

## Verification

1. Backend: `cd backend && alembic upgrade head` against the dev DB, then run the updated pytest suite (`test_transaction_routes.py`, `test_financial_engine_routes.py`) to confirm select/unselect and totals behave correctly with multiple selections.
2. Frontend: `npx tsc --noEmit` to catch every call site touched by the type/field removals.
3. Manual pass in the running dev app (already up via docker compose): open a budget line with an existing selected quote, add and select a second quote, confirm both show as "Sélectionné" simultaneously, the budget total sums both, and the "budget sélectionné" label under the transaction list shows the correct count (e.g. "2 devis + 1 estimation DIY").
