# Roadmap: category alias rename and transfer

Builds on assign/unassign ([completed](category-alias-assign-unassign.md)). "Reassign" conflates two operations with different risk profiles:

- **Rename**: change an already-set alias on the same category. Extends the existing `PUT /category/:categoryId/alias`, relaxing "must be null" to "must not collide with another category's alias." No new route.
- **Transfer**: move an alias from category A to B (e.g. redirecting to a new category after a schema migration). An orchestration of assign+unassign across two categories in one transaction, not a variant of assign. Open questions: grace period vs. immediate reuse of A's vacated alias, an audit trail, in-flight Kafka messages published under the old mapping. Needs its own design pass; don't build until actually needed.
