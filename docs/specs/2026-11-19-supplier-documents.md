# Spec: supplier documents library and tabbed supplier page

Approved by Yoann on 2026-11-19. The open questions of the draft were
answered at approval and are folded into the criteria. Based on the
branch `feat/lots` (spec `docs/specs/2026-11-18-lots.md`), so it merges
after it.

**Read:**
- In full: `docs/api/errors.md`, `docs/planning/ui_consistency_review_2026-09-19.md`, `docs/specs/2026-11-18-lots.md`.
- `docs/architecture/batibudget_project_summary.md` §5 `transactions`, `suppliers`, `documents`; §6 in full; §7; start of §8.
- Backend: `models/supplier_document.py`, `routers/supplier_documents.py`, `repositories/supplier_document.py`, `schemas/supplier_document.py`, `repositories/trash.py`.
- Frontend: `SupplierDetailPage.tsx`, `SupplierModal.tsx`, `SupplierRibPanel.tsx`, `useSupplierRibViewer.ts`, `useSupplierActions.ts`, `api/supplier-documents.ts`, `DocumentsPage.tsx`, `TrashPage.tsx`, `App.tsx`.
- Every statement about current behaviour is inferred from code; no database figures. The dev agent greps the whole repo (backend, frontend, tests, docs) for "RIB" and `supplier_document`.

## Goal

A supplier gets a small library of documents (RIB, Kbis, Attestation décennale, Attestation URSSAF, Autre). Each has a type and an optional expiry date. Users can add, view, edit (type and expiry only) and delete them from a new Documents tab. The supplier page becomes a short header plus three linkable tabs (Synthèse, Transactions, Documents). The single "RIB" is renamed "Documents" everywhere. The family can then keep the paperwork that has to stay current and see what is expired.

## Out of scope

- Replacing a document's file (delete and add instead).
- Notifications, emails or dashboard widgets about expiry. The signal appears only on the supplier page.
- Types beyond the five, user-defined types, or a free label for "Autre".
- Any change to transaction documents, R2 keys or objects, or the file validation of `upload_document`.
- Expiry or type columns, filters or search on the Documents page (criterion 17 covers what it does change).
- Any change to the transactions table's behaviour, the transaction modals, or the lots and supplier-lot assignment logic.
- Reworking the Fournisseurs list page.
- Changing what restoring a supplier restores (criterion 5).

## Acceptance criteria

**Data and API**
1. A migration adds `type` to `supplier_documents`: the five values stored as stable English keys, NOT NULL, with every existing row becoming RIB. It also adds a nullable `expiry_date` (date, no time). The downgrade works. A migration test (upgrade, downgrade, upgrade) on a populated table asserts that existing rows are RIB with no expiry, row counts are unchanged and R2 keys are unchanged.
2. `POST /suppliers/{id}/documents` takes the file, a required `type`, and an optional `expiry_date`. A missing or invalid type gives 422 in the standard envelope. The create response and the list endpoint return `type` and `expiry_date`. List order is unchanged (newest first).
3. A new `PATCH /supplier-documents/{id}` changes `type` and/or `expiry_date`. An omitted field is left unchanged; `expiry_date: null` clears the expiry; `type: null` or an unknown type gives 422. The file, name, size and R2 key are never touched. `updated_at` changes.
4. Isolation: upload, list, view/download-url, the new PATCH and delete on another user's supplier or document return 404 with a stable code. Soft-deleted documents are also 404 for view and PATCH. Tests cover each endpoint.
5. Delete keeps the existing soft-delete into the project trash, with restore and permanent delete as today. A restored document keeps its type and expiry (tested). Restoring a supplier keeps today's behaviour: it restores all of the supplier's soft-deleted documents. New errors, if any, follow `docs/api/errors.md` (stable code in `backend/app/errors.py`, `raise_api_error`, French translation by code).
6. The frontend API module gains `type` and `expiry_date` in the types, the upload call, and an update mutation. After add, edit and delete, the queries for the supplier's documents, the Documents page and the trash are invalidated.

**Supplier detail page**
7. Routes `/suppliers/:id` (Synthèse), `/suppliers/:id/transactions` and `/suppliers/:id/documents` each render the same header and the matching tab. The tabs are links, so direct open, back button and reload keep the tab. The active tab is exposed to assistive technology. An unknown supplier id keeps today's "Fournisseur introuvable" state on all three URLs.
8. Header contents:
   - the "Retour aux fournisseurs" link, the supplier name, and the supplier's comment under it as today;
   - the supplier's lots in the current project as badges, from the same source as the Fournisseurs page "Lots" column, so manually assigned lots without transactions show too (nothing shown when there are none);
   - the actions "Écrire" (mailto) and "Copier" for the primary contact's email, falling back to the first contact with an email as today, hidden when no contact has an email; then "Modifier".
   - The contact picker select and the "Accès rapides" card are gone.
9. Tab labels show counts: "Transactions (n)" and "Documents (n)". n is the number of this supplier's active transactions in the current project, and of its active documents. Both are available whichever tab is open.
10. Synthèse shows four cards side by side from the `lg` breakpoint and stacked below it (visual layout is a human check):
    - **Coordonnées**: SIRET, N° RNE, address.
    - **Contacts**: the primary contact with name, phone and email, and "+n autres" expanding the rest.
    - **Bilan**: for the current project and this supplier, Devis retenus (sum of TTC of active validated quotes), Facturé (sum of TTC of all active invoices), Reste à facturer (Devis retenus minus Facturé, negative flagged as an overrun), following lots-spec criterion 17, with today's progress bar kept. A test or check covers a supplier with no transactions (zeros), a negative remainder, and soft-deleted transactions excluded.
    - **Documents**: which of the five types are present, the next expiry with its signal, and a link to the Documents tab.
    - The old tall cards (Coordonnées, Bilan, Accès rapides) are removed.
