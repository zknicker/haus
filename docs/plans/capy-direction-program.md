---
summary: Implementation plan for the Capy-direction program (ADRs 0054 to 0057). Phases, PRs in order, the invariants every PR keeps, how each phase is run and verified, and the gates between phases.
read_when:
  - starting or running any phase of the Drive, Agents-on-the-Server, Projects, Workers, or computer-use work
  - writing a phase brief, a PR description, or a fidelity review for that work
  - checking which ADR decision or invariant a change must satisfy
---

# Capy-direction program plan

This program turns ADRs 0054 to 0057 into shipped Haus. People get a Drive they can read and fix,
Agents that live on the Server and survive their machines, Projects as the home of every effort,
and Workers that do parallel work on any Computer. The rule the program enforces is that every
PR implements named ADR decisions and keeps the invariants below. The PRs run in this order.
P0 lands the decisions. D1 to D5 build Drive. R1 to R5 move Agents to the Server. J1 to J4 build
Projects. W1 to W4 build Workers. C1 and C2 add computer use and the token panel.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a
sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a
screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `~/.claude/skills/make-it-so/playbooks/orchestrate.md`, one coordinator session
per phase. Zach merges every PR. Each phase ends at a phase gate that Zach clears before the next
phase starts.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on the operator's explicit go.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:docs/adr/0054-drive-holds-what-agents-know-and-follow.md`, and ADRs `0055`, `0056`, `0057`, `0053`, and `0059` the same way.
  - [ ] `git show origin/main:docs/proposals/capy-product-model.md`.
  - [ ] `git show origin/main:AGENTS.md` and `git show origin/main:docs/operations/testing.md`.
  - [ ] `~/.claude/skills/make-it-so/SKILL.md` and `playbooks/orchestrate.md`.
  - [ ] `~/.claude/skills/make-it-so/playbooks/opening-a-pr.md`.
- [ ] On the operator's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Keep the invariants in every PR

Each phase brief copies this list. Each PR description names the ADR decisions it implements and
says how it keeps each invariant it touches. The fidelity review checks the diff against the ADRs
and this list only.

- [ ] The inbox is the only way to wake an Agent. Worker reports, `drive_conflict`, mentions, assignments, and pull request changes are inbox items with a delivery test each.
- [ ] Events notify and React Query owns state. One focused subscription per event type, never a union stream.
- [ ] The Server is canonical. No layer invents an id, a timestamp, an actor, or a routing target.
- [ ] The runner never holds database credentials or Server secrets. It reaches Haus only through its scoped API.
- [ ] Machines run tools. No model call for an Agent happens on a Computer.
- [ ] Every tool invocation has an id, is recorded as accepted before it runs, and never reruns after an unknown outcome.
- [ ] Each phase migrates every caller and deletes the retired path in the same wave. No lasting mixed state.
- [ ] The prompt contract holds. Prompt text changes go through the cap, the divergence register, `bun run test:prompt-contract`, and `.agents/skills/tune-agent-behavior/SKILL.md`. Event wording rides the inbox item, not the prompt.
- [ ] Lint is Ultracite on Oxlint and Oxfmt with the landmines preset. `landmines-style/no-comments` stays an error. No test doubles, sleeps, retries, or explicit return types.
- [ ] Architecture boundaries are Oxlint rules in the repo's plugin, each with valid and invalid tests, never prose alone.
- [ ] HeroUI v3 stock components and theme tokens for every UI change, per AGENTS.md.
- [ ] Files stay under 300 lines and use kebab-case names.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle the execution playbook names. Each owner loads `make-it-so` and the phase brief.
- [ ] Follow this dependency graph.
  - [ ] P0 first.
  - [ ] D1, then D2, then D3 and D4 in parallel, then D5. D5 may start after D2.
  - [ ] R1 after D4 merges. Then R2 and R3 in parallel. R5 after R2 and R3. R4 after R5.
  - [ ] J1 after R4 merges. Then J2. Then J3 and J4 in parallel.
  - [ ] W1 after J2 merges. Then W2. Then W3 and W4 in parallel.
  - [ ] C1 and C2 after W3 merges. Both are independent.
  - [ ] E1 first among the Cove removals. E2 next; its last commit deletes J3's `COVE_HOME_FIXED` after PR 327 merges. E3 and E5 after E2. E4 after E2 and the Capy shell (PR 324). The E slices run before R4, while Agents still run on Computers.
