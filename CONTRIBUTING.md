# Contributing

## Branches

- `main`: production-ready code for `vocosai.com`.
- `develop`: shared integration branch for team development.
- `feature/<short-name>`: feature work from `develop`.
- `fix/<short-name>`: bug fixes from `develop` or `main`, depending on urgency.

## Local Development

```powershell
cd fullstack
$env:VOC_HOST="127.0.0.1"
$env:VOC_PORT="8090"
python app.py
```

Open `http://127.0.0.1:8090`.

GitHub Codespaces also works from the repository `Code` menu. The dev container forwards port `8090` and starts the app automatically.

## Pull Requests

Before opening a pull request, run:

```bash
python -m py_compile fullstack/app.py
node --check fullstack/public/app.js
```

Pull requests should include:

- A short description of the user-facing change.
- Screenshots or API examples when UI or endpoint behavior changes.
- Notes for any migration, deployment, or environment variable changes.

Do not commit runtime data or secrets:

- `fullstack/.env`
- `fullstack/data/`
- SQLite database files
- logs
- Cloudflare credentials or private keys

## Review Rules

- Use pull requests for all shared work.
- Ask at least one teammate to review changes before merging.
- Keep changes scoped to one feature or fix.
- Rebase or merge the latest `develop` before requesting final review.
