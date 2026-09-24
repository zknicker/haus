---
summary: Local development workflow for Server, Computer, app startup, and verification.
read_when:
  - running Haus locally or changing the managed development stack
  - changing local stack startup, ports, or developer verification
  - running or verifying the iPhone app in Simulator against a local Server
---

# Development

## Worktree Setup

Use Bun `1.4.2`, matching the package manifests, cloud bootstrap, and CI/release
jobs. Server and Computer binaries embed the Bun version used to compile them;
changing the host's Bun executable does not upgrade an already published artifact.

Run the checked-in setup command in every fresh checkout or worktree:

```bash
bun run setup:worktree
```

It installs the frozen Bun dependency graph with lifecycle scripts still
disabled, then explicitly runs only the pinned HeroUI React Pro downloader. The
two licensed registry credentials it needs resolve from 1Password through the
committed `.env.schema`, under the install context switch — no `.env` file and
no manual step. See [environment.md](environment.md). Codex worktrees run this
command through their environment setup hook, and Claude Code runs it from the
repository's `SessionStart` hook.
A cold worktree install moves multiple gigabytes, so that hook allows a long
timeout; cutting it short leaves the HeroUI bootstrap package in place without
its downloaded artifacts.

`bun run dev` refuses to start when those artifacts are missing. Vite otherwise
caches a broken `@heroui-pro/react` resolution that outlives a restart, so
rerun `bun run setup:worktree` and start the stack again.

Upgrading `@heroui-pro/react` means bumping its peers in the same install:
`@heroui/react`, `@heroui/styles`, `react-aria-components`, `react-aria`,
`react-stately`, and `@react-aria/interactions` are all declared peers and
`auto = "disable"` never installs them for us. A HeroUI release published
inside the three-day `minimumReleaseAge` window needs its package added to
`minimumReleaseAgeExcludes` in `bunfig.toml`; installing with
`frozenLockfile = false` is a temporary flip that gets restored in the same
change. Rerun `bun run setup:worktree` afterwards.

The paired `react-aria-components@1.21.1` and `react-stately@3.50.0` patches
separate preview cards from tooltips in the open-overlay registry. Without
them, hovering a copy button's tooltip dismisses its enclosing HoverCard.
Cards still share their own exclusivity group, and ordinary tooltips retain
theirs; hover travel, delays, and keyboard behavior remain dependency-owned.
Remove both patches when upstream supports tooltips inside PreviewTrigger
without closing the preview. Verify with
`bun run --filter @haus/website test:app runtime-issue-hover.spec.ts` after
restarting Vite so it rebuilds optimized dependencies.

## Runtime Harness Upgrades

The `@ai-sdk/harness*` packages version in lockstep: every adapter pins one
exact `@ai-sdk/harness`, and `harness-grok-build` pins one exact
`harness-acp`, which Computer also depends on directly to run Codex. Bump the whole set to versions that agree, and prefer the newest
set whose transitive `ai`, `@ai-sdk/provider`, and `@ai-sdk/harness-acp` are
themselves outside the three-day `minimumReleaseAge` window — the adapters are
excluded from that hold in `bunfig.toml`, their transitive dependencies are not.

Every adapter is patched locally, as is `@ai-sdk/harness` itself (its display
text shows a bare workspace mention as `<workspace>` rather than `.`), and each
`patchedDependencies` key carries an exact version, so an upgrade regenerates every adapter patch with `bun patch`
rather than renaming the files. The patch contents are contracts covered by
`apps/computer/src/harness/bridge-bootstrap.test.ts`, which greps the built
bridge text: if a patch silently stops applying, that test fails first.