- [ ] Hold the file boundaries. Server PRs touch `apps/server/**` and `packages/haus-api/**`. Computer PRs touch `apps/computer/**`. App PRs touch `apps/website/**` and `apps/ios-swift/**`. Spec PRs touch `specs/**` and `docs/**` only. A PR that must cross a boundary says so in its brief.
- [ ] Hold the review gate. D5, J4, W4, C2, E2, and E4 change an interaction. They wait for the operator's review in chat with screenshots and a video before merge.

### PR mechanics, for every PR

- [ ] Use `gh` for every PR operation.
- [ ] Open the PR ready, never draft, per **Opening a PR**, with `gh pr create --base main`.
- [ ] Run `bun run lint` and the owning typecheck once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit and `/no-comments` before review.
- [ ] Triage every Bugbot and security-reviewer comment per `~/.claude/skills/make-it-so/references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, or on a CI failure that comes from a change on trunk.

### Verdict and merge, for every PR

- [ ] At the code-ready head SHA, run the gates from `docs/operations/testing.md#change-routing` for every row the PR matches.
- [ ] Run two audit lanes that read the diff and distrust the PR body. One is the fidelity review against the ADRs and the invariants. One is `codex exec -m gpt-6.1-sol` read-only on the diff.
- [ ] Clean only when every gate and lane passes. Findings go back to the owner. A new head gets fresh gates and a fresh verdict.
- [ ] Zach squash-merges after the clean verdict.

