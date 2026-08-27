# Code Sanity Review & Remediation Plan — 2026-08-27

Whole-codebase pass over Bâti Budget (FastAPI backend, React/Vite frontend,
CI) looking at two things: **(1) code quality & safety** — guarded routes,
logic errors, things that can break or leak — and **(2) code hygiene** —
duplication, separation of concerns, dead code. The security-specific pass
already lives in `docs/security/security_audit_2026-08-26.md`; nothing from
it is repeated here, only referenced.

**Bar.** The app works in production and is owner-operated for a small
family user base. The goal is *sane, easy to keep working*, not
*textbook*. Every item below was filtered against "would this change break
more than it prevents?" — items that failed that test are listed at the end
as explicitly *not recommended*.

**Method.** Read every backend module (`app/`), every router/service/
repository, the models and schemas, the test layout and CI workflows; read
the frontend auth/API/state/layout layer in full and the page and component
layer by structure (outlines + targeted reads of the largest files). Ran
`ruff check` (clean), `tsc --noEmit -p tsconfig.app.json` (clean) and
`oxlint` (4 warnings, listed below). The backend suite (221 tests) was **not
re-run**: port 5435 is currently held by another project's
`db-test` container and `tests/conftest.py` drops `public` on whatever it
connects to. The suite was green on 2026-08-26 per the security audit; run
it before starting WP-1.

---

## 1. Executive summary

The codebase is in good shape. The layering (routers → services →
repositories → models, pydantic schemas at the edge) is consistent, every
data query is scoped by `user_id`, the error envelope is uniform, and the
backend has real tests (221) plus migration and dependency CI. The frontend
has a clean auth/API core (in-memory token, single-flight refresh, typed
error mapping) and a coherent React Query key scheme.

What needs attention, in priority order:

| # | Finding | Category | Severity |
|---|---------|----------|----------|
| Q-01 | Synchronous boto3 (R2) calls run inside `async` request handlers — a 20 MB upload or a slow R2 response freezes the whole uvicorn worker for every other user. A new boto3 client is also built on every call. | Quality/safety | **High** |
| Q-02 | Permanently deleting a user leaves every supplier document (RIB) file in R2 forever — only transaction documents are cleaned up. | Quality/safety | **Medium** |
| Q-03 | `/catalog/tree`, `/categories/*`, `/subcategories/*`, `/products/*` are served without authentication; the SPA only uses `/catalog/tree` (behind login). | Quality/safety | Medium |
| Q-04 | The API→SPA error-code contract depends on exact English message strings; ~12 messages currently fall through to a generic "La demande est invalide." | Quality/safety | Medium |
| Q-05 | No frontend job in CI — type errors only surface during the production `docker build` on the VPS. | Quality/safety | Medium |
| Q-06 | "No project selected" resolves to project id `0` on the Budget and Transactions pages (requests `/projects/0/…`, gets 404) while other pages guard with `> 0`. | Quality/safety | Low |
| H-01 | Same ownership/loader helpers re-implemented 3–5× across repositories and services (`_get_active_project` ×5, `_get_active_product` ×3, product-hierarchy `joinedload` chain ×4). | Hygiene | High |
| H-02 | `TransactionModal.tsx` is 2,029 lines holding two modals, a supplier quick-create, a documents panel and all pure form maths; the two modals duplicate their amount-recalculation logic verbatim. | Hygiene | High |
| H-03 | Frontend API→domain adapters are copy-pasted per page (`projectToDomain` ×3, `supplierToDomain` ×2, `decimalToNumber` ×4). | Hygiene | Medium |
| H-04 | `enableReadQueries` feature flag is dead: every hook reads it and every call site overrides it with `{ enabled: true }` (50 occurrences). | Hygiene | Medium |
| H-05 | Four copies of the Resend send/error block in `mailer.py`; two copies of the upload pipeline (`documents.py` vs `supplier_documents.py`). | Hygiene | Medium |
| H-06 | 76 hand-written `if x is None: raise HTTPException(404, …)` blocks and 12 near-identical dashboard endpoints in `projects.py`. | Hygiene | Low |
| H-07 | Dead/hidden code: `{false ? … : null}` blocks in `ProjectsSettingsPage`, three unused public routers, an unused `/users/{id}` route, a leftover English error key in `client.ts`. | Hygiene | Low |

