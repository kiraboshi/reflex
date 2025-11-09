# AGENTS.md — Repository Agent Guide

This document defines how agents and contributors operate across the entire repository. It establishes a documentation-first, code-second workflow and a single set of norms that app-level guides must extend, not contradict.

Keep this guide current. When you change behaviors, structures, or standards, update the relevant documentation as part of the change.

## Scope and Sources of Truth

Follow this order of operations for any task:

1. Documentation (authoritative): discover facts here first.
2. Code (confirm and refine): validate docs, read implementations and tests.
3. Plans and evaluations: align with current proposals and quality signals.

Do not assume stack, structure, or patterns. Find them in documentation first.

## Documentation Topology

Root-level documentation lives at:

- `/docs` — project-wide documentation (architecture, conventions, onboarding)
- `/docs/adr` — Architecture Decision Records (authoritative design choices)
- `/evals` — qualitative evaluations of structures and functionalities
- `/plans` — proposals and the current state of implementing proposals, organized by state:
  - `plans/drafts/` — early-stage ideas and rough proposals
  - `plans/pending/` — proposals awaiting implementation
  - `plans/in-progress/` — actively being worked on, with each plan in its own container folder at `plans/in-progress/plan-name/` containing the plan specification and any other working context required for plan execution
  - `plans/completed/` — finished implementations
  - `plans/deprecated/` — superseded or obsolete plans that have been replaced by better approaches or completed work

This structure is mirrored inside each app folder. Examples:

- `app-web/docs`, `app-web/docs/adr`, `app-web/evals`, `app-web/plans`
- `app-srv/main/docs`, `app-srv/main/docs/adr`, `app-srv/main/evals`, `app-srv/main/plans`

When working within an app, start with that app's local docs, then consult root docs for cross-cutting standards.

### Plan Lifecycle and Deprecation

Plans follow a clear lifecycle: `drafts` → `pending` → `in-progress` → `completed`, with `deprecated` as a terminal state for superseded plans.

**When to Deprecate a Plan:**
- The plan's objectives have been achieved by a different, better approach
- The plan's scope has been superseded by completed work (e.g., the Core Behavior Testing Restructure superseded multiple testing plans)
- The plan addresses requirements that are no longer relevant
- The plan conflicts with new architectural decisions or completed work

**How to Deprecate a Plan:**
1. Move the plan from its current location to `plans/deprecated/`
2. Update the plan's content with:
   - A clear deprecation notice at the top
   - Explanation of why it was deprecated
   - Reference to the superseding work or plan
   - Preservation of original content for historical reference
3. Update any references to the deprecated plan in other documentation

**Deprecated Plan Structure:**
- Keep the original plan content for historical reference
- Add a deprecation notice with clear reasoning
- Reference superseding plans or completed work
- Mark with appropriate frontmatter (`status: deprecated`)

## Quick links

- Root ToC: [docs/toc.md](./docs/toc.md)
- Server ToC: [app-srv/main/docs/toc.md](./app-srv/main/docs/toc.md)
- Web ToC: [app-web/docs/toc.md](./app-web/docs/toc.md)

## Path anchoring (treat the repository root as the single source of truth)

- All paths in docs, prompts, scripts, and tool calls are relative to the repository root.
- Do not re-prefix the top-level label shown in tree snapshots. If a tree view shows `app/` as the root label, that is the repository root — do not write `app/app-web/...`.
- Use forward slashes in docs and prompts; tools should normalize on the host OS.

Examples

- Correct (relative to repo root):
  - `app-web/evals/meta/2025-08-12-app-web-docs-meta-evaluation.md`
  - `app-srv/main/docs/toc.md`
  - `prompts/operators/qa-operator.md`
- Incorrect (double-prefixed):
  - `app/app-web/evals/meta/...`
  - `app/app-srv/main/docs/...`

Preflight checks before creating or referencing files