### Boot recipe, for every live lane

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>` in a fresh worktree.
- [ ] Start the stack with `bun run dev` and read the Services banner for the ports.
- [ ] Drive the desktop App through the Browser pane or `control-ui`, and the iPhone app through a dedicated Simulator device.
- [ ] Save every screenshot under `/tmp/haus-<pr-id>/` and return the paths with the report.

### Clear each phase gate

- [ ] Every PR in the phase is merged with its evidence.
- [ ] One full-suite run at the phase head, per `docs/operations/testing.md`.
- [ ] Real-app proof in Electron and on iOS of the phase's walkthrough from the proposal.
- [ ] A fidelity review of the whole phase diff against the ADRs and the invariants.
- [ ] Every ADR or spec that the phase taught us was wrong is amended in the phase.

## Land the decisions (P0)

**Depends on.** None.

**Files.**

- [ ] Create `docs/adr/0054` to `0057`, `docs/proposals/capy-product-model.md`, and this plan.
- [ ] Edit `docs/adr/0053-channels-and-tasks-are-the-only-places.md` status to implemented.

**Build.**

- [ ] The four ADRs, the proposal, and this plan, rebased on `main`.

**You see.**

- [ ] `bun run docs:list` lists the new ADRs and this plan.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `bun run docs:list` and a link check of the changed files.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Documentation only. No live lanes. Recorded per the change routing table.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Documentation only. No perf gate.

**Review gate.** None. P0 is not review-gated.

**Merge.**

- [ ] Zach merges.

## Build Drive on Files (D1 to D5)

ADR 0054 decisions 1 to 12. Until R3 lands, the Computer composes the prompt from the `drive/`
folder.

- [ ] **D1. Write the Drive contract.** Rewrite `specs/artifact-drive.md` for the three areas, attribution, the change counter and "changes since", pull and push, merges, kept-both copies, and citations by revision. Add the `drive_conflict` kind to `specs/inbox.md`. Evidence is the merged spec PR.
- [ ] **D2. Extend the Server drive.** Areas, attributed revisions, the per-area counter and query, three-way text merge from the base revision, kept-both copies, and the `drive_conflict` inbox item with its delivery test. Server gate plus focused regressions.
- [ ] **D3. Migrate workspaces into Drive.** Move every Agent's `MEMORY.md`, notes, pages, and skills into `agents/<handle>/`. Memory delivery and instruction composition read the `drive/` folder. Delete the Computer-local source of truth in the same PR. Computer gate plus a `test:agents` memory scenario.
- [ ] **D4. Pull and push on the Computer.** A persistent `drive/` folder per Agent, a delta pull of every changed file that finishes before the turn starts until the runner ships, and a push after the reply (`specs/drive-folder.md`). Computer gate plus a conflict regression with two writers.
- [ ] **D5. Turn Files into the Drive page.** Rename Files, show the three areas, and add History, Compare with `@pierre/diffs`, and Restore. Website gate plus scoped App e2e. Review-gated.

**Verify, live, for the phase.** Walkthrough 4 from the proposal on the real stack. An Agent writes `WORKER.md` from a "from now on" message, the Drive page shows the attributed revision, and Compare shows the one-line change.

**Verify, perf, for the phase.** Turn start latency for an Agent turn with no machine work, measured on trunk first and at the phase head. Fail when the head adds more than 50 ms at the median over 20 interleaved turns.

## Move Agents to the Server (R1 to R5)

ADR 0057 decisions 1 to 12, and ADR 0054 decision 7.

- [ ] **R1. Write the runtime contract.** Rewrite `specs/runtime-drivers.md` for the runner, harnesses, the invocation contract, outcomes including unknown and offline, timeouts, cancellation, and output limits. Update `specs/mcp.md` for relayed agent-browser and the descoped local MCP. Name the Computer protocol frames that change. R2 bumps `packages/haus-api/computer-protocol.json` for them, and R4 bumps it again.
- [ ] **R2. Run tools on Computers by invocation.** The invocation handler, the accepted-before-run ledger, `bash` and the edit tool from Pi's MIT tool code with provenance marked, and agent-browser relayed behind `execute`. Computer gate plus a crash-before-acknowledgement regression.
- [ ] **R3. Stand up the runner.** A runner process in its own container with a persistent volume, the Claude Agent SDK harness with native tools off and Haus tools bridged, inbox delivery to the runner, prompt composition from Server Drive, and logins in runner settings. Add the Oxlint boundary rules that stop the runner importing Postgres or Server internals. Server gate plus provider smoke.
- [ ] **R5. Add Pi Durable.** The second harness for every non-Claude model, with its file backend on the runner volume. It lands before R4, so the cutover has a harness for every Agent. Each Agent is pinned to one harness, and a switch is an explicit reset. Provider smoke for ChatGPT plans.
- [ ] **R3b. Route invocations on the Server.** The Server invocation router, the payload GET and PUT routes, and the runner's read of attachment-reference results (`readInvocationPayload`), so `view_image` and image `view` reach the model.
- [ ] **R3c. Move large payloads from the runner to the machine.** The runner→machine upload path, so a `haus` path flag (`attachment view --output`, `image wait --out`) can write more than 700 KiB to the machine. PDF reading in `view` (text, or page images for Claude) rides with it. A `test:agents` scenario covers it: a person attaches a 2 MB photo and the Agent describes it.
- [ ] **R6. Configure model connections in the App.** Server-held, encrypted model connections, several per provider: Claude by pasted setup-token, ChatGPT and SuperGrok by device-code sign-in run through the runner, and API keys for xAI, Gemini and OpenRouter. The runner reads them only from the Server, and refreshes are serialized there. Settings → Models shows status and plan capacity per connection, and each Agent picks a connection, defaulting to the first. Delivered as R6a (Server and runner), R6b (the App, review-gated) and R6c (plan capacity).
- [ ] **Web tool.** A Haus `web_search` and `web_fetch` for Pi models, so non-Claude Agents keep web search after the cutover.
- [ ] **R4. Move every Agent to the runner.** One cutover, with both harnesses available. Delete the Computer Agent session store, the Agent-session parts of the runtime drivers, and Grok Build as an Agent runtime. The Claude Code and Codex drivers stay for Workers. `test:agents` full set and real-app proof. **Gate:** R4 starts only after R6, R3c and the web tool merge, because each one restores a capability Agents have today that the cutover would otherwise drop.

**Verify, live, for the phase.** With every Computer offline, an Agent answers a DM and dispatches nothing to a machine. With its Computer online, it runs `bash` there and edits a file in `drive/`.

**Verify, perf, for the phase.** Time to first token for an Agent reply, trunk first and then head, 20 interleaved runs. Fail when the head median is more than 20 percent slower.

## Make channels Projects (J1 to J4)

ADR 0055 decisions 1 to 11.

- [ ] **J1. Write the Projects contract.** A Projects spec, plus `specs/tasks.md`, `specs/inbox.md`, and `specs/chats.md` for Project keys, explicit Task Projects, home Projects, and hearing rules.
- [ ] **J2. Turn channels into Projects on the Server.** Every channel becomes a Project, `#all` becomes Haus, one key per Project, an explicit Project on every Task, and human-filed Tasks assigned to an Agent.
- [ ] **J3. Give every Agent a home Project.** Delivery narrows to the home Project, mentions, assignments, and DMs. Migrate each Agent to the channel it is most active in. Delivery tests for each hearing rule.
- [ ] **J4. Rebuild the sidebar and Agent page.** Agent tiles, Projects with their Agents, open Tasks, the footer, Project settings, New task, and the Agent page Overview. iPhone gets the Project and Task changes it needs to stay usable. Review-gated.

