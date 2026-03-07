# Plan: Issue #6 — Adopt @swedev/ui components in frontend

## Goal

Replace native HTML elements (`<button>`, `<input>`, `<select>`, `<textarea>`, `<dialog>`, `<table>`) with their `@swedev/ui` React component counterparts (`Button`, `TextField`, `Select`, `TextArea`, `Modal`/`ConfirmModal`, `Table`) across the frontend and `packages/openvera` shared components. This unifies the UI layer on the shared design system.

## Triage Info

| Field | Value |
|-------|-------|
| **Blocked by** | None |
| **Related issues** | #10 (Fix UI regressions — should be completed first to establish CSS baseline), #3 (CI builds) |
| **Scope** | ~12 files across `frontend/src/pages/` (9 pages) and `packages/openvera/src/components/` (4 components), plus `packages/openvera/package.json` |
| **Risk** | Medium — large surface area, CSS class system changes from daisyUI-style to Radix-based |
| **Conflict risk** | High with #10 if done concurrently (both touch same components and CSS) |
| **Safe for junior** | Yes (incremental, one component type at a time) |

## Approach

Replace incrementally, one component type at a time. Each phase swaps a single HTML element type and verifies no regressions before proceeding. The custom daisyUI-style CSS classes in `index.css` can be progressively retired as `@swedev/ui` components take over their styling.

**Key principle:** `@swedev/ui` components use Radix UI Themes internally and are styled via `@layer swedev` CSS. They use props like `variant`, `color`, `size` instead of CSS class names. The migration means replacing `className="btn btn-primary btn-sm"` with `<Button variant="solid" color="blue" size="1">`.

## Available @swedev/ui Components

From `@swedev/ui@0.1.1` exports:

| @swedev/ui | Replaces | Count in codebase |
|---|---|---|
| `Button` | `<button className="btn ...">` | ~65 buttons |
| `TextField` | `<input className="input ...">` | ~20 text inputs |
| `Select` | `<select className="select ...">` | ~25 selects |
| `TextArea` | `<textarea className="textarea ...">` | ~4 textareas |
| `Modal`, `ConfirmModal` | `<dialog className="modal">`, `FormModal`, `ConfirmDialog` | ~3 dialogs |
| `Table` | `<table className="table ...">` | ~15 tables |
| `Badge` | `<span className="badge ...">` | many badges |
| `Checkbox`, `LabelledCheckbox` | `<input type="checkbox" className="checkbox ...">` | ~7 checkboxes |
| `Callout` | `<div className="alert ...">` | ~4 alerts |
| `Dropdown` | `<details className="dropdown">` | ~1 dropdown |

## Steps

### Phase 0: Preparation

1. **Verify #10 is complete** — Ensure issue #10 (CSS regression fixes) is done first so we start from a clean visual baseline.

2. **Add `@swedev/ui` dependency to `packages/openvera`** — The shared components in `packages/openvera/src/components/` will import `@swedev/ui` React components. Add `@swedev/ui` as a dependency (or `peerDependency`) in `packages/openvera/package.json`. Also verify `packages/openvera/vite.config.ts` externalizes `@swedev/ui` so it's not bundled into the package output.

3. **Understand @swedev/ui component APIs** — Read the `@swedev/ui` source/docs to understand prop interfaces for each component (`ButtonProps`, `TextFieldRootProps`, `SelectRootProps`, etc.). Key props to map:
   - `Button`: `variant` (solid/soft/ghost/outline), `color` (Radix colors), `size` (1-4)
   - `TextField`: `variant`, `color`, `size`, `placeholder`
   - `Select`: `Select.Root`, `Select.Trigger`, `Select.Content`, `Select.Item` (compound pattern)
   - `Modal`: `open`, `onClose`, title, body, footer slots
   - `Table`: `Table.Root`, `Table.Header`, `Table.Body`, `Table.Row`, `Table.Cell`
   - `Badge`: `variant`, `color`, `size`
   - `Checkbox`/`LabelledCheckbox`: `checked`, `onCheckedChange`, `color`
   - `Callout`: `color`, icon, title, children

4. **Create mapping reference** — Document the CSS class → @swedev/ui prop mapping:
   - `btn-primary` → `<Button variant="solid" color="blue">`
   - `btn-ghost` → `<Button variant="ghost">`
   - `btn-sm` → `<Button size="1">`
   - `btn-xs` → `<Button size="1">` (smallest)
   - `badge-success` → `<Badge color="green">`
   - `badge-error` → `<Badge color="red">`
   - etc.

