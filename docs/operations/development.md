---
summary: Local development workflow for Server, Computer, app startup, and verification.
read_when:
  - running Haus locally or changing the managed development stack
  - changing local stack startup, ports, or developer verification
  - running or verifying the iPhone app in Simulator against a local Server
---

# Development

## Worktree Setup

Use Bun `1.4.2`, matching the package manifests. The cloud install reads the root
`packageManager` pin, and the CI and release jobs pin the same version. Server
and Computer binaries embed the Bun version used to compile them. Changing the
host's Bun executable does not upgrade an already published artifact.

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

The paired `react-aria-components` and `react-stately` patches keep a HoverCard
open when a nested tooltip appears; [Dependency Patches](dependency-patches.md)
owns their removal condition and proof. Restart Vite after touching them so it
rebuilds optimized dependencies.

## Runtime Harness Upgrades

The `@ai-sdk/harness*` packages version in lockstep: every adapter pins one
exact `@ai-sdk/harness`, and `harness-grok-build` pins one exact
`harness-acp`, which Computer also depends on directly to run Codex. Bump the whole set to versions that agree, and prefer the newest
set whose exact dependencies agree. The AI SDK packages, including the core
`ai`, `@ai-sdk/gateway`, and `@ai-sdk/provider` transitive pins, are excluded from the three-day
`minimumReleaseAge` hold in `bunfig.toml` so current stable releases can install.

Every adapter is patched locally, as is `@ai-sdk/harness` itself, and each
`patchedDependencies` key carries an exact version, so an upgrade regenerates every adapter patch with `bun patch`
rather than renaming the files. [Dependency Patches](dependency-patches.md) lists
each patch with its proof and removal condition; check that table before
regenerating, because its guard test fails on every renamed key.

Each adapter also ships a bridge manifest pinning the vendor CLI it installs,
and those pins trail the models Haus offers. Computer therefore owns the
Claude Code bridge manifest and lockfile in
`apps/computer/assets/harness-bridges/claude-code/`, taking only the bridge code
from the package. It pins Claude Code `2.1.284` and Agent SDK `0.3.284` to support
Opus 5.5 and Sonnet 5.5; the current adapter still bundles CLI `2.1.281`, which
predates Sonnet 5.5. Codex has no adapter-owned pin: `harness-bridges/codex/` is the
implementation Computer installs behind `harness-acp` — an exact
`@agentclientprotocol/codex-acp` plus a pnpm override pinning the `@openai/codex`
CLI it drives (currently `0.159.0`, verified with `gpt-6.1-sol`), and `codex-acp.patch`, a pnpm patch
that sends per-request token usage (see [Usage](../features/usage.md)). Rebuild the patch
with `pnpm patch` / `pnpm patch-commit --patches-dir .` when bumping codex-acp. Regenerate a
lockfile with
`corepack pnpm@10.32.1 install --ignore-workspace --lockfile-only` beside the
edited manifest. Drop an override once the published bridge pins that vendor at
or above the floor Haus needs; the bootstrap recipe is content-fingerprinted,
so changing a pin re-runs every Agent's bridge install on its own.

Harness-generated bootstraps and run state live under each Agent home's
`.ai-sdk-harness/` directory. The local sandbox always sets `HOME` to that Agent
home, including during bootstrap refresh; it must never inherit the operator's
home for these files. An upgrade from the older workspace layout installs the
current bridge recipe in the new location.

Adding a model is one entry in `apps/computer/src/inventory.ts`. Nothing
validates a model id against the vendor, so prove a new one end to end before
shipping it: start the visuals lab (`bun run visuals:lab`) and run the new
model on one question. It drives the same harness bridge the Computer executor
does, so a model id the bridge rejects fails there rather than in front of a
user. That is a real model turn and costs money — see [Testing](testing.md),
"Visuals Lab".

For a focused Claude model and conversation-continuity smoke without a visual,
run `HAUS_RUN_LIVE_CLAUDE_MODELS_TEST=1 bun test apps/computer/src/harness/claude-models-live.test.ts`.
It uses the host's Claude sign-in and runs real turns on Opus 5.5 and Sonnet 5.5. It also proves
MCP servers in the Agent's own Claude Code config never start.

