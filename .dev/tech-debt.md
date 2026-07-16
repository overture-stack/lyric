# Tech debt

## Open

### Tests live in `test/` not co-located with source
standalone: yes
context: Convention mismatch: team convention is to co-locate test files with source (`validation.test.ts` next to `validation.ts`). Lyric's existing mocha suite lives in `packages/data-provider/test/`. New tests should be co-located. Migrating existing tests is a standalone cleanup task.

### Existing tests use mocha/chai/sinon, not node:test
standalone: no
context: Depends on / related to the test placement issue above. Team convention for new code is `node:test` + `assert` with BDD naming. Migrating the mocha suite is a significant effort; do as a dedicated task, not in scope of feature work.

---

## Resolved

<!-- Move entries here when addressed, with a note of when and what fixed it -->