Estimated effort for everything recommended below: **~3 working days**,
split into four independently shippable packages. Nothing requires a
database migration; every package is a code-only rollout.

### Remediation status

Validated by the owner on 2026-08-27 (all packages, incrementally; delete
unused routers; backend invariant test replaces the frontend verification
file; empty state — no first-project fallback — when nothing is selected).

| Pkg | Status | Notes |
|-----|--------|-------|
| WP-1 Safety fixes | ✅ Done 2026-08-27 | Q-01…Q-05, Q-07 landed as 8 commits (`674ac6e`…`556da57`); the frontend CI job is live. `oxlint` runs with `--deny-warnings`, so the four warnings were fixed and the whole frontend was run through Prettier once. |
| WP-2 Backend dedupe | ✅ Done 2026-08-27 | `repositories/common.py`, `core/time.py`, `routers/_helpers.py`, `routers/uploads.py`, `mailer._send`; 43 `if x is None: 404` blocks → `require_found`; the 13 financial projections are registered from a table; `GET /users/{id}` and `POST …/budget-lines/from-template/{id}` removed (repo function renamed `attach_template`). |
| WP-3 Frontend dedupe | ⏳ | |
| WP-4 Frontend tests | ⏳ | |

Not re-run on the VPS yet: deploy with the usual `up -d --build` once WP-3
is merged, or earlier if wanted — every package so far is backwards
compatible with the deployed SPA except the two removed routes, which the
SPA never called.

---

## 2. What is solid (keep as-is)

Listed so the plan doesn't "improve" things that are already right.

- **Layering.** Routers only translate HTTP ↔ service/repository calls and
  map domain `ValueError`s to 400/404/409; repositories own queries and
  commits; services (`financial_engine`, `budget_line`, `user_lifecycle`,
  `auth`) own multi-step logic. Pydantic schemas are the only thing the
  wire sees.
- **Ownership scoping.** Every project/budget-line/transaction/document/
  supplier/trash/export query joins through `Project.user_id ==
  current_user.id` or `Supplier.user_id`; cross-user access is 404 and a
  31-route matrix test enforces it (`tests/api/test_cross_user_authorization.py`).
- **Auth core.** Documented in the security audit; nothing to change.
- **Error envelope.** `app/errors.py` gives one `{code, message, field,
  context}` shape for HTTP errors, validation errors and rate limits;
  `client.ts` maps codes to French copy with sensible status fallbacks.
- **Financial engine.** One `calculate_project_financials` produces a
  single in-memory model that every summary/dashboard/export projection is
  derived from — the arithmetic lives in exactly one place
  (`FinancialTotals.add_transaction`). Transaction amount/lifecycle/date
  rules are pure functions with unit tests.
- **Soft-delete + trash model.** Consistent `deleted_at` everywhere, parent-
  first restore rules, R2 cleanup on permanent delete, all covered by
  `test_trash_routes.py`.
- **Frontend core.** `AuthProvider` + `client.ts` (single-flight refresh,
  StrictMode-safe bootstrap), `RequireAuth`/`RedirectAuthenticated`,
  admin page self-guards with `<Navigate>`, query keys are namespaced and
  invalidation is centralised in `budget-workspace-cache.ts`.
- **Tests & CI.** 221 backend tests across unit/integration/API, Alembic
  `upgrade head` on an empty DB in CI, `pip-audit`/`npm audit`, gitleaks.
- **Tooling.** Ruff clean, `tsc` strict-ish (`noUnusedLocals`,
  `verbatimModuleSyntax`) and clean, Prettier config present.

---

## 3. Findings — code quality & safety

Severity: **High** = can degrade the running service or lose data;
**Medium** = wrong behaviour or a guard that should exist; **Low** = cheap
to fix, low blast radius.

