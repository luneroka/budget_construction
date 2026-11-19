# Spec: Coût prévu / Facturé / Payé / À payer, "Devis et factures", supplier form page, simpler dashboard

Approved by Yoann on 2026-11-19. The open questions of the draft were
answered at approval and are folded into the criteria. One `/feature`
run on the branch `feat/supplier-documents` (which sits on `feat/lots`),
as the owner decided, although it covers three concerns (money model and
its screens, route rename, supplier form as a page). Risks says what to
review first.

**Read (by the product agent):** in full `docs/api/errors.md`, `docs/planning/ui_consistency_review_2026-09-19.md`, `docs/specs/2026-11-18-lots.md`, `docs/specs/2026-11-19-supplier-documents.md`; in `docs/architecture/batibudget_project_summary.md` §5, §6.1–6.9 and §7 up to the financial dashboard. No code was read for this spec and nothing was queried: the dev agent checks the current code against it before starting.

## Goal

The family uses the app as a store of quotes and invoices per lot, not as a balanced budget. Lots with only invoices (materials bought in a shop) look over budget under "Devis retenus − Facturé". The engine, the Lots page, the supplier page and the dashboard move to four figures: Coût prévu, Facturé, Payé, À payer. The "Transactions" page becomes "Devis et factures". The supplier form becomes a page that also sets the supplier's lots.

## Out of scope

- Renaming internal code names (API `transactions`, TS types, DB tables). Only user-facing text and routes change.
- Any change to quote or invoice statuses, VAT/TTC rules, documents, R2, the supplier-documents feature, or the lots model (hide, visibility, assignment rules).
- The analytics views and `is_selected_budget`: untouched, as in the lots spec.
- New KPIs or charts beyond those listed in criteria 19–20.
- Notifications or emails about expiry.
- Changing the accounting CSV, unless it carries a removed figure (criterion 24).

## Acceptance criteria

**Engine and API (backend is the source of truth, summary §6.6)**
1. Per lot, **Coût prévu** is the sum over the lot's suppliers, plus the "Sans fournisseur" group as one group, of max(sum of TTC of that supplier's active `validated` quotes in the lot, sum of TTC of its active invoices in the lot). **Facturé** is the sum of TTC of all active invoices. **Payé** is the sum of TTC of active invoices with status paid. **À payer** is the sum of TTC of active invoices that are unpaid or on hold. Payé + À payer = Facturé.
2. The project figures are the sums of the visible lots' figures. Every visible lot still appears with zeros when empty. Hidden lots are excluded.
3. A supplier's own figures, per project, are **Coût prévu** (the sum of its per-lot maxes over the project's visible lots, so a supplier's figures add up to the Lots page), Devis validés (reference), Facturé, Payé and À payer.
4. Removed from schemas, endpoints and responses: "Reste à facturer" (`remaining_to_invoice`), `is_overrun`, "Dépassement", "Lots à chiffrer" (screen and API), and the Top-5 variance widget data. A test asserts the old keys are absent. The validated-quotes total stays as a reference figure (supplier Bilan).
5. Engine tests cover: a lot with quotes only, and a lot with invoices only (Coût prévu = Facturé); quote larger than invoices, and invoices larger than quote, for one supplier; two suppliers in one lot, each taking its own max; the "no supplier" group as one group; every non-validated quote status ignored; soft-deleted quotes and invoices ignored; the paid, unpaid and on-hold split; project = sum of lots; an empty lot; a supplier in two lots (its own Coût prévu = the sum of its two lot maxes).

**Lots page**
6. Header boxes are exactly Coût prévu, Facturé, Payé, À payer. "Devis retenus", "Reste à facturer" and "Lots à chiffrer" are gone.
7. Lot cards show Prévu, Facturé and À payer. À payer is visually emphasized only when non-zero. The dashed border for empty lots stays. (Emphasis and layout are human visual checks.)
8. On a lot page, each supplier card header shows the new figures (Prévu, Facturé, À payer) and no longer "Devis retenus · Facturé". "Dépassement" appears nowhere.

