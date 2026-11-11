# Roadmap, completed: category alias assign/unassign

`PUT`/`DELETE` on `/category/:categoryId/alias`: lets a category created before the alias feature existed get one, or have it cleared. Both idempotent, both audit-logged. Rename/transfer remain deferred ([rename and transfer](category-alias-rename-transfer.md)).

- `schemas.ts`: `categoryAliasAssignRequestSchema`, `categoryAliasUnassignRequestSchema`, body type via `zod.infer`
- `categoryService.ts`: `assignAlias`/`unassignAlias`; assign rejects a different existing alias (400) or one taken elsewhere (409), no-ops on a matching retry; unassign no-ops when already unset
- `categoryController.ts`, `categoryRouter.ts`: new handlers/routes
- swagger: documented both endpoints; extracted a shared `CategorySummary` schema
- `categoryRouter.spec.ts`: coverage for both; full integration suite run and passing (98/98)
