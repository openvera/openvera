# Plan: Issue #15 — Match transaction search in document modal feels broken

## Goal

Improve the UX of the `MatchTransactionSection` component so that repeated 0-result searches give visible feedback and the section doesn't feel broken when auto-search finds nothing.

## Context

This section only appears for matchable, unmatched documents after data has been verified (`DocumentDetailModal.tsx:318`). Issue #13 (closed) gates it behind verification, so it now mounts suddenly after clicking "Verifiera", making the UX more noticeable.

## Approach

The fix is entirely frontend — the backend search endpoint works correctly. Changes are confined to `MatchTransactionSection` in `packages/openvera/src/components/DocumentDetailModal.tsx` (lines 704–844).

**Current state:** The `Sök` button already shows a loading spinner via `loading={isSearching}` (line 781). The gap is that the **results area** shows no feedback — when going from 0 → 0 results, nothing visually changes.

Three changes:

1. **Define explicit search/expansion state** — track auto-search completion, last executed query, and collapsed/expanded state.
2. **Add loading and contextual empty-state feedback in the results area** — show a spinner while searching, and after search show "Inga resultat för «query»" when a manual query returns empty.
3. **Collapse the section when auto-search finds nothing** — default to collapsed with a clickable header to expand. Manual searches never auto-collapse.

## Steps

### 1. Add state variables

**File:** `packages/openvera/src/components/DocumentDetailModal.tsx`

Add to `MatchTransactionSection`:

```tsx
const [lastQuery, setLastQuery] = useState<string | null>(null)     // trimmed query from last search
const [autoSearchDone, setAutoSearchDone] = useState(false)          // true after initial auto-search completes
const [isExpanded, setIsExpanded] = useState(true)                   // collapse toggle, initialized true until auto-search decides
```

Update `doSearch` to:
- Set `lastQuery` to the trimmed query string (or `null` if no manual query).
- After auto-search completes (first call from the `useEffect`), set `autoSearchDone = true` and `isExpanded = results.length > 0`.
- Disable the search input's `onKeyDown` handler while `isSearching` is true to prevent concurrent/duplicate requests.

### 2. Implement results area feedback

**File:** `packages/openvera/src/components/DocumentDetailModal.tsx`

Replace the current results rendering (lines 787–841) with this logic:

| State | Render |
|-------|--------|
| `isSearching` | Inline spinner: `<Loader2 className="w-3.5 h-3.5 animate-spin" />` + "Söker..." (use existing `loading loading-spinner` pattern from line 123 for consistency) |
| `hasSearched && candidates.length === 0 && lastQuery` | "Inga resultat för «{lastQuery}»" |
| `hasSearched && candidates.length === 0 && !lastQuery` | "Inga matchande transaktioner hittades." |
| `candidates.length > 0` | Existing results table (unchanged) |

Hide the empty-state message while `isSearching` is true so the user sees the spinner, not stale text.

**Edge case — blank/whitespace queries:** Since `q || undefined` (line 734) makes an empty manual search equivalent to auto-search, trim the query before setting `lastQuery`. If trimmed query is empty, set `lastQuery = null` so the generic message shows instead of "Inga resultat för «»".

### 3. Add collapsible section

**File:** `packages/openvera/src/components/DocumentDetailModal.tsx`

Wrap the search input and results area (lines 760–841) in a container that is hidden when `!isExpanded`.

- The section header "Matcha med transaktion" (line 755) becomes a clickable toggle with a `ChevronDown`/`ChevronRight` icon (already used in `CompanySelector.tsx:60`).
- **Default state:** expanded (`isExpanded = true`) until auto-search completes. After auto-search, set `isExpanded = candidates.length > 0`.
- **Manual interaction:** clicking the header toggles `isExpanded`. Once the user expands manually, do not auto-collapse again.
- **No-amount documents:** When `doc.amount` is null/undefined, auto-search doesn't run (line 745). In this case, keep `isExpanded = true` and `autoSearchDone = false` — the user must search manually.

### 4. Import updates

Add `ChevronDown`, `ChevronRight` to the lucide-react import (line 10). The existing spinner pattern (`<span className="loading loading-spinner" />`) is already available via daisyUI CSS classes in `index.css`, so no additional dependency needed.

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/openvera/src/components/DocumentDetailModal.tsx` | Modify | All changes in `MatchTransactionSection` (lines 704–844) |

## Risks

- **Low risk overall** — changes are purely cosmetic/UX in a single component, no backend changes, no data model changes.
- The collapsible behavior changes the default visibility when auto-search returns nothing. This is the intended trade-off per the issue description.
- Concurrent search requests (Enter while a search is in flight) could cause out-of-order results. Mitigation: disable input during `isSearching`.

## Test Plan

- `npm run lint` and `npm run typecheck:frontend` must pass.
- **Full flow from issue report:** Open document detail modal → click "Verifiera" → match section mounts → auto-search runs → verify loading spinner appears in results area during the search.
- **Auto-search with results:** Section expanded, showing transaction table.
- **Auto-search with no results:** Section collapsed. Header visible with chevron. Expanding reveals search input and "Inga matchande transaktioner hittades."
- **Manual search (0 → 0):** Type a query, click Sök. Spinner in results area. Message changes to "Inga resultat för «{query}»".
- **Manual search with blank query:** Trim whitespace, show generic empty message (not "Inga resultat för «»").
- **Manual search (0 → N):** Type a matching reference, click Sök. Results table appears. Note: manual search combines `q` with existing amount/date/doc_type filters.
- **No-amount document:** Section stays expanded, auto-search doesn't run, user can search manually.
