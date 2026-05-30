# Voice of Consumer OS Full-stack

This directory contains a runnable full-stack implementation of the original single-file prototype.

## Architecture

- Frontend: static HTML/CSS/JavaScript in `public/`
- Backend API: Python standard-library HTTP server in `app.py`
- Database: SQLite at `data/vocos.db`
- AI orchestration: server-side `/api/ai/run`, with provider settings stored on the server

## Run

```powershell
$env:VOC_PORT="8090"
C:\Users\daxia\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe app.py
```

Open:

```text
http://127.0.0.1:8090
```

## API

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/brands`
- `POST /api/brands`
- `POST /api/brands/switch`
- `GET /api/comments`
- `POST /api/comments/import`
- `GET /api/imports`
- `GET /api/review`
- `POST /api/review/update`
- `GET /api/briefs`
- `POST /api/briefs/from-strategy`
- `GET /api/briefs/export`
- `GET /api/search?q=keyword`
- `GET /api/demands`
- `GET /api/barriers`
- `GET /api/strategies`
- `GET /api/brand`
- `PUT /api/brand`
- `GET /api/ai/settings`
- `POST /api/ai/settings`
- `POST /api/ai/run`
- `GET /api/ai/runs`
- `GET /api/ai/steps`
- `GET /api/agents`
- `POST /api/snapshots/weekly`
- `POST /api/system/clear-demo`

For production, move AI secrets to environment variables or a secret manager instead of SQLite.

## Iteration Scope

The current version implements the five-epic iteration plan:

- Multi-brand workspaces with brand creation, editing, switching, and shared category tags.
- Continuous import with deduplication, import history, and optional incremental AI analysis.
- Human review workbench for AI outputs with pending, approved, rejected states and confidence scores.
- Strategy-to-Brief conversion with CSV export for execution handoff.
- System repair utilities including report generation, knowledge inference, global search, weekly snapshots, and demo-data clearing.

## GitHub Sync

The source repository is:

```text
https://github.com/Mikesure000/vocosai.com
```

Runtime files are intentionally excluded from GitHub:

- `fullstack/.env`
- `fullstack/data/`
- `*.db`
- `*.log`
- Cloudflare credentials and private keys

Use `.env.example` as the template for future deployments. After future code changes,
sync only source files and run:

```powershell
C:\Users\daxia\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -m py_compile fullstack\app.py
C:\Users\daxia\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --check fullstack\public\app.js
```

## Fixed Domain Deployment

The prepared hostname is:

```text
vocosai.com
www.vocosai.com
```

`vocosai.com` is covered by normal Cloudflare Universal SSL. `www.vocosai.com`
is a second-level subdomain, so HTTPS may require an explicit Cloudflare edge certificate
for that exact hostname, for example through Advanced Certificate Manager / Total TLS.

If this hostname changes, replace it in:

- `.env`
- `deploy/cloudflared-config.yml.template`
- `scripts/setup-cloudflare-tunnel.ps1`

Recommended Windows setup:

1. Copy `.env.example` to `.env` and set `VOC_AI_API_KEY`.
2. Install the app service task:

```powershell
.\scripts\install-scheduled-task.ps1
```

If Windows denies scheduled task creation, use the current-user Startup folder fallback:

```powershell
.\scripts\install-startup-shortcut.ps1
```

3. Configure Cloudflare Tunnel:

```powershell
.\scripts\setup-cloudflare-tunnel.ps1 -Hostname "vocosai.com" -AliasHostname "www.vocosai.com"
```

Cloudflare will issue and renew HTTPS automatically for the hostname once the domain is active in your Cloudflare account.

If Windows denies `cloudflared service install`, use the current-user Startup folder fallback:

```powershell
.\scripts\install-cloudflared-startup-shortcut.ps1
```