Each adapter also ships a bridge manifest pinning the vendor CLI it installs,
and those pins trail the models Haus offers. Computer therefore owns the
Claude Code bridge manifest and lockfile in
`apps/computer/assets/harness-bridges/claude-code/`, taking only the bridge code
from the package. Codex has no adapter-owned pin: `harness-bridges/codex/` is the
implementation Computer installs behind `harness-acp` — an exact
`@agentclientprotocol/codex-acp` plus a pnpm override pinning the `@openai/codex`
CLI it drives (`gpt-6-astra` needs 0.153.0 or newer), and `codex-acp.patch`, a pnpm patch
that sends per-request token usage (see [Usage](../features/usage.md)). Rebuild the patch
with `pnpm patch` / `pnpm patch-commit --patches-dir .` when bumping codex-acp. Regenerate a
lockfile with
`corepack pnpm@10.32.1 install --ignore-workspace --lockfile-only` beside the
edited manifest. Drop an override once the published bridge pins that vendor at
or above the floor Haus needs; the bootstrap recipe is content-fingerprinted,
so changing a pin re-runs every Agent's bridge install on its own.

Adding a model is one entry in `apps/computer/src/inventory.ts`. Nothing
validates a model id against the vendor, so prove a new one end to end before
shipping it: start the visuals lab (`bun run visuals:lab`) and run the new
model on one question. It drives the same harness bridge the Computer executor
does, so a model id the bridge rejects fails there rather than in front of a
user. That is a real model turn and costs money — see [Testing](testing.md),
"Visuals Lab".

## Local Stack

Run the managed development stack:

```bash
bun run dev
```

This starts an isolated PostgreSQL cluster, Haus Server,
Haus Computer, and the website dev server. `bun run dev-app` runs the same
stack inside the Electron desktop shell. Install the PostgreSQL 16 binaries once:

```bash
brew install postgresql@16
```

Do not start a Homebrew PostgreSQL service. The dev stack owns its direct child,
chooses a private loopback port, bootstraps a fresh schema, and preserves that
worktree's data across runs. On later boots it applies any new checked-in
PostgreSQL migrations before starting Haus Server, so an existing worktree
database stays current with main. If that migration step fails, the database
predates the checked-in migration baseline: move
`~/.haus/dev/<worktree-id>/postgres` aside and rerun to bootstrap fresh. On first use, Server creates one demo Server with
the Agents Blippy and Tiny, avatars for them and for you, the `#all` and
`#product` Channels, starter messages, a Thread, two tasks, and one MCP
connection — enough to open any surface without hand-building data. It then
seeds the activity the Inbox is a lens over: unread lines in both Channels and
both Agent DMs, two open Asks — Cove's rename question offering three replies
and Tiny's stale-copy question offering none — one claim Blippy left stalled, one
settled Cloud Agent work, and seven days of Agent turns. That activity is idempotent and separate,
in `apps/server/src/development/seed-inbox-activity.ts`.

A separate idempotent seed adds **#ui-gallery** to fresh and existing demo workspaces. Its 26
anchor messages cover open/answered Asks, options and free-text questions, all task statuses,
hidden claims, claims with replies, all cloud-work statuses, cancelling/stale work, ordinary
threads, and a task thread containing multiple cloud runs and inline Asks. Toggle **Show tasks
in chat** to compare hidden claims. Cloud branch and diff evidence is synthetic and has no external
link. The gallery's queued/running work appears in Inbox too.

Gallery runs belong to a dedicated **UI gallery (unattached samples)** Computer whose randomly
created credential is discarded. The attached development Computer never receives these runs for
reconciliation, and the seed creates no deliveries or external jobs. Running timestamps age
naturally into stale states; these are static examples, not a simulated provider. The bootstrap
always resolves the real Computer through onboarding, so adding the gallery cannot replace its
attachment. Restarting and opening the dev workspace adds missing gallery data without resetting
existing messages; subsequent bootstraps leave it alone.

Computer
then runs their real Agent turns using the host's Codex, Claude Code, Grok Build, or Pi
sign-in.

Seeding runs once per Server. To pick up changes to
`apps/server/src/development/seed-server.ts`, delete the demo Server row
(its Threads and messages first, since both reference it) and reload the App.

