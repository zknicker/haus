# Haus

Haus is a chat app for working with agents. Haus Server owns collaboration
state, Haus App is the React product surface in browsers and Electron, and
Haus Computer runs agents on an attached machine.

The repository, package namespace, API types, environment variables, and dev
state retain the internal `haus` name.

## Architecture

```text
Haus App -> Haus Server -> Haus Computer -> Codex / Claude Code / Grok Build
```

`packages/haus-api` is the cross-boundary contract package. OpenAPI is the
wire source of truth, and the package also owns shared first-party contracts.

`packages/haus-sdk` is the TypeScript client over that API. Bots, webhooks,
automations, local tools, tests, and the app use the SDK/API
shape instead of a second protocol package.

## Repo Layout

* `packages/haus-api`: OpenAPI and shared Haus API contracts.
* `packages/haus-sdk`: TypeScript client wrapper for Haus API.
* `apps/server`: Haus Server and canonical collaboration state.
* `apps/website`: Haus App, including the React UI and Electron shell.
* `apps/computer`: Haus Computer and machine-local Agent execution.

## Getting started

Use Bun `1.4.4`, matching the root `packageManager` pin.

Install dependencies in every fresh checkout:

```bash
bun run setup:worktree
```

`setup:worktree` installs the frozen Bun dependency graph with lifecycle
scripts disabled, then downloads the pinned HeroUI React Pro artifacts.
Licensed registry credentials resolve from 1Password through the committed
`.env.schema`; there is no `.env` step. See
[docs/operations/environment.md](docs/operations/environment.md).

Start the local stack:

```bash
bun run dev
```

That starts PostgreSQL, Haus Server, Haus Computer, and the App
dev server. Use `bun run dev-app` for the same stack inside Electron.

Dev state is isolated under the worktree-specific Haus root. Ports are derived
from the worktree path so multiple worktrees can run at once; use `dev-port`
to inspect the assigned group. Host prerequisites and the full workflow are in
[docs/operations/development.md](docs/operations/development.md).

## Desktop Build

Build a debug desktop app and DMG:

```bash
bun run desktop:build
```

The macOS outputs are written under `apps/website/electron-dist/`.

## Docs

Start with [docs/README.md](docs/README.md).
