---
summary: Implementation plan for rebuilding the Haus iPhone app in Capy's shape, iPhone Duo included. It covers the iOS 26 tab-bar shell, Home, Projects, Tasks, the Work view, turn details, and the visual system, with phases, slices in order, invariants, shared-file owners, Server contracts, and verification. ADR 0062 later replaced its Workers, Task states and Captain DMs; the catch-up note says what changed.
read_when:
  - starting or running any phase of the iPhone rearchitecture
  - writing a slice brief, a PR description, or a review for apps/ios-swift work in this program
  - deciding where an iPhone surface lives (tab, route, sheet) or which Server contract it reads
---

# iPhone rearchitecture plan

The program rebuilds `apps/ios-swift` in the shape Zach chose from Capy's iPhone app. Haus's own product model
holds throughout: Projects, Tasks, and one session per Captain.

**ADR 0062 catch-up (2026-11-27).** [ADR 0062](../adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md)
landed after the slices below shipped, and the iPhone followed it in one pass. Read the slices as history where
they say otherwise; [the iPhone spec](../../specs/ios-app.md) is the contract.
- Workers, the Worker view, Happening now, "Workers can run here", cloud agent settings, worker places, and
  Project repos are deleted. The Work view lists pull requests and Files, and its pill counts open pull requests.
- A Task is an agent session: a title, a short id, active or archived, and an activity (Needs you, Working,
  Waiting, Failed, Idle). Task states, the Status sheet, priority, labels, assignee, due dates and keys are gone.
  The Tasks tab is My tasks, All tasks, and Archived, grouped by activity. "Ask anything" starts a Task with
  `task.start` (Project, Machine, model). The Task chat renames, follows, archives and restores, and sends as
  steer.
- Captain DMs are the one shared Captain chat (`kind: captain`): the `captain(agentId)` route, Home tiles, push
  routing, and mark read all use it.
- Issues have no iPhone screen. Issue pushes open Home, and Issue turn triggers decode.

- **Decisions, teardown, and gaps:** the [Capy parity audit](ios-capy-parity-audit.md). When the two disagree, the
  audit's Decisions section wins.
