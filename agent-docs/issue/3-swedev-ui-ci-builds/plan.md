# Implementation Plan: Make @swedev/ui available for CI builds

## Summary

Remove or update the local `file:` reference to `@swedev/ui` in `packages/openvera/package.json`, regenerate lockfiles, and update documentation. The frontend's `package.json` has already been updated to use the npm-published version, but the `openvera` package and lockfiles still reference the local path.

## Triage Info

> Decision-support metadata for this issue.

| Field | Value |
|-------|-------|
| **Blocked by** | None |
| **Blocks** | CI/CD release pipeline (mentioned in issue; no workflow files exist yet) |
| **Related issues** | None found |
| **Scope** | 5 files across frontend, packages, docs |
| **Risk** | Low (but local `../ui` checkout can mask verification failures) |
| **Complexity** | Low |
| **Safe for junior** | Yes |
| **Conflict risk** | Low |

### Triage Notes

- `@swedev/ui` v0.1.0 is already published on npm (option 1 from the issue was chosen)
- `frontend/package.json` was already updated to `"@swedev/ui": "^0.1.0"` (npm reference)
- The remaining work is in `packages/openvera/package.json` which still has `"@swedev/ui": "file:../../../ui"`
- Both lockfiles contain stale local-path references (`file:../../../ui`, `resolved: "../../../ui"`, `resolved: "../../ui"`)
- Dockerfile comment and README are outdated
- `@swedev/ui` is listed as a `dependency` in the `openvera` package but is **not imported in any source file** — it's only consumed via the CSS import in `frontend/src/index.css` (`@import "@swedev/ui/styles.css"`). It may not be needed in `packages/openvera` at all.
- A local `../ui` checkout exists on the developer machine, which means local builds will succeed even with stale `file:` references — clean-room verification is essential.

## Analysis

The issue describes a broken CI build due to `@swedev/ui` using a `file:` reference pointing to `~/repos/ui`. Since the issue was filed, two things have happened:

1. `@swedev/ui` v0.1.0 was published to npm
2. `frontend/package.json` was updated to reference `^0.1.0`

However, the fix is incomplete:
- `packages/openvera/package.json` still has `"@swedev/ui": "file:../../../ui"` in its `dependencies`
- `frontend/package-lock.json` resolves `@swedev/ui` via local path links (inherited from the openvera package)
- `packages/openvera/package-lock.json` also has the `file:` reference
- Dockerfile comment (line 6) still says "because @swedev/ui is a local file dependency"
- README references local dependency at `../ui`

## Implementation Steps

### Phase 0: Confirm dependency need

1. Verify whether `@swedev/ui` is actually needed in `packages/openvera`
   - Grep `packages/openvera/src` for any `@swedev/ui` imports (confirmed: none found)
   - Check if the Vite build config externalizes or bundles it (it's not in the `external` list, but also not imported)
   - **Decision:** If not imported, remove `@swedev/ui` from `packages/openvera/package.json` entirely rather than repointing. If it turns out to be needed (e.g., re-exported types), change to `"^0.1.0"`. See Design Decisions below.

### Phase 1: Update package references

2. Update `packages/openvera/package.json`
   - Remove `"@swedev/ui": "file:../../../ui"` from `dependencies` (preferred), OR change to `"@swedev/ui": "^0.1.0"` if Phase 0 reveals it's needed

3. Regenerate lockfiles
   - Run `cd packages/openvera && rm -rf node_modules package-lock.json && npm install`
   - Run `cd frontend && rm -rf node_modules package-lock.json && npm install`

4. Verify no local-path references remain
   - Grep both lockfiles for any `../ui` or `../../ui` resolved paths (not just `file:../../../ui`)
   - Ensure `@swedev/ui` resolves to the npm registry tarball URL

### Phase 2: Clean-room verification

5. Verify builds without local `../ui` checkout
   - After regenerating lockfiles, temporarily rename `../ui` (or verify in a container/CI-like environment)
   - Run `cd packages/openvera && npm ci && npm run build`
   - Run `cd frontend && npm ci && npm run build`
   - This ensures the build doesn't silently depend on the local checkout

### Phase 3: Update documentation

6. Update Dockerfile comment
   - Remove lines 5-7 that reference `@swedev/ui` as a local file dependency
   - The pre-build requirement remains because the Dockerfile copies pre-built `frontend/dist` rather than building in-image. Update the comment to reflect that.

7. Update README.md
   - Remove `@swedev/ui` from the Prerequisites section (line 36)
   - Update the frontend dependency note (lines 40, 65) — the pre-build is needed because Docker copies `frontend/dist` directly, not because of local deps

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `packages/openvera/package.json` | Modify | Remove `@swedev/ui` from `dependencies` (or change to `^0.1.0`) |
| `packages/openvera/package-lock.json` | Regenerate | Clean lockfile with npm registry resolution |
| `frontend/package-lock.json` | Regenerate | Clean lockfile with npm registry resolution |
| `Dockerfile` | Modify | Update comment — pre-build needed because Docker copies dist, not because of local deps |
| `README.md` | Modify | Remove `@swedev/ui` local dependency references |

## Codebase Areas

- `packages/openvera/`
- `frontend/`
- Root (`Dockerfile`, `README.md`)

## Design Decisions

### 1. Remove @swedev/ui from openvera package vs repoint to npm

**Options:** (A) Remove from `packages/openvera/package.json` entirely, (B) Change to `^0.1.0`, (C) Move to `peerDependencies`

**Decision:** (A) Remove — if confirmed unused in source.

**Rationale:** No source file in `packages/openvera/src` imports `@swedev/ui`. The only consumer is `frontend/src/index.css` which already has its own direct dependency on `@swedev/ui`. Keeping an unused dependency adds confusion and creates unnecessary resolution chains in the lockfile. If during implementation it turns out `@swedev/ui` is needed (e.g., for types or re-exports), fall back to option (B).

### 2. Delete and regenerate lockfiles vs npm install update

**Options:** Delete lockfiles and regenerate vs run `npm install` to update in-place

**Decision:** Delete and regenerate.

**Rationale:** The lockfiles contain deeply nested local-path resolved entries (`../../../ui`, `../../ui`) that `npm install` alone may not fully clean up. A fresh lockfile ensures no stale local references remain.

## Verification Checklist

- [ ] `@swedev/ui` is either removed from or updated in `packages/openvera/package.json`
- [ ] No local-path references to `ui` remain in any lockfile (check for `../ui`, `../../ui`, `file:`)
- [ ] `@swedev/ui` in `frontend/package-lock.json` resolves to npm registry URL
- [ ] `packages/openvera` builds successfully without `../ui` present
- [ ] `frontend` builds successfully without `../ui` present
- [ ] Dockerfile comment accurately describes why pre-build is needed
- [ ] README does not reference local `@swedev/ui` path
- [ ] Docker image builds successfully (`docker compose build`)
- [ ] `@swedev/ui` is a public npm package (no auth needed for CI)