**Supplier page**
9. "Copier" is removed. "Écrire" is a small menu listing the supplier's contacts that have an email, as "name — email". Choosing one opens `mailto:`. With exactly one email, the button opens `mailto:` directly with no menu. With none, it is hidden. The menu is keyboard operable and has an `aria-label`.
10. The Bilan card shows Coût prévu, Devis validés (reference), Facturé, Payé and À payer. The progress bar becomes a payment bar (Payé out of Facturé), with an empty state when Facturé is 0 (a test or check covers the zero case). `lib/supplierStats.ts` follows the backend figures and does not recompute them differently.

**Rename**
11. The user-facing name "Transactions" becomes "Devis et factures" in the sidebar, the page title and the supplier tab ("Devis et factures (n)"). The dev greps the frontend for every user-facing mention of the page (empty states, links, trash or issue-report context, help text). Generic uses of the word for the records themselves are listed in the report and left unless they name the page.
12. The routes become `/devis-factures` and `/suppliers/:id/devis-factures`. `/transactions` and `/suppliers/:id/transactions` redirect to them (replace, not push), keeping any query string and hash. A test or check covers both old URLs. Links inside the app use the new routes.

**Supplier form as a page**
13. `/suppliers/new` (create) and `/suppliers/:id/edit` (edit, from "Modifier") replace the large supplier modal. Sections are Entreprise (name, SIRET, N° RNE, comment), Adresse, Contacts, and **Lots du projet**. The same field rules and limits as today apply. The primary-contact rule is unchanged.
14. "Lots du projet" is a multi-select of the current project's visible lots. Ticked lots are written to the supplier↔lot assignments of the current project. A lot with active quotes or invoices for the supplier cannot be unticked; saving that state is refused with the same stable error code as today (lots spec criterion 15, 409), shown on the page. Hidden lots' existing assignments are never removed by saving.
15. Save and Cancel return to where the user came from (supplier page, list, or the quote/invoice flow), with a fallback of the supplier page for edit and the list for create when opened directly. An unknown supplier id on `/edit` shows the "Fournisseur introuvable" state.
16. Unsaved-change protection works as in today's modal: leaving with edits asks for confirmation, and a clean form leaves silently. The page carries `data-blocks-auto-update` while it has edits (owner's auto-update rule).
17. Quick supplier creation from the quote/invoice form stays as it is today: an inline panel with the name only, no navigation, the in-progress form not lost. No lots picker: the supplier is assigned to the transaction's lot automatically when the quote or invoice is saved (decided by Yoann during dev).
18. A test covers: creating a supplier with lots, editing lots (add and remove), and the refused untick. If the dev adds a single endpoint, it follows `docs/api/errors.md`. If the page calls existing endpoints in sequence, the report says what a failure between them leaves behind.

