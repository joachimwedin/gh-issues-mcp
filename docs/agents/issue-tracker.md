# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. **This repo dogfoods its
own server**: use the `gh-issues-mcp` MCP tools for all issue operations.
The `gh` CLI is not a fallback — treat it as unavailable. If an operation
you need isn't covered by any tool below, that's a real gap in the server,
not something to route around: say so explicitly, and treat it as a
candidate for a new `gh-issues-mcp` tool (e.g. by filing an issue against
this repo) rather than improvising another way to do it.

## Conventions

- **Create an issue**: `create_issue(title, body, labels?)` — creates a new
  top-level issue. If `labels` is given, only labels in the server's
  configured vocabulary are accepted — see `docs/agents/triage-labels.md`.
- **Read an issue**: `view_issue(number)` — returns body, labels, and full
  comment history in one call.
- **List issues**: `list_issues(state?, labels?)` — PRs are excluded
  automatically, since this server treats issues, not PRs, as the triage
  surface.
- **Comment on an issue**: `comment_issue(number, body)`.
- **Apply / remove labels**: `edit_labels(number, add?, remove?)`. Only
  labels in the server's configured vocabulary are accepted — see
  `docs/agents/triage-labels.md`. If a label you need isn't in the
  vocabulary, flag it as a gap (config or tool) rather than trying to force
  it another way.
- **Close**: `close_issue(number, comment)` — `comment` is required, so an
  issue can never be closed without an explanation.
- **Create a sub-issue**: `create_sub_issue(parent_number, title, body)` —
  creates a new issue and links it to the parent via GitHub's sub-issues API
  in one call.

There is currently no tool for editing an issue's title/body after creation.
That remains a known gap.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Call `create_issue(title, body, labels?)`.

## When a skill says "fetch the relevant ticket"

Call `view_issue(number)`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create it with `create_issue(title, body)`, then `edit_labels(n, add: ["wayfinder:map"])` (label vocabulary permitting — see `docs/agents/triage-labels.md`).
- **Child ticket**: `create_sub_issue(parent_number, title, body)` — creates the child and links it to the map in one call. Where sub-issues aren't enabled on the repo, this tool call will fail; that's a gap to flag, not something to route around by editing the map body (no tool edits issue bodies either). Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`), plus `wayfinder:claimed` once claimed — apply via `edit_labels`.
- **Blocking**: native issue relationships where available; otherwise a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every issue it lists is closed.
- **Frontier query**: `list_issues(state: "open")` scoped to the map's sub-issues / task list, drop any with an open `Blocked by` issue or the `wayfinder:claimed` label; first in map order wins.
- **Claim**: `edit_labels(n, add: ["wayfinder:claimed"])` — the session's first write.
- **Resolve**: `comment_issue(n, "<answer>")`, then `close_issue(n, "<answer/summary>")`, then append a context pointer (gist + link) to the map's Decisions-so-far.
