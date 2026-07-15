# Admin Section: Catalog & Template Management

**Status: planned, not yet implemented.** This is a design + implementation plan
for a future session. Cross-check file paths/line numbers against the code
before implementing, since they may drift.

## Context

Two recent catalog changes ("Borne de recharge VE", then renamed to "Borne
IRVE") had to be made by hand — editing `backend/app/seed/data/catalog.json`,
rebuilding the backend image, and re-running seed scripts from a shell,
including a manual SQL `UPDATE` to rename an existing row without duplicating
it. That's fine for one-off changes but doesn't scale, and it's the wrong
skillset to require for what is fundamentally content maintenance (adding a
product line, renaming something, retiring an old entry).

The goal is an Admin page where the catalog (Category → Subcategory →
Product) can be created/edited/deactivated through the app itself, gated to
admin users only.

Two things shape the design beyond just "build a CRUD screen":

1. **This is the first screen of a bigger Admin section**, not a one-off. User
   management (`/admin/users/*`) and eventually project oversight will land
   here later. The page structure, routing, and conventions chosen now should
   still make sense once those exist — not require a rebuild.
2. **This may become the template for a future user-facing feature**: letting
   individual users maintain their own catalog/template instead of sharing
   the global one. Not being built now, and deliberately not designed for
   in this pass (that's a real design problem — per-user forking, migration
   of existing projects, etc. — that deserves its own thinking later) — but
   the CRUD shape (schemas → repository → admin-gated router) built here is
   exactly what that feature would reuse, scoped by `user_id` instead of
   gated by `is_admin`. Worth knowing that's watching over this design, even
   though nothing here should be over-built for it today.

## 1. Current State

### 1.1 What already exists and is directly reusable

**Admin authorization is solid, tested, and already proven** —
`get_current_admin_user` (`backend/app/dependencies/auth.py:53-58`) layers on
`get_current_user`, returns `403 Admin access required` for a non-admin. It
already gates every mutation on Templates and TemplateItems:

- `backend/app/routers/templates.py`: `POST /templates/`, `PATCH
  /templates/{id}`, `DELETE /templates/{id}` (soft — sets `is_active=False`,
  there is no hard-delete for templates).
- `backend/app/routers/template_items.py`: single create, bulk create
  (`POST .../items/bulk`, takes a plain `list[TemplateItemCreate]`, fully
  transactional/all-or-nothing), update, delete (hard delete — TemplateItem
  has no soft-delete flag).

This is the pattern to copy directly for Category/Subcategory/Product
endpoints: same dependency, same `TemplateCreate`/`TemplateUpdate`/`TemplateRead`
schema shape (`backend/app/schemas/template.py`), same `IntegrityError` →
`raise_integrity_conflict` (`backend/app/routers/integrity.py`) error
handling for unique-constraint violations.

**A full admin Users API already exists**, unused by the frontend —
`backend/app/routers/admin.py` (prefix `/admin/users`, router-level
`get_current_admin_user` dependency): list users, get by id, patch
(name/email/`is_active`), soft delete, restore, hard delete. This is
concrete groundwork for the "manage users" admin screen mentioned as a later
goal — no backend work needed there, only a frontend page, when that's
prioritized.

### 1.2 What's missing for catalog CRUD

Category/Subcategory/Product are **100% read-only today, at every layer**:

- Routers (`backend/app/routers/catalog.py`, `categories.py`,
  `subcategories.py`, `products.py`) — GET only, no admin dependency needed
  or present because there's nothing to protect.
- Schemas (`backend/app/schemas/category.py`, `subcategory.py`, `product.py`)
  — only `*Base`/`*Read` classes exist. No `CategoryCreate`, `CategoryUpdate`,
  `SubcategoryCreate`, `ProductCreate`, etc. anywhere, not even unused.
- Repositories (`backend/app/repositories/category.py`, `subcategory.py`,
  `product.py`) — only `SELECT` functions.
- The **only** place these tables are ever written today is
  `backend/app/seed/seed_catalog.py`, an idempotent CLI script matched by
  `name` (run via `docker compose exec backend uv run python -m
  app.seed.seed_catalog`). There is no API path at all.

**No way to grant admin status.** `is_admin` (`backend/app/models/user.py:16`,
already migrated, `backend/alembic/versions/22f3b7c9a8d1_add_is_admin_to_users.py`)
is not settable via any endpoint — `AdminUserUpdate`
(`backend/app/schemas/user.py:20-21`) only has `name`/`email`/`is_active`. The
only way a user becomes admin today is a manual `UPDATE users SET
is_admin = true` in the database.

**`is_admin` isn't visible to the frontend.** `GET /users/me` returns
`UserRead` (`backend/app/schemas/user.py:24-29`), which doesn't include
`is_admin` — only `AdminUserRead` (used by the admin-users endpoints,
i.e. for viewing *other* users) does. The frontend's `UserRead` type
(`frontend/src/api/types.ts:21-28`) and `AuthContextValue.user` therefore
have no way to know if the logged-in user is an admin — a prerequisite for
any admin nav item or route guard.

**No "safe to delete" check exists anywhere.** `TemplateItem.product_id` and
`BudgetLine.product_id` both have `ondelete` unset on their FK
(`backend/app/models/template_item.py`, `backend/app/models/budget_line.py`)
→ Postgres defaults to `RESTRICT`. A product referenced anywhere can't be
hard-deleted without hitting an `IntegrityError`. Deactivation
(`is_active=False`), by contrast, is confirmed non-destructive:
`financial_engine._get_budget_lines`
(`backend/app/services/financial_engine.py:611-640`) has no `is_active`
filter on the joined product, so existing projects keep working normally
against a deactivated product — deactivation only blocks *new* usage
(`budget_line.py::_get_active_product`,
`template_item.py`'s active-product checks). This is why Templates only
expose a soft "deactivate", never a hard delete — same call should apply to
Category/Subcategory. Product is the one entity where a real hard-delete
button is worth offering, gated on "nothing references it".

### 1.3 Frontend: nothing to build on, but clear patterns to copy

No catalog admin UI exists, and no catalog domain types
(`frontend/src/types/`) exist distinct from the read-only API shapes
(`CatalogCategoryRead` etc. in `frontend/src/api/types.ts:377-399`) or the
unrelated budget-rollup `Product`/`BudgetCategory` types in
`frontend/src/types/budget.ts` (don't reuse those — different concept, same
name).

The **Suppliers page is the template to copy**, end to end:

- `frontend/src/pages/SuppliersPage.tsx` — table + search, `modalMode:
  'create' | 'view' | 'edit'` + `selectedX` state, one modal handles all
  three modes, `saveX()`/`deleteX()` dispatch to create/update/delete
  mutations with manual `queryClient.setQueryData` + `invalidateQueries`,
  `notifySuccess`/`notifyError` from `frontend/src/lib/toasts.ts`.
- `frontend/src/components/suppliers/SupplierModal.tsx` — built on the
  shared `frontend/src/components/shared/ModalShell.tsx`
  (`ModalShell`/`ModalCancelButton`/`ModalCloseButton`/`ModalSaveButton`) and
  `frontend/src/components/shared/ConfirmationDialog.tsx` for delete
  confirmation. View vs. edit is two hand-written JSX blocks gated by
  `isReadOnly`, not per-field conditionals.
- `frontend/src/api/suppliers.ts` — the API-layer convention: hierarchical
  query keys, plain fetcher functions, `useXQuery`/`useCreateXMutation`/etc.
  hooks with **no** auto-invalidation inside the hooks (left to the calling
  page), plus `xToCreatePayload`/`xToUpdatePayload` domain→API mappers.

Routing: `frontend/src/App.tsx` nests all authenticated pages under
`RequireAuth` → `AppLayout`. `frontend/src/pages/SettingsPage.tsx` is a hub
page (`SectionCard` grid of `Link`s to sub-pages) — this is the pattern for
the new `/admin` index page, since Admin will grow multiple sub-areas the
same way Settings did.
`frontend/src/components/layout/SidebarNav.tsx` builds nav from a typed
`SidebarItem[]` array (`primaryItems`, `secondaryItems`) — an `adminItems`
array rendered conditionally is a direct extension of the existing shape.

## 2. Design

### 2.1 Backend

**Admin identity, first** (blocks everything else):
- Add `is_admin: bool` to `UserRead` (or add it as its own minimal
  `/users/me`-adjacent field) so the frontend can learn the current user's
  admin status. Simplest: add `is_admin: bool` directly to `UserRead` —
  `AdminUserRead` already extends it, so no duplication, and every consumer
  of `UserRead` (including the current user's own profile) gaining a boolean
  field is harmless.
- Bootstrap mechanism for the *first* admin: a small idempotent CLI script,
  `backend/app/seed/promote_admin.py`, matching the existing
  `seed_catalog.py`/`seed_template.py` shape — `python -m
  app.seed.promote_admin --email you@example.com` sets `is_admin=True` for
  that user. This avoids adding a self-promotion HTTP endpoint (a security
  smell) while fitting the project's existing "seed scripts run from a
  shell" convention. Once at least one admin exists, promoting further
  admins can go through a "later" enhancement: add `is_admin` to
  `AdminUserUpdate` so it's settable via the existing `PATCH
  /admin/users/{id}` — deliberately not doing this in the first pass to keep
  the blast radius (a self-service admin-granting-admin endpoint) reviewed
  deliberately, not bundled into a catalog feature.

**Catalog write endpoints**, mirroring Templates exactly:
- New schemas: `CategoryCreate`/`CategoryUpdate`, `SubcategoryCreate`
  (`name`, `sort_order`, `category_id`)/`SubcategoryUpdate`,
  `ProductCreate` (`name`, `sort_order`, `subcategory_id`)/`ProductUpdate` —
  same shape as `TemplateCreate`/`TemplateUpdate`
  (`backend/app/schemas/template.py`), built from the existing `*Base`
  classes.
- New repository functions per entity: `create_x`, `update_x`
  (`model_dump(exclude_unset=True)` + `setattr` loop, exactly
  `update_template`'s shape), `deactivate_x` (sets `is_active=False`).
  Product additionally gets `delete_x` — a real hard delete, but only after
  checking it's unreferenced (query `template_items`/`budget_lines` for the
  product id; if either has rows, raise a domain validation error → `400`
  with a clear message, same pattern as
  `template_item.py`'s `TemplateItemValidationError` → `_bad_request()`, do
  **not** rely on the raw `IntegrityError`/`RESTRICT` as the primary UX —
  reserve that as a defense-in-depth fallback via `raise_integrity_conflict`
  for the race-condition case).
- Extend the existing read-only routers (`categories.py`, `subcategories.py`,
  `products.py`) with `POST`/`PATCH`/`DELETE`, each `Depends(get_current_admin_user)`,
  each wrapping repo calls in the same `try/except IntegrityError` →
  `raise_integrity_conflict` pattern already used by `templates.py`.
- Add the three new unique-constraint names to `CONSTRAINT_MESSAGES`
  (`backend/app/routers/integrity.py`) — category name unique, `
  uq_subcategories_category_id_name`, `uq_products_subcategory_id_name` —
  with friendly French error messages, matching every existing entry there.
- **No new Alembic migration needed for the core feature.** The tables
  already have every column this needs (`name`, `sort_order`, `is_active`,
  timestamps). Only the admin-bootstrap script touches data, not schema.

**Deliberately not building in this pass** (call these out explicitly so
they're not assumed missing later): bulk category/subcategory import,
drag-and-drop re-ordering (`sort_order` is editable as a plain number field
for now), audit trail of who changed what (`created_by`/`updated_by`
columns — would need a migration, not needed for a single-admin app today).

### 2.2 Frontend

**Foundations for the whole Admin section** (not catalog-specific — build
these once, reuse for every future admin screen):
- `is_admin: boolean` added to `frontend/src/api/types.ts`'s `UserRead`.
- `frontend/src/auth/RequireAdmin.tsx`, mirroring `RequireAuth.tsx` exactly
  (`useAuth()`, redirect to `/dashboard` — not `/login`, the user *is*
  authenticated, just not authorized — if `!user?.is_admin`, else
  `<Outlet />`), nested one level inside the existing `RequireAuth` route in
  `App.tsx` so admin routes get both checks.
- `frontend/src/pages/AdminPage.tsx` — a hub page copying
  `SettingsPage.tsx`'s `SectionCard`-grid-of-`Link`s shape. One live card
  ("Catalogue") in this pass; the doc's job is to make adding "Utilisateurs"
  and "Projets" cards later a five-minute change, not a redesign.
- `SidebarNav.tsx`: read `user` via `useAuth()`, add a third, conditionally-rendered
  `SidebarSection` (bordered like `secondaryItems`) shown only when
  `user?.is_admin`, containing one `{ label: 'Admin', to: '/admin', icon:
  Shield }` item today.
- Routing in `App.tsx`: nest `admin` and `admin/catalog` under a
  `RequireAdmin` element, itself inside the existing `RequireAuth` →
  `AppLayout` block.

**Catalog admin screen**, following the Suppliers pattern:
- `frontend/src/types/catalog.ts` — `Category`/`Subcategory`/`Product`
  domain types (string ids, matching the `Supplier` convention), re-exported
  from `frontend/src/types/index.ts`. Distinct from both the read-only
  `CatalogCategoryRead` API types and the unrelated budget-rollup `Product`
  type — don't collide names in the same barrel file (suggest importing the
  admin one with the barrel's default `Product` name is unavailable — alias
  as needed, or place under a `catalog` sub-namespace if that reads
  cleaner).
- `frontend/src/api/catalog-admin.ts` — query keys, fetchers, mutation
  hooks, mappers, one-for-one with `suppliers.ts`'s shape. (Keep this
  separate from the existing read-only `frontend/src/api/catalog.ts`, which
  other pages already depend on for the read-only tree — don't repurpose
  it.)
- `frontend/src/pages/AdminCatalogPage.tsx` — since this is a 3-level
  hierarchy rather than Suppliers' flat list, render it as an expandable
  tree table: Category rows expand to Subcategory rows expand to Product
  rows, each level with its own inline "+ Ajouter" action and edit/delete
  affordances per row, reusing `TableRow`/`TableCell` with indentation
  rather than inventing a new tree component. `BudgetTree.tsx`'s expand/collapse
  state pattern (`useState<Set<string>>` of open ids) is a reasonable
  reference if the table needs expand/collapse, though the admin table is
  simpler (no financial rollups).
- `CategoryModal.tsx`, `SubcategoryModal.tsx`, `ProductModal.tsx` — three
  small modals (not one generic one; the fields genuinely differ:
  Subcategory needs a category picker, Product needs a subcategory picker),
  each built on `ModalShell` + `ConfirmationDialog`, matching
  `SupplierModal.tsx`'s `isReadOnly` split exactly. Given these are
  simpler than suppliers (3-4 fields, no contacts/documents), each modal
  should end up meaningfully shorter than `SupplierModal.tsx`'s ~1100 lines.
- Deactivate is the default destructive action for all three (soft, DELETE
  verb → sets `is_active=False`, same UX language as "Fournisseur déplacé
  dans la corbeille" for suppliers, but there's no catalog trash — the
  message should read as "désactivé", not "supprimé", to set the right
  expectation). Product's modal additionally offers a **"Supprimer
  définitivement"** action distinct from deactivate, disabled with an
  explanatory tooltip when the product is still referenced (the backend
  validation error message doubles as that tooltip text).

## 3. Implementation Chunks

Each chunk should be independently committable and testable. Run backend
`pytest` and `cd frontend && npx tsc --noEmit -p tsconfig.app.json` at the
end of every chunk, not just at the very end — note the `-p
tsconfig.app.json` is required: a bare `tsc --noEmit` at the frontend root
resolves against `tsconfig.json`'s empty `files: []` + project references
and silently checks nothing.

### Chunk 0 — Admin identity foundations
*Backend:*
- `backend/app/schemas/user.py`: add `is_admin: bool` to `UserRead`.
- `backend/app/seed/promote_admin.py` (new): idempotent CLI, `--email`
  argument, sets `is_admin=True`, prints before/after state, mirrors
  `seed_template.py`'s argparse shape.
- Backend tests: extend whatever covers `/users/me` to assert `is_admin` is
  present in the response for both admin and non-admin users.

*Frontend:*
- `frontend/src/api/types.ts`: add `is_admin: boolean` to `UserRead`.
- `frontend/src/auth/RequireAdmin.tsx` (new).
- `frontend/src/pages/AdminPage.tsx` (new, hub with one card).
- `frontend/src/components/layout/SidebarNav.tsx`: conditional admin
  section.
- `frontend/src/App.tsx`: `admin` route (index → `AdminPage`), wrapped in
  `RequireAdmin`.

*Verification:* run `promote_admin.py` against your dev user, confirm the
sidebar Admin item appears after re-login/refetch of `/users/me`, confirm a
non-admin user hitting `/admin` directly gets redirected.

### Chunk 1 — Backend: Category CRUD
- `backend/app/schemas/category.py`: `CategoryCreate`, `CategoryUpdate`.
- `backend/app/repositories/category.py`: `create_category`,
  `update_category`, `deactivate_category`.
- `backend/app/routers/categories.py`: `POST /`, `PATCH /{id}`, `DELETE
  /{id}` (soft), all `Depends(get_current_admin_user)`.
- `backend/app/routers/integrity.py`: category name constraint message.
- `backend/tests/api/test_category_routes.py` (new): admin-gating (403 for
  non-admin, mirroring `test_template_authorization.py`), create/update/
  deactivate happy paths, duplicate-name conflict → friendly 409.

### Chunk 2 — Backend: Subcategory CRUD
Same shape as Chunk 1, scoped under a category: `backend/app/schemas/subcategory.py`,
`backend/app/repositories/subcategory.py`, `backend/app/routers/subcategories.py`,
`uq_subcategories_category_id_name` constraint message, new test file.
Additionally validate `category_id` refers to an active category on create
(mirror `template_item.py`'s active-parent check).

### Chunk 3 — Backend: Product CRUD (create/update/deactivate/delete)
Same shape again, plus the extra hard-delete path: `backend/app/schemas/product.py`,
`backend/app/repositories/product.py` (`create_product`, `update_product`,
`deactivate_product`, `delete_product` with the reference pre-check),
`backend/app/routers/products.py`, `uq_products_subcategory_id_name`
constraint message, new test file including a case that asserts deleting a
referenced product is rejected with a clear error and an unreferenced one
succeeds.

### Chunk 4 — Frontend: Catalog admin API layer
- `frontend/src/types/catalog.ts` (new).
- `frontend/src/api/catalog-admin.ts` (new): query keys + fetchers + hooks +
  mappers for all three entities.
- No UI yet — this chunk is done when `tsc` is clean and the hooks compile
  against the Chunk 1-3 backend shapes (sanity-check by calling one mutation
  from the browser console or a throwaway test page, then remove it).

### Chunk 5 — Frontend: Catalog admin page
- `frontend/src/components/admin/CategoryModal.tsx`,
  `SubcategoryModal.tsx`, `ProductModal.tsx` (new).
- `frontend/src/pages/AdminCatalogPage.tsx` (new): tree table + the three
  modals + delete/deactivate confirmations.
- `frontend/src/App.tsx`: `admin/catalog` route.
- `frontend/src/pages/AdminPage.tsx`: wire the "Catalogue" card's `Link`.
- Manual verification in the running dev app: create a category, a
  subcategory under it, a product under that, edit each, deactivate a
  product and confirm it disappears from the catalog tree used elsewhere
  (e.g. `/catalog/tree` consumers) but existing budget lines referencing it
  are untouched, then delete an unreferenced product and confirm a
  referenced one is correctly blocked with a clear message.

### Chunk 6 — Deferred (explicitly not part of this build)
Listed here so they're not forgotten, not because they should be started
next:
- Template/TemplateItem admin UI — the backend is already fully built and
  tested; this would be a frontend-only chunk following the exact same
  pattern as Chunk 4-5, once the catalog screen has proven the pattern out.
- Admin Users screen — same situation, backend (`admin.py`) already
  complete.
- Self-service admin promotion (`is_admin` on `AdminUserUpdate` +
  a UI toggle in the future Users admin screen), replacing the CLI
  bootstrap script as the *only* way to promote further admins once the
  first one exists.
- Re-ordering (`sort_order`) via drag-and-drop instead of a number field.
- The user-facing "customize your own catalog" idea from the Context
  section — needs its own design pass (ownership model, how it interacts
  with shared templates, migration path for existing projects) before any
  code. Not scoped here.