The dev stack uses worktree-isolated development state by default:

```txt
~/.haus/dev/<worktree-id>/computer
~/.haus/dev/<worktree-id>/postgres
~/.haus/dev/<worktree-id>/server/attachments
```

The stack reserves a stable four-port group from the worktree path. Haus App uses the first port
and Haus Server uses the fourth; the middle ports remain reserved so existing worktrees keep their
URLs. Multiple worktrees can run without sharing local state.

To intentionally share one dev workspace across worktrees, run:

```bash
bun run dev:shared
```

That target defaults `HAUS_DEV_STACK_ID` to `haus-shared`, so every checkout
using it reads and writes `~/.haus/dev/haus-shared/`. When a stack id is set,
the default port group is derived from that stack id instead of the checkout
path, so the shared workspace also has one stable set of local URLs. You can set
`HAUS_DEV_STACK_ID` before `bun run dev:shared` to choose a different shared
workspace name. Run one shared stack per shared workspace at a time.

Set `HAUS_DEV_STACK_ID` to choose the state directory name, or
`HAUS_DEV_PORT_BASE` to choose the first port in the four-port group:

```bash
HAUS_DEV_STACK_ID=agent-a HAUS_DEV_PORT_BASE=43000 bun run dev
```

That example uses ports `43000` through `43003`. Set `HAUS_COMPUTER_DATA_ROOT`
or `HAUS_DATABASE_URL` explicitly when a dev run
should use specific state.

`.claude/launch.json` is gitignored and generated per checkout by a
`SessionStart` hook (`dev-port --claude-launch`), so Claude Code previews use
this checkout's real website port. The `dev-port` helper and the dev stack
derive the same four-port group from the checkout path, or from
`HAUS_DEV_STACK_ID` when it is set.

`bun run dev` and `bun run dev-app` share the same Server, Computer,
PostgreSQL, and web app, so Agent behavior matches across both.

AI SDK bridge packages use the machine-wide
`~/.haus/cache/harness-bridge-store` pnpm cache in development and production.
Bridge installs pin pnpm so Computer prewarming and Agent sandboxes use the same
store format instead of creating parallel versioned stores.
Fresh development Servers prewarm Codex, the runtime used by their seeded Agents;
other available runtimes warm when first selected. Agent homes, sessions, and
workspaces remain isolated inside each dev stack.

The installed Computer keeps service output under its stable data root and
exposes local recovery checks:

```bash
haus-computer status
haus-computer doctor
haus-computer logs 200
```

`status` reads the stopped/running state for each attachment. `doctor` checks private local files
plus Server credential acceptance without printing secrets, and `logs` tails the resident service
log. The Computer page keeps a Server-side system log of observed connections, disconnections, and
state-changing management commands. It remains readable while the Computer is offline and surfaces
a warning only when repeated recent disconnects indicate instability.

For login and setup failures, start with `haus-computer status`. An expired or
abandoned device code is not resumed; rerun `setup /<server-slug>` for a new code.
A saved wrong account or origin requires `haus-computer login --replace`, then
setup again. **Finishing the connection** means browser approval
succeeded but durable local attachment storage has not; leave the page open and
rerun the same setup command if the CLI stopped. Its persisted idempotency key
recovers the issued Computer instead of creating another. `logout` revokes only
the human management session and stops the service; it preserves every Server
attachment and Agent workspace for an explicit later `start`.

## Haus For iPhone In Simulator

The iPhone app signs in automatically against a local Server, the same way the
website does in development. It never needs browser OAuth or hand-entered
credentials.

Start the stack, then build, install, and launch the app with the development
environment:

```bash
bun run dev
```

```bash
cd apps/ios-swift && xcodegen generate --spec project.yml
```

```bash
xcrun simctl boot "iPhone 17 Pro"; xcrun simctl bootstatus "iPhone 17 Pro"
```

```bash
xcodebuild -project apps/ios-swift/Haus.xcodeproj -scheme Haus -destination 'name=iPhone 17 Pro' -derivedDataPath build/ios build
```

