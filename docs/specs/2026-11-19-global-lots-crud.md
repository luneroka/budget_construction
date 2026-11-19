# Spec: create and delete global lots (admin)

Approved by Yoann on 2026-11-19. One `/feature` run on the branch `feat/supplier-documents`. The two open questions of the draft were answered at approval and are folded in below.

**Read (by the product agent):** in full `docs/api/errors.md`, `docs/specs/2026-11-18-lots.md`, `docs/planning/ui_consistency_review_2026-09-19.md` §2, `docs/specs/2026-11-19-money-model-and-screens.md`; in `docs/architecture/batibudget_project_summary.md` lines 1–400; `frontend/src/pages/AdminLotsPage.tsx`. No backend code was read: everything about the backend is inferred from the specs and docs, and the dev agent checks the current code against this spec before starting.

## Goal

An admin can add and delete global lots from the admin Lots screen (`/settings/lots`), in addition to renaming and reordering them. Today the 25 default lots are fixed in number. The admin has no way to adapt the shared list, and users can no longer add project lots from the Lots page.

## Out of scope

- The project-lot endpoint and table (lots spec criteria 5–6). They stay as they are, dormant: no change in behavior. The UI no longer reaches them, because the "Ajouter un lot" button was removed from the Lots page. Removing them later is a separate change, to be preceded by counting the project lots that exist in production.
- Editing global lots in bulk, importing lots, restoring a deleted lot, or any soft delete of lots.
- Deleting or renaming project-only lots from the admin screen. The admin sees global lots only.
- Admin access to other users' projects or data. The refusal message says only that the lot is in use, with no project, user or count.
- Any change to the engine, the figures, the analytics views, the migration, documents or R2.
- Changing the phase grouping on the Lots page. It stays keyed on the 25 default codes: a lot created here with another code falls in "Autres lots", and a recreated default code returns to its phase group.
- Changing rename and move up/down, except that they must keep working with the new and removed lots (criteria 12–13).

## Acceptance criteria

**Create (backend)**
1. `POST` on global lots, admin only (`is_admin`), takes a `code` and a `designation`. Both are trimmed. The code has 1–10 characters and the designation 1–120 (empty after trimming gives a validation error). Overlong values are refused with the same stable codes or validation error as rename. Success returns the new lot in the same shape as the existing global-lot read.
2. Code and designation are each unique among global lots, with the same comparison rule as rename. A duplicate gives 409 with the existing stable codes used by rename, not new ones. As with rename, the code is not checked against project lots; a project may then show two lots with the same code.
3. A non-admin gets 403 and an unauthenticated caller gets 401, on both create and delete, and no row is written.
4. The new lot's order position is after every existing global lot (last). A test creates two lots in a row and asserts the order of the full list.
5. The new lot is visible in every project at once and is not hidden by default. A test creates a lot and checks it in the Lots list of two different users' projects, with no `project_hidden_lots` row.

**Delete (backend)**
6. `DELETE` on a global lot, admin only. A lot that does not exist, or that is not global (a project lot), gives 404.
7. Refused with a stable 409 when any transaction of any user's project uses the lot, active or soft-deleted (trashed). A test covers each case separately: used by an active transaction; used only by a soft-deleted one. The new error code is added to `backend/app/errors.py` with an English message and a `field`, and a French translation by code, as `docs/api/errors.md` requires. The French message says only that the lot is in use (for example « Ce lot est utilisé et ne peut pas être supprimé »). It names no project, user or count, and `context` carries none either.
8. When no transaction uses it, the lot row is hard-deleted together with its `project_hidden_lots` rows and its `supplier_lots` rows, in one transaction. A test seeds a hidden-lot row and a supplier assignment in at least two users' projects, deletes the lot, and asserts that all those rows and the lot are gone and that other lots' rows are untouched.
9. After a delete, the lot is absent from every project's lots list, the lot pickers, and the admin list. A lot page `/lots/:lotId` for it answers not found.
10. The check and the delete cannot race with a transaction being created in that lot (lock, or a restrictive foreign key that makes the delete fail into the same 409). The dev states which in the report. No orphan `lot_id` may be possible.
11. Deleting a lot never touches suppliers, transactions, documents or R2 objects.

**Order**
12. After a delete, the remaining global lots are listed in the same relative order, and move up/down still works for every lot, including the neighbors of the deleted one. A test deletes a lot in the middle and then moves its former neighbors up and down. The dev chooses between renumbering and tolerating gaps, and says which in the report. It must not need a client-side workaround.
13. Rename and move up/down keep their current behavior and tests for lots created here.