- Existence-first: list or glob for sibling artifacts to confirm canonical directories (e.g., glob `app-web/evals/**/*.md`).
- Parent directory validation: ensure the parent folder exists; if not, reassess the anchor rather than creating a parallel structure.
- Consistency: use the same root-anchored path across all tool calls in a task.

Tip for Windows/PowerShell

- When running scripts, resolve paths from the workspace root (e.g., `pwsh -NoProfile -File scripts/evals/supercede-eval.ps1`). Avoid absolute local machine paths in docs; prefer repo-root relative paths.

## How to Understand Any Area (Workflow)

1) Read documentation

- At app scope: start in `<app>/{docs,docs/adr,evals,plans}`. Check `<app>/plans/in-progress/` for active work, `<app>/plans/pending/` for upcoming priorities, `<app>/plans/drafts/` for early-stage ideas, and `<app>/plans/completed/` for recently finished work. Avoid referencing `<app>/plans/deprecated/` for new work. In-progress plans are stored in container folders at `<app>/plans/in-progress/plan-name/` containing the plan specification and any other working context required for plan execution.
- At repo scope: read `/docs` and `/docs/adr` for global policies; review `/plans` and `/evals` for current direction and quality signals. Check `plans/in-progress/` for active work, `plans/pending/` for upcoming priorities, `plans/drafts/` for early-stage ideas, and `plans/completed/` for recently finished work. Avoid referencing `plans/deprecated/` for new work.
- Prefer architecture and ADR pages for the canonical description of structure, technology choices, and tradeoffs.

2) Analyze relevant code

- Use the doc-informed mental model to navigate the code. Start from documented entry points and key paths.
- Read tests and example usages to confirm behaviors and edge cases.

3) Align with proposals and evaluations

- If a plan is in progress, follow its guidance. If unclear or stale, propose an update (see Documentation Update Rules).

## Global Rules for Agents

- Documentation-first: never assume technology stack, file layout, or patterns without checking docs.
- Code as confirmation: read the implementation after the docs to validate details and edge cases.
- Prefer app-local standards when operating inside an app; use root standards for cross-cutting concerns.
- Keep changes small, typed/validated, and consistent with documented conventions.
- Avoid introducing parallel patterns or tools without an ADR.
- Do not pin library versions in narrative docs; consult manifest files (e.g., `package.json`, `pyproject.toml`, `go.mod`).

### Evaluation Authoring Rules (Non-negotiable)

- Never author evaluation findings or metrics directly from assumptions. Always analyse current source to produce qualitative justifications.
- When an evaluation is requested, you must execute the evaluation operator as a subagent and follow the evaluation framework. Do not bypass the operator to write eval content by hand, except for mechanical wiring (links, supersede metadata).
- Superseding is process-bound: use the provided script to archive and wire metadata. Do not hand-edit archive fields.

## Coding Standards

All agents must follow the coding standards defined in [docs/coding-standards.md](./docs/coding-standards.md). Key points include:

- Use of `Record<>` vs `Partial<Record<>>` patterns for appropriate type safety
- Strict prohibition of `any` type usage
- Service layer patterns for business logic extraction
- API/controller migration patterns

Refer to the full coding standards document for detailed guidelines.

## Operating Environment

The development environment has specific characteristics that agents must be aware of:

- **Server Status**: The server is already running in the background. Do not attempt to start the server in your agentic flow as this will cause conflicts.
- **Background Processes**: When testing changes, you can make requests to the already running server rather than starting a new instance.
- **Port Usage**: The server typically runs on port 4000. Check existing configurations before assuming port numbers.
- **Environment Variables**: The server may require specific environment variables to be set. Refer to existing configuration files rather than assuming defaults.

When verifying changes to API endpoints or server functionality, make requests to the existing server instance rather than trying to start a new one.

## Synchronization Across Agent Configs

`AGENTS.md` is the single source of truth for agent behavior. After editing this file, synchronize it to the various agent configuration files so all coding agents consume the same guidance.

