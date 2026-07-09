## gh-issues-mcp

A Model Context Protocol (MCP) server that exposes a fixed, narrow set of GitHub Issues tools, scoped to a configured allowlist of repositories. It runs as its own long-running process, outside the process tree of any agent session, and holds a GitHub personal access token internally so agents never see or hold the credential themselves.

### Requirements
- Node.js
- macOS (the token is read from the macOS Keychain)
- An MCP client that supports Streamable HTTP transport (Claude Code, Claude Desktop, VS Code, Cursor, or any other MCP client)

### Quickstart

1. **Create a token.** [Create a fine-grained personal access token](https://github.com/settings/personal-access-tokens/new), scoped to every repo you plan to track (the repos you'll list under `repos` in step 3). Grant only:

   - **Issues**: Read and write
   - **Metadata**: Read-only

   Nothing else — see [Token scope](#token-scope) for why.

2. **Store it in the Keychain** — the server only ever reads the token from here, never from an env var or a file:

   ```sh
   security add-generic-password \
     -a "$USER" \
     -s "gh-issues-mcp" \
     -T "" \
     -w
   ```

   `-w` with no value prompts for the token instead of taking it as an argument, so it never lands in your shell history. The first time a process reads it back, macOS prompts you to click **Allow**. See [Keychain storage](#keychain-storage) for what `-T ""` does and how to replace a token later.

3. **Point it at your repo.** Create `~/.config/gh-issues-mcp/config.json`:

   ```json
   {
     "repos": [{ "repo": "joachimwedin/gh-issues-mcp" }],
     "port": 4319
   }
   ```

   `repos` is an allowlist — every repo a tool call may target — and with one entry it's the implicit default. To track more than one repo, list them all here and add `defaultRepo` to pick which one a call uses when it omits the `repo` parameter. See [Configuration](#configuration) for the full schema, including per-repo label vocabulary overrides.

4. **Install and start the server**, then confirm it picked up the token:

   ```sh
   npm install
   npm run build
   npm start
   ```

   ```sh
   curl http://127.0.0.1:4319/health
   # {"status":"ok","tokenLoaded":true}
   ```

   It's meant to be started once and left running — there's no auto-start or service-management logic built in.

5. **Register it with your MCP client.** The port is machine-specific and the server is meant to be available to every agent session on the machine, not just one project — register it at the **user level**, not project-local.

   **Standard config** works in most clients:

   ```json
   {
     "mcpServers": {
       "gh-issues-mcp": {
         "url": "http://127.0.0.1:4319/mcp"
       }
     }
   }
   ```

   <details>
   <summary>Claude Code</summary>

   ```bash
   claude mcp add --transport http gh-issues-mcp http://127.0.0.1:4319/mcp --scope user
   ```
   </details>

   <details>
   <summary>Claude Desktop</summary>

   Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.
   </details>

   <details>
   <summary>VS Code</summary>

   ```bash
   code --add-mcp '{"name":"gh-issues-mcp","url":"http://127.0.0.1:4319/mcp"}'
   ```
   </details>

   <details>
   <summary>Cursor</summary>

   Go to `Cursor Settings` -> `MCP` -> `Add new MCP Server`. Use the standard config above.
   </details>

### Key Features

- **Narrow surface**. Nine tools, all issue-scoped and restricted to a configured repo allowlist — nothing in the tool set can touch code, pull requests, or repo administration.
- **Token isolation**. The GitHub token lives only in the macOS Keychain and this process; agents talk to a local HTTP endpoint, never to GitHub directly.
- **Local-only**. Binds to `127.0.0.1` only — never reachable from outside the machine it runs on.
- **Audited**. Every tool call is appended to a local JSON-lines audit log, independent of GitHub's own issue-timeline history.

### Configuration

The server has no command-line flags — it reads runtime settings from environment variables and a JSON config file.

| Option | Description |
|--------|-------------|
| `GH_ISSUES_MCP_KEYCHAIN_SERVICE` | Keychain service name to read the token from. Default `gh-issues-mcp`. |
| `GH_ISSUES_MCP_CONFIG_PATH` | Path to the JSON config file. Default `~/.config/gh-issues-mcp/config.json`. |
| `GH_ISSUES_MCP_AUDIT_LOG_PATH` | Path to the JSON-lines audit log. Default `~/.local/state/gh-issues-mcp/audit.log`. |

<details>
<summary>Configuration file schema</summary>

```typescript
{
  /** Allowlist of repos tool calls may target. Non-empty. */
  repos: {
    /** "owner/name". */
    repo: string;

    /**
     * Allowed label values for edit_labels and create_issue on this repo.
     * Labels outside this list are rejected locally, before any GitHub API
     * call is made. Defaults to needs-triage, needs-info, ready-for-agent,
     * ready-for-human, wontfix.
     */
    labelVocabulary?: string[];
  }[];

  /**
   * The repo a tool call targets when it omits the `repo` parameter. Must
   * be one of the "owner/name" values in `repos`. Optional only when
   * `repos` has exactly one entry, in which case that entry is the default.
   */
  defaultRepo?: string;

  /** Port the server listens on. Bound to 127.0.0.1 only, never external. */
  port: number;
}
```

The old flat `owner`/`repo` shape is no longer supported; the server refuses to start and reports the error if it's detected.
</details>

## Security

gh-issues-mcp is designed so that a compromised server process, or a bug in a tool handler, cannot do more damage than commenting on or labeling issues.

<details open id="token-scope">
<summary><b>Token scope</b></summary>

Create a **fine-grained personal access token** scoped to exactly:

- **Issues**: Read and write
- **Metadata**: Read-only

Grant nothing else — no `Contents`, no `Pull requests`, no `Administration`, no `Actions`. GitHub itself rejects any call outside this scope, regardless of what the server attempts.

One token is shared across every repo in the server's `repos` allowlist, so scope it to cover all of them (a fine-grained PAT can select multiple repos). A tool call naming a repo outside the allowlist is rejected locally, before any GitHub API call is made, regardless of what the token itself could reach — so the allowlist, not just the token, is what bounds a given server instance.
</details>

<details open id="keychain-storage">
<summary><b>Keychain storage</b></summary>

The server never reads the token from an environment variable or a file on disk — only from the macOS Keychain, at startup.

```sh
security add-generic-password \
  -a "$USER" \
  -s "gh-issues-mcp" \
  -T "" \
  -w
```

`-w` with no value prompts for the token instead of taking it as an argument, so it never lands in your shell history.

`-T ""` is required — without it, any process can silently read the token back via `security find-generic-password`, no prompt. With it, every access (including the server's own) requires clicking **Allow** on a system dialog. For a real password prompt instead of a click, check "Ask for Keychain password" on the item in Keychain Access.app.

The `-s` value is the Keychain **service name**, overridden with `GH_ISSUES_MCP_KEYCHAIN_SERVICE`.

To replace an existing token, delete the old entry first:

```sh
security delete-generic-password -s "gh-issues-mcp"
```

If the Keychain entry is missing or unreadable, the server prints a clear error and exits immediately — it will not start up "successfully" without a token.
</details>

<details>
<summary><b>Network exposure</b></summary>

The server binds to `127.0.0.1` only — it is never reachable from outside the machine it runs on. The `/health` endpoint reports whether a token was loaded, but never the token value itself, in the response, in logs, or anywhere else observable.
</details>

<details>
<summary><b>Audit log</b></summary>

Every tool call appends one JSON-lines entry (timestamp, tool name, arguments, success/failure, GitHub response status) to a local audit log, independent of GitHub's own issue-timeline history. Path is configurable via `GH_ISSUES_MCP_AUDIT_LOG_PATH`.
</details>

### Tools

Every tool below (except `list_repos`) takes an optional `repo` parameter, `"owner/name"`, which must be one of the configured `repos` allowlist entries — a call naming a repo outside it is rejected locally, before any GitHub API call is made. When omitted, the call falls back to `defaultRepo`. Every issue-shaped result (all tools except `edit_labels` and `list_repos`) is tagged with the `repo` it targeted.

- **list_issues**
  - Description: List issues in a repository, optionally filtered by state and labels. Pull requests are excluded, since this server treats issues, not PRs, as the triage surface.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `state` (string, optional): One of `open`, `closed`, `all`.
    - `labels` (array, optional): Labels to filter by.
  - Read-only: **true**

- **view_issue**
  - Description: View a single issue's body, labels, and full comment history.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `number` (integer): Issue number.
  - Read-only: **true**

- **comment_issue**
  - Description: Post a comment to the given issue.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `number` (integer): Issue number.
    - `body` (string): Comment body.
  - Read-only: **false**

- **close_issue**
  - Description: Post a comment and close the given issue. `comment` is required, so an issue can never be closed without an explanation.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `number` (integer): Issue number.
    - `comment` (string): Closing comment. Required — the call is rejected locally if omitted.
  - Read-only: **false**

- **edit_labels**
  - Description: Add and/or remove labels on the given issue, restricted to the resolved repo's configured label vocabulary. Labels outside the vocabulary are rejected locally, before any GitHub API call is made. Unlike the other write tools, the result is `{ repo, labels }` — the resolved repo plus the issue's resulting label list — rather than a tagged issue object.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `number` (integer): Issue number.
    - `add` (array, optional): Labels to add.
    - `remove` (array, optional): Labels to remove.
  - Read-only: **false**

- **create_sub_issue**
  - Description: Create a new issue and link it as a sub-issue of the given parent issue, via GitHub's sub-issues API. Both the parent and the new sub-issue are in the same repo.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `parent_number` (integer): Parent issue number.
    - `title` (string): Title of the new sub-issue.
    - `body` (string): Body of the new sub-issue.
  - Read-only: **false**

- **create_issue**
  - Description: Create a new top-level issue in a repository. Labels outside the resolved repo's configured vocabulary are rejected locally, before any GitHub API call is made.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `title` (string): Issue title.
    - `body` (string): Issue body.
    - `labels` (array, optional): Labels to apply, restricted to the resolved repo's configured vocabulary.
  - Read-only: **false**

- **edit_issue**
  - Description: Update an issue's title and/or body. At least one of `title`/`body` must be given — a call with neither is rejected locally, before any GitHub API call is made.
  - Parameters:
    - `repo` (string, optional): `"owner/name"`. Defaults to `defaultRepo`.
    - `number` (integer): Issue number.
    - `title` (string, optional): New title.
    - `body` (string, optional): New body.
  - Read-only: **false**

- **list_repos**
  - Description: List the configured repo allowlist and each repo's effective label vocabulary (its own override, or the server-wide default). Takes no parameters — it doesn't target a single repo, so it has no `repo` input and its results aren't tagged with one.
  - Parameters: none.
  - Read-only: **true**
</content>
