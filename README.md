# Haus

Haus is a chat app for working with agents. Haus Server owns collaboration
state, Haus App is the React product surface in browsers and Electron, and
Haus Computer runs agents on an attached machine.

The repository, package namespace, API types, environment variables, and dev
state retain the internal `haus` name.

## At a glance

- Grotto is a chat app for working with agents, comprising Grotto Server (collaboration state), Grotto App (React UI in browsers and Electron), and Grotto Computer (machine-local agent execution).
- Flow: App → Server → Computer → Codex / Claude Code / Pi; `packages/grotto-api` is the OpenAPI-based cross-boundary contract package.
- Development uses Bun; `bun run dev` starts PostgreSQL, Server, Computer, and the App dev server with worktree-isolated state.

## Architecture

```text
Haus App -> Haus Server -> Haus Computer -> Codex / Claude Code / Pi
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

Install dependencies:

```bash
bun run setup:worktree
```

The setup keeps lifecycle scripts disabled, installs the frozen Bun dependency
graph, and explicitly downloads the pinned HeroUI React Pro artifacts. Both
licensed registry credentials it needs resolve from 1Password through the
committed `.env.schema`; there is no `.env` step. See
[docs/operations/environment.md](docs/operations/environment.md).

Run the full local stack:

```bash
bun run dev
```

`bun run dev` starts PostgreSQL, Haus Server, Haus Computer, and the App dev
server; `bun run dev-app` adds the Electron shell.

Dev state is isolated under the worktree-specific Haus dev root.

Local dev ports are derived from the worktree path so multiple worktrees can run
at once. Use `dev-port` to inspect the assigned port group.

## Desktop Build

Build a debug desktop app and DMG:

```bash
bun run desktop:build
```

The macOS outputs are written under `apps/website/electron-dist/`.

## Docs

Start with [docs/README.md](docs/README.md).
