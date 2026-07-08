# gh-issues-mcp

A standalone MCP server exposing a fixed, narrow set of GitHub Issues tools,
scoped to a single repository. It runs as its own long-running process,
outside the process tree of any agent session, and holds a GitHub personal
access token internally so agents never see or hold the credential
themselves.

The server exposes GET /health for liveness checks, and an MCP endpoint at
POST/GET/DELETE /mcp (Streamable HTTP transport) with the tools listed
below.

## Required GitHub token scope

Create a **fine-grained personal access token** scoped to exactly:

- **Issues**: Read and write
- **Metadata**: Read-only

Grant nothing else — no `Contents`, no `Pull requests`, no `Administration`,
no `Actions`. This means even a compromised server process or a bug in a
tool handler cannot push code or open pull requests: GitHub itself rejects
any such call regardless of what the server attempts.

Scope the token to the single repository this server instance is configured
for (see below). If you need to operate on more than one repo, run a
separate server instance (different port, different config, different
token) per repo.

## Storing the token in macOS Keychain

The server never reads the token from an environment variable or a file on
disk — only from the macOS Keychain, at startup.

```sh
security add-generic-password \
  -a "$USER" \
  -s "gh-issues-mcp" \
  -w "<your-fine-grained-PAT>"
```

The `-s` value is the Keychain **service name**. It defaults to
`gh-issues-mcp`; override it by setting `GH_ISSUES_MCP_KEYCHAIN_SERVICE`
before starting the server (useful if you run multiple instances for
multiple repos).

To replace an existing token, delete the old entry first:

```sh
security delete-generic-password -s "gh-issues-mcp"
```

## Configuring the target repo

The server reads its target `owner/repo` and listen port from a local JSON
config file, not from hardcoded values or per-call arguments:

```json
{
  "owner": "your-org-or-user",
  "repo": "your-repo",
  "port": 4319
}
```

By default this file is expected at `~/.config/gh-issues-mcp/config.json`.
Override the path with `GH_ISSUES_MCP_CONFIG_PATH`.

## Running the server

```sh
npm install
npm run build
npm start
```

The server binds to `127.0.0.1:<port>` only — it is never reachable from
outside the machine it runs on. It is meant to be started manually, once,
and left running; there is no auto-start or service-management logic built
into it.

If the Keychain entry is missing or unreadable, the server prints a clear
error and exits immediately (it will not start up "successfully" without a
token).

### Health check

```sh
curl http://127.0.0.1:4319/health
# {"status":"ok","tokenLoaded":true}
```

The health-check response reports whether a token was loaded — it never
includes the token value itself, in the response, in logs, or anywhere
else observable. Use this to confirm the server is up (and holding a
token) before starting an agent session or an autonomous run against it.

## Registering with an MCP client

Because the port is machine-specific and the server is meant to be
available to every agent session on the machine (not just one project),
register it in your **user-level** MCP client configuration — not in any
project's committed config. For example, in Claude Code's user config:

```json
{
  "mcpServers": {
    "gh-issues-mcp": {
      "url": "http://127.0.0.1:4319/mcp"
    }
  }
}
```

## Tools

- `list_issues(state?, labels?)` — lists issues in the configured repo.
  Pull requests are excluded, since this server treats issues, not PRs, as
  the triage surface.
- `view_issue(number)` — returns an issue's body, labels, and full comment
  history.

More tools land in later slices (comment/close, label edits, sub-issues).

## Audit log

Every tool call appends one JSON-lines entry (timestamp, tool name,
arguments, success/failure, GitHub response status) to a local audit log,
independent of GitHub's own issue-timeline history.

By default this file is written to
`~/.local/state/gh-issues-mcp/audit.log`. Override the path with
`GH_ISSUES_MCP_AUDIT_LOG_PATH`.