11. Transactions tab: the current table is unchanged in behaviour: same columns, row click opening the review modal, the document viewer buttons, "Ajouter une facture pour ce devis", and its empty and loading messages.
12. Documents tab lists the active documents:
    - each row shows type badge, file name, upload date, and expiry date with signal (or "Sans date");
    - actions: view, download, edit type/expiry, delete, all icon-only with an `aria-label` and no `title`;
    - "Ajouter un document" opens a form with the file, a required type, and an optional expiry date; edit opens the same form without the file field;
    - delete asks for confirmation and says the document goes to the trash;
    - an empty state shows when there are no documents.
13. Expiry signal: "Expiré" when the date is before today (a document is valid through its expiry date). "Expire bientôt" when it is today or within the next 30 days. Otherwise no signal. One helper serves the Documents tab and the Synthèse card, with Vitest cases for yesterday, today, day 30, day 31, and no date.
14. Any new form holding input (add and edit) carries `data-blocks-auto-update` while open. If the modal shell already does this, a check confirms it.

**RIB removal and renaming**
15. `SupplierRibPanel.tsx` (including `NewSupplierRibField`) is removed from `SupplierModal`, in both create and edit modes: the modal has no file upload, and documents are added from the Documents tab only. The modal's unsaved-change logic and save no longer reference a RIB file. `useSupplierRibViewer` is renamed or generalized to view and download any supplier document, titled with its type.
16. No user-facing text, error message or toast says "RIB" for a generic supplier document. Messages name the document ("Document ajouté", "Impossible d'ajouter le document", "Document déplacé dans la corbeille"). A document of type RIB is still labelled "RIB" as its type. Frontend files that say RIB today: `SupplierRibPanel`, `useSupplierRibViewer`, `SupplierDetailPage`, `DocumentsPage` ("RIB • …" and the `rib` badge), and `TrashPage` (type label, filter, toasts, counts). The backend label "supplier document" and the summary doc are reviewed too. A repo-wide grep for "RIB" finds only the type label and historical notes.
17. Documents page: supplier documents show their type (not "RIB") in the name and badge, plus the file name. Trash: the `supplier_document` type is labelled "Document fournisseur" in the filter, row badge, "Vider la corbeille" counts and toasts.
18. The summary doc is updated: a supplier documents subsection in §5 (type, expiry, no uniqueness per type), §7 supplier management and document management, §8 routes, and RIB mentions renamed.

**Quality**
19. New UI follows the control standard: 40px fields, shared button heights per row, French copy. Checks run and reported: `tsc --noEmit -p tsconfig.app.json`, lint, build, Vitest, pytest including the migration test. Before merge: `/preflight` and a qa review of the branch diff against `feat/lots`.

## Project rules touched

- `docs/api/errors.md` "Backend Responsibilities" and "Adding New Errors": stable codes, `raise_api_error`, 404 for what is not visible to the user, 422 for payload validation, French translation by `detail.code`.
- `docs/planning/ui_consistency_review_2026-09-19.md` §2: control standard and icon-only controls (`aria-label`, never `title`).
- Summary §5 `documents` and `suppliers` (private R2 storage, metadata only), §6.7 (soft delete, trash, dependency-aware restore), §7, §8.
- Lots spec criteria 15-17: lots badges and Bilan definitions.
- CLAUDE.md: `/feature` applies (migration, per-user isolation, R2 documents, several areas). The repo is public: no infrastructure detail in tests or docs. Auto-update rule (`data-blocks-auto-update`) from the owner's notes.

## Risks

- **Restore side effect:** `restore_supplier` restores every soft-deleted document of the supplier, including ones binned one by one earlier. Kept as is (criterion 5); a real library makes it more visible.
- **Open tabs on the old frontend:** a required `type` makes an old tab's RIB upload fail with 422. The auto-update reload (v1.10.0) should cover it; verify that it triggers.
- **Migration:** a NOT NULL column with a default is light on a live table, but the downgrade drops type and expiry data. Take a pre-deploy backup per the runbook.
- **Isolation:** the new PATCH is a new write path; a missing `user_id` filter would let one user alter another's documents (criterion 4).
- **Expiry and "today":** a date-only value compared with the user's local date. A server-side "today" would disagree around midnight.
- **Removed buttons:** the contact picker and "Voir le RIB" disappear from the page; old `/suppliers/:id` links still work (they land on Synthèse).
- **Lots dependency:** the header badges and Bilan rely on the unmerged lots branch. The Bilan changes "Reste à payer" to "Reste à facturer".

## Open questions

None. Answered at approval: 30-day threshold, valid through the expiry date (criterion 13); no file field in the supplier modal's create mode either (criterion 15); trash label "Document fournisseur" (criterion 17); supplier restore keeps restoring all its documents (criterion 5); email actions fall back to the first contact with an email and hide when none, the comment stays under the name, the Bilan keeps its progress bar (criteria 8 and 10).
