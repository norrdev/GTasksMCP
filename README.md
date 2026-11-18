# google-tasks-mcp

Self-hosted remote [MCP](https://modelcontextprotocol.io) server that lets Claude
(web, desktop and the mobile apps) read and manage **Google Tasks**.

- TypeScript, stateless Streamable HTTP (`POST /mcp`)
- OAuth: the server proxies the flow to Google, so there is no database or token store;
  the MCP bearer token *is* the Google access token and is verified against Google on each call (cached 60 s)
- Single-user: only `ALLOWED_EMAIL` is accepted
- Docker + Caddy (automatic HTTPS) + GitHub Actions

## Tools

`list_task_lists`, `create_task_list`, `list_tasks`, `create_task`, `update_task`, `complete_task`, `delete_task`

## Setup

### 1. Google Cloud

1. Create a project, enable **Google Tasks API**.
2. OAuth consent screen: type *External*, add yourself as a test user (or publish the app, otherwise refresh tokens expire after 7 days in "Testing").
3. Credentials -> *OAuth client ID* -> **Web application**. Authorized redirect URIs:
   - `https://claude.ai/api/mcp/auth_callback`
   - `https://claude.com/api/mcp/auth_callback`
4. Copy the client id and secret.

### 2. Server (VPS)

```bash
git clone https://github.com/<you>/google-tasks-mcp && cd google-tasks-mcp
cp .env.example .env   # fill in
docker compose up -d --build
```

Point a DNS A record for `MCP_DOMAIN` at the VPS; Caddy gets the certificate itself.
Check: `curl https://mcp.example.com/healthz` -> `ok`.

### 3. Claude

Settings -> Connectors -> *Add custom connector*:
- URL: `https://mcp.example.com/mcp`
- Advanced settings: OAuth client ID / secret = the Google ones from step 1

Sign in with the Google account from `ALLOWED_EMAIL`. Connectors sync to the mobile apps.

### Auto-deploy (optional)

CI builds and pushes `ghcr.io/<owner>/google-tasks-mcp:latest`. To also restart the VPS, set
repo variable `DEPLOY_ENABLED=true` and secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`.
Set `GITHUB_REPOSITORY=<owner>/google-tasks-mcp` in the VPS `.env` so compose pulls your image.

## Development

```bash
npm i && cp .env.example .env
npm run dev        # needs env vars exported, e.g. `set -a; . ./.env; set +a`
npm run typecheck
```

## Security notes

- Anyone with the URL gets a 401 without a valid Google token for `ALLOWED_EMAIL`; tokens for other clients/accounts are rejected.
- The Google client secret lives only in the server env; keep `.env` out of git (store it in OpenBao/Vault if you run one).
- Scope is `tasks` (read/write all tasks) plus `openid email` for the allowlist check.