- **Mocks:** [Haus iPhone Rebuild](https://claude.ai/artifact/QjPFKEUPJFm9kHFoAvwaFk) has 14 iPhone screens and 6
  iPhone Duo poses.
  - The chrome is measured from Capy's recording at 430 pt: a 49 pt icon-only tab bar, a 47 pt accessory and
    composer, 44 pt glass circles, 20 pt margins, Inter, and plain lists, with cards only in settings.
- **Review:** a council review (Opus, Sol, Gemini; 6 to 6.5 out of 10 on the first draft) found contract and
  ownership errors. This revision fixes them.

## Where it ends

- **Tab bar.** A native iOS 26 tab bar: **Home · Projects · Tasks · You · Search**.
  - An "Ask anything" accessory sits above it, and it minimizes on scroll.
  - Each tab owns a `NavigationStack`, and one router owns every open.
  - The tab bar and the accessory hide on chat routes, so the custom composer owns the bottom edge.
- **Gone.** The drawer, the Inbox page, and the Settings sheet. Each one goes only after its workflows have a new
  home (S1c).
- **Tabs.**
  - **Home:** Captain tiles, Recent, and the active Tasks.
  - **Projects:** Projects with their Captains, unread dots, active Task counts, archived Projects, and People.
  - **Tasks:** My tasks, All tasks, and Archived, grouped by activity. You can start a Task here.
  - **You:** the settings as pushed rows, plus Automations, Models & connections, Projects setup, Devices, People,
    Integrations, and the Server switcher.
  - **Search:** a palette with scopes, recents, and actions.
- **Chats.**
  - Captain chats and Task chats use the assistant layout. Projects keep roster rows.
  - Live work stays as the header dots and thought pill. Tapping them, or a message's "View turn details", opens
    the turn details sheet.
  - Stop is in the Captain's menu. The voice call stays in the header menu.
- **Work view.** A floating Work pill with a count, above each place's composer, opens its PRs (read-only) and
  Files.
- **Composer.** It gains a model chip that opens the Model sheet (later moved to the Captain chat's `…` menu,
  when the composer became a one-line pill that grows as you type). The sheet writes the Captain's model. Members
  see it read-only. (A full-height grabber shipped in 13.0.0 and was removed: swipes meant for the keyboard caught
  it.)
- **iPhone Duo.** Per Apple's HIG:
  - On the outer display, controls sit in a trailing-edge column in every pose.
  - The inner display, fully open, shows a narrower list and a wider content pane.
  - Half-open splits into two equal panes around the fold: side by side like a book, or above and below when it
    sits on a surface.

Deferred by decision:
- the swipe and pinch pane pager (D7)
- PR comment, status, and merge (D5)
- a Server-wide PR list, PR bodies, and diffs (W6)
- App layout customization

## Invariants every PR keeps

- [ ] **Server owns canonical state.** The app is sync-first: render the best Server data during reconnects, keep
  the launch snapshot, and never invent ids, timestamps, or routing.
- [ ] **Server scope.** Every read, event, draft, and snapshot is keyed by Server. A late response for a Server the
  app has switched away from is dropped.
- [ ] **Loading.** Blank while loading. Show an empty state only when the read has loaded and is truly empty. No
  skeletons.
- [ ] **Realtime.** One subscription per event type. Events notify and the stores' reads own state. Optimistic sends
  stay app-local, with draft recovery.
- [ ] **Chats are prose only.** No work groups, "Working for" rows, delegation lines, or tail placeholders in any
  transcript (`specs/chat-timeline.md`).
- [ ] **Role.** Execution outlines and journals are Owner and Admin only (`requireExecutionEvidenceAccess`). Members
  get turns and activity.
- [ ] **Read and push.** Only the selected tab's top route may mark a chat read or suppress its pushes.
- [ ] **Unread is a dot, never a count.** DM chats read "DM" in context labels. Reference chips have no fill.
- [ ] **The composer and attachment portal stay custom.** Fix and extend inside them.
- [ ] **No silent regressions.** A PR that removes something users can do today names it and points to its new
  home, or to the decision that retires it. Re-home the transcript substrate and its benchmarks, realtime
  reconciliation, the launch snapshot, voice calls, push routing and the notification extension, inline replies,
  reactions, mentions, visuals, claims, automations, archived chats, scoped chat search, and avatar generation.
- [ ] **No iOS compatibility stubs.** Old installed builds may break.
- [ ] **Code.**
  - Swift files stay at or under 300 lines (`scripts/source-size-policy.json`).
  - Landmines rules: no test doubles, sleeps, retries, prose comments, or explicit return types where inferred.
- [ ] **Copy uses ADR 0058 names:** Captain, Project, Device. Code and wire names stay Agent, Channel, Computer,
  and `cloudAgent*`.

## Shared files and their owners

A slice edits a file only if it owns that file or the file is new. Other slices reach in through a seam the owner
exposes, or they land after the owner does.

| File | Owner | Others go through |
| --- | --- | --- |
| `HausApp/Router/**`, `HausRoute` | S1a | add route cases only in the seam S1a seeds |
| `HausApp/AuthenticatedHausView*`, `HausUI/Chat/HausShellView*` | S1a, S1b, S1c in order | — |
| `HausUI/Chat/ChatScreenView.swift`, `ChatScreenHeader.swift` | C2 | header slots for the Work button (W1) and the menu (C3) |
| `HausUI/Tasks/TaskChatView.swift`, `TaskChatHeader.swift` | T2 | the transcript style param (C1), the Work slot (W1) |
| `HausUI/Platform/TranscriptListView*.swift` | C1 | — |
| `HausUI/Settings/SettingsHubView.swift` | Y1 | rows added by W3 and W4 after Y1 |
| `HausUI/Chat/MessageComposerView.swift`, `Composer*` | C4 | — |
| `HausUI/Platform/ChromeHeader`, `GlassChromeButton`, glass forks | I1 | V1 adds new files only |

## How the program runs

- **Owner.** One orchestrator owns the program: briefs, merges, and the audit doc. Each slice is an Opus subagent
  in its own worktree, pinned with `git checkout -B` to the commit it builds on.
- **Briefs.** Each brief lists owned and must-not-touch files and the Server procedures it reads. It says "backup
  copy, never checkout, restore, or stash." It forbids heredoc edits, `cd` chains, and loops, and it carries the
  invariants.
- **One heavy lane.** One Simulator driver at a time, on a dedicated device per slice. Check the installed binary's
  md5 before trusting a screenshot.
- **Review.** Gemini Neon reviews every slice, with Codex as a second opinion on contract and architecture slices.
  Merge on green. Update open PRs by merging `origin/main`, never by force-push.
- **UI gate.** UI slices wait for Zach's preview: real Simulator screenshots in light and dark, and a recording for
  motion and gestures. Glass z-order needs a device check.
- **Releases.** Release iOS through `docs/operations/ios-testflight.md` at the end of each phase.

## Verification

Use [Change Routing](../operations/testing.md#change-routing). Every slice runs:

- `swift test` in `apps/ios-swift`
- a build of the app target for a Simulator destination
- `bun run lint`

Add these where they apply:

- **Text layout, transcript, or composer:** the HausRenderingTests Simulator target (I1, C1, C4) and the transcript
  benchmarks.
- **Gestures, chrome, tabs, sheets, or motion:** drive the Simulator. Use XCUITest when panel input is unreliable,
  and `recordVideo` plus ffmpeg bursts for transitions.
- **Push:** unit tests for every payload kind, plus `simctl push` for each, cold and warm. Before S1c ships, prove
  APNs and the notification extension on a signed iPhone.
- **Docs:** `bun run docs:list` and a link check for I0 and any docs change.
- **iPhone Duo:** the iPhone Duo Simulator in Device Hub (Xcode 27.1), covering closed, open, rotated, and
  half-open.
- **End of each phase:** one whole-suite run plus a real-app walkthrough. This is the only full run.

## Phase 0: Foundation (no visible change)

- [ ] **I0. Contracts and a testable home.**
  - Write `specs/ios-app.md`:
    - the tab set and the route table
    - the **push route table**: Channel, DM, Task, `task_assignment`, and `task_assignment_burst`; which tab each
      lands in; push vs reset; how a cold launch waits for the router; how a push for another Server switches first
    - the **Server lifecycle**: switch, membership loss, sign-out, and launch restore
    - transcript layout per place, the live-work and turn-details rule with roles, the Work view, and the PR
      read-only rule
  - Done in [`specs/ios-app.md`](../../specs/ios-app.md).
  - The tested package target (`HausAppModel`) for the router and the per-noun stores moves to I3a. `HausApp` has
    no test target today.
  - So do the `apps/ios-swift/README.md` update and E5's Cove cleanup.
- [ ] **I1. Require iOS 26.**
  - Set `project.yml` to 26.0 in all three places (options, `Haus`, `HausNotificationService`). Regenerate and check
    in `Haus.xcodeproj`, and verify the archived app and extension minimums.
  - Pick the macOS strategy for `swift test`: bump `Package.swift` to tools 6.2 with `.macOS(.v26)` if the iOS CI
    runner is on macOS 26, else keep the `macOS 26` availability guards. Delete the iOS 18 fallbacks either way.
  - Emoji proof moves from the 18.6 Simulator to a device.
  - Record the upgrade outcome for iOS 18 users before the Phase 0 upload.
- [ ] **I2. Models and transport, additive only.** Owns `HausModels/**` and `HausTransport/**`. It removes nothing.
  - Add Swift models and calls:
    - `task.create`, `setState`, `assign`, `setFollow`, `update`, `list`, and `listOpen`, with `task.onCreated`,
      `onUpdated`, and `onFollowUpdated`, plus `taskLabel.list`
    - `worker.get`, `listActive`, `listForChat`, `listLinks`, `sendFollowUp`, and `stop`, with `worker.onUpdated`.
      Fix today's decoder, which reads `messageId` where the event carries `taskId`.
    - `project.list`, `create`, `update`, the repo procedures, `setDefaultWorkerPlace`, and `project.onUpdated`
    - `agent.turns`, `activityHistory`, `activeActivity` (with `runStartedAt`), `create`, `stop`, and `configure`,
      plus the role-gated `executionOutlines`, `executionJournal`, and `onExecutionJournal`, and `agent.onUpdated`
    - `artifact.list`, `byPath`, `text`, and `download`, with `artifact.onUpdated`
    - `modelConnections.list` and `onUpdated`
    - push payloads for `task_assignment` and `task_assignment_burst`
  - Rename the iOS presentation types from `CloudAgent*` to `Worker*`. Keep the `cloudAgentSettings.*` and
    `cloudAgentProvider.*` callers: they are the live wire names for Worker places, and Y1 folds their screen into
    Models.
  - Read the model list from `modelConnections` (audit bug 4).
- [ ] **I3a. Split the store.** After I0 and I2. It moves `HausStore` into the tested target as `ChatsModel`,
  `TasksModel`, `CaptainsModel`, `WorkersModel`, `DriveModel`, and `SettingsModel`. Behavior stays the same, proven
  by new tests in the target.
- [ ] **I3b. Server lifecycle.** After I3a, per the I0 contract.
  - Persist `activeServerID`, key the launch snapshot by Server, and bump its version with a migration.
  - Fix `reloadServerList`, which treats any non-first Server as membership loss.
  - Drop late reads, events, and writes across a switch.
  - Key drafts and staged attachments by Server and destination, using the Worker id for follow-ups (bugs 2 and 3).
  - Prove offline first paint, switching during a refresh, and sign-out isolation.
- [ ] **V1. Visual primitives, new files only.** After I1.
  - Tokens: `HausPlatformColor.accent` (Haus #0485F7) and the dark and light palette.
  - New components: `FilterChip`, a count section label, the glass toast, and the squircle Captain mark with its
    radius derived from the box.
  - A gallery preview. No screen adopts them yet.

**Gate.** Tests pass in the new target. The app builds for iOS 26 and still works on a walkthrough with the drawer
intact, including a Server switch and a cold launch on each Server.

## Phase 1: Shell, in three slices

- [ ] **S1a. Router and push, behind today's drawer.** It owns `HausApp/Router/**` and the routing parts of
  `AuthenticatedHausView*`.
  - One `@Observable HausRouter` with typed routes. Push, references, search, and deep links all call
    `router.open(_:)`.
  - Implement the push route table:
    - all five payload kinds
    - a switch to another Server before the tap is consumed
    - `messageId` reveal
    - a cold-launch queue
  - Mark-read and push suppression read the router's visible route.
- [ ] **S1b. Tab cutover.** Review-gated. It owns `HausShellView*`.
  - The root becomes a `TabView` (Home · Projects · Tasks · You · `Tab(role: .search)`) with
    `tabBarMinimizeBehavior` and the accessory. Both hide on chat routes.
  - Home first hosts today's Inbox sections as they are (Happening now, unread, Today), so nothing is lost.
  - Projects gets today's sidebar list with Archived, and People.
  - Tasks first lists followed and unread Tasks.
  - You hosts today's settings hub as pushes.
  - Search hosts `ServerSearchView`, keeping scoped chat search.
  - Fix the fresh-Server dead end (bug 1), with role copy for each action:
    - New project
    - Connect a Device
    - New Captain, which `agent.create` allows only with a home Project and a Device
- [ ] **S1c. Delete the old shell.** After H1 and T1. Gated by a checklist proving each workflow has its new home:
  - Happening now → Home
  - followed unread Tasks and Mark read → Tasks
  - the unread peek → Home and row dots
  - archived restore → Projects
  - the week card → retired by decision (Open questions)

  Then delete `HausDrawer*`, `DrawerPanGesture`, the Inbox page, the Settings sheet, and the 35-closure
  `HausShellView` init.

**Gate.** A walkthrough of every tab, push routing for all five kinds (cold and warm, both Servers), interactive
back that keeps its scroll position, a fresh Server as Owner and as Member, and Server switching. Zach reviews S1b.

## Phase 2: Places (parallel after S1b)

- [ ] **H1. Home.** Review-gated. It owns `HausUI/Home/**`.
  - Captain tiles: working badge, unread dot, idle and stopped states. Tap opens the DM. Long-press opens the profile
    and automations; Stop arrives in C3.
  - Happening now (`worker.listActive`), recent DMs, and Open tasks.
  - New Captain through a sheet that reuses avatar generation.
  - The Ask anything accessory: a Captain and Project picker that calls `task.create`. The draft survives an error.
    Match `capy-shell/home-send.ts`.
- [ ] **P1. Projects.** Review-gated. It owns `HausUI/Projects/**`.
  - Projects with Captains, unread dots, and open Task counts, plus `#all`, People with DM, and Archived with
    restore.
  - New project (`project.create`).
  - Project settings: keys, repos, and the default Worker place.
- [ ] **T1. Tasks tab.** Review-gated. It owns `HausUI/TasksTab/**`.
  - "Open ⌄", "Mine ⌄", and "+ Filter" chips.
  - Groups by state with count labels. Rows show the state disc, a priority icon (port `task-priority-icon.tsx`),
    the Project key, assignee, and age.
  - The default scope is Tasks you or your Captains started. New task.
- [ ] **T2. Task editing.** After T1. It owns `TaskChatView` and `TaskChatHeader`.
  - The state pill opens the Status sheet (`task.setState`).
  - Assignee (`task.assign`), follow (`task.setFollow`), and priority, labels, and due date (`task.update`, with
    labels from `taskLabel.list`).
  - It keeps the legacy read-only Task path and origin-message jumps.
  - The header stays until W1 replaces it.
- [ ] **Y1. You.** Review-gated. It owns `HausUI/Settings/**`.
  - The order:
    - profile and the Server switcher
    - Automations, as a cross-Captain index
    - General, Notifications, Appearance, App icon, and Show claims
    - Captains
    - Models & connections, which absorbs `CloudAgentSettingsView` and holds Subscriptions
    - Projects
    - Devices, with "Workers can run here"
    - People and Integrations
    - About / Sign out
  - Rows have a title, an optional description, a value, and a chevron, with footers.
  - Glass close buttons replace the blue "Done" text.
  - Prove it at large Dynamic Type.
- [ ] **Q1. Search.** It owns `HausUI/Search/**`.
  - Scope chips: Messages, Tasks, Captains, Projects, People. These come from authorized lists, because
    `chat.search` returns messages only.
  - Zero-query shows Captains, recents, and actions.
  - Exact message jumps and scoped chat search stay.
  - A PR scope waits for W6.

**Gate.** A walkthrough per tab, light and dark, at large Dynamic Type. Then S1c lands.

## Phase 3: Chat (parallel with Phase 2 by owner)

- [ ] **C1. Transcript style and anchoring.** It owns `TranscriptListView*`, `MessageTimeline*`, and
  `TranscriptRow*`. Review-gated.
  - A `TranscriptStyle`: assistant for Captain DMs and Task chats, roster for Projects. It passes into `TaskChatView`
    through T2's param.
  - Centered time dividers, a copy glyph on replies, and stopped claims kept.
  - Send landing ("Scroll new messages to top" in General). It needs a tail inset in the flipped table, specified
    and benchmarked here. Off by default since 13.0.3: the held-open room read as empty space after a send.
  - Latest and unread jumps.
  - Compare both styles on one long-history fixture: paging, exact jumps, optimistic reconciliation, and row reuse.
- [ ] **C2. Header and turn details.** It owns `ChatScreenView`, `ChatScreenHeader`, `Chat/Engagement/**`, and the
  new `HausUI/TurnTrace/**`. Review-gated.
  - A stock centered header with the Captain avatar. The dots and thought pill sit under it, and the menu keeps
    Call and scoped Search.
  - Tapping the dots opens the turn details sheet:
    - **Everyone:** live steps from `agent.activeActivity` and `onActivity`, reconciled by run id, with the clock
      from `runStartedAt`. Settled turns come from `agent.turns`.
    - **Owners and Admins:** `executionOutlines` and the journal. They subscribe only while the sheet is open.
  - The "View turn details" message action opens the same sheet.
  - Port the label and fold model from `features/turn-trace/` with adapted fixture tests.
  - Test a mid-run open, a reconnect, several Captains, and settlement, as both Member and Admin.
- [ ] **C3. Stop on the Captain.** After H1, C2, and Y1. It adds Stop (`agent.stop`) to the Captain menu in the DM
  header, the profile, and a tile long-press. Pending and settled stops look different.
- [ ] **C4. Composer.** It owns `MessageComposerView` and `Composer*`. Review-gated.
  - A grabber and a full-height drag state.
  - The model chip opens the Model sheet: searchable and grouped by connection, with effort drill-in and medium and
    large detents. It writes `agent.configure`, which rotates the session.
  - It is read-only for Members, or when the configure call is refused.
  - Subscriptions links to Y1.
  - The placeholder says "Reply" in Captain and Task places.
- [ ] **C5. References.** It owns `RichReferenceRenderer` and the reference route cases. Task references carry the
  state disc inline. Worker, PR, and Drive references turn native as W2–W4 ship their destinations.

**Gate.** Rendering tests and benchmarks pass. A recording of a live turn as Member and as Admin: the dots, the
ticking sheet, and the settled turn. A long draft goes to full height and back.

## Phase 4: Work (after I2, S1b, C2, and T2)

- [ ] **W1. Work button and Work view.** Review-gated.
  - A floating Work pill (grid glyph, count, ⌃) centered above the composer, as Capy does, in Captain DMs,
    Projects, and Task chats. It shows only while that place has work. Headers keep just the identity and `…`.
  - It opens that place's Workers, Tasks, PRs, and Files.
  - T2's `TaskChatHeader` shrinks to a compact bar here.
- [ ] **W2. Worker view.** Review-gated. Port `features/workers/view/*`.
  - Steps as a "Worked for…" chain that shimmers while live, and "Finished, worked for…" separators.
  - The report, cited files, and PRs.
  - A follow-up composer whose send turns into Stop Worker, kept live by `worker.onUpdated`.
  - In Task chats, a Worker report is one centered muted line.
  - Retire `CloudAgentCard`.
- [ ] **W3. Pull requests, read-only, in the Work view.**
  - A list grouped Ready / Waiting on checks / Draft, from the PR readings on the place's loaded Tasks and Workers.
  - Detail shows the state, the branch from Worker evidence (with copy and toast), the diffstat, the checks and
    review rollups, and the linked Task and Worker report, plus Open in GitHub and Copy link.
  - No PR body until W6.
- [ ] **W4. Files.**
  - Drive reads: `artifact.list`, `byPath`, `text`, and `download`, with `artifact.onUpdated`.
  - Browse `haus/`, `projects/<key>/`, and `agents/<handle>/` with revision-aware previews.
  - HTML stays on the sandboxed canvas.
- [ ] **W5. Sweep.**
  - Remove the dead cloud-agent presentation files.
  - Adopt V1 tokens on any screen still on system blue.
  - Confirm there are no orphan routes.

**Gate.** From a DM, open the Task, then its Worker (steps, report, follow-up, Stop Worker), its PR, and a Drive
file, all natively.

## Phase 5: iPhone Duo (after S1b; builds with the iOS 27.1 SDK)

Follow Apple's [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)
HIG. Use the stock `TabView` and toolbars, which move to the side on their own. Displays: outer is about 466×678 pt
(compact width); inner is about 951×669 pt in landscape and 669×951 in portrait (regular in both dimensions).

[The iPhone Duo layout plan](ios-duo-layout.md) holds this phase: decisions from the accepted design, slices D0 to
D5, and the Device Hub pass. It replaces the old D1 to D3, and its Task mode replaces the Worker side pane.

## Later

- **W6.** A Server PR read: a Server-wide list, the body, and the diff (`apps/server/src/haus-api/github/**` +
  `packages/haus-api`). Then You › Pull requests, the PR Search scope, and the native diff viewer.
- **D5 revisit.** PR comment, status, and merge.
- **D7.** The pane pager with swipe and pinch overview, over the Work view.
- **App layout customization.**

## Open questions for Zach

- **The Inbox week card** (`serverUsage`, "Active this week"). Retire it, or show it on Home or in You › Models &
  connections?

## Order at a glance

```text
I0 ─┬─ I1 ── V1
    ├─ I2 ── I3a ── I3b ─┐
    └────────────────────┴─ S1a ── S1b ─┬─ H1, P1, T1→T2, Y1, Q1 ── S1c
                                       ├─ C1, C2, C4, C5 ── C3 (after H1, C2, Y1)
                                       ├─ W1 (after C2, T2) → W2, W3, W4 → W5
                                       └─ D0 → D1 → D2, D3 → D4 → D5 (ios-duo-layout.md)
```