- Target files synchronized from `AGENTS.md`:
  - `.cursorrules` (Cursor)
  - `GEMINI.md` (Gemini)
  - `CLAUDE.md` (Claude)
  - `GEMINI.md` (Qwen)
  - `CODEX.md` (Codex)
  - `OPENCODE.md` (OpenCode)

Run one of the following from the repository root:

```bash
# macOS/Linux
bash scripts/sync-agents.sh

# Preview changes without writing
bash scripts/sync-agents.sh --dry-run
```

```powershell
# Windows PowerShell / PowerShell 7+
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/sync-agents.ps1

# Preview changes without writing
pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/sync-agents.ps1 -DryRun
```

These scripts will:
- Ensure root-level target files exist and mirror `AGENTS.md`.
- Note: Scripts currently sync only root-level targets. App-level guides should explicitly link back to this root guide.

## Prompts

- Prompts live under the root `prompts/` directory with subfolders by scope: `web/`, `srv/`, `design/`, and cross-cutting `operators/`.
- Each prompt must include frontmatter: `title`, `type: prompt`, `scope`, `owner`, `status`, `inputs`, `outputs`, `safety`, and `links`.
- Discover prompts via `docs/prompt-registry.md`.
- The Operators Prompt Suite provides reusable functional prompts for coding, documentation, evaluation, migration, and QA under `prompts/operators/`.
- When executing changes based on a prompt, include references to the prompt and related `plans`/`docs/adr`/`evals` in your PR description.

## Evaluations (Evals) — Update and Archive Framework

- Framework: see `prompts/qa/evaluation-framework.md`.
- Supersede trigger: material content difference (not status) — e.g., substantive additions/removals, metrics/safety shifts that change recommendations.
- New eval frontmatter must include `supersedes: <path>` and `delta_trend: positive|negative|neutral` (plus optional `delta_summary`).
- Archive prior eval by setting `status: archived`, `archived_at`, and `superseded_by`, and moving it to `evals/<scope>/archive/<YYYY>/`.
- Use the helper script `scripts/evals/supercede-eval.(sh|ps1)` to perform mechanics.

### Evaluation Execution Protocol (Subagent required)

1) Run the Evaluation Operator as a subagent
- Use `prompts/operators/eval-operator.md` with inputs: subject, scope, evaluator handle, links to docs/prompts, paths to evidence artifacts, and optional `prior_eval_path`.
- The subagent drafts the eval using `prompts/qa/evaluation-framework.md` sections. You may minimally edit for formatting, but do not alter findings/metrics without updating evidence.

2) Supersede/Archive if applicable
- PowerShell (Windows):
  ```powershell
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/evals/supercede-eval.ps1 -New app-web/evals/2025-08-12-performance-budget-results.v2.md -Prev app-web/evals/performance-budget-results.md -DeltaTrend neutral
  ```
- Bash (macOS/Linux):
  ```bash
  bash scripts/evals/supercede-eval.sh --new app-web/evals/2025-08-12-performance-budget-results.v2.md --prev app-web/evals/performance-budget-results.md --delta-trend neutral
  ```

3) Catalog updates
- Update `evals/OVERVIEW.md` (and app-level indexes) to point to the latest eval and archive history folder.

Enforcement
- PRs that modify evals must include: links to evidence files, a note that the eval was produced via `prompts/operators/eval-operator.md`, and the supersede script invocation (if used). Reviews should reject eval changes lacking attached evidence or operator provenance.

## App-Level Guides

This section is to be completed after review.

## Implementation Playbooks (Repository-Wide)

Use these generic steps, then adapt to app-specific guides and current proposals.

1) Add or change a capability

