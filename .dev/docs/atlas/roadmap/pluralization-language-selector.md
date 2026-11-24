# Roadmap: PLURALIZE_SCHEMAS_ENABLED as a language selector

The README documents this as English-only ("Pluralization assumes the words are in English"), and it's a single global boolean (`PLURALIZE_SCHEMAS_ENABLED`, default `true`), wired in `apps/server/src/config/app.ts`. There's no path to correct pluralization for a non-English dictionary today, only on or off.

Replace the boolean with a language selector: `none` (current `false` behaviour, no pluralization), `english` (current `true` behaviour), `french`. Requires picking a French pluralization library (`grammaire` looked like the best actively-maintained candidate when checked; no single library does both languages, so this would still be two separate pluralizers selected by the setting, not one shared implementation) and deciding what an unrecognized/unset value falls back to.
