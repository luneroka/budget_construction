# UI Implementation Log

## Chunk 1 - Frontend Reset & Design Tokens

Status: Completed

Summary

- Replaced default Vite starter styling with the reference admin design tokens adapted for Tailwind 4.
- Removed the starter stylesheet import from `src/App.tsx` and deleted `src/App.css`.
- Added a minimal token smoke screen in `src/App.tsx` so `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-sidebar`, and `text-gold` are exercised before the app shell chunk.

Plan Deviations

- Did not add `src/lib/utils.ts` or install `clsx`, `tailwind-merge`, or `class-variance-authority` because Chunk 1 does not use `cn` or component variants yet.
- Added a minimal token smoke screen in `src/App.tsx` instead of leaving the app blank, so the reset can visibly exercise the new Tailwind 4 token classes before the shell/routing chunk.

Notes

- `npm run build` completed successfully from `frontend/`.
- The built CSS includes the required token utilities, including `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-sidebar`, and `text-gold`.
- No backend files were changed.

## Chunk 2 - App Shell & Routing

Status: Completed

Summary

- Replaced the Chunk 1 token smoke screen with React Router routes for `/`, `/dashboard`, `/budget`, `/suppliers`, `/documents`, `/settings`, and `*`.
- Added the admin shell in `src/components/layout/AppLayout.tsx` with the fixed-width sticky sidebar and `main.flex-1.bg-background` workspace.
- Added `SidebarNav` with backend-aligned primary navigation and active states using `bg-sidebar-accent`, `text-gold`, and `border-gold`.
- Added `ProjectSwitcher` with mock project selection, local storage persistence, and placeholder project management actions.
- Added placeholder route pages for Dashboard, Budget, Suppliers, Documents, Settings, and Not Found.
- Installed `lucide-react` for route and project-action icons.

Plan Deviations

- Added `src/lib/format.ts` in this chunk to keep the Project Switcher currency and project status labels out of the component. The broader formatter work still belongs to Chunk 4.
- Added a minimal `src/lib/mock-data.ts` with project-only mock data so the Project Switcher can actually switch and persist projects. This does not replace the backend-shaped demo adapter work planned for Chunk 4.
- Implemented project management actions as a local lightweight placeholder modal instead of a reusable dialog primitive because shared UI primitives are scheduled for Chunk 3.

Notes

- `npm install lucide-react` initially failed inside the sandbox with `ENOTFOUND registry.npmjs.org`; it succeeded after rerunning with approved network escalation.
- `npm run build` completed successfully from `frontend/`.
- Starting Vite inside the sandbox failed with `listen EPERM` on `127.0.0.1:5173`; it succeeded after rerunning with approved escalation.
- Vite selected `http://127.0.0.1:5174/` because port `5173` was already in use.
- Local HTTP smoke checks returned `200` for `/`, `/dashboard`, `/budget`, `/suppliers`, `/documents`, `/settings`, and `/unknown-route`.
- The Docker frontend service on port `5173` had a stale `/app/node_modules` volume; running `docker compose exec frontend npm install` restored `react-router-dom` and `lucide-react` resolution inside the container, then the frontend service was restarted.
- No backend files were changed.

## Chunk 3 - Shared UI Primitives

Status: Completed

Summary

- Added a local `cn` helper in `src/lib/utils.ts`.
- Added local UI primitives for button, input, label, select, textarea, checkbox, card, table, and badge.
- Added shared components for page headers, KPI cards, chart cards, status badges, section cards, table toolbars, and progress bars.
- Wired the placeholder pages to import and render the shared components so they compile in real route usage.
- Implemented `StatusBadge` with backend-aligned project, transaction, invoice, budget line, and document states from the reference plan.

Plan Deviations

- Did not install `clsx`, `tailwind-merge`, or `class-variance-authority`; the current primitives are small enough to use a local dependency-free `cn` helper and manual variant maps.
- Implemented `select` and `checkbox` as native controls rather than Radix/shadcn primitives because Chunk 3 only requires compile-ready local building blocks and richer behavior is not needed yet.
- Updated placeholder pages to render the new shared components, although Chunk 3 only required they be importable. This keeps the component layer exercised before real mock data arrives.

Notes

- `npm run build` completed successfully from `frontend/`.
- No backend files were changed.

## Chunk 4 - Backend-Shaped Mock Data

Status: Completed

Summary

- Copied `backend/app/seed/data/catalog.json` to `frontend/src/demo/data/catalog.json`.
- Copied `backend/app/seed/data/powerbi_demo.json` to `frontend/src/demo/data/powerbi_demo.json`.
- Added backend-shaped demo types and pure adapter functions under `src/demo/adapters/`.
- Added adapter-produced view models for the budget workspace, dashboard, suppliers, documents, projects, and templates.
- Replaced the earlier one-off `src/lib/mock-data.ts` project fixture with adapter-produced project data from the backend seed.
- Updated current placeholder pages and the Project Switcher to consume view models from `src/demo/demo-data.ts` instead of raw seed JSON.
- Expanded `src/lib/format.ts` with date, file-size, percent, and progress formatters.

