# Roadmap: fixing an invalid submission before it's committed

Once a submission fails validation, starting over with a brand new submission feels like the only option to a submitter. Most of the plumbing to fix one in place already exists, so this is narrower than a new feature:

- `OPEN`/`VALID`/`INVALID` all count as active (`submissionUtils.ts`'s `openSubmissionStatus`); `getOrCreateActiveSubmission` reattaches new data to the existing submission for the same category+organization instead of creating a new one.
- `DELETE /:submissionId/:actionType` (`deleteActiveSubmissionEntity`) already removes a single record by index, or a whole entity's batch, and retriggers validation.
- The actual gap: resubmission is additive, not replace-in-place. `mergeInsertsRecords` (`submissionUtils.ts`) concatenates new records onto an entity's existing batch, deduping only exact-identical rows, so re-uploading a corrected file leaves the old bad rows sitting alongside the fix unless the submitter explicitly deletes that batch first. This is likely what's actually driving people to abandon a submission rather than fix it in place.

Scoped fix: make `submit`/`submitFiles` replace an entity's insert batch on resubmission instead of concatenating (or add an explicit replace mode). State machine, revalidation trigger, and delete-by-index scaffolding are already in place, so this is probably a few days including tests, once someone confirms the replace-vs-append read by tracing `submit`/`submitFiles` fully.
