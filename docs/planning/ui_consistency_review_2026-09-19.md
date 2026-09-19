# UI Consistency Review — 2026-09-19

Follow-up to `f28850b`, which made `cn()` merge classes with
tailwind-merge. The same review ran on ccig-app that day (its roadmap entry
"One class-merging rule, one control standard"); its rules were ported here
and applied to this project's own components and screens.

## 1. Summary

`f28850b` applied every className override as written, and the 2026-09-19
PostgreSQL 18 deploy (`2571eef` → `f28850b`) put that live. A parser-based
audit found 117 distinct class lists where merging drops a class; 88 render
differently in Chromium (29 are no-ops: the caller's class already came
later in the stylesheet). They are resolved by one control standard, owned
by the components, and three fixes the audit surfaced along the way.

| Commit | Change |
|--------|--------|
| `4ca3e32` | One control height: fields 40px, buttons in a row share a height, overrides that never rendered deleted |
| `75939ea` | `--muted` 95% → 92% |
| `22ac1ce` | Global element rules moved into `@layer base` |
| `bdc2477` | Button text sized by button size |
| `bc13085` | `wrap-break-words` typo fixed |
| `9f77709` | `!` workarounds and redundant field font classes removed |

Frontend only; the backend is untouched. **Not deployed yet**: a frontend
image rebuild with the usual deploy procedure (runbook).

## 2. The control standard

Owner's brief (from ccig-app): clean, neat, standardized, consistent across
the app.

- **Fields**: every Input, Select (and `SupplierSelectField`) and date input
  is 40px, set by the component; call sites never set a height (50 removed).
  A read-only stand-in beside a field matches it (`h-10`).
- **Labels**: inline elements. A block `<p>` label beside inline labels
  pushed its field down (the transaction modal's « Type »). Each form keeps
  its own consistent style: `<Label>` (14px) on login, onboarding, exports
  and the new-transaction form; `text-xs` labels in the supplier and
  transaction-review modals.
- **Buttons sharing a row share a height**: filter chips, toolbar and
  page-header actions are the default 40px `Button`; `size="sm"` (36px) is
  for dense rows (tables, the budget tree), back links and compact bars.
- **Text follows size**: 16px regular on the normal and large button, 14px
  on the small one; fields 14px. Hand-built pills follow the same rule (the
  budget subcategory pills: 16px regular, pinned to `h-10`).
- **Production look kept**: overrides that never rendered before merging
  and that nobody asked for were deleted (pill chips, 28px budget-row
  buttons, 49px budget rows, 32px icon buttons…). Behaviour the code clearly
  intended stays: the Aide button hides during a page capture, « Mot de
  passe oublié ? » sits flush with the fields, a disabled select's chevron is
  paler, a disabled option or template card shows one cursor.

## 3. Global rules in `@layer base`

An unlayered rule outranks every Tailwind utility whatever its specificity.

- `* { border-color }` was unlayered, so every `border-<colour>` class
  rendered plain grey. Layered, they apply: dark dividers in the sidebar,
  tinted borders on error and success notices, bordered selected pills and
  cards. Kept by the owner (ccig-app fixed the same on 2026-08-24).
- `button, input, select, textarea { font: inherit }` is deleted: Tailwind's
  preflight already sets it, in the base layer. Unlayered, it cancelled every
  `text-*`, `font-*` and `leading-*` class on form controls, including
  Button's own `text-sm font-medium`.
- The cursor and heading rules are layered, the settings grid classes (still
  used here) moved into `@layer components`, and react-easy-crop's stylesheet
  is imported into `@layer components`. `:root` is the only unlayered rule in
  the built CSS.

## 4. Muted grey

`--muted` 95% → 92%, the owner's pick from previews at 95/93/92/90%: table
headers, count badges and the budget cards' counts were barely visible on
white cards. Borderless fills already used the full token; bordered panels
and row states keep their light tints.

## 5. Method and verification

- **Audit**: every className parsed with rolldown's `parseAst`, following
  className-forwarding components recursively (including calls inside
  `components/ui/`), every `cn()` and `buttonVariants()` call, and plain
  strings on HTML elements; ternary and variant-map branches treated as
  mutually exclusive. Each finding was checked in Chromium on its real
  element (the unlayered rules made some no-ops, and a dropped class can take
  a property with it).
- **False merges**: every pair of the 489 classes in use checked against the
  CSS properties each sets. None involve the custom colour, font or radius
  tokens. The one generic tailwind-merge 3 × Tailwind 4 mismatch (an
  arbitrary `text-[Npx]` drops a named size's line height) hit a single site,
  the transaction chips' count badges, whose override is gone. `break-words`/`break-all`: unused.
- **Rendered sweep**, 12 pages and 26 modal states at 1680, 1280 and 375px:
  every field 40px, no side-by-side controls of different height or top,
  button and field text as specified. The same sweep flags 4 mismatches on
  the pre-merge build and 41 short fields on main.
- **Cleanup proof**: the 22 `!` classes were removed rule by rule (no
  surviving class on the element can outrank them; `TableCell` has no
  responsive padding here), then 1,541 elements (912 with forced `:hover`)
  were compared before and after at desktop and phone width: 0 differences
  in about 1.5 million computed values per width. 37 field `text-sm` classes that
  repeated the component default are gone.
- **Gate**: `tsc -p tsconfig.app.json`, `oxlint --deny-warnings` (0 warnings,
  as on main), Prettier, `npm run build`, Vitest 18/18,
  `npm audit --omit=dev --audit-level=high` (0).

## 6. Dev note

The dev frontend container keeps `node_modules` in an anonymous volume, so
a dependency installed on the host is invisible to it until
`docker compose up -d --build --renew-anon-volumes frontend`. Check that the
Vite-served module imports `/node_modules/.vite/deps/<pkg>.js` and that the
URL returns 200 before calling a dependency change live.