Plan Deviations

- Added `resolveJsonModule` to `tsconfig.app.json` so TypeScript can import copied seed JSON directly through Vite.
- Kept all copied seed JSON under `src/demo/data/` rather than importing backend files across package boundaries, preserving frontend build isolation.
- Represented supplier fields absent from the seed, such as `siret`, `created_at`, and `deleted_at`, as nullable values instead of inventing persisted backend data.
- Derived `invoice_type: full` for invoice transactions because `powerbi_demo.json` has invoice transactions but does not include an invoice type field.
- Built document rows from invoice transactions because the seed has no document table. These rows are marked as derived frontend demo data and preserve the transaction id relationship.

Notes

- `catalog.json` contains 7 categories, 30 subcategories, and 137 products.
- `powerbi_demo.json` contains 17 suppliers, 137 budget-line transaction groups, and 388 transactions.
- `npm run build` completed successfully from `frontend/`.
- No backend files were changed.

## Chunk 5 - Dashboard Only

Status: Completed

Summary

- Installed `recharts` and implemented the dashboard charts with `ResponsiveContainer`.
- Expanded the dashboard KPI grid to show budget sélectionné, coût facturé, factures payées, factures à payer, écart budget, and devis validés.
- Added chart cards for budget sélectionné vs coût facturé by category, invoice status distribution, monthly invoice activity, and transaction counts.
- Added recent transactions and product variance tables backed by adapter view models.
- Updated dashboard-facing French labels to include proper accents.
- Updated shared status labels and project status formatting with accented French labels.

Plan Deviations

- Kept the implementation on the existing adapter view models from Chunk 4; no additional mock-only dashboard state was introduced.
- Did not add code splitting for Recharts during this chunk. The production build warns that the JavaScript chunk is larger than 500 kB after adding Recharts, but the build succeeds and code splitting can be handled as a later optimization.

Notes

- `npm install recharts` initially failed inside the sandbox with `ENOTFOUND registry.npmjs.org`; it succeeded after rerunning with approved network escalation.
- The Docker frontend service had a stale `/app/node_modules` volume again; running `docker compose exec frontend npm install` restored `recharts` resolution inside the container, then the frontend service was restarted.
- `npm run build` completed successfully from `frontend/`.
- Build output includes a Vite chunk-size warning after adding Recharts.
- No backend files were changed.

## Chunk 6 - Budget Workspace Only

Status: Completed

Summary

- Replaced the Budget placeholder with the main operational workspace.
- Rendered the adapter-built hierarchy as expandable sections: Category > Product > Budget Line > Transactions.
- Added category headers with budget, facturé, and écart totals.
- Added dense product and budget-line financial rows with budget, devis validés, estimation DIY, facturé, payé, à payer, écart, and progression.
- Added contextual transaction child tables under expanded budget lines with date, type, fournisseur, description, montant TTC, statut devis, statut facture, and document.
- Added row-level mock actions to create a devis, estimation DIY, or facture from a specific budget line.
- Highlighted negative variances with destructive styling and over-budget progress with destructive progress bars.

Plan Deviations

- Kept transaction creation actions as a lightweight demonstration panel because the backend-compatible form/modal is explicitly planned for Chunk 7.
- The current demo seed produces one product-level budget line per product. The UI is structured to support multiple budget lines and breakdown indentation, but the copied backend seed does not yet contain breakdown-line examples.
- Kept expansion state local to `BudgetPage` because persistence and route-level state are not required by Chunk 6.

Notes

- `npm run build` completed successfully from `frontend/`.
- Build output still includes the Recharts chunk-size warning introduced in Chunk 5.
- No backend files were changed.

## Chunk 7 - Contextual Transaction Modal

Status: Completed

Summary

- Added a contextual transaction modal launched only from Budget workspace product and budget-line actions.
- Added backend-compatible conditional fields for quotes, DIY estimates, and invoices, including quote status, invoice status, invoice type, payment method, due dates, payment dates, and budget selection behavior.
- Built mock submit output that preserves the budget-line-scoped route for existing lines and the product-scoped route for the first transaction on an empty product.
- Replaced the placeholder transaction details dialog with a contextual review modal that shows the current project, product, budget line, and transaction fields.

Plan Deviations

- Kept submit behavior as a payload preview in the modal rather than mutating the adapter-backed demo data, matching the mock-submit requirement.
- Left non-transaction budget actions for product decomposition and sub-product creation as demonstration placeholders because Chunk 7 only covers transaction creation and review.
- Supplier and route identifiers continue to use frontend demo ids from the adapter layer; the payload shape and route structure mirror the backend contract, but no real API request is made.

Notes

- `pnpm build` completed successfully from `frontend/`.
- Build output still includes the Recharts chunk-size warning introduced in Chunk 5.
- No backend files were changed.
