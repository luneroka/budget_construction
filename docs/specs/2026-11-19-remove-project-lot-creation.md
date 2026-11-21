# Spec: remove the dormant project-lot creation endpoint, and fix the docs that still describe it

Requested by Yoann on 2026-11-19 ("Fix the dormant endpoints and docs"), as the follow-up named in `docs/specs/2026-11-19-global-lots-crud.md` (Out of scope and Open questions). One `/feature` run on the branch `feat/supplier-documents`. This spec is the narrow reading of that request; Yoann can widen it.

## Goal

Users can no longer add project-only lots: the "Ajouter un lot" button is gone from the Lots page and the admin now creates global lots. The endpoint that created project lots is therefore dead code that can drift and keeps being tested. Remove it, and make the docs stop saying a project adds its own lots.

## Out of scope

- **Existing data.** Project-only lots that already exist (the number in production is unknown) keep working exactly as today: they are listed with the project's lots, can be hidden and shown, can hold devis and factures, and appear on the Lots page. No migration, no deletion, no change to `lots.project_id`, to the visibility table or to the supplier assignments.
- Hiding and showing a lot in a project (`PATCH /projects/{id}/lots/{lot_id}`), listing the project's lots, supplier ↔ lot assignments, the admin global-lot endpoints and screen.
- Dropping the `lots.project_id` column or any "project lot" concept from the schema (a later cleanup, once the production count of project lots is known and they are migrated or removed).
- Any change to the engine, figures, dashboard or transactions.

## Acceptance criteria

1. `POST /projects/{project_id}/lots/` no longer exists: the route is removed, not disabled, and a request to it gets the framework's 405 (the path still exists for the other methods) or 404, whichever the router gives; a test asserts it is not 2xx for an authenticated owner of the project, and no lot row is written.
2. Everything only the removed endpoint used is deleted, not left dead: its handler, its repository and service code, its request schema, and error codes, translations and tests that exist only for it. Anything still used by another path is kept; the dev lists what was removed and what was kept and why. In particular the code-uniqueness rules used by the admin create and rename stay.
3. Existing project lots still work: a test creates a project lot directly in the database, then checks it is returned by the project's lots list, can be hidden and shown, can hold a transaction (creation accepts its `lot_id` for that project), is refused for another user's project, and appears in the project's financial summary. These tests replace the old ones that created project lots through the removed endpoint.
4. Frontend: the API function, hook, request type and any translation used only by the removed endpoint are deleted. `tsc`, lint, build and tests stay green; a grep finds no frontend call to the removed route.
5. Docs: `docs/architecture/batibudget_project_summary.md` no longer says a project can add its own lots or that a user adds a project lot: §6.1 ("add its own"), §7 "Lots workspace" step 2, the §5 `lots` text, the API section (project lots) and the cross-row rule sentence about a project lot's code. It says instead that project-only lots are a legacy kind: existing ones keep working and can be hidden, no screen or endpoint creates new ones, and the admin manages the shared global list. The lots spec (`docs/specs/2026-11-18-lots.md`) criteria 5–6 and the global-lots spec get a short "creation removed by `docs/specs/2026-11-19-remove-project-lot-creation.md`" note. A grep of `docs/architecture` for "adds a project lot" and "add its own" finds nothing outside historical notes.
6. Checks run and reported (only the ones actually run): `tsc --noEmit -p tsconfig.app.json`, lint, build, Vitest, pytest. Then `/preflight` and a qa review of the branch diff.

## Project rules touched

- CLAUDE.md "Team workflow": `/feature` applies (backend logic removal, more than one area), then `/preflight` and qa.
- `docs/api/errors.md`: removing codes only used by the removed endpoint must not break the error-registry test or leave an untranslated code.
- Summary §5 `lots`, §6.1, §7: wording replaced (criterion 5). Lots spec criteria 5–6: noted as removed.
- Per-user isolation (criterion 3): another user's project must still 404 for the lot routes that remain.

## Risks

- **Existing project lots in production** are unknown and not counted; they must keep working (criterion 3). The count is still needed before any later removal of the concept.
- **Open tabs on the old frontend** that still hold the removed button would get an error until the auto-update reload; the button is already gone from the current frontend.
- **Dead-code removal can delete something still used elsewhere** (shared helpers, error codes): the dev checks each by grep and tests.

## Open questions

None.
