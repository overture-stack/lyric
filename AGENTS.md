<!-- agentics-template-version: 0.1.0 -->
# Agent collaboration conventions

Adapted from [softeng/agentics](https://github.com/oicr-softeng/agentics). This is the comprehensive reference for agents that do not load files on demand. If you are Claude, prefer `CLAUDE.md`: it dispatches to more detailed convention files.

## Interaction parameters
- Ask clarifying questions before making large assumptions about intent
- Surface better alternatives as options; let the user decide
- Push back on bad ideas and identify blind spots before they are baked into code
- Flag scope-adjacent issues verbally, then document them in `.dev/tech-debt.md`

## Critical constraints
- No credentials, secrets, or private URLs in any file: ever
- Library/module code must not read from the environment; configuration belongs at the application boundary, passed in as typed parameters
- Do not modify `CLAUDE.md`, `AGENTS.md`, or other instruction files without explicit instruction from the developer: surface suggestions, do not self-edit

## Project notes
- Monorepo (pnpm): `packages/data-provider` is the publishable library; `packages/data-model` is the DB schema; `apps/server` is the reference server
- Existing tests use mocha/chai/sinon in `test/`; new tests use `node:test` + `assert` co-located with source
- `onFinishCommit` in `AppConfig` is the extension point for post-commit actions (see `packages/data-provider/src/config/config.ts`)

## Session-start signals

A session is a work period: not necessarily a new chat thread. Treat greetings ("good morning", "hi again"), resumption phrases ("let's continue", "back to it", "where were we"), and on-demand requests ("sync up", "refresh context", "re-read your instructions") as session-start signals even mid-thread.

## Starting a session

On a session-start signal, before touching any code:
1. Check whether your agent has a cross-project map available. If it exists, read it for cross-project context and downstream effects.
2. Check whether instruction files changed since the last `sessions.md` entry: `git log --oneline -1 -- CLAUDE.md AGENTS.md`. Re-read only changed files.
3. Read `.dev/roadmap.md`: check current focus and any `[in progress]` items
4. Read `.dev/tech-debt.md`: note `standalone: yes` entries relevant to today's work
5. Read `.dev/sessions.md`: last 1-2 entries give context on recent work and open threads
6. softeng team member -> apply Canadian English spelling and softeng K8s/CI conventions from your agent's global context

## Keeping `.dev/` current

Update `.dev/roadmap.md` or `.dev/tech-debt.md` within the same session whenever a roadmap item's status changes, a tech-debt entry is resolved, or a meaningful decision is made.

After any meaningful unit of work: code written, bug fixed, tech-debt logged, roadmap updated, docs changed: add or extend the dated entry in `sessions.md`. Do not wait for a "session over" signal; work rarely ends cleanly. Do not log conversational activity (discussions, PR reviews with no local changes, waiting states).

When `.dev/` documents are updated, remind the developer to commit them: this history matters for avoiding double work across sessions.

## Tech-debt entry format

```
[short description of the issue]
standalone: yes | no
context: [roadmap item reference or brief note: required when standalone: no]
```

`standalone: yes`: can be picked up freely.
`standalone: no`: blocked on or coupled to roadmap work; read the context note before touching it.

## Testing

Co-locate test files with the source file they test: `validation.test.ts` next to `validation.ts`, not in a sibling `__tests__/` directory.

For non-trivial work: plan first -> define behaviour as tests -> implement. Tests are the specification.

BDD style using `node:test` and `assert`: no additional libraries:

```ts
import { suite, test } from 'node:test';
import assert from 'node:assert/strict';

suite('getNetworkPassthroughHeaders', () => {
  test('returns an empty array when no headers are configured', () => {
    assert.deepEqual(getNetworkPassthroughHeaders({ passthroughHeaders: [] }), []);
  });
});
```

`suite()` groups related tests; `test()` states expected behaviour in plain language; body: setup -> action -> assertion (Given / When / Then).

Note: existing tests in `test/` use mocha/chai/sinon. New tests should use node:test co-located with source.

## Code style

**Comments:** write none by default. Add one only when the WHY is non-obvious: a hidden constraint, subtle invariant, workaround for a specific bug. Never explain WHAT the code does; never reference the current task or callers.

**Scope:** stick to stated scope. Surface weaknesses verbally, then log in `.dev/tech-debt.md`. Three similar lines is better than a premature abstraction.

**Search before writing:** before implementing something new, search the codebase for existing patterns: use grep or semantic search before writing from scratch.

**Library awareness:** when a well-established library would do more thorough work than a hand-rolled solution, surface it as an option with a brief explanation. Let the developer decide.

**Checking in:** check in before non-trivial direction changes; not on mechanical steps.

**Property ordering:** Alphabetize properties in config objects and YAML/JSON files at all nesting levels: prevents silent duplicate key overwrites and keeps additions consistent.

**Language:** Canadian English (`-our`, `-re`, `-ize`, `-yse`). Flag typos and language issues when spotted: don't fix silently.

## Structured logging

Emit logs as structured key-value pairs or JSON objects, not interpolated strings. Include a consistent set of fields: timestamp, severity, event type, actor identity where known, resource identifier, outcome. Do not log secrets, credentials, or PII in log values.

Apply from the start of any feature involving authentication or access control decisions, permission changes or administrative actions, data access or exports, or errors at system boundaries.

## Security

Be aware of the current OWASP Top 10 (verify the current edition at https://owasp.org/www-project-top-ten/). Apply during implementation, flag when reviewing adjacent code, surface when making design decisions touching authentication, access control, input handling, session management, or dependency management.

## Convention placement and propagation

Conventions live at one of three levels: always ask which level is correct:

- **Project-specific**: applies to this project only; goes in the project's `CLAUDE.md` or `.dev/tech-debt.md`
- **Global**: applies to all the developer's projects; belongs in your agent's global context directory
- **Shareable**: could benefit other teams; flag as a potential PR to the agentics repo

## Initialization

If no project memory exists for you in this project yet:
1. Check whether a cross-project map is accessible.
2. Ask: "What best describes your primary work on this project?": developer / bioinformatician / AI engineering / general (or describe it). Read the matching file in `CLAUDE.roles/`.
3. Ask: "Are you part of the softeng team?": if yes, apply softeng conventions from your agent's global context (Canadian English, K8s operator-first, VSO, Jenkins CI).
4. Ask: "Do you already have agent conventions for this project?": if yes, treat these conventions as supplementary; defer to your existing setup on conflicts.
5. Ask: "Would you like me to suggest when conventions could be useful beyond this project?": record as `propagation_suggestions: yes | no`.
Record all answers in project memory. Do not ask again.
