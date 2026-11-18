# Explore versioned guide publication and entry/resume

Status: implementation complete; final read-only review reported in task response

## Goal and scope

Publish validated immutable guide versions through a small JSON CLI; start a chosen
version by URL and resume the exact saved run without mixing guides. Preserve existing
Explore demo/progress and legacy contracts. No real route content, catalogue, CMS,
accounts, native work, commit/push or access to docs/season-zero.md.

## Current behavior / investigation

Guide.slug is already unique and ExploreRun.guide_id pins a row, but immutability is
only a convention and all rows can start. Frontend hardcodes demo slug/storage/copy
and reads current entry metadata before resuming a saved run. Existing row locks
already protect Answer/Arrival/Continue. PostgreSQL and browser fixtures are reused.

## Decisions and invariants

- Each slug identifies one immutable publication, e.g. walk-v1. No latest alias or
  separate guide-family/version hierarchy. Changed content requires a new slug.
- Migration 0006 adds nullable published_at; existing guides were implicitly public
  and keep access. New rows default unpublished. DB triggers freeze published guide
  and stop content; import validates all fields/positions before atomic publication.
- Identical imports are idempotent; conflicting imports reject without overwrite.
- Explicit ?guide= selects that version. Missing guide resumes last saved version
  or explains that a walk link is needed. Invalid/unknown/draft never falls back.
- Storage is scoped by immutable slug; last-guide is only a resume shortcut. Resume
  reads the run first and verifies its identity. Legacy demo credentials migrate
  without deletion/overwriting another version; no token goes in a URL.
- No automatic Start, GPS, progression, or loss of existing run state.

## Implementation plan / acceptance

- [x] Add publication model/migration, validated JSON importer and seed integration.
- [x] Gate guide lookup/Start on publication; preserve pinned Resume and legacy data.
- [x] Implement URL entry, isolated storage, old demo compatibility and generic UI.
- [x] Test valid/invalid/concurrent publication, immutability, migration, multiple
      versions, old-version resume, unavailable entry and 3+ stop completion.
- [x] Run focused backend/frontend/browser regression, lint/type/build/diff checks.
- [x] Update operator documentation. Final P0–P3 self-review is read-only and
      delivered separately after implementation and verification.

## Verification

Tests use the guarded PostgreSQL test database, never the application DB.

- 122 backend tests passed: publication/CLI, Explore, Arrival, legacy auth/quests/
  field-test regression, migration roundtrips and Alembic schema check.
- 187 frontend unit tests passed, including entry/storage isolation and old storage.
- 35 browser tests passed against the real API: versioned guides, Explore, Arrival
  and legacy flow. Three-stop completion/reload and layout at 320/390/430 px.
- Ruff lint/format, TypeScript, production Vite build (both entries) and
  git diff --check passed. No new dependencies or application database writes.

## Remaining limitations

Content field validation is not editorial/field verification. Same-browser credential
storage, live-device GPS and public admission/rate limitations remain unchanged.
