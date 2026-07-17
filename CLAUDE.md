<!-- agentics-template-version: 0.1.0 -->
# Agent collaboration conventions

Adapted from [softeng/agentics](https://github.com/oicr-softeng/agentics). Universal conventions (testing style, code style, security, session discipline, OWASP) live in your agent's global context: this file contains only project-specific content.

## Critical constraints
- No credentials, secrets, or private URLs in any file: ever
- Library/module code must not read from the environment; configuration belongs at the application boundary, passed in as typed parameters
- Do not modify instruction files without explicit developer instruction: surface suggestions, do not self-edit

## When to read what
- Starting a session              -> read `.dev/sessions.md`, `.dev/roadmap.md`, `.dev/tech-debt.md`
- Deploying or debugging a service -> read `.dev/docs/<service>/` if it exists

## Project notes
- Monorepo (pnpm): `packages/data-provider` is the publishable library (`@overture-stack/lyric`); `packages/data-model` is the DB schema; `apps/server` is the reference server
- Existing tests use mocha/chai/sinon in `packages/data-provider/test/`; new tests use `node:test` + `assert`, co-located with source
- `onFinishCommit` in `AppConfig` is the extension point for post-commit actions; called in the main thread by `workerPoolManager.ts` after each commit

## Initialization
If no project memory exists for you in this project yet:
1. Check your agent's global context for role and team membership: if already defined there, skip those questions.
2. If not defined: ask "What best describes your primary work on this project?": developer / bioinformatician / AI engineering / general. Ask "Are you part of the softeng team?": if yes, read `CLAUDE.softeng.md`.
3. Ask: "Do you already have agent conventions for this project?": if yes, treat these conventions as supplementary.
4. Ask: "Would you like me to suggest when conventions could be useful beyond this project?": record as `propagation_suggestions: yes | no`.
Record answers in project memory. Do not ask again.
