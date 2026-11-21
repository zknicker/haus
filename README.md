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

```bash
bun run setup:worktree
```

Installs the frozen dependency graph and the pinned HeroUI Pro artifacts.
Licensed registry credentials resolve from 1Password through `.env.schema`;
there is no `.env` step. See
[docs/operations/environment.md](docs/operations/environment.md).

```bash
bun run dev
```

Starts PostgreSQL, Files storage, Haus Server, Haus Computer, and the App.
The Services banner prints the Website, Server, and Computer URLs. Local apps
auto sign in, and the first boot seeds a demo Server. Use `bun run dev-app`
for the Electron shell.

Dev state lives under `~/.haus/dev/<worktree-id>/`, with ports derived from the
worktree path so checkouts can run side by side. Prerequisites and more detail:
[docs/operations/development.md](docs/operations/development.md).

## Desktop Build

Build a debug desktop app and DMG:

```bash
bun run desktop:build
```

The macOS outputs are written under `apps/website/electron-dist/`.

## Docs

Start with [docs/README.md](docs/README.md).
