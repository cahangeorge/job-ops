# Dokploy/Omnestack Deployment

This directory contains production-prep notes for deploying JobOps to Dokploy on Omnestack at:

```text
https://openjobs.omnestack.com
```

The root Dockerfile is the production source of truth. It builds the React client and docs, installs runtime dependencies, exposes port `3001`, and includes a container health check for `http://localhost:3001/health`.

## Prerequisites

- Dokploy project access on the Omnestack server.
- DNS for `openjobs.omnestack.com` pointing at the Omnestack/Dokploy ingress.
- This repository available to Dokploy, or a published image such as `ghcr.io/dakheera47/job-ops:latest`.
- At least one configured LLM provider. The app can also be configured through onboarding after first boot, but production secrets are easier to manage in Dokploy environment variables.

## Required Dokploy Settings

Use these values for the application service:

| Setting | Value |
| --- | --- |
| Domain | `openjobs.omnestack.com` |
| Public URL | `https://openjobs.omnestack.com` |
| Internal/container port | `3001` |
| Health check path | `/health` |
| Health check URL from inside container | `http://localhost:3001/health` |
| Restart policy | `unless-stopped` or Dokploy equivalent |

Required persistent volumes:

| Volume name | Mount path | Purpose |
| --- | --- | --- |
| `openjobs-data` | `/app/data` | SQLite database, generated PDFs, runtime state, local JWT fallback, browser cookies |
| `openjobs-codex-home` | `/app/codex-home` | Codex app-server auth/config when using the Codex provider |

Do not run production without `/app/data` persistence. Without it, jobs, settings, resumes, generated files, and generated local auth state can be lost when the container is replaced.

## Environment

Create the Dokploy environment from `openjobs.env.example`, then replace placeholders with real values in Dokploy. Keep secrets in Dokploy, not in Git.

Minimum production baseline:

```text
NODE_ENV=production
PORT=3001
DATA_DIR=/app/data
CODEX_HOME=/app/codex-home
PYTHON_PATH=/usr/bin/python3
JOBOPS_PUBLIC_BASE_URL=https://openjobs.omnestack.com
JWT_SECRET=replace-with-at-least-32-random-characters
```

Set an LLM provider using `LLM_PROVIDER`, `MODEL`, and `LLM_API_KEY` unless you plan to complete onboarding and store settings through the UI. Common provider values include `openrouter`, `openai`, `glm`, `gemini`, `openai-compatible`, and local app-server providers.

## Deploy From Git

1. In Dokploy, create a new application in the Omnestack project.
2. Choose Git repository deployment and select this repository.
3. Set the build context to the repository root.
4. Set the Dockerfile path to `Dockerfile`.
5. Set the exposed/internal port to `3001`.
6. Add the domain `openjobs.omnestack.com` and enable HTTPS/TLS.
7. Add the two persistent volumes:
   - `openjobs-data` mounted at `/app/data`
   - `openjobs-codex-home` mounted at `/app/codex-home`
8. Paste environment variables from `deploy/omnestack/openjobs.env.example` and replace placeholder values.
9. Set the health check path to `/health` if Dokploy exposes path-based checks. If it asks for a command or full URL, use `curl -f http://localhost:3001/health`.
10. Deploy.

### Submodules

CareerOps is included as a reference-only submodule at `vendor/career-ops`. Production runtime must not depend on reading files from that path; the runtime parity surface is the static JobOps registry in `orchestrator/src/shared/career-ops/feature-registry.ts`.

If a Dokploy/CI build runs the CareerOps parity audit, make sure the checkout fetches submodules first:

```bash
git submodule update --init --recursive
npm run careerops:audit
```

If the build only runs the production Dockerfile and does not run the audit, the app should still build from native JobOps code without importing from the submodule.

## Deploy From Image

If you want Dokploy to pull a prebuilt image instead of building from Git:

1. Create a new Dokploy Docker image application.
2. Set the image to a pinned production image tag. `ghcr.io/dakheera47/job-ops:latest` matches the existing compose convention, but a release or commit tag is safer for production rollbacks.
3. Use the same domain, port, volumes, environment, and health check settings listed above.
4. Deploy.

## First Boot

1. Open `https://openjobs.omnestack.com`.
2. Complete onboarding:
   - choose and verify an LLM provider,
   - configure Reactive Resume if needed,
   - import or select the base resume,
   - decide whether to enable basic auth.
3. If using the Codex provider, complete Codex authentication in the container/session flow expected by the app. The auth state must persist in `/app/codex-home`.
4. Run the smoke check from the repository root:

```sh
deploy/omnestack/smoke.sh https://openjobs.omnestack.com
```

## Health Check

The production image and existing compose file both check:

```text
http://localhost:3001/health
```

For Dokploy, configure the service health check as `/health` on port `3001`, or use the full internal URL above if the UI asks for it.

The external smoke test checks:

- the supplied URL uses HTTPS,
- HTTPS response headers can be fetched,
- `/health` returns a successful HTTP response.

## Dev vs Production Notes

- Local development in the root README uses `docker compose up -d`, maps host port `3005` to container port `3001`, and reads an optional root `.env`.
- Dokploy should route HTTPS directly to container port `3001`; do not use the local `3005:3001` host-port convention.
- The compose `develop.watch` entries are for local container development and are not needed in Dokploy.
- Keep `NODE_ENV=production` in Dokploy.
- Keep `DATA_DIR=/app/data` and mount it as a persistent volume.
- Keep `CODEX_HOME=/app/codex-home` and mount it as a persistent volume if Codex app-server auth is used.
- Build from the root Dockerfile or deploy a pinned image built from that Dockerfile.

## Rollback Notes

- Prefer pinned image tags or a pinned Git commit for production.
- Keep `/app/data` attached across redeploys and rollbacks.
- Back up the `/app/data` volume before major upgrades because it contains the SQLite database and generated artifacts.