- Read relevant ADRs and architecture/docs for the area.
- Check `/plans/in-progress/` for active proposals, `/plans/pending/` for planned work, `/plans/drafts/` for early ideas, and `/plans/deprecated/` for superseded plans; if needed, create or update a plan in the appropriate state folder (start in drafts for early-stage ideas). In-progress plans are stored in container folders at `/plans/in-progress/plan-name/` containing the plan specification and any other working context required for plan execution.
- Implement changes in code following app-local patterns.
- Add/update tests and examples to reflect the behavior.
- Update documentation and, if the change alters architecture or policy, add or amend an ADR.
- Consider updating `/evals` with new qualitative findings.

2) Introduce or modify an integration/API

- Document the contract and failure modes in the app-level docs.
- Update architecture docs if the integration affects boundaries or data flow.
- Keep generated clients and manifest configuration out of narrative docs; link to their locations.

3) Restructure or migrate code

- Propose the change in `/plans/pending/` (or move to `/plans/in-progress/` when starting); add an ADR if the change is architectural. Plans can be moved between states: drafts → pending → in-progress → completed, or to deprecated if superseded. In-progress plans are stored in container folders at `/plans/in-progress/plan-name/` containing the plan specification and any other working context required for plan execution.
- Provide a migration guide in the app's `docs/` and update key paths.
- Perform the migration in small, verifiable steps with tests.

## Documentation Update Rules

Update the relevant docs in the same pull request when any of the following change:

- Architecture or boundaries (modules, services, data flows)
- Technology choices or cross-cutting policies
- Directory structure or key paths/entry points
- Behavioral contracts (APIs, component interfaces, CLI, data schemas)
- Significant UX, performance, security, or accessibility guidance

Where to update:

- Minor clarifications: edit the closest app-level `docs/*.md` page.
- Structural or cross-cutting changes: add/update an ADR in `docs/adr` (and the app-level `docs/adr` if scoped to an app).
- Planned work or migrations: create early ideas in `plans/drafts/`, then promote to `plans/pending/` when ready for review. Track status by moving between folders as appropriate: drafts → pending → in-progress → completed, or to deprecated if superseded. In-progress plans are stored in container folders at `plans/in-progress/plan-name/` containing the plan specification and any other working context required for plan execution.
- Quality insights, tradeoffs, or regressions: capture in `evals/`.

Process requirements:

- Keep docs adjacent to the change; the PR should not leave them stale.
- Link code diffs to the updated docs (and ADRs) in the PR description.
- For breaking changes, include a "Migration Notes" subsection in the modified doc(s).
- If a doc appears stale or contradictory, fix it or open an issue/PR to correct it before proceeding.
- Maintain the prompt registry (`docs/prompt-registry.md`) when adding new prompts; ensure prompt frontmatter is present.

## PR Checklist (for Agents)

- Documentation-first review completed; facts discovered from docs, not assumptions.
- App-level docs updated to reflect the change (and root docs if cross-cutting).
- ADR added/updated when introducing or reversing an architectural decision.
- Plans updated when the change is part of an ongoing proposal/migration (move between `drafts/`, `pending/`, `in-progress/`, `completed/`, and `deprecated/` folders as appropriate). In-progress plans are stored in container folders at `plans/in-progress/plan-name/` containing the plan specification and any other working context required for plan execution.
- Evals updated if quality characteristics or tradeoffs changed.
- Tests added/updated; behaviors confirmed against docs.
- No narrative version pinning; manifests remain the source of versions.
- Synchronization run: `scripts/sync-agents.(sh|ps1)` executed and resulting updates committed.
- Evaluations (if present):
  - Produced via `prompts/operators/eval-operator.md` in a subagent session.
  - Supersede/archival performed via `scripts/evals/supercede-eval.(sh|ps1)` (with trend noted).
  - `evals/OVERVIEW.md` and app-level indices updated.

## Security, Accessibility, and Performance

Treat these as first-class. If changes affect them, update the relevant guidance in docs and, if policy-level, in ADRs. Confirm with tests and measurements where applicable.

---

This guide is the baseline for all apps in this repository. App-specific guides must extend it and point back here. Keep it accurate.