The J4 UI ships early as the flagged Capy shell from the UI track. That covers the sidebar and the Home prompt, and later the Captain page and Project settings. J4 itself is data wiring, flipping the flag on, and deleting the old shell. D5 is unchanged. The UI track also decided, with Zach, that the shell has no Inbox page: Home is the prompt box, and each sidebar row carries its own unread state. The Agent inbox is unchanged.

**Verify, live, for the phase.** Walkthroughs 2, 3, and 5 from the proposal on the real stack.

**Verify, perf, for the phase.** Sidebar render cost with `render-budget.spec.ts`, trunk first. Fail on any budget the spec already enforces.

## Start empty, without Cove (E1 to E5)

ADR 0059 decisions 1 to 9. Each slice deletes its Cove and onboarding code and the docs that
describe it in the same PR. Existing Coves and `#onboarding-owner` channels stay as ordinary data.

- [ ] **E1. Land the decision.** ADR 0059 with its capability table, the status notes on ADRs 0021, 0028 and 0055, the proposal, Manual API and Activity spec edits, and these rows. Evidence is the merged docs PR.
- [ ] **E2. Delete Cove from the Server and API, with its App and iPhone consumers.** Declared cross-boundary: `apps/server/**`, `packages/haus-api/**` (App-facing shapes only), `apps/website/**` and `apps/ios-swift/**` where a removed field is read, App e2e, `scripts/` size and lint lists, and the docs and specs for what it deletes. It deletes `server.createCove`, the onboarding record, gate and phases, `#onboarding-owner` creation, every writer of a new `onboarding` wake, identity locks, the reserved `cove` handle, `factory_kind` and `factory_applied_at`, `ServerDetail.onboarding` and `Agent.factoryKind`, and, in the same PR, the web onboarding route and steps, `use-create-cove`, e2e `completeOnboarding`, and the iPhone `cove` factory kind, avatar gating and reserved handle. The invalid-inventory repair state moves onto the Computer record so Add device can show it. The `onboarding` read path stays in haus-api, the Server and the App. The Server keeps sending `agent-configure` with `factoryKind: 'ordinary'` until E3 drops that field and the `cove-apply` frames with a protocol bump. One migration retires unsettled `onboarding` inbox items, keeps seen ones and every turn trigger, and keeps every existing Cove and onboarding channel as ordinary data. The dev seed keeps Blippy, Tiny, `#haus` and `#product`, and re-anchors its inbox, showcase and automation seeds. Its last commit deletes J3's `COVE_HOME_FIXED`. Server gate, focused App and iOS tests, scoped App e2e for a fresh Server, and Owner and Member screenshots of a fresh Server opening into the App. Review-gated.
- [ ] **E3. Delete Cove from the Computer and agent packages.** Declared cross-boundary: `apps/computer/**`, `packages/haus-api/src/agent-runner.ts` and `computer-protocol.json`, `packages/agent-workspace/**`, `packages/agent-manual/**`, `packages/agent-prompt/**` tests, `scripts/agent-tests/**`, and the specs and register rows for what it deletes. The `cove-apply` frames, handler and receipt, `agent-configure`'s `factoryKind`, the protocol bump, the Cove factory workspace, guidance refresh and per-turn notices, the Manual's Cove lines, Cove-only live harnesses and scenarios, and the divergence register rows that cite Cove. Cove's still-true product FAQ answers move into Manual topic `app`. `bun run test:prompt-contract`; the cap does not move.
- [ ] **E4. Add what onboarding did to Settings and New Captain.** Declared cross-boundary only for the docs it changes. Add device gains live progress and repair copy for no usable runtime or model, invalid inventory, incompatible, and disconnected. New Captain links to Settings → Devices when none is connected. New task with zero Captains is hidden or points to New Captain. The first-run Home ships in the Capy shell (PR 324). Website gate plus scoped App e2e. Review-gated.
- [ ] **E5. Clean up the iPhone app.** Cove-named fixtures and previews, and any Cove copy E2 did not need to touch. iOS gate.