```bash
xcrun simctl install booted build/ios/Build/Products/Debug-iphonesimulator/Haus.app
```

```bash
SIMCTL_CHILD_HAUS_DEV_SERVER_ORIGIN="http://localhost:$(($(dev-port) + 3))" SIMCTL_CHILD_HAUS_CLERK_PUBLISHABLE_KEY="$(bunx varlock@1.16.1 printenv VITE_CLERK_PUBLISHABLE_KEY)" xcrun simctl launch booted chat.haus.ios
```

`SIMCTL_CHILD_` prefixes pass an environment variable through to the launched
app. Haus Server listens on the fourth port of the worktree's group, which is
`dev-port` plus three; the development Clerk publishable key is the public
schema literal the App already uses. A Debug build accepts a development origin only on
`localhost`, `127.0.0.1`, or `::1`, requests the localhost-only
`dev.createClerkSignInToken` ticket, activates it through Clerk's native SDK, and
calls `server.developmentBootstrap` before loading the Server list. It caches the
last validated configuration, so a later plain `xcrun simctl launch booted
chat.haus.ios` reuses the same development Server and Clerk instance without
the environment. Release builds carry no development path and always use the
production Server.

Launching without those variables on a fresh install leaves the app on
production sign-in, which needs a real Google account and cannot be automated.

## Claude Code Previews

`.claude/launch.json` tells Claude Code's browser preview which port to attach
to. It is gitignored, not committed, because the port is per-checkout. A
`SessionStart` hook in `.claude/settings.json` runs
`scripts/generate-claude-launch.mjs`, which writes the file from the same
`resolveDevPorts` group the dev stack uses — so the preview always points at the
website port that `bun run dev` actually binds. Nothing to do by
hand; the file regenerates each session.

## Hover Card Preview

The dev-only `/s/:slug/hover-cards` comparison page holds all current rich hover-card
families open side by side using their real content components and surface classes.
Agent details use live Server data; other examples use labeled fixtures. Use it to
compare existing appearance before changing shared hover-card styling.

## Activation Preview

In development builds, `/prototype/activation` renders every activation surface — sign-in, Server
choice and creation, invitations, Computer login, and Cove onboarding — as
independently addressable scenes for design iteration. Each scene mounts the
real component; a fixture tRPC client
(`apps/website/src/features/activation-preview/`) answers its Haus API calls,
so no hosted Server, Computer, or signed-in session is needed. The URL selects
the scene (shareable per step) and a floating picker switches between them.
Production builds do not register this route or bundle its fixture Server.
Mutations resolve against fixtures: approving the Computer login code plays the
pending → approved → connected arc live; everything else fails with a clear
preview message after showing its pending state.

## Shutdown

From the terminal, stop the dev stack with `Ctrl+C` or `kill -TERM <dev-stack-pid>`.
The stack forwards that signal to every directly managed child process immediately, then waits
for each process group to exit before returning control to the shell.

In desktop mode, quitting the app with `Cmd+Q` also lets the stack unwind. The
desktop process exits first, then the stack signals the remaining website,
local backend, Server, Computer, and PostgreSQL processes.

## Verification

Use [Testing](testing.md) for test lanes and e2e rules.

### Repeating the opening and waiting experience

Create a fresh Server from Settings → Servers and leave it without a Computer. Reload its
`/s/<slug>` URL to exercise real authentication and Server loading into setup. This does not
change the seeded `/dev` Server or its attached Computer.

The dev-only activation preview also includes `/prototype/activation/sign-in-loading`,
`/prototype/activation/onboarding/preview-connect-computer`,
`/prototype/activation/onboarding/preview-member`, and
`/prototype/activation/onboarding/preview-admin`. These render the actual components with fixture
responses for quick visual checks; they do not prove authentication or real Server transitions.
Use the focused `onboarding-entry.spec.ts` browser test for those Server transitions.
