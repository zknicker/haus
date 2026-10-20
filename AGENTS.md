# AGENTS.md

Always-on Haus guidance for AI coding assistants.

## Start Here

- Work in this repository or worktree. Do not jump to sibling checkouts unless asked.
- Run `bun run docs:list` at task start. Read docs whose `Read when` hints match the work.
- Prefer the docs and source over memory. If docs and code disagree, inspect source and update the
  stale doc as part of the change.
- Keep changes small and reviewable. Preserve user and parallel-agent work.

## Architecture Map

Haus has three first-party product surfaces. Haus is the product; execution runtimes are
Computer-local implementation choices.

| Layer | Owns |
| --- | --- |
| Haus Server | Canonical collaboration state, identity, authorization, chats, messages, tasks, reminders, connections, and Computer coordination. |
| Haus App | The React product surface, Electron shell, local presentation, app cache, settings, optimistic UI, and tRPC client behavior. |
| Haus Computer | Machine attachment state, Agent workspaces, delivery queues, execution-runtime discovery, and Agent execution. |
| Haus API | Stable first-party contracts shared by Server, App, Computer, and the Agent CLI. |

Use product nouns directly:

- A `chat` is the durable conversation container.
- A `session` is one agent's single ongoing global execution context spanning
  every chat it participates in (specs/sessions.md).
- A `turn` is one execution inside a session.
- Haus chat history is canonical Haus Server state.
- Agent execution traces are execution evidence, not the product timeline.

## Docs Routing

- `docs/README.md` is the human docs front door.
- `docs/features/` describes user-facing capabilities.
- `docs/api/` describes first-party API contracts.
- `docs/internals/` describes architecture, ownership, App/Server/Computer boundaries, frontend structure,
  and data model.
- `docs/operations/` describes development, testing, releases, and deployment.
- `specs/` holds deeper product contracts and normative design.

Do not maintain a hand-written doc index here. Add or update `summary` and `read_when` frontmatter
so `docs:list` routes future agents correctly.

## Coding Rules

1. Keep TypeScript strictness enabled.
2. Follow the repo-standard Ultracite and Biome config. Use `bun run lint`.
3. Build types and contracts first before implementation details.
4. Make illegal states unrepresentable with narrow unions and runtime validation.
5. Keep modules focused and composable. Split files when responsibilities diverge.
6. Keep files under `300` LoC, excluding generated files. When a file grows past roughly `200` LoC
   or starts mixing concerns, split before adding more surface area.
7. Keep main exports and the core flow near the top; keep local helpers near the bottom.
8. Avoid unnecessary barrel files. Use them only for clear package or domain entrypoints.
9. Prefer immutable patterns and explicit validation at boundaries.
10. Handle edge cases and external failures explicitly; do not swallow errors.
11. Use Haus in product prose. Preserve literal internal `haus` identifiers such as package
    names, env vars, API fields, paths, and wire names until an explicit contract migration renames
    them. Frame internal engine abilities as the agent's or assistant's abilities; use
    "agent engine" only on technical surfaces.
12. Use concise product names. Avoid vague names such as `provider`, `manager`, `helper`, or `data`
    when a domain term exists.