### Q-01 · Blocking R2 I/O inside async handlers — High

`app/services/storage.py` is fully synchronous (`boto3`), and it is called
directly from `async def` routes:

- `app/routers/documents.py:97` and `:237`, `:301`
- `app/routers/supplier_documents.py:68`, `:145`
- `app/routers/trash.py:60` (loops over every file when emptying the trash)
- `app/services/user_lifecycle.py:266` (loops over every file on hard delete)
- `app/services/document_validation.py:92`

Under uvicorn each of these blocks the worker's event loop for the whole
duration of the network call. A 20 MB upload on a slow connection, or R2
being slow, stalls *every* other request on that worker — including
`/auth/refresh` and the container healthcheck — for two workers' worth of
capacity. Additionally `get_r2_client()` constructs a new boto3 client per
call (`storage.py:21`); client construction loads botocore's service model
and is the single most expensive part of a small S3 call.

**Fix (contained, no behaviour change).**

1. Cache the client: `@functools.lru_cache(maxsize=1)` on `get_r2_client`.
   boto3 clients are thread-safe for these calls.
2. Keep the three storage functions synchronous (the test suite monkeypatches
   them by their sync names on the router modules) and dispatch them off the
   loop at the call sites: `await run_in_threadpool(upload_file_to_r2,
   file=…, object_key=…, content_type=…)` from `starlette.concurrency`.
   Same for `generate_download_url`, `delete_file_from_r2` and the two loops.
3. No test changes required beyond confirming the suite is green; add one
   test that a sync fake still works through `run_in_threadpool`.

### Q-02 · Hard-deleting a user orphans supplier-document files in R2 — Medium

`app/services/user_lifecycle.py:260-268` collects `Document.file_path` for
the user and deletes those objects, then `DELETE FROM users` cascades the
rows. `SupplierDocument` rows (RIBs) are cascaded too — but their objects
are never deleted, so they stay in the bucket indefinitely. This is a
storage leak and, for RIBs, personal/banking data retained after an account
is permanently removed.

**Fix.** Also select `SupplierDocument.file_path WHERE user_id = :id` and
delete those. Extend `tests/integration/test_user_lifecycle.py` (the
existing `delete_file_from_r2` recorder at line 253 makes this a 10-line
test).

### Q-03 · Unauthenticated reference-data routes — Medium

`app/routers/catalog.py`, `categories.py`, `subcategories.py`,
`products.py` declare no auth dependency, unlike `templates.py` which
requires `get_current_user`. The SPA calls only `GET /catalog/tree`
(from a logged-in dialog); the other three routers are called by nothing.
Public reads of the product catalog are not a data-exposure problem, but
they are free database queries for anonymous callers without rate limits,
and they contradict the "closed product" posture established in the
security audit.

**Fix.**
- `catalog.router`: add `dependencies=[Depends(get_current_user)]`.
- `categories`, `subcategories`, `products`: **remove** them (and their
  `include_router` lines in `main.py`) unless
  `docs/planning/admin_catalog_management.md` needs them — in which case
  guard them the same way. The repositories can stay.
- Add the four prefixes to the unauthenticated-access assertions in
  `tests/api/test_template_authorization.py` (401 without a token).

### Q-04 · Error-code contract relies on exact message strings — Medium

The uniform error envelope is produced by `normalize_error_detail`
(`app/errors.py:395`), which reverse-maps a plain-string `detail` to a code
through `MESSAGE_TO_CODE`. Routers raise plain strings 115 times versus 9
uses of `raise_api_error`. Any message not present *verbatim* in
`ERROR_DEFINITIONS` silently degrades to `bad_request` / `not_found` and the
SPA shows a generic sentence. Currently unmapped (found by reading, not by a
test):

