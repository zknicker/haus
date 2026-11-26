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

### Prerequisites

- Bun `1.4.4` (root `packageManager` pin)
- PostgreSQL 16 and [versitygw](https://github.com/versity/versitygw) on `PATH`
- Access to the Development 1Password vault (credentials resolve through
  `.env.schema`; there is no `.env` file)

On macOS, install the binaries once:

```bash
brew install postgresql@16 versitygw
```

Do not start a Homebrew PostgreSQL service. The stack starts its own cluster.
Linux and cloud sessions: see
[Linux And Cloud Sessions](docs/operations/development.md#linux-and-cloud-sessions).
Secrets: [Environment](docs/operations/environment.md).

### 1. Install dependencies

```bash
bun run setup:worktree
```

Installs the frozen Bun dependency graph (lifecycle scripts disabled) and
downloads the pinned HeroUI React Pro artifacts.

### 2. Start the local stack

```bash
bun run dev
```

Starts PostgreSQL, a local Files storage gateway, Haus Server, Haus Computer,
and the App dev server. When the Services banner prints Website, Server, and
Computer URLs, the stack is ready. Ports come from the worktree path, so several
checkouts can run at once. Read the banner instead of assuming `3100` or
`8090`.

- `bun run dev-app` runs the same stack in the Electron shell.
- Dev state lives under `~/.haus/dev/<worktree-id>/`.
- First boot seeds a demo Server (Blippy, Tiny, `#all`, `#product`).

More detail: [Development](docs/operations/development.md).

## Desktop Build

Build a debug desktop app and DMG:

```bash
bun run desktop:build
```

The macOS outputs are written under `apps/website/electron-dist/`.

## Docs

Start with [docs/README.md](docs/README.md).
