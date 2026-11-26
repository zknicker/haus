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

Prerequisites:

* Bun `1.4.4` (matches the root `packageManager` pin)
* PostgreSQL 16 and versitygw on `PATH` (macOS: `brew install postgresql@16 versitygw`)

Do not start a system or Homebrew PostgreSQL service. The managed stack owns its
own cluster per worktree.

In every fresh checkout or worktree:

```bash
bun run setup:worktree
```

That installs the frozen Bun dependency graph with lifecycle scripts disabled,
then downloads the pinned HeroUI React Pro artifacts. Licensed registry
credentials resolve from 1Password through the committed `.env.schema`; there is
no `.env` step. See
[docs/operations/environment.md](docs/operations/environment.md).

Start the local stack:

```bash
bun run dev
```

This starts an isolated PostgreSQL cluster, a local Files storage gateway, Haus
Server, Haus Computer, and the App dev server. Read the Services banner for the
Website, Server, and Computer URLs. Ports come from the worktree path so
multiple worktrees can run at once. Use `bun run dev-app` for the same stack in
the Electron shell.

Local apps auto sign in through the loopback-only development session. Dev state
lives under `~/.haus/dev/<worktree-id>/`.

For shared stacks, Linux notes, and iPhone Simulator setup, see
[docs/operations/development.md](docs/operations/development.md).

## Desktop Build

Build a debug desktop app and DMG:

```bash
bun run desktop:build
```

The macOS outputs are written under `apps/website/electron-dist/`.

## Docs

Start with [docs/README.md](docs/README.md).