| Raised in | Message |
|-----------|---------|
| `repositories/budget_line.py:153` | `f'Product {id} not found or inactive'` (dynamic — can never match) |
| `repositories/transaction.py:158` | `issued_date is required` |
| `repositories/transaction.py:333`, `:617` | `Only quotes and DIY estimates can be (un)selected as budget candidates` |
| `routers/integrity.py:11`, `:19` | `A supplier can only have one primary contact`, `A whole-product budget line already exists…` |
| `routers/issue_reports.py:57`, `:64`, `:72`, `:122` | `Description is required`, `Too many attachments`, `Invalid metadata`, `Failed to send issue report` |
| `routers/contact_requests.py:38` | `Failed to send contact request` |
| `main.py:153` | `Database is unavailable` |

The frontend also still carries the English key `'Invalid or expired token'`
in `ERROR_MESSAGES_FR` (`client.ts:54`), a leftover from before the reset
route was normalised.

**Fix (no architecture change).**
1. Add the missing entries to `ERROR_DEFINITIONS` and matching French copy
   to `ERROR_MESSAGES_FR`; make the dynamic product message static (the id
   is already in the request).
2. Add a unit test in `tests/unit/` that greps `app/` for
   `ValidationError('…')`, `LifecycleError('…')`, `RestoreError('…')` and
   `detail='…'` literals and asserts each resolves to a code that is not the
   status default. This turns "I forgot to register the message" into a red
   test instead of a generic toast.
3. Going forward, new routers use `raise_api_error(status, code)`. No
   retro-fit of the existing 115 calls — they work.

### Q-05 · No frontend job in CI — Medium

`.github/workflows/` runs Ruff, pytest, Alembic, audits and gitleaks —
nothing for the frontend. `frontend/Dockerfile` runs `tsc -b && vite build`,
so a type error is caught, but only on the VPS during `docker compose up
--build`, i.e. at the worst possible moment. Local `tsc` and `oxlint` are
clean today; `oxlint` reports 4 warnings (`ProjectsSettingsPage.tsx:678/735`
constant conditions — see H-07; `checkbox.tsx:8` unused param;
`button.tsx:41` non-component export).

**Fix.** `frontend-checks.yml`: `npm ci`, `npx tsc --noEmit -p
tsconfig.app.json`, `npx oxlint`, `npx prettier --check .`, `npm run build`.
~20 lines, mirrors `dependency-audit.yml`'s Node setup.

### Q-06 · "No project selected" becomes project `0` — Low

`Number('')` is `0` and `Number.isInteger(0)` is `true`, so
`pages/TransactionsPage.tsx:200-203` and `pages/BudgetPage.tsx:46-49` resolve
an empty selection to `projectId = 0`, enable their queries and request
`/projects/0/…` → 404 → error state, where `DashboardPage.tsx:105-112`,
`TrashPage.tsx:62-66`, `ExportsSettingsPage.tsx:38-39` correctly require
`> 0`. `DashboardPage` additionally falls back to the first project; the
others don't. Seven hand-rolled copies of this resolution exist.

