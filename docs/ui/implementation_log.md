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
