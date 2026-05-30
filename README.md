# Voice of Consumer OS

Voice of Consumer OS turns real user comments from Douyin, Xiaohongshu, Bilibili,
and other social platforms into executable brand content strategy.

The current runnable implementation is in `fullstack/`.

## What It Does

- Imports comments from CSV, JSON, or pasted text.
- Stores comments, brand data, benchmark data, strategies, reports, and reviews in SQLite.
- Runs a 10-step Agent pipeline for comment analysis, demand mapping, barrier analysis,
  competitor opportunities, platform strategy, experiments, decisions, and reviews.
- Provides 14 product modules across decision, insight, strategy, execution, asset, and AI engine views.
- Supports DeepSeek, OpenAI, or custom OpenAI-compatible providers through server-side settings.
- Can run publicly through Cloudflare Tunnel or a Linux server at `vocosai.com`.

## Structure

```text
.
|-- fullstack/
|   |-- app.py
|   |-- public/
|   |-- scripts/
|   |-- deploy/
|   |-- .env.example
|   `-- README.md
|-- sample_comments.csv
|-- sample_comments.json
|-- overview.md
`-- README.md
```

Runtime secrets and data are intentionally not committed:

- `fullstack/.env`
- `fullstack/data/`
- database files
- logs
- Cloudflare credentials and private keys

## Run Locally

```powershell
cd fullstack
$env:VOC_PORT="8090"
python app.py
```

Open `http://127.0.0.1:8090`.

For the exact Windows runtime path and public tunnel setup, see `fullstack/README.md`.

## Team Development

- Use `main` as the production branch and `develop` as the shared integration branch.
- Create feature branches from `develop`, open pull requests, and require at least one review before merging.
- Keep runtime secrets and local SQLite data out of Git. Use `fullstack/.env.example` as the only committed environment template.
- GitHub Codespaces is supported through `.devcontainer/devcontainer.json`; it starts the app on port `8090`.
- Pull requests run Python and frontend JavaScript syntax validation through GitHub Actions.

## Production Deployment

Production deployment files live in `fullstack/deploy/`.

To deploy from GitHub Actions, configure repository secrets:

- `VOCOS_SSH_HOST`
- `VOCOS_SSH_USER`
- `VOCOS_SSH_KEY`
- optional `VOCOS_SSH_PORT`

Run the `Deploy Production` workflow manually. To deploy automatically after merges to `main`, set repository variable `VOCOS_AUTO_DEPLOY=true`.