**Fix.** One `useSelectedProjectId(): number | null` hook next to
`useAppState` (with the `> 0` guard), used by all seven sites. Decide once
whether the first-project fallback belongs in the hook (recommended: yes,
it matches `ProjectSwitcher`'s behaviour) — then the Dashboard special case
disappears. This is also hygiene item H-03's neighbour.

### Q-07 · Small items — Low (bundle into WP-1)

- **Login timing oracle.** `services/auth.py:78-84` returns before bcrypt
  when the email is unknown (~1 ms vs ~150 ms). Verify against a module-level
  dummy hash in that branch so both paths cost the same. 3 lines.
- **`localStorage` without try/catch.** `state/AppStateProvider.tsx:12,24,29`
  — Safari private mode and some embedded browsers throw on `setItem`, which
  would crash the provider. Wrap reads/writes.
- **Legacy cookie cleanup date.** `routers/auth.py:41-46` expires the old
  `/`-scoped refresh cookie on every write and says it is safe to drop
  after `REFRESH_TOKEN_EXPIRE_DAYS`. That is **2026-09-26**; schedule the
  removal (calendar note, not code).
- **Deactivating a user doesn't revoke sessions.** `admin_update_user` with
  `is_active=false` and `soft_delete_user` leave refresh tokens un-revoked.
  Functionally harmless (`get_current_user` and `/auth/refresh` both reject
  inactive users on every call) but the security log then never shows the
  session end. One `revoke_all_for_user(db, id, reason='deactivated')` call
  in `user_lifecycle.update_user` / `soft_delete_user`.

---

## 4. Findings — code hygiene

### H-01 · Duplicated ownership/loader helpers (backend) — High

The same three query fragments are re-declared per module:

| Helper | Copies |
|--------|--------|
| "active project owned by user" | `repositories/budget_line.py:31`, `repositories/trash.py:45`, `services/financial_engine.py:564`, `services/budget_line.py:247`, plus `repositories/project.py:39` (the canonical one) |
| "active product with active subcategory/category" | `repositories/budget_line.py:45`, `repositories/template_item.py:42`, `services/budget_line.py:260` |
| `joinedload(product→subcategory→category)` chain | `repositories/budget_line.py:23`, `repositories/template_item.py:28`, `services/budget_line.py:291`, `services/financial_engine.py:619`, `repositories/transaction.py:477` |
| "template item for project+product or raise" | `repositories/budget_line.py:236`, `services/budget_line.py:418` (identical) |

Any future rule change ("a project can be shared", "archived categories
stay visible") has to be applied five times and will be missed once.

**Fix.** `app/repositories/common.py` with `get_active_project(db,
project_id, user_id)`, `get_active_product(db, product_id)`,
`product_hierarchy()` (the loader option) and
`find_template_item_for_project_product(...)`; delete the local copies and
import. Pure refactor; the existing suite is the safety net.

### H-02 · `TransactionModal.tsx` (2,029 lines) — High

One file exports `TransactionModal` and `TransactionReviewModal` and also
contains `SupplierSelectField` (with its own quick-create mutation),
`TransactionDocumentsPanel` (its own queries/mutations), `Field`,
`CompactSection`, `SelectedDocumentPreview`, seven label maps and ~15 pure
helpers (`recalculateAmounts`, `normalizeForType`, `buildTransactionCreate`,
…). The two modals implement `updateField` + amount-source tracking
verbatim twice (`:928-947` and `:1448-1467`). `SupplierModal.tsx` (1,108
lines) has the same shape with `SupplierRibPanel` inlined.

Impact: this is the most-edited business surface (transaction entry) and
the hardest file to review; the pure money maths can't be unit-tested
without rendering React.

**Fix (moves only, no behaviour change).**
```
components/budget/transaction-form/
  transactionForm.ts        # types, label maps, recalculateAmounts, normalizeForType, build*  (pure)
  useTransactionAmountForm.ts  # the shared updateField/amountSource logic
  SupplierSelectField.tsx
  TransactionDocumentsPanel.tsx
  TransactionModal.tsx
  TransactionReviewModal.tsx
components/suppliers/SupplierRibPanel.tsx
```
`TransactionModal.tsx` keeps re-exporting the two modals so no import
changes elsewhere. Once `transactionForm.ts` is pure, a handful of Vitest
tests on `recalculateAmounts`/`normalizeForType` become trivial (see WP-4).

### H-03 · Per-page copies of API→domain adapters — Medium

The frontend has two type layers by design (`api/types.ts` = wire shapes,
`types/*.ts` = domain shapes with string ids and numbers). That's fine; the
problem is the adapters are copied per page and drift:

- `projectToDomain`: `lib/budgetWorkspaceApiAdapter.ts:74`,
  `pages/DashboardPage.tsx:76`, `pages/TransactionsPage.tsx:86` — three
  versions, two of them hard-code `selected_budget_amount_ttc: 0`.
- `supplierToDomain` (`pages/SuppliersPage.tsx:42`) vs `suppliersToDomain`
  (`lib/budgetWorkspaceApiAdapter.ts:225`).
- `decimalToNumber`: `lib/budgetWorkspaceApiAdapter.ts:30`,
  `lib/budgetWorkspaceVerification.ts:16`, `lib/transactionWorkspace.ts:50`,
  `components/dashboard/utils.ts`.

**Fix.** Move every adapter and `decimalToNumber` into
`lib/apiAdapters.ts` (one definition each, `projectToDomain` taking an
optional summary), delete the page-local copies. Do **not** merge the two
type systems — that is the over-engineering trap; only dedupe.

### H-04 · Dead `enableReadQueries` flag and hook boilerplate — Medium

`api/config.ts` exposes `enableReadQueries` (from `VITE_ENABLE_API_READS`),
every query hook does `enabled: options?.enabled ??
apiConfig.enableReadQueries`, and every caller passes `{ enabled: true }` —
50 occurrences. The flag is a leftover from the mock-data phase; the
production `.env` doesn't set it, so any hook called without the override
would be silently disabled. `api/projects.ts` also contains 12 dashboard
hooks that differ only by key and fetcher (~250 lines).

**Fix.** Delete the flag and the `?? apiConfig.enableReadQueries` clauses;
`enabled` defaults to `projectId !== null`. Drop the `{ enabled: true }`
arguments. Collapse the 12 dashboard hooks with a tiny factory
`useProjectScopedQuery(projectId, keyFn, fetcher, options)`. Mechanical;
`tsc` catches every missed call site.

### H-05 · Copy-pasted I/O pipelines (backend) — Medium

- `services/mailer.py`: `send_reset_password_email`,
  `send_issue_report_email`, `send_contact_request_email`,
  `send_email_changed_notice` each repeat the config check, `httpx` POST,
  status check and `except Exception` logging (~25 lines × 4). One
  `_send(payload, *, label) -> bool` removes ~80 lines and makes the next
  email template a 20-line function. The branded HTML shell (header/footer
  table) is duplicated between the reset and contact emails — optional
  `_branded_html(title, body_html)`.
- `routers/documents.py:62-125` and `routers/supplier_documents.py:34-96`
  are the same upload pipeline (validate → uuid key → upload → persist →
  cleanup on failure → 502/500 mapping) differing only in the ownership
  lookup and the key prefix. Extract
  `services/document_upload.py: store_uploaded_document(file, *,
  object_prefix, persist)` where `persist` is the repository call; the
  routers keep the ownership check and the 404. Also replaces the
  `document.__dict__` spread in `documents.py:45,183` (works only because
  Pydantic ignores `_sa_instance_state`) with `model_validate` on the ORM
  object plus explicit extra fields.
- Naive-UTC timestamp `datetime.now(UTC).replace(tzinfo=None)` appears 57
  times → `app/core/time.py: utcnow()`. Trivial and mechanical.

### H-06 · Router boilerplate — Low

76 instances of

```python
if thing is None:
    raise HTTPException(status_code=404, detail='Thing not found')
```

and 12 dashboard endpoints in `routers/projects.py:137-410` that are
identical except for the engine method and response model. A
`require_found(value, code) -> T` helper (raising via `raise_api_error`,
so it also nudges Q-04 in the right direction) and a small loop that
registers the dashboard routes from a `(path, method, schema)` table cut
~300 lines with zero behaviour change. Do this only in files already being
touched by WP-2; don't do a repo-wide sweep for its own sake.

### H-07 · Dead / hidden code — Low

- `pages/ProjectsSettingsPage.tsx:678` and `:735`: `{false ? (...) : null}`
  around the "danger zone" card and the delete dialog (oxlint warns). Keep
  the intent by moving it to one `const PROJECT_DANGER_ZONE_ENABLED = false`
  or delete the blocks and keep the explanatory comment.
- `routers/categories.py`, `subcategories.py`, `products.py`: not called by
  the SPA (see Q-03).
- `routers/users.py:92` `GET /users/{user_id}` returns only self — the SPA
  uses `/users/me`. Remove.
- `routers/budget_lines.py:73` `POST …/budget-lines/from-template/{id}`
  "loads" a template but actually just sets `project.template_id` and
  returns the (usually empty) existing lines; budget lines are created
  lazily elsewhere. Verify `useLoadTemplateMutation` (`api/budget-lines.ts:54`)
  is still reachable from the UI; if not, drop the route; if yes, rename
  to `attach-template` so the response shape stops being surprising.
- `lib/budgetWorkspaceVerification.ts` (156 lines) re-checks the backend's
  arithmetic in the browser in dev mode. The backend already has
  `tests/api/test_financial_engine_routes.py`; this is a second copy of the
  invariants that will drift. Either keep it deliberately (document why) or
  move the invariants into a backend unit test and delete it.
- `trash.py:33-42`: `_transaction_name` and `_document_transaction_name`
  are identical.
- oxlint: `components/ui/checkbox.tsx:8` unused `type` param;
  `components/ui/button.tsx:41` `buttonVariants` export breaks Fast Refresh
  (move to `button-variants.ts`).

### H-08 · Style notes — no action unless touching the file

- `FinancialEngine`, `BudgetLineService`, `TransactionService` are
  stateless frozen dataclasses instantiated as singletons; module-level
  functions (like the repositories) would be simpler. Leave as-is.
- `exports.py:29` re-implements the date-range check that
  `validate_project_dates` already provides.
- Dashboard = 12 requests each recomputing the full project financials
  (every budget line + transaction + document + supplier), and
  `invalidateBudgetWorkspaceQueries` refetches all 12 after every edit. At
  family scale this is invisible; it is the first thing that will get slow
  if data grows. A single `GET /projects/{id}/dashboard` computing the model
  once is the fix — **deliberately not in the plan** (see §6).

---

## 5. Remediation plan

Four packages, each independently mergeable and deployable with the usual
`up -d --build`. Order matters only in that WP-2 is easier once WP-1's
helper module exists. Each package ends with: backend suite green,
`tsc`/`oxlint` clean, manual smoke of the touched screens on
`localhost:5173`, then the standard VPS rollout from the runbook.

| Pkg | Contents | Items | Effort | Risk |
|-----|----------|-------|--------|------|
| **WP-1 Safety fixes** | R2 off the event loop + cached client; supplier-document cleanup on hard delete; auth-guard catalog & remove unused reference routers; register missing error codes + guard test; login timing; `localStorage` guard; session revocation on deactivate; frontend CI workflow | Q-01…Q-05, Q-07 | ~1 d | Low — each change is local and test-backed |
| **WP-2 Backend dedupe** | `repositories/common.py` (active project/product, hierarchy loader, template-item lookup); `core/time.py`; `mailer._send`; `services/document_upload.py`; `require_found` + dashboard route table in the files touched; trash helper cleanup | H-01, H-05, H-06, H-07 (backend) | ~1 d | Low–Med — pure refactor, 221 tests as net |
| **WP-3 Frontend dedupe** | `useSelectedProjectId` hook; `lib/apiAdapters.ts`; remove `enableReadQueries` + `{ enabled: true }` noise + dashboard hook factory; split `TransactionModal.tsx` / `SupplierModal.tsx` by responsibility; delete hidden/dead frontend code; fix oxlint warnings | Q-06, H-02, H-03, H-04, H-07 (frontend) | ~1 d | Med — no behaviour change intended, but the largest diff; needs a careful manual pass on Budget/Transactions/Suppliers |
| **WP-4 Tests (optional)** | Vitest + ~10 tests on the now-pure `transactionForm.ts` (amount recalculation, type normalisation, update payload building) and `getApiErrorMessage`; wire into the CI job from WP-1 | — | ~0.5 d | None |

### Per-package checklist

**WP-1**
1. `storage.py`: `lru_cache` on `get_r2_client`; call sites →
   `run_in_threadpool`. Test: existing document/supplier-document/trash
   suites + one new "sync fake through threadpool" test.
2. `user_lifecycle.hard_delete_user`: add `SupplierDocument.file_path`
   query. Test in `test_user_lifecycle.py`.
3. `catalog.router` dependency; delete `categories`/`subcategories`/
   `products` routers + `main.py` includes (confirm against
   `admin_catalog_management.md` first). Test: 401 assertions.
4. `errors.py` + `client.ts`: missing codes; static product message;
   drop `'Invalid or expired token'` key. New `tests/unit/test_error_codes_registered.py`.
5. `services/auth.py`: dummy-hash verify on unknown email.
6. `AppStateProvider.tsx`: try/catch around storage.
7. `user_lifecycle.update_user` / `soft_delete_user`: `revoke_all_for_user`.
8. `.github/workflows/frontend-checks.yml`.

**WP-2**
1. `repositories/common.py`; replace the 5+3+4+2 copies; delete locals.
2. `core/time.py: utcnow()`; mechanical replace.
3. `mailer._send`; four senders become payload builders.
4. `services/document_upload.py`; both routers shrink to ownership + call.
5. `routers/_helpers.py: require_found`; apply in `projects.py` (with the
   dashboard route table), `documents.py`, `supplier_documents.py`,
   `trash.py` — the files already open. Leave the rest.
6. Remove `/users/{user_id}`; decide on `from-template` route (H-07).

**WP-3**
1. `state/appState.ts: useSelectedProjectId()`; replace 7 sites.
2. `lib/apiAdapters.ts`; delete page-local adapters and the 3 extra
   `decimalToNumber`s.
3. `api/config.ts`: remove flag; hooks default `enabled`; strip
   `{ enabled: true }`; `useProjectScopedQuery` factory in `api/projects.ts`.
4. Split `TransactionModal.tsx` → `transaction-form/` (files listed in H-02),
   `useTransactionAmountForm`; extract `SupplierRibPanel.tsx`. Keep barrel
   re-exports so no page import changes.
5. `ProjectsSettingsPage`: resolve the `{false ? …}` blocks; oxlint fixes;
   decide on `budgetWorkspaceVerification.ts`.
6. Manual smoke: create quote/invoice/DIY via both modal entry points,
   edit, budget toggle, document upload, supplier quick-create, RIB upload,
   trash restore.

**WP-4**
1. `npm i -D vitest`; `"test": "vitest run"`; add to `frontend-checks.yml`.
2. Tests for `recalculateAmounts` (HT↔TTC both directions, VAT rate
   change, empty inputs), `normalizeForType` (quote→invoice field reset),
   `buildTransactionUpdate` (only changed fields), `getApiErrorMessage`
   (code / string / status fallback / network).

---

## 6. Deliberately **not** recommended

Considered and rejected as over-engineering for this app and team size:

- **Merging the frontend's two type layers** (`api/types.ts` vs
  `types/*.ts`). It would touch every page and component for no functional
  gain; dedupe the adapters instead (H-03).
- **A single aggregated dashboard endpoint** (H-08). Real but premature;
  revisit when a dashboard load exceeds ~1 s on the VPS.
- **Rewriting the 115 `HTTPException(detail=str)` calls** to typed domain
  exceptions with codes. The registry test in Q-04 gives the same safety for
  1 % of the diff.
- **Centralising soft-delete cascades** (project / budget line /
  transaction / user each re-implement the `Document`/`Transaction`
  `UPDATE … SET deleted_at` chain). They differ in scoping on purpose and are
  each tested; a shared helper would be more abstract than the four
  copies are long.
- **Component-level frontend tests** (Testing Library). The value is in the
  pure maths; keep WP-4 to that.
- **Redis-backed rate limiting**, a shared session store, or splitting
  services into classes with dependency injection. None of it pays for
  itself at this scale.

---

## 7. Validation before execution

Please confirm:

1. Which packages to execute (recommended: WP-1 now; WP-2 and WP-3 as
   separate PRs; WP-4 if you want the frontend tests).
2. Q-03: delete the three unused reference routers, or keep + guard them
   for the planned admin catalog UI?
3. H-07: keep `budgetWorkspaceVerification.ts` as a dev guard, or move the
   invariants to a backend test and delete it?
4. Q-06: should "no project selected" fall back to the first project on
   every page (Dashboard behaviour) or show an empty state (current
   Budget/Transactions intent)?
