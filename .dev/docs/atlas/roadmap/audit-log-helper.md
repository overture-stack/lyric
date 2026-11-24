# Roadmap: reusable structured audit-log helper

`categoryService.ts`'s `assignAlias`/`unassignAlias` each log inline (`logger.info` with categoryId/previous/new alias/actor), duplicated. Worth a small `auditLog(dependencies, { action, actor, resource, changes })` helper once a second or third call site needs it (e.g. dictionary registration already changes a category's active dictionary). A shared audit-log shape is worth standardizing across softeng apps rather than each repo inventing its own fields.
