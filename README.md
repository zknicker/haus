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

## Development

Prerequisites: Bun `1.4.4` (root `packageManager` pin), PostgreSQL 16 binaries,
and `versitygw` on `PATH`. On macOS:

```bash
brew install postgresql@16 versitygw
```

Do not start a system PostgreSQL service; the stack owns its cluster.

Install dependencies:

```bash
bun run setup:worktree
```

That installs the frozen Bun graph with lifecycle scripts disabled, then
downloads the pinned HeroUI React Pro artifacts. Licensed registry credentials
resolve from 1Password through the committed `.env.schema`; there is no `.env`
step. See [docs/operations/environment.md](docs/operations/environment.md).

Run the local stack:

```bash
bun run dev
```

This starts PostgreSQL, Files storage, Haus Server, Haus Computer, and the App
dev server. The Services banner prints the Website, Server, and Computer URLs
for this worktree — read those instead of assuming fixed ports. `bun run
dev-app` runs the same stack in the Electron shell.

Dev state lives under `~/.haus/dev/<worktree-id>/`. Ports come from the
worktree path so multiple checkouts can run at once.

Full workflow: [docs/operations/development.md](docs/operations/development.md).

## Desktop Build

Build a debug desktop app and DMG:

```bash
bun run desktop:build
```

The macOS outputs are written under `apps/website/electron-dist/`.

## Docs

Start with [docs/README.md](docs/README.md).