Codex model smoke uses the existing opt-in bridge suite:
`HAUS_RUN_LIVE_CODEX_TEST=1 HAUS_LIVE_CODEX_MODEL=gpt-6.1-sol bun test apps/computer/src/harness/codex-live.test.ts`.
It uses the host's Codex sign-in and checks steering, tools, token usage, and
conversation resume. Without a model override, the suite uses GPT-5.6 Luna.

## Local Stack

Run the managed development stack:

```bash
bun run dev
```

This starts an isolated PostgreSQL cluster, a local Files storage gateway, Haus Server,
Haus Computer, and the website dev server. `bun run dev-app` runs the same
stack inside the Electron desktop shell. Install the PostgreSQL 16 and versitygw binaries once:

```bash
brew install postgresql@16 versitygw
```

Files bytes go to a per-worktree [versitygw](https://github.com/versity/versitygw) S3 gateway
instead of R2, so uploads, thumbnails, and `haus files` work in every worktree with no cloud
credential. The stack starts it on a private loopback port over
`~/.haus/dev/<worktree-id>/object-storage`, creates the `haus-artifacts-development` bucket
directory, and points Server at it with the fixed development key pair from `.env.schema`. The
ready banner shows it as **Files**; it stops with the stack. To exercise a real bucket instead, set
`HAUS_ARTIFACT_R2_ENDPOINT` and its credentials before `bun run dev`, and the stack skips the
gateway.

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
both Agent DMs (Tiny's DM ends on its unanswered stale-copy question; Blippy's DM line already has
your reply), and Cove @mentioning you with its rename question in `#onboarding-owner`. It also
seeds one claim Blippy left stalled (shown
on the Tasks page under **Stopped before finishing**), one
settled Cloud Agent work, and seven days of Agent turns. That activity is idempotent and separate,
in `apps/server/src/development/seed-inbox-activity.ts`.

Another idempotent seed (`seed-artifact-message.ts`) gives fresh and existing demo workspaces a
Blippy message in `#product` that shares two workspace files: a `haus://workspace` link to
`notes/tab-strip-polish.md` and a page card for `workbench/tab-strip-states.html`. It writes
both files into Blippy's workspace under `HAUS_COMPUTER_DATA_ROOT` when they are missing, so the
card, the link, and desktop workspace tabs have real files to open.

A separate idempotent seed adds **#ui-gallery** to fresh and existing demo workspaces. Its
anchor messages cover human @mentions in Channels and Threads, all task statuses,
hidden claims, claims with replies, all cloud-work statuses, cancelling/stale work, follow-ups
waiting or running behind a finished Run and waiting behind a failed one, ordinary
threads, and a task thread containing multiple cloud runs and an inline human @mention. Toggle **Show tasks
in chat** to compare hidden claims. Cloud branch and diff evidence is synthetic; its pull request link points at a nonexistent
`demo/ui-gallery` repository. The gallery's queued/running work appears in Inbox too.

Gallery runs belong to a dedicated **UI gallery (unattached samples)** Computer whose randomly
created credential is discarded. The attached development Computer never receives these runs for
reconciliation, and the seed creates no deliveries or external jobs. Running timestamps age
naturally into stale states; these are static examples, not a simulated provider. The bootstrap
always resolves the real Computer through onboarding, so adding the gallery cannot replace its
attachment. Restarting and opening the dev workspace adds missing gallery data without resetting
existing messages; subsequent bootstraps leave it alone.

An idempotent seed (`seed-automation-causes.ts`) adds **#automations**: Blippy and Tiny answers
to Reminder and Trigger fires, recorded through the Server's own cause path, so every cause-line
state has real records — a live Reminder with a short title and a description, a Reminder answer that is also an
inline reply (only its cause line shows), a Trigger answer, an archived Reminder (no Automations link), and a plain reply.
The weekly Reminder's next fire is a week out and the Trigger's secret is discarded, so nothing
there wakes an Agent on its own.

Computer
then runs their real Agent turns using the host's Codex, Claude Code, Grok Build, or Pi
sign-in.

When `HAUS_OPENAI_API_KEY` or `HAUS_GEMINI_API_KEY` resolves in the dev stack, bootstrap stores it as
the demo Server's image generation key for that provider (`seed-image-generation-keys.ts`), only
if none is set yet, so a key set in Settings is never overwritten.

Seeding runs once per Server. To pick up changes to
`apps/server/src/development/seed-server.ts`, delete the demo Server row
(its Threads and messages first, since both reference it) and reload the App.

The dev stack uses worktree-isolated development state by default:

```txt
~/.haus/dev/<worktree-id>/computer
~/.haus/dev/<worktree-id>/object-storage
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

## Linux And Cloud Sessions

`bun run dev` runs the whole stack on Linux, including Agent turns. Haus
Computer keeps its macOS-only pieces behind platform seams:

- Agent workspaces are plain directories, not capped sparsebundles (see
  [Workspace](../../specs/workspace.md#capacity)); workspace maintenance
  commands stay macOS-only.
- Computer Secrets stores its 1Password token in the macOS Keychain, so
  connecting a vault fails on Linux. Turns without Secrets are unaffected.
- Browser discovers Chrome or Chromium binaries; the browser must still be
  started externally (see [Browser](../internals/browser.md)).
- Files storage needs `versitygw` on `PATH` (or `HAUS_VERSITYGW_BIN`). The cloud install
  installs the pinned release `.deb` from GitHub releases (network access to `github.com` and its
  release-asset host); elsewhere install a release package by hand.

Turns need a signed-in runtime CLI on the host, exactly as on a Mac. The dev
seed puts Cove, Blippy, and Tiny on Codex. Cloud sessions handle this
automatically: `.agents/cloud/install.sh` installs the Codex CLI pinned in
`harness-bridges/codex/`, and `.agents/cloud/start.sh` signs it in each session
with the Development OpenAI key. Elsewhere on Linux, do the same by hand:

```bash
npm install -g @openai/codex@0.159.0
varlock printenv HAUS_OPENAI_API_KEY | codex login --with-api-key
```

Restart the stack after signing in so Computer reports the runtime. A Cove whose
setup already failed recovers on its own once the inventory includes Codex. The
cloud install also exposes Playwright's Chromium as `chromium` and installs
`agent-browser`, so a headless Chromium started with a dedicated
`--user-data-dir` and `--remote-debugging-port=0` can be connected for the
Browser tool.

`bun run ui:capture -- <path-or-url>` screenshots the running website headlessly,
resolving a bare path against this checkout's website port. `--video <dir>`
records a WebM, `--send <text>` types a message into the composer first, and
`--wait <ms>` holds before the screenshot, which is long enough to capture an
Agent's reply when set to a minute or two. It uses Playwright's Chromium, or
the preinstalled `$PLAYWRIGHT_BROWSERS_PATH/chromium` in cloud sessions.

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
app. Add `SIMCTL_CHILD_HAUS_DEV_APP_ORIGIN="http://localhost:$(dev-port)"` (the
website origin) when absolute shared-artifact links should chip; root-relative
ones chip without it. Haus Server listens on the fourth port of the worktree's group, which is
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

After Settings → Sign Out, a Debug build stays signed out across relaunches and
shows "Sign in to local Server"; tapping it clears the flag and resumes auto
sign-in.

## Claude Code Previews

`.claude/launch.json` tells Claude Code's browser preview which port to attach
to. It is gitignored, not committed, because the port is per-checkout. A
`SessionStart` hook in `.claude/settings.json` runs
`scripts/generate-claude-launch.mjs`, which writes the file from the same
`resolveDevPorts` group the dev stack uses — so the preview always points at the
website port that `bun run dev` actually binds. Nothing to do by
hand; the file regenerates each session.

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
The stack forwards that signal to every directly managed child process except PostgreSQL
immediately, then waits for each process group to exit in order (desktop, website, Computer,
Server) before returning control to the shell. PostgreSQL gets its fast-shutdown `SIGINT` last,
after the Server and Computer exit, so their teardown can still write; a second `Ctrl+C` signals
everything at once.

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
