## Agent skills

### Issue tracker

Issues live in GitHub Issues (joachimwedin/gh-issues-mcp). Dogfood this repo's own MCP server: use the `gh-issues-mcp` MCP tools for all issue operations — `gh` CLI is not a fallback. Gaps in tool coverage should be flagged, not routed around. External PRs are not treated as a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
