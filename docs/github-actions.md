# GitHub Actions

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

| Trigger | Jobs |
|---------|------|
| Pull request | `test` — `./scripts/test.sh` (Vite build, router tests, Python unittest) |
| Push to `main` | `test`, then `deploy` — same tests, then `./deploy.sh` to the VPS |

## One-time: deploy secret

Production deploy uses SSH (same as local `./deploy.sh`). Add a **repository secret**:

| Secret | Value |
|--------|--------|
| `DEPLOY_SSH_KEY` | Private key that can `ssh root@188.166.105.108` (ed25519, full PEM including `BEGIN`/`END` lines) |

GitHub → **Settings → Secrets and variables → Actions → New repository secret**.

Optional **variables** (defaults shown in the workflow):

| Variable | Default |
|----------|---------|
| `DEPLOY_HOST` | `188.166.105.108` |
| `DEPLOY_SSH_PORT` | `22` |

The `production` environment on `deploy` allows adding required reviewers later (Settings → Environments).

Manual deploy without CI: run **Actions → CI → Run workflow** on `main`, or locally `./deploy.sh`.