**Verify, live, for the phase.** Create a Server on the real stack: it opens into an empty Home with zero Captains, connecting a Device from Settings and creating a Captain works, and the dev seed still shows Blippy and Tiny with inbox activity.

## Turn cloud agents into Workers (W1 to W4)

ADR 0056 decisions 1 to 12.

- [ ] **W1. Write the Workers contract.** Rewrite `specs/cloud-agents.md` as Workers, and reconcile `specs/workers.md`.
- [ ] **W2. Rename cloud agents to Workers.** `haus worker`, typed reports as inbox items, the `Haus-Task` trailer, PRs attached through reports, and supervision. Delete the cloud-agent noun in the same PR.
- [ ] **W3. Run Workers on Computers.** Native Claude Code or Codex in a worktree with that machine's logins, the "Workers can run here" switch, the Project's default place, and `WORKER.md` at launch and on change.
- [ ] **W4. Build Worker cards.** Place, status, newest report, cited files, PR, a follow-up composer between turns, and stop. Review-gated.

**Verify, live, for the phase.** Walkthrough 1 from the proposal on the real stack, with Workers on two Computers and one cloud provider.

**Verify, perf, for the phase.** Task page render cost with six Worker cards, trunk first. Fail on any budget the render specs already enforce.

## Add computer use and the token panel (C1 and C2)

- [ ] **C1. Relay agent-desktop.** Built into every Computer behind `execute`, with the per-Computer "Computer use allowed" switch.
- [ ] **C2. Show what loads before the first message.** The token breakdown on the Agent page. Review-gated.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

No prototypes ran for this plan. The decisions came from research and three council rounds,
recorded in the session notes. Two facts stay unproven and are checked inside their PRs. Codex
app-server can turn off its built-in tools, which matters only if Pi Durable is replaced. The
Claude Agent SDK can run with its native tools off and Haus tools bridged, as Amp and Capy report.
R3 proves it first.

## Appendix B. Alternatives rejected

ADRs 0054 to 0057 record the rejected designs. This plan also rejects two execution shapes. A
single coordinator for the whole program lost to one coordinator per phase, because each phase
needs a fresh context and Zach's go between phases. Full per-PR verification blocks for every
phase up front lost to writing them at each phase start, because later PRs depend on specs that
earlier phases write.

## Appendix C. Risks

- **R3.** The Claude Agent SDK may resist running with its native tools off. The owner proves it in the first commit.
- **R4.** One cutover moves every Agent. The owner rehearses it on the dev Server with every seeded Agent first.
- **D3.** A migration bug loses memory. The owner writes the migration as idempotent and verifies every Agent's `MEMORY.md` digest before and after.
- **J3.** Narrower delivery can hide a request from the Agent that should answer. The owner adds a delivery test per hearing rule and an eval on placement.
- **R5.** Pi Durable's API changes without notice. The owner pins the version and keeps it behind the harness boundary.

## Appendix D. Links and reading list

- ADRs 0053 to 0057 and the proposal, before any edit.
- `specs/runtime-drivers.md`, `specs/artifact-drive.md`, `specs/inbox.md`, `specs/tasks.md`, `specs/mcp.md`, `specs/cloud-agents.md`.
- R3 and R4 owners load `~/.claude/skills/make-it-so/SKILL.md` and its `how` and `interrogate` skills.
- Each phase keeps a decision trail per the `show-me-your-work` skill.