### Phase 1: Buttons (highest count, most visible)

4. **Migrate `packages/openvera` components first:**
   - `CompanySelector.tsx` — 3 buttons (ghost, primary xs)
   - `FormModal.tsx` — 1 button (ghost close)
   - `ConfirmDialog.tsx` — 2 buttons (default, error)
   - `DocumentDetailModal.tsx` — ~15 buttons (ghost, primary, various sizes)
   - Files: `packages/openvera/src/components/*.tsx`

5. **Migrate `frontend/src/pages/` buttons:**
   - `Transactions.tsx` — 3 buttons (primary save, ghost cancel, batch)
   - `Documents.tsx` — ~6 buttons (review, archive, delete, batch)
   - `Inbox.tsx` — 2 buttons (scan, delete)
   - `ReviewQueue.tsx` — ~4 buttons (approve, reject, review)
   - `Settings.tsx` — ~8 buttons (edit, delete, create, modal footer ModalFooter component)
   - `PartyDetail.tsx` — ~8 buttons (edit, delete, relations, modal)
   - `Parties.tsx` — buttons for party actions
   - `Reports.tsx` — report action buttons
   - `TransactionDetail.tsx` — detail action buttons
   - Note: `Dashboard.tsx` and `Layout.tsx` have no `<button>` elements to migrate.

6. **Remove retired `.btn-*` CSS classes** from `index.css` after all buttons are migrated.

### Phase 2: Form Inputs (TextField, Select, TextArea, Checkbox)

7. **Migrate text inputs** — Replace `<input className="input input-bordered input-sm">` with `<TextField.Root size="1" variant="surface">`:
   - `CompanySelector.tsx` — 1 input (new company name)
   - `Settings.tsx` — CompanyForm (3 inputs), AccountForm (2 inputs)
   - `PartyDetail.tsx` — PartyForm (2 inputs)
   - `Documents.tsx` — search input (composite: icon + input in `<label>` wrapper)
   - `Transactions.tsx` — search input (composite: icon + input in `<label>` wrapper)
   - `DocumentDetailModal.tsx` — EditDocumentForm (~8 inputs), MatchTransactionSection search (composite with icon)
   - **Edge case: composite search inputs** — `Transactions.tsx` and `Documents.tsx` wrap `<input>` inside a `<label className="input ...">` with a search icon. These need `TextField.Root` with a `TextField.Slot` for the icon instead of a wrapping label.

8. **Migrate selects** — Replace `<select className="select select-bordered select-sm">` with `<Select.Root>/<Select.Trigger>/<Select.Content>/<Select.Item>`:
   - `Transactions.tsx` — 5 selects (account, match, batch code/category/transfer/receipt)
   - `Documents.tsx` — 6 selects (filter, type, batch type/party/reviewed/archived)
   - `Settings.tsx` — AccountForm (2 selects: type, currency)
   - `PartyDetail.tsx` — PartyForm (2 selects: entity type, BAS code), AddRelationForm (1 select)
   - `DocumentDetailModal.tsx` — EditDocumentForm (3 selects: type, party, currency)

9. **Migrate textareas** — Replace `<textarea className="textarea textarea-bordered">` with `<TextArea.Root>`:
   - `PartyDetail.tsx` — PartyForm patterns textarea
   - `DocumentDetailModal.tsx` — notes textarea

10. **Migrate checkboxes** — Replace `<input type="checkbox" className="checkbox">` with `<Checkbox>` or `<LabelledCheckbox>`:
    - `Transactions.tsx` — select-all + row checkboxes (standalone, no label)
    - `Documents.tsx` — select-all + row checkboxes (standalone, no label)
    - `Inbox.tsx` — show duplicates checkbox (with label text — use `LabelledCheckbox`)
    - **Edge case: table row checkboxes** use `onChange` + `checked` props and `stopPropagation`. Verify `Checkbox` supports `onCheckedChange` with compatible event handling.

11. **Remove retired `.input-*`, `.select-*`, `.textarea-*`, `.checkbox-*`, `.label` CSS classes** from `index.css`.

### Phase 3: Tables

12. **Migrate tables** — Replace `<table className="table table-sm">` with `<Table.Root size="1">`:
    - `Transactions.tsx` — main transactions table
    - `Documents.tsx` — main documents table
    - `Inbox.tsx` — pending files table
    - `ReviewQueue.tsx` — unreviewed documents table
    - `Settings.tsx` — accounts table
    - `PartyDetail.tsx` — transactions table
    - `DocumentDetailModal.tsx` — VAT breakdown table, match candidates table

