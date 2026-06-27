# second-brain-mcp

Local-first MCP server for managing a file-based second brain. Consumers send text through MCP tools; the server writes and audits files inside a configured vault root, so clients do not need direct filesystem access.

## Folder Layout

The vault root comes from `SECOND_BRAIN_ROOT` or from `.second-brain/config.json`.

```text
SECOND_BRAIN_ROOT/
  raw/
  wiki/
    rejected/
  outputs/
  .second-brain/
    manifest.json
```

- `raw/`: original source documents received as text.
- `wiki/`: knowledge articles. New wiki entries start as `pending_audit`.
- `wiki/rejected/`: rejected drafts, eligible for cleanup after the configured retention period.
- `outputs/`: generated answers, reports, and syntheses.

## Audit Flow

`wiki_search` only returns entries with status `approved`. Every `wiki_input` creates a `pending_audit` item that must be reviewed with `audit_update`.

Rejections require a comment and move the file to `wiki/rejected/`. Retention is configured with `SECOND_BRAIN_REJECTED_RETENTION_DAYS`; the default is 30 days.

## MCP Tools

- `raw_input`
- `raw_search`
- `wiki_input`
- `wiki_search`
- `outputs_input`
- `outputs_search`
- `audit_list`
- `audit_update`
- `purge_rejected`

## Configuration

Preferred environment variables:

```powershell
$env:SECOND_BRAIN_ROOT="C:\path\to\second-brain"
$env:SECOND_BRAIN_REJECTED_RETENTION_DAYS="30"
```

Linux/macOS example:

```sh
export SECOND_BRAIN_ROOT="/path/to/second-brain"
export SECOND_BRAIN_REJECTED_RETENTION_DAYS="30"
```

See `.env.example` for all supported variables.

Optional fallback in `.second-brain/config.json`, relative to the process working directory:

```json
{
  "root": "/path/to/second-brain",
  "rejectedRetentionDays": 30
}
```

## Development

```sh
npm install
npm test
npm run test:coverage
npm run mutate
npm run build
```

The project enforces at least 90% global coverage with Vitest. Mutation testing runs with Stryker through `npm run mutate`.

## Transports

By default, the server runs with `stdio`, which is suitable for local MCP clients:

```sh
npm run build
npm start
```

For Streamable HTTP:

```sh
MCP_TRANSPORT=http HOST=127.0.0.1 PORT=3000 MCP_HTTP_PATH=/mcp npm start
```

On PowerShell:

```powershell
$env:MCP_TRANSPORT="http"
$env:HOST="127.0.0.1"
$env:PORT="3000"
$env:MCP_HTTP_PATH="/mcp"
npm start
```

There is also a convenience script:

```sh
npm run start:http
```

HTTP endpoints:

- `GET /health`
- `POST /mcp`
- `GET /mcp`
- `DELETE /mcp`

Streamable HTTP clients must send an `Accept` header that includes both `application/json` and `text/event-stream`.

Example initialize request:

```sh
curl -X POST http://127.0.0.1:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example","version":"0.0.0"}}}'
```

## Docker

The container runs HTTP by default and uses `/data/second-brain` as the internal vault root.

```sh
docker compose up --build
```

By default, the MCP endpoint is `http://127.0.0.1:3000/mcp`, and the health check is `http://127.0.0.1:3000/health`.

## Parent Repository Dispatch

This repository includes a GitHub Actions workflow that dispatches a workflow in the parent repository whenever `master` receives a push.

Required repository settings:

- Repository variable `PARENT_REPOSITORY`: parent repository in `owner/repo` format.
- Repository secret `PARENT_REPO_TOKEN`: token with permission to dispatch workflows in the parent repository.

Optional repository variables:

- `PARENT_WORKFLOW_FILE`: parent workflow file name. Defaults to `second-brain.yml`.
- `PARENT_REF`: parent branch or ref. Defaults to `master`.

Note: if the parent repository checks out this project as a submodule, the parent workflow will use the submodule commit recorded in the parent repository. To always build the latest `master` from this repository, the parent workflow should update the submodule before building, for example:

```sh
git submodule update --remote second-brain-mcp
```
