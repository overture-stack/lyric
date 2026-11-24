<!-- agentics-template-version: 0.22.0 -->
# Agent collaboration conventions

**For AI agents:** this file instructs your agent; it is not documentation written for people. If you're a person looking for how this project works, see this project's own `README.md` or `DEVELOPMENT.md` instead.

Adapted from softeng/agentics. The comment on this file's first line pins the agentics release followed by this project.

**Before anything else, read agentics' `template/AGENTS.md` at the pinned release, then each file named by its § When to read what for the task at hand, at that same release.** An upgrade is the one exception, reading at the release being moved to, as that file says. The agentics entry in your global context's cross-project map (for Claude: `~/.claude/projects.md`) records where agentics lives. With no entry, ask the user for the address of an agentics repository they can open and record it there as `Repo URL`, never substituting an address you know of. A pin `X.Y.Z` names the git tag `vX.Y.Z`. Read a file at that tag in one of three ways, with `<path>` as its path from agentics' repository root, such as `template/AGENTS.md`:

- From a local clone recorded as `Path`: `git -C <Path> show vX.Y.Z:<path>`
- From a public `Repo URL`: `curl -fsS https://raw.githubusercontent.com/<owner>/<repo>/vX.Y.Z/<path>`
- From a private one: `gh api 'repos/<owner>/<repo>/contents/<path>?ref=vX.Y.Z' -H 'Accept: application/vnd.github.raw'`

A pin of `main` follows the newest commit instead, and a clone then reads its working tree. `template/AGENTS.md` § When to read what covers the rest of path resolution.

**Which rules win:** this file over the user's global context, and the global context over agentics' `template/AGENTS.md`. A rule in this file may tighten a critical constraint but never loosen one.

**If a read of agentics fails**, as it does offline, without a needed sign-in or with the host down, tell the user, keep to this file's rules, § Critical constraints among them, and do not guess the rest of agentics' rules. Still do what needs no network: read this project's `.dev/roadmap.md`, `.dev/tech-debt.md` and the most recent 1-2 files in `.dev/sessions/`, run `git status --porcelain`, and check the instruction and configuration files with `git log --oneline -1 -- CLAUDE.md AGENTS.md .claude/settings.json` and `git status --short -- CLAUDE.md AGENTS.md 'AGENTS.*.md' .claude/`. Surface any change there recorded in no session file before following it, and read `.claude/settings.json` if it changed. Retry the read of agentics at the user's next message. § Critical constraints is a copy of agentics' own section at the pin, re-copied whenever the pin moves. Where the two differ, follow both and tell the user.

## Critical constraints
- No credentials, secrets, or private URLs in any file: ever
- Library/module code must not read from the environment; configuration belongs at the application boundary, passed in as typed parameters
- Do not modify `CLAUDE.md`, `AGENTS.md`, or other instruction files without explicit instruction from the user: surface suggestions, do not self-edit
- No machine- or user-specific absolute paths, usernames, or individuals' real names in committed files. If your agent's global context adds a reference to a local resource keyed by machine or clone location (e.g. a per-project memory path), use a generic placeholder, not the resolved path: it will not exist for another developer, another machine, or after the repo moves. Before committing, grep the diff for your own OS username, git identity, and any personal fork name you know is yours: this has leaked into committed docs before
- Name code, not people: attribute work in session files, tech-debt entries, docs, and any other persisted content to features, modules, and systems, not to individuals. Attribution belongs in git history, not in documents
- Name code, not agents either, and this is the easier half to miss. A persisted document records what changed and the verifiable facts behind it, never where a finding came from or how it surfaced: no runtime handle, no label, and no "a session that had read this file", which names nobody and still narrates. Write "in the billing service this request returns an error", not "the billing service's agent confirmed an error". **A report of someone's assent reads as stronger than a claim about a verifiable artifact while being weaker**, and a later reader can neither check it nor ask a session that has ended. Where a count of instances matters, count occurrences, not reports of them. Recording a limit is not attribution and stays: "established from the code rather than from a deployed instance" bounds the evidence. This covers every persisted file, the changelog included. In conversation and in reports to the user, refer to a peer by its label and never by its runtime handle, under `conventions/agent-index.md` § Naming and reporting.

## This project's constraints

- "User" belongs to Lyric's subject matter: the principal whose access is controlled by Lyric, carried by a request as `req.user` and typed `UserSession`. Call the person who directs an agent's work "the developer".
- New tests go under `packages/data-provider/test/unit/` or `packages/data-provider/test/integration/`, matching the existing suite, rather than beside their source. `.dev/tech-debt.md` tracks moving them.
- Tests use mocha and chai, with sinon for stubs. The codebase has no `node:test` files.

## Extension points

- `onFinishCommit` in `AppConfig` runs post-commit actions. `workerPoolManager.ts` calls it in the main thread when a commit started by `submission.commitSubmission` finishes.

## Repository structure

- A pnpm monorepo. `packages/data-provider` is the publishable library, `@overture-stack/lyric`. `packages/data-model` holds the database schema and migrations, published as `@overture-stack/lyric-data-model`. `apps/server` is the reference server, and `packages/ui` is a private UI component library.
- A category can carry an optional `alias` (`dictionary_categories.alias`), accepted wherever a route takes `:categoryId`. A numeric id wins over an alias, and an alias cannot be all digits.