13. Use kebab-case file names.
14. Behavior changes include focused tests when fitting. Route final verification through
    [Testing](docs/operations/testing.md#change-routing).

## API And Events

- Server tRPC features live in `apps/server/src/haus-api/<feature>/`.
- Each feature exposes a `router.ts` plus one file per procedure when the feature has multiple
  procedures.
- Keep API procedures thin: validate input, call product logic, and return a narrow result.
- Put business logic under product nouns. Keep external-system code behind adapters.
- Define server-to-client event contracts in `packages/haus-api`, one payload schema per event
  type: Chat and Thread events in `src/chat-events.ts`, Server-level notices in
  `src/realtime-events.ts` (see `specs/realtime-events.md`).
- One focused subscription per event type, such as `chat.onMessageCreated` or `agent.onActivity`;
  never a union stream or generic event bucket.
- Events are live notifications; React Query owns recovery. Each App stream hook owns its tRPC
  subscription and the exact React Query invalidation or cache update.

## Haus App UI

- React structure, behavior, data flow, or state: before editing, use
  `architect-react-features` and read `docs/internals/react.md`. Also use
  `vercel-composition-patterns` when changing component APIs, props, providers, context, shared
  state, or reusable UI. Before verification, apply the relevant skill audits again to the
  completed diff.
- The app is sync-first. Render the best Server data we have while a Computer is offline or
  reconnecting.
- Computer connection state belongs in a focused hook or small UI surface. Avoid full-page
  connection gates except for real setup or onboarding boundaries.
- Keep persistent synced data separate from volatile runtime state. Do not attach high-churn fields
  to shared records when a focused query can expose that activity.
- Keep optimistic chat rows app-local. Do not patch durable chat history to show optimistic rows.
- Keep hooks granular and capability-first under `apps/website/src/hooks/<capability>`.
- Computer-dependent feature gates must use Server-reported Computer state and capabilities. Do
  not gate behavior on app-local process guesses or direct machine probes.
- The UI system is HeroUI v3 (`@heroui/react` + `@heroui-pro/react`). Do not add Base UI, COSS,
  shadcn, or Radix usage. The few components under `components/ui` are product-specific adapters,
  not a general-purpose component kit.
- Use HeroUI components stock. Customize through component props (`variant`, `size`, semantic
  states) and compound parts before adding CSS. Do not restyle HeroUI components at call sites.
  Read a compound component's anatomy before wrapping its parts in your own layout, and never
  cancel its padding or gap with a `className`. Both are enforced: Biome plugins in
  `apps/website/lint/` and `apps/website/src/lib/heroui-composition-contract.test.ts`.
- When a stock dependency misbehaves, first reproduce the failure at the dependency boundary and
  check its upstream issues, releases, and source. Prefer a verified upgrade or a bounded package
  patch with a regression test over reimplementing the dependency in product code. Use a local
  workaround only when neither is currently viable, and document its removal condition.
- After changing a browser-runtime dependency, restart the worktree dev stack so Vite rebuilds its
  optimized dependencies before browser verification.
- `DESIGN.md` and `apps/website/src/styles/default-theme.css` started as exports from the
  [saved Haus design system](https://heroui.pro/ds/9e70cb0a-050a-4aca-8cc4-4d38eafb56ad)
  in HeroUI Pro and are now owned in code. The saved design system is stale; the repo is the
  source of truth. Edit both directly and keep them consistent.
- `default-theme.css` is the whole design system, in HeroUI's own theme shape: tokens in
  `:root`, then one `@layer components` block for BEM overrides. A customization climbs that
  order and never skips up: a **token**, then a **BEM override** in the theme layer, then a
  **structural component** that gives the rule a class to hang on, and only then a
  **call-site class** for a genuine one-off. `DESIGN.md` → "Where a customization goes"
  carries the ladder with its reasons. Do not add new per-region `--spacing` or `--radius`
  scopes, and do not scatter override rules into feature CSS. Product CSS may own layout or
  behavior HeroUI cannot express, but must not recreate component appearance.
- HeroUI pairs each component's **box** with a matching **radius step**. If you force a box —
  an exact-pixel avatar, an icon container — derive the radius too (`identityMarkRadius` in
  `components/ui/entity-avatar.tsx`), or the corner stays fixed while the box moves and the
  shape drifts. This has been the root cause of every radius bug in this codebase so far.
  `DESIGN.md` carries the tier table; match a component's tier rather than eyeballing a step
  that looks right at today's `--radius`.
- Focus: a tab stop is earned by interaction, never by structure. Only native interactive
  elements, ARIA widget roles, and React Aria's composite roots carry `tabIndex >= 0`; scroll
  regions, landmarks and layout wrappers carry none. When a dependency puts a `tabIndex` on
  structural chrome, strip it at our adapter boundary (`components/chats/message-scroller.tsx`,
  `hooks/shell/use-unfocusable-app-main.ts`), never at call sites. Style focus, never suppress it
  — an invisible tab stop is worse than a mismatched ring, and the `:focus-visible` fallback in
  `styles/global.css` already paints anything unstyled with `--focus`. Rings are keyboard-only:
  use `:focus-visible`, never bare `:focus`.
- Use the HeroUI design tokens (`bg-surface`, `text-muted`, `text-accent`, etc.) for UI colors. Do
  not hand-roll component-local color mixes or arbitrary color values unless a new reusable token
  is first added to the theme layer.
- Follow `DESIGN.md` for generated tokens, component guidance, and visual rules. Consult the
  `heroui-react-pro` and `heroui-pro-design-taste` skills
  plus the HeroUI Pro MCP (`list_components` → `get_component_docs`) before building UI —
  and before reshaping it. A mismatch you are about to solve with CSS is often a component
  you have not looked for yet; check the catalog before concluding one does not exist.
- For motion polish, use Fluid Functionalism's motion guidance and ThinkingIndicator reference:
  https://www.fluidfunctionalism.com/docs/motion and
  https://www.fluidfunctionalism.com/docs/thinking-indicator.

## Server, Computer, And Data

- Server owns canonical collaboration records. Computer owns machine-local Agent workspaces,
  queues, execution state, and execution-runtime access. App storage is cache, settings, and local
  presentation state.
- Preserve participant source labels as observed labels. Do not merge participants by display name
  or reintroduce observed-identity linking without a current product spec.
- Message delivery to an Agent flows Server → assigned Computer → Agent session. App and external
  clients must not invent Computer, session, or execution-runtime routing ids.
- If a Server or Computer record lacks a required stable id, timestamp, file, or actor, fail the
  mapping or mark the capability degraded instead of inventing a value.
- Treat `apps/server/src/postgres/bootstrap.ts` as fresh-schema setup only. Schema changes use the
  checked-in PostgreSQL migrations.

## Testing And Smoke

- Verification follows completed behavior and cleanup. Use an in-progress focused check only for
  reproduction, TDD, or a risk checkpoint during long autonomous work. Then use
  [Change Routing](docs/operations/testing.md#change-routing) for the smallest proof, combine lanes
  across boundaries, and report proof or gaps.

## Change Scope And Maintenance

- Prefer the simplest end-to-end change that resolves the requirement.
- Promote code to a top-level domain area when it already represents a product or platform concept;
  do not wait for a second call site when ownership is clear.
- Do not add extension points, abstractions, compatibility branches, or schema-normalization paths
  unless they are needed now.
- For cross-boundary Server, Computer, App, or Agent API changes, update `packages/haus-api`
  directly for the current first-party contract.
- Keep docs current when API shape, storage models, frontend structure, or runtime assumptions
  change.
- Keep startup status logging intact in the server entrypoint when adding features.
- Keep secrets out of version control. The committed `.env.schema` is the
  environment contract and 1Password holds every value; update the schema when
  environment variables change, and never add a `.env` file. See
  [docs/operations/environment.md](docs/operations/environment.md).
- If requirements are unclear, update the relevant spec and ask.

## Agent Execution Work

- For AI bugs or performance problems anywhere in this repo, start with
  `.agents/skills/debug-haus-ai/SKILL.md`, even when the report is a recording or says only
  "debug this" or "fix these bugs." Do not wait for the user to name Axiom or Raft. The skill
  routes existing telemetry and creates a Luna-max Raft partner when useful. Pure visual or
  layout bugs follow the App UI workflow instead.

- Haus Computer owns runtime discovery, model inventory, instruction composition, tools, and the
  chat-to-Agent turn runner under `apps/computer/src/`.
- Codex, Claude Code, and Pi are execution runtimes inside Computer. Do not use “Haus Runtime” as
  a product, service, release, compatibility, or ownership term.
- After a coherent execution change, select deterministic and live verification from
  [Change Routing](docs/operations/testing.md#change-routing).

## Agent System Prompt Changes

The composed agent system prompt is a guarded contract. Its sources live under
`apps/computer/src/harness/`, with focused coverage in `instructions.test.ts` and
`managed-instructions.test.ts`.

Every sentence here changes the behavior of every Agent, so the prompt must stay deliberate,
reviewed, and bounded. `managed-instructions.test.ts` asserts a size cap (currently 39,230
characters). The cap is a ratchet that forces a deliberate decision, not a hard limit, and no
adapter enforces a prompt length. A justified addition raises the cap to the measured render in
the same change, with a one-line reason in the register. Never delete, trim, merge, or
deduplicate other prompt text just to make room: that silently changes other behavior. Shrinking
the prompt is its own intentional change with its own justification, and lowers the cap. Prefer
moving guidance out of the prompt over adding to it — the prompt is a pointer to the
[Haus Manual](docs/adr/0021-cove-onboards-and-agents-share-a-manual.md) for mechanics, and a
change should move things around and simplify rather than expand. Following Raft's own rule,
standing principles stay in the prompt; event formats, delivery mechanics, and event-specific
actions ride the event input (for example the inbox notice in `apps/computer/src/inbox-format.ts`).

Haus tracks the **current** Raft release from source. The
[divergence register](specs/raft-alignment/prompt-divergences.md) pins the Raft source commit;
re-pin by updating that commit and re-diffing every row. Two kinds of text share the cap:

- **Raft-verbatim text is the fixed part.** It is text present in the current Raft prompt at the
  pinned source commit, and it is never trimmed, paraphrased, or reordered to make room. Adopting
  or restoring a current Raft clause raises the cap by exactly that amount, with the register row
  and a one-line commit rationale. When Raft deletes a clause, the Haus copy becomes Haus-only and
  must justify itself like any other Haus-only text.
- **Haus-only text is the variable part.** Each Haus-only addition justifies itself with a
  register row and raises the cap; mechanics belong in Manual topics, skills, or event input, per
  [ADR 0012](docs/adr/0012-design-guidance-is-skill-carried.md), rather than the prompt.

When changing prompt text or that contract test:

1. Run the focused Computer harness tests and inspect the rendered prompt change.
2. Never delete or weaken a requirement merely to make tests pass. Name intentional capability
   removals explicitly to the operator.
3. Add or update executable coverage with every prompt-taught capability change.
4. Update the [divergence register](specs/raft-alignment/prompt-divergences.md) with a new,
   changed, or removed row, and run `bun run test:prompt-contract`. The register's
   "TODO — no owner" rows are the current debt.

For any Agent behavior change (prompt, Manual, CLI receipts, inbox text) and its baseline eval and
report, use `.agents/skills/tune-agent-behavior/SKILL.md`.

## Agent skills

### Issue tracker

Issues live in the Linear `PRD` team with the `Haus` label. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary in Linear. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: use root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Release operations

For release target decisions, `releases.json` preparation, the single release PR, post-merge
target-job monitoring, or the operator handoff, use `.agents/skills/release-haus/SKILL.md`.
Route durable artifact and target contracts through `docs/operations/releases.md`; merging a release PR that
publishes a Server target deploys production automatically through the Release workflow's
`production` Environment. Manual deploy and activate runs are for recovery only; see
`docs/operations/haus-server-deploy.md`.

## Cloud agents

Haus follows the fleet cloud agent contract. Set up or repair it with the `zknicker/agents`
`cloud-agent-setup` skill. `.agents/cloud/bootstrap.sh` is a byte copy of the fleet script. Never
edit it here. The fleet loads separately. Claude loads it from the environment Setup script. Cursor
loads it from `bootstrap.sh cursor-install` and refreshes it from `bootstrap.sh cursor`.

- `install.sh` provisions Bun at the root `packageManager` pin, PostgreSQL 16, versitygw `1.9.0`,
  the pinned Codex CLI, and `agent-browser`, then runs `bun run setup:worktree` (frozen install and
  the HeroUI Pro artifacts). Rerunning it is safe.
- `start.sh` signs Codex in for the dev seed. `env.sh` exports `HAUS_POSTGRES_BIN`.
- Cursor (`.cursor/environment.json`) installs with `bootstrap.sh cursor-install`, starts with
  `bootstrap.sh cursor`, and opens the `dev-stack` terminal
  (`. .agents/cloud/env.sh && bun run dev`).
- Claude (`.claude/settings.json`) runs `bun run setup:worktree` on a local SessionStart, and runs
  `bootstrap.sh claude` only when `CLAUDE_CODE_REMOTE` is true. Those hooks are separate entries.
  The dev stack is not auto-started.
- Verify with `bun run dev`. The Services banner prints the Website, Server, and Computer URLs.
  Ports come from the worktree. Server is the website port plus three. Read the banner instead of
  assuming `3100` or `8090`. `bun run check:fast` is the fast quality check. See
  [Linux And Cloud Sessions](docs/operations/development.md#linux-and-cloud-sessions).
- No per-repository cloud secrets. Each platform provides `CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN`.
  Values resolve from 1Password through `.env.schema`. `setup:worktree` fetches the two licensed
  install credentials itself. See [docs/operations/environment.md](docs/operations/environment.md).
- Product skills stay in the committed `.agents/skills`. Fleet skill links under `.agents/` stay
  untracked.
- PostgreSQL 16 lives at `/usr/lib/postgresql/16/bin`, symlinked onto `/usr/local/bin`.
  `scripts/dev-postgres.mjs` only auto-discovers Homebrew paths on Linux, so a non-standard install
  needs `HAUS_POSTGRES_BIN`. Do not start a system PostgreSQL service. Each lane owns a throwaway
  cluster. On root hosts, `scripts/postgres-server-account.mjs` runs the server as `postgres`.
- The web app auto signs in (`VITE_DEV_CLERK_AUTO_SIGN_IN=true`). The first Server boot seeds the
  demo Server (Blippy, Tiny, `#all`, `#product`). No manual login.
- One Claude cloud environment serves every fleet repo. Its Setup script is `zknicker/agents`
  `cloud/setup-script.sh`.
