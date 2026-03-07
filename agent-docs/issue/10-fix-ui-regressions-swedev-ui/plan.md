# Plan: Issue #10 — Fix UI regressions after @swedev/ui migration

## Goal

Audit and fix any UI regressions introduced when `@swedev/ui` switched from a local `file:` reference to the npm package (`^0.1.0`, currently resolved to `0.1.1`). Ensure all component imports work, styling is consistent, responsive behavior is intact, and Radix UI Themes interop is correct.

## Triage Info

| Field | Value |
|-------|-------|
| **Blocked by** | None |
| **Related issues** | #6 (Adopt @swedev/ui components), #3 (CI builds) |
| **Scope** | `frontend/src/index.css` + 6 shared components in `packages/openvera/src/components/` |
| **Risk** | Medium (CSS layer conflicts, shared component surface) |
| **Conflict risk** | Medium if #6 starts modifying the same components concurrently |
| **Safe for junior** | Yes |

## Approach

The frontend uses `@swedev/ui` only for its CSS (`@import "@swedev/ui/styles.css"` in `index.css`). No `@swedev/ui` React components are imported yet (that's issue #6). The main regression risk is:

1. CSS conflicts between `@swedev/ui`'s `@layer swedev` / `@layer properties` styles and the custom daisyUI-compatible classes in `index.css`
2. Visual regressions in the 6 shared components in `packages/openvera/` that use those CSS classes
3. Version drift between the local build and npm-published `0.1.1`

## Steps

### Phase 0: Baseline Verification

1. **Verify clean build** — Run `cd frontend && npm run build && npm run lint && npm run typecheck` to establish a clean baseline before making any changes. If anything fails, fix it first and attribute the cause.

### Phase 1: CSS Layer Audit

2. **Check CSS layer ordering** — `index.css` imports Tailwind CSS first, then `@swedev/ui/styles.css`. The `@swedev/ui` CSS uses `@layer swedev` for component styles and `@layer properties` for CSS property resets. Verify that:
   - `@layer swedev` styles don't override the custom daisyUI classes in `index.css` (which are unlayered and thus higher specificity)
   - The global `*,*::before,*::after` selectors in `@layer properties` that reset `--tw-font-weight`, `--tw-border-style`, `--tw-shadow`, etc. don't cause unintended side effects
   - Files: `frontend/src/index.css`, `frontend/node_modules/@swedev/ui/dist/index.css`

3. **Check for class name collisions** — `@swedev/ui` uses capitalized class names (`.Badge`, `.Button`, `.Table`, `.Modal_Content`) while `index.css` uses lowercase daisyUI-style names (`.btn`, `.badge`, `.table`, `.modal`). These should not collide directly, but check for:
   - Radix UI Themes class selectors that both might target (`.rt-r-size-1`, `.rt-variant-ghost`)
   - Global CSS property resets affecting Tailwind utility behavior

4. **Verify built CSS output** — Inspect the production CSS bundle for duplicate rules or unexpected overrides. Grep for known daisyUI class names to confirm they're present.

### Phase 2: Visual Verification

**Prerequisites:** Backend/API must be running with seeded data (company, transactions, documents, parties). A company must be selected in the navbar.

5. **Audit each route** — Start dev server and navigate through all 10 routes plus detail views:
   - `/` (Dashboard) — stat cards, badges, financial summary
   - `/transactions` — filter selects, search input, data table, batch edit bar, checkboxes
   - `/transactions/:id` (TransactionDetail) — detail view, linked document info
   - `/documents` — document table, FormModal, ConfirmDialog, DocumentDetailModal
   - `/inbox` — pending files table, file tree, scan button, alert variants
   - `/review` (ReviewQueue) — review table
   - `/parties` — party list
   - `/parties/:id` (PartyDetail) — detail view
   - `/reports` — report display
   - `/settings` — settings form

6. **Check shared components** from `packages/openvera/src/components/`:
   - `CompanySelector` — dropdown, loading/empty states, create form
   - `FormModal` — modal open/close, header, body, footer
   - `ConfirmDialog` — modal with action buttons
   - `DocumentDetailModal` — modal with `table-xs`, `input-xs`, links
   - `EmptyState` — icon, title, description
   - `StatusBadge` — badge-success, badge-info, badge-error, badge-ghost variants

7. **Check CSS class patterns** across pages:
   - `.btn` variants (primary, ghost, error, outline, sizes sm/xs/square)
   - `.badge` variants (ghost, success, error, info, warning, soft)
   - `.input` / `.select` / `.textarea` / `.checkbox` (bordered, sizes)
   - `.table` (sm, hover, zebra)
   - `.loading` spinner, `.modal`, `.alert`, `.menu`, `.dropdown`, `.tooltip`
   - Custom: `.page-title`, `.stat-accent-*`, `.alert-accent-*`, `.tabular-nums`, `.card-hover`

8. **Test state coverage** — Verify loading, empty, and error states for key views (company selector, transactions list, inbox).

9. **Test responsive behavior** — Resize at mobile (375px), tablet (768px), desktop (1280px):
   - Sidebar behavior, grid layouts, table scroll, filter bar wrapping

### Phase 3: Fix Identified Issues

10. **Diagnose regression root cause** — For each regression, determine which category it falls into:
    - **Import order issue** — Fix the CSS import order in `index.css`
    - **Tailwind custom-property reset** — Add explicit property overrides where `@layer properties` zeroes out needed values
    - **Component markup issue** — Fix class names or HTML structure in the affected component

11. **Apply targeted fixes** — Fix only the specific regressions found. Do not refactor or change patterns that aren't broken.

### Phase 4: Final Verification

12. **Run full build** — `npm run build` must succeed with no TypeScript errors
13. **Run lint and typecheck** — `npm run lint && npm run typecheck`
14. **Visual regression check** — Re-verify affected pages after fixes

## Risks

- **CSS property resets from `@swedev/ui`** — The `@layer properties` block resets `--tw-font-weight`, `--tw-border-style`, `--tw-shadow`, and other Tailwind internal custom properties on `*,*::before,*::after`. These could interfere with Tailwind utility classes if layer ordering differs between the local build and npm package.
- **Radix UI Themes CSS variable scope** — Both `@swedev/ui` and the Radix `Theme` wrapper rely on CSS variables like `--accent-9`, `--gray-6`. The app's Tailwind theme tokens (e.g., `--color-primary`) could conflict if naming overlaps.
- **Version drift** — npm package is `0.1.1` vs whatever local version was used before.
- **Build-time CSS processing** — The local `file:` reference may have been processed differently by Vite/Tailwind compared to the npm package.

## Test Plan

- Build succeeds: `cd frontend && npm run build`
- Lint passes: `npm run lint && npm run typecheck`
- Visual check of all 10 routes + 2 detail views
- Responsive check at 375px, 768px, 1280px
- Modal open/close behavior (FormModal, ConfirmDialog, DocumentDetailModal)
- Company selector dropdown works (loading, empty, populated states)
- All badge variants render with correct colors and spacing
- Table rows hoverable and properly spaced
- Loading spinners animate correctly
- Empty states render correctly