13. **Remove retired `.table-*` CSS classes** from `index.css`.

### Phase 4: Modals

14. **Replace shared modal components** — Refactor `FormModal` and `ConfirmDialog` in `packages/openvera` to use `@swedev/ui` `Modal` and `ConfirmModal`:
    - `FormModal.tsx` → wrap `Modal` from @swedev/ui
    - `ConfirmDialog.tsx` → use `ConfirmModal` from @swedev/ui
    - `DocumentDetailModal.tsx` → use `Modal` from @swedev/ui

15. **Remove retired `.modal-*` CSS classes** from `index.css`.

### Phase 5: Badges, Alerts, Dropdown

16. **Migrate badges** — Replace `<span className="badge badge-success">` with `<Badge color="green">`:
    - `StatusBadge.tsx` — 4 badge variants
    - `ReviewQueue.tsx` — confidence badge, doc type badge
    - `Documents.tsx` — doc type badges
    - `PartyDetail.tsx` — entity type badge, relation badges, pattern badges
    - `Inbox.tsx` — duplicate/not-in-db badges
    - `Dashboard.tsx` — company badge

17. **Migrate alerts** — Replace `<div className="alert alert-success">` with `<Callout color="green">`:
    - `Inbox.tsx` — scan result alert

18. **Migrate company selector dropdown** — Replace `<details className="dropdown">` with `<Dropdown>`:
    - `CompanySelector.tsx`

19. **Remove retired `.badge-*`, `.alert-*`, `.dropdown-*` CSS classes** from `index.css`.

### Phase 6: CSS Cleanup

20. **Audit remaining custom CSS** — After all components are migrated, review `index.css` for:
    - CSS classes that are still needed (`.page-title`, `.stat-accent-*`, `.card-hover`, `.tabular-nums`, `.link-*`, `.tooltip`)
    - CSS classes that can be removed (fully replaced by @swedev/ui)
    - Theme tokens that should be kept for custom styling

21. **Verify `@swedev/ui/styles.css` import is sufficient** — Confirm that all necessary Radix/Tailwind CSS is loaded through the @swedev/ui import.

### Phase 7: Verification

22. **Run full build** — `cd frontend && npm run build && npm run lint && npm run typecheck`
23. **Run knip** — `npm run knip` to catch unused imports/exports
24. **Visual check all pages** — Verify all 10 routes + detail views render correctly
25. **Test responsive behavior** — Mobile, tablet, desktop
26. **Test all interactive flows** — Modals, dropdowns, form submissions, batch operations

## Risks

- **Large surface area** — ~65 buttons, ~25 selects, ~20 inputs, ~15 tables across 13+ files. High chance of visual inconsistencies during migration.
- **@swedev/ui Select is compound** — Native `<select>` with `<option>` is simple; `@swedev/ui` Select uses `Select.Root > Select.Trigger > Select.Content > Select.Item`. This requires restructuring, not just renaming.
- **Modal API differences** — Current `FormModal`/`ConfirmDialog` use native `<dialog>` with `showModal()`/`close()`. @swedev/ui `Modal` likely uses Radix Dialog which has different open/close semantics.
- **Table API complexity** — Current tables use raw `<table>/<thead>/<tbody>/<tr>/<td>` with daisyUI classes. @swedev/ui `Table` uses a compound component pattern that may require significant restructuring.
- **CSS removal risk** — Removing daisyUI classes too early could break components not yet migrated. Each phase must complete before removing its CSS.
- **Build size** — Adding React component wrappers for every primitive may increase bundle size. Monitor the production build output.
- **`packages/openvera` dependency chain** — Adding `@swedev/ui` to `packages/openvera` means consumers of the openvera package also need `@swedev/ui` and `@radix-ui/themes`. Using `peerDependencies` is preferred to avoid bundling duplicates.

## Test Plan

- Build succeeds after each phase: `npm run build && npm run lint && npm run typecheck`
- Knip passes: `npm run knip`
- Visual check of all pages after each phase
- Responsive behavior preserved at 375px, 768px, 1280px
- All modals open/close correctly
- All form submissions work (company create/edit, account create/edit, party edit, document edit)
- Batch operations work (transactions, documents)
- Company selector dropdown works
- All badge variants render correctly
- Loading states and spinners still work