**Dashboard**
19. The KPIs are Coût prévu, Facturé, Payé and À payer, with a payment progress bar (Payé out of Facturé) replacing the old invoicing progress. Charts are: "Facturé par lot" (bars split paid and à payer, lots with a non-zero amount only), "Dépenses dans le temps" (all invoices) and "Répartition par fournisseur".
20. The action center has these widgets: unpaid invoices; quotes to confirm or negotiate (one merged widget); missing documents; supplier documents expired or expiring within 30 days. The last is new: it lists the documents of suppliers assigned to a lot of the current project (active documents of active suppliers only), and the expired / expiring-soon flag is computed in the frontend from `expiry_date` with the existing supplier-documents helper (the user's local date; expired the day after the expiry date, expiring from 30 days before it to the day itself).
21. Removed from the UI, with their components: "Budget vs dépenses réelles", the lot treemap, "Top 5 Écarts budgétaires", the separate to-confirm and to-negotiate widgets, and the invoicing-progress element. Any dashboard endpoint, schema or engine function that served only those is deleted, not left dead. The dev lists the removed endpoints in the report. Tests assert each of them returns 404 and that the new payloads have the new shapes. The new supplier-documents payload gets tests for scope (current project's suppliers only, soft-deleted documents excluded, another user's documents excluded); the frontend flag gets Vitest cases for expired, today, day 30, day 31 and no date.

21b. Every dashboard chart and widget tells an empty result from a failure. With no data it shows a short French message saying what is missing (for example "Aucune facture enregistrée pour ce projet." for the invoice charts, "Aucun devis à confirmer ou à négocier." for that widget), never an API error text such as "La ressource demandée est introuvable.". A load failure keeps an error message with a retry. (Added by Yoann during dev.)

**Docs and quality**
22. The summary is updated: §5–§7 (Lots workspace, Supplier management, Transaction workspace and Financial dashboard, with the new names and routes); §6.4 and §6.5 (money definitions, including the supplier-max rule); the financial-engine section, and any other place that says "Devis retenus", "Reste à facturer" or "Dépassement". The lots spec (criteria 17, 18, 19, 21) and the supplier-documents spec (criteria 8, 10) get a short "superseded by this spec" note.
23. A grep of `docs/` and `frontend/src` for "Reste à facturer", "remaining_to_invoice", `is_overrun`, "Dépassement", "Top 5" and "Écarts budgétaires" finds only historical notes.
24. The CSV export is checked for removed figures. Either it carries none (stated in the report), or the change is listed.
25. Checks run and reported (only those actually run): `tsc --noEmit -p tsconfig.app.json`, lint, build, Vitest, pytest. Then `/preflight` and a qa review of the branch diff. Frontend tests cover the `/transactions` redirects and the "Écrire" menu's one-email and no-email cases.
26. New UI follows the control standard: 40px fields, shared button height per row, icon-only controls with `aria-label` and no `title`. Card and section titles use `font-[family-name:var(--font-body)]`, as elsewhere on this branch.

## Project rules touched

- Summary §6.4 and §6.5: **this spec deliberately supersedes them** (criterion 22 rewrites them).
- Summary §6.6: the backend calculates the figures and the frontend only displays them.
- Summary §6.3: the lot multi-select lists visible lots only.
- Summary §6.7: soft-deleted records never count, and the supplier-documents widget ignores them.
- Lots spec criteria 15 (reused) and 17, 18, 19, 21 (superseded). Supplier-documents spec criteria 8, 10 (superseded) and 13 (expiry rule, reused).
- `docs/api/errors.md`: stable codes, `raise_api_error`, 404 for what is not visible to the user, French translation by code.
- `docs/planning/ui_consistency_review_2026-09-19.md` §2: control standard and icon-only controls.
- CLAUDE.md "Team workflow": `/feature` required (engine and KPIs, several areas), then `/preflight` and qa. The repo is public.
- Owner's auto-update rule: `data-blocks-auto-update` on the new page.

## Risks

- **Size.** Three concerns in one branch. qa reviews the engine and its tests first, then the supplier form (the only write path), then routes and the dashboard.
- **Figures change meaning again at deploy.** Lot and dashboard totals differ from the previous release. Coût prévu is no longer Devis retenus: lots with only invoices now show their invoices as the plan. Payé and À payer are new splits.
- **Old bookmarks and open tabs.** `/transactions` and `/suppliers/:id/transactions` keep working (criterion 12). Open tabs on the old frontend call removed dashboard endpoints (404) until the auto-update reload fires; verify it triggers.
- **Half-saved supplier.** If the page saves the supplier and then the lot assignments in sequence, a failure after the first call leaves a saved supplier with old assignments. A single backend endpoint avoids it; the dev's choice is stated in the report.
- **Max rule is per supplier and per lot.** The same supplier in two lots contributes two maxes; the supplier's own Coût prévu is defined as that sum so the figures add up (criterion 3).
- **No overrun signal any more.** Intended.
- **Removed endpoints** break API clients outside the app; none are known (assumed, not checked).

## Open questions

None. Answered at approval: a supplier's Coût prévu is the sum of its per-lot maxes and is shown in the Bilan (criteria 3, 10); the expired-documents widget covers the current project's suppliers and flags in the frontend with the existing helper (criterion 20); invoicing progress is replaced by a payment progress bar (criterion 19); "Lots à chiffrer" is removed from the screen and the API (criterion 4).