**Admin screen (`AdminLotsPage.tsx`)**
14. The screen has an "Ajouter un lot" action that opens an inline row or form with a code field (max 10 characters) and a designation field (max 120), like the rename form. It is not a modal, and it carries `data-blocks-auto-update` while open, as the rename form does. A success toast is shown and the lot appears last in the list. Errors show inline under the form (`role="alert"`), translated by `detail.code`.
15. Each row has an icon-only delete button with an `aria-label` that names the lot (for example « Supprimer le lot 05 »), no `title`, and the 40px control standard (`docs/planning/ui_consistency_review_2026-09-19.md` §2). The existing row buttons are `size="sm"` (36px); the dev follows the standard and states what was chosen. It is disabled while another action is running.
16. Delete asks for confirmation in a dialog that names the lot (code and designation) and says it disappears from every project. Cancel closes it without a request. If the API refuses (409), the dialog or the row shows the French message inline, and the lot stays in the list.
17. After create or delete, the same queries are invalidated as for rename and move (`lotQueryKeys.all`, `projects`, `transactions`).
18. A non-admin is still redirected away from the screen, has no menu entry, and gets 403 from the endpoints. Frontend tests (Vitest) cover: the add form; the inline duplicate error; the confirmation naming the lot; the inline refusal. Layout is a human visual check.
19. The intro texts of the screen are updated, because « nobody adds or deletes one » and the page description are no longer true.

**Docs and quality**
20. `docs/architecture/batibudget_project_summary.md` is updated: §5 `users` and `lots` ("nobody adds or deletes one" becomes admin create and delete, with the delete rule) and the §7 sentence on the admin screen. The lots spec criteria 1–3 and its Out of scope line ("Adding or deleting global lots") get a short "extended by `docs/specs/2026-11-19-global-lots-crud.md`" note. A grep of both for "nobody adds or deletes" finds only historical notes.
21. Checks run and reported, only the ones actually run: `tsc --noEmit -p tsconfig.app.json`, lint, build, Vitest, pytest. Then `/preflight` and a qa review of the branch diff.

## Project rules touched

- `docs/api/errors.md`: a stable `code` in `backend/app/errors.py`, `raise_api_error`, 403, 404 and 409 used with their meaning, `context` only with safe data, French translation by code (criteria 2, 3, 6, 7).
- Summary §5 `users` (`is_admin` now also covers create and delete of global lots) and §5 `lots` ("nobody adds or deletes one" deliberately superseded; criterion 20 updates it).
- Summary §6.7: soft-deleted transactions still count as a use of the lot, so a restore is never orphaned.
- Summary §6.3 and §5 `project_hidden_lots` / `supplier_lots`: these rows are links only and go with the lot.
- Lots spec criteria 1–3: extended, with a note. Criterion 15 still holds.
- CLAUDE.md "Team workflow": `/feature` (backend logic, per-user data isolation, more than one area), then `/preflight` and qa.
- CLAUDE.md per-user data isolation: the delete check reads other users' transactions only to decide yes or no and reveals nothing about them (criterion 7).
- `docs/planning/ui_consistency_review_2026-09-19.md` §2: 40px control standard, icon-only controls with `aria-label`, no `title`.
- CLAUDE.md "The repository is public": nothing sensitive in tests or docs.

## Risks

- **Hard delete is irreversible.** A deleted lot, its per-project visibility and its supplier assignments cannot be restored; recovery is a database backup. The "in use" refusal and the confirmation dialog are the only protections.
- **Trashed transactions block a delete.** A user may not see why a lot is "in use"; emptying a project's trash frees the lot. Intended (criterion 7).
- **Race with transaction creation** (criterion 10).
- **Analytics views.** They are expected not to read lots. The dev greps `backend/analytics/sql/` and the repo-root `analytics/` copy for any join to `lots` and reports.
- **Order positions after a delete** (criterion 12).
- **Shared codes.** An admin-created code can equal a project lot's code; already accepted for rename.
- **Every change applies to everyone at once** (a family app, accepted).
- **Open tabs.** An open Lots page may list a lot another session just deleted; its lot page then answers not found.
- **Dormant project-lot endpoint** can drift until it is removed.

## Open questions

None. Answered at approval: the phase grouping stays keyed on the 25 default codes; the project-lot endpoint and table stay dormant, removal being a separate later change.
