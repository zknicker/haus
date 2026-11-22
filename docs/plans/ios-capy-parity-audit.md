---
summary: Audit of the Capy iPhone app against the Haus iPhone app. It holds the teardown, the gap list by area, scores, the top changes, and the open decisions. It feeds the iOS rearchitecture plan.
read_when:
  - planning or running the iPhone rearchitecture toward Capy's shape
  - deciding what the iPhone tab bar, Home, transcript, turn trace, panes, Tasks, or PR surfaces should look like
  - checking which Haus iPhone strengths must survive the rearchitect
---

# Capy iPhone parity audit (2026-11-21)

## Sources

- Zach's 2:16 screen recording of Capy's TestFlight build, in dark mode.
- A three-model council (Claude Opus, GPT Sol, Gemini Neon) and my own pass. All four read the same frames and the
  Haus iPhone source in `apps/ios-swift`.
- Timestamps are m:ss into the recording. Paths are relative to `apps/ios-swift/Sources/` unless shown otherwise.
- Every claim about Haus code below was spot-checked against this checkout.

## Scores

Each cell is Haus / Capy out of 10, as the council scored them.

| Area | Opus | Sol | Gemini |
|---|---|---|---|
| Information architecture | 4 / 8 | 5 / 8 | 5 / 9 |
| Chat transcript | 6 / 8 | 8 / 8 | 7 / 8.5 |
| Composer | 6 / 8 | 8 / 9 | 8 / 8.5 |
| Live work visibility | 4 / 9 | 6 / 9 | 4 / 9.5 |
| Feature breadth | 5 / 9 | 6 / 9 | 4.5 / 9 |
| Visual polish | 7 / 8 | 7 / 9 | 6.5 / 9 |
| Motion | 7 / 8 | 7 / 9 | 7.5 / 9 |

The council agreed on where the gap is. It is widest in information architecture, live work visibility, and
breadth. Haus is close or ahead on transcript substrate, the composer and attachments, and motion craft.

Opus's headline: Capy's chrome is mostly stock iOS 26, and its effort went into content. That content is turn traces,
delegation status, panes, and PRs.

## Bugs found in passing

These are real today and independent of the redesign.

1. **Fresh-Server dead end.** `HausApp/AuthenticatedHausView.swift:258` shows "Create a project from the sidebar" on
   a Server with no chats, but that branch never mounts the sidebar. Since E2 every new Server starts empty.
2. **No Server switching.** `HausApp/HausStore.swift:168` is `activeServer { servers.first }`.
3. **Task drafts are lost.** `HausUI/Tasks/TaskChatView.swift:20` keeps `@State private var draft`. Leaving a Task
   drops the draft and staged attachments, while Projects and DMs keep theirs.
4. **Models come from the wrong source.** `HausApp/SettingsPresentationAdapters.swift:104` derives the model list
   from `computer.reportedInventory`, which predates ADR 0057. Agents now get models from `modelConnections.list`.
5. **Stale Worker nouns.** iOS still decodes `CloudAgent*` and calls `cloudAgentSettings.*` and
   `cloudAgentProvider.*`. `CloudAgentCard` asks "Cancel this cloud agent run?", and there is no follow-up composer
   even though `worker.sendFollowUp` exists.

## Capy teardown

### Shell

- **Tab bar** (0:45, 1:44). A floating glass tab bar holds Captains · Threads · Pull requests · Me (avatar) ·
  Search.
  - The selection is a glass lens. It tracks a finger scrub across the tabs and settles.
  - Push uses an interactive swipe-back with parallax.
- **Ask anything.** A persistent "+ Ask anything" glass pill sits above the tab bar on every root.
- **Minimize on scroll** (1:42–1:48). Scrolling collapses the bar to [avatar] [Ask anything] [search].
- **App layout** (1:55–2:00) is a short sheet.
  - It has a "Combined home" toggle.
  - Tabs reorder between "Tab bar" and "More".
  - Issues and Automations live in More.
- **Root headers.** Each has a centered 17-semibold title and one or two glass circle buttons (`+`, `…`, adjust).
  - Below the title sits a chip row: a white filled "My threads ⌄" or "Open ⌄", then an outlined "+ Filter".
  - There are no large titles.
- **Empty states** are an icon, a one-line title, and one explanatory line. Examples: "No threads yet / Threads you
  start show here." and "No automations yet / Automations run Capy on a schedule or when an event arrives."

### Captains (0:45, 2:14)

- A grid of large squircle illustrated avatars with names. A Captain that is working gets a tiny `⋯` dot badge.
- The header has `+` and `…`.

### Thread screen

- **Header** (0:00). A glass back circle, a centered avatar and name, and a glass `…`.
  - Tiny pager or presence dots sit under the avatar while it works.
  - Content scrolls under a progressive blur.
- **Message rhythm.** The user's message is a right-aligned dark bubble with native text selection (0:04). The
  Captain's reply is full-width plain prose with no avatar.
  - A small copy glyph sits under each reply.
  - Centered "5:18 PM" dividers separate turns.
  - Inline charts, inline code chips, and teal issue links carry a state glyph ("◐ HAUS-8").
- **Turn trace.**
  - A centered "Worked for 19s" divider opens into "Thought for 34s ›", "Ran a script ›", "Commented on HAUS-12".
  - While live, "Working for 27s" ticks every second and shimmers. The current step ("Running a script",
    "Read skill", "Thinking", "Prep dir") is bright and finished steps dim.
- **Delegation lines** (0:23–0:44). These are centered and muted.
  - "Waiting on OVER-3, OVER-4, and OVER-5" has linked keys and a pulsing dot grid.
  - Completion lines read "OVER-3 finished" and "OVER-3 and OVER-4 finished, worked for 1m 32s".
  - The child gets an assignment line: "OVER-1 assigned you HAUS-11".
- **Floating controls.** A jump-to-latest `↓` sits next to a crew pill "⁝3 ⌃", which counts running children.
- **Stop.** While the Captain works, send becomes a teal stop square.
- **Panes** (0:26–0:44). A coach mark says "Swipe or pinch to see all panes".
  - A pinch scales the thread into a horizontal card carousel: Chat, then each child thread, then a launcher.
  - The launcher has tiles for Crew (count), Pull requests, Issues, Side threads, Terminals, Files, and Setup, plus
    "+ New tab".
  - Each pane keeps its own composer.

### Composer and model (0:06–0:19)

- **Composer.** At rest it is a "+ Reply" pill with send or stop.
  - On focus it grows into a glass card that rises with the keyboard. The card has a grabber, a multiline field, `+`,
    a model chip "✳ Opus 5.5 ⌄", and send.
  - It can be dragged up to most of the screen.
- **Model sheet.** It has ✕, a "Model" title, and a usage button.
  - A search field heads the list. Featured is "Particle-1 Free". Groups follow by provider with logos.
  - The selected row shows "Medium ✓", and a chevron drills into effort.
  - The sheet uses medium and large detents.
- **Subscriptions** shows the account and runtime, a 7-day segmented meter at "100% left", and the reset time.

### Pull requests (0:48–1:43)

- **List.** "Open ⌄", "+ Filter", and an adjust button.
  - Rows are grouped "Ready to merge 2" and "Waiting on checks 5", with state-colored PR glyphs.
  - Each row has two lines: the title, then avatar · repo#num · age.
- **Detail.**
  - A large title, the author, and "opened 3h".
  - A meta card holds a state chip that opens a Status sheet (Draft / Ready / Closed), the branch → base pill (copy
    shows a "Branch copied" toast), `+15 −501`, and the review state.
  - The body is Markdown with "Show more". Below it are "Checks › 1 passed, 1 skipped", the review findings with
    open and resolved counts, severity, file:line, and inline expand, and a filterable Activity.
  - The bottom has "Leave a comment", then a glass Overview / Checks / Diff switcher next to a teal "Merge ⌄".
- **Diff.**
  - Per-file sticky headers with icon, path, `+N` and a viewed checkbox.
  - "160 unmodified lines" expanders, line numbers, red and green washes, "Moved to line 175", and horizontal scroll.
  - While GitHub prepares it, the diff reads "GitHub is still preparing this diff".

### Search (1:48)

- It is a "Search Capy" field with ✕, then scope chips (Threads, Captains, Pull requests, People, …).
- Before any typing it already shows:
  - Captains
  - Recent threads, with status, key, and age
  - Actions: New thread, Go to Captains, threads, pull requests, automations, settings

### More and Settings (1:47–2:13)

- More opens with the profile row, then Issues and Automations.
- The groups follow: Settings (General, Notifications, Appearance, App layout, Referrals, Experiments), then
  Threads, Models, Projects & setup, MCP & plugins, Git and pull requests, Integrations, API, and Devices.
- After those come Review repositories and Review agent config, then Organization, Members, Issue states, Billing,
  Usage, Activity, and Audit log.
- Every row is a pushed screen. A row has a title, an optional description, a trailing value, and a chevron.
  Footers explain inheritance ("· Org default").

### Visual system

- **Color.**
  - The ground is near-black, about #141416, with grouped cards at about #1E1E21 and inset hairlines.
  - There is one teal accent. It covers the selected tab, send and stop, links and keys, Merge, toggles, checks, and
    "Show more".
  - Status color appears only in green, yellow, and red glyphs.
- **Type.** SF throughout: 17 body, 13 meta, and small gray section labels with a count suffix.
- **Glass** sits only on chrome: header circles, the tab bar, the composer, sheets, toasts, menus, and file pills.
  Content stays flat.

## Gap list

Format: Capy → Haus today → do. **P0** is the core redesign, **P1** completes a workflow, and **P2** is breadth or
polish. **S/M/L** is the size. ★ marks a Haus strength that must not regress.

### 1. Shell and navigation

- **P0/L.** Tab bar root → Haus has a UIKit drawer plus a single canvas (`HausUI/Chat/HausShellView*.swift`,
  `HausDrawerContainer.swift`, `Platform/HausDrawerController.swift`) that lands on the Inbox. → Build a native iOS 26
  `TabView` with a per-tab `NavigationStack`: **Home · Projects · Tasks · You · Search (`Tab(role: .search)`)**,
  per D4. Retire the drawer.
- **P0/M.** "Ask anything" accessory → missing. → Use `tabViewBottomAccessory`, which opens a Home composer with a
  Captain + Project picker. It matches the desktop `capy-shell/home-composer.tsx` and `home-send.ts` (`task.create`,
  draft kept on error, opens the new Task).
- **P0/S.** Minimize on scroll and the lens scrub → these come free from `.tabBarMinimizeBehavior(.onScrollDown)`.
- **P0/M.** One router. Navigation state is scattered today (`selectedDestinationID`, `showsInboxCanvas`,
  `path: [HausRootRoute]` with one case, `canvasRouteRevision`, `activeChatSheet`, `settingsRequest`, …). → Build one
  `@Observable HausRouter` that holds the tab, a route stack per tab, and one sheet. Push, references, search, and
  deep links all call `router.open(_:)`. Back returns to the source with its scroll position.
- **P0/M.** Retire the Inbox page (decision D2). Unread becomes a dot on rows, and "Happening now" moves to Captain
  tiles, the crew pill, and Tasks.
- **P0/M.** Settings becomes the You tab, as pushes rather than a sheet.
- **P0/S.** Fix the empty-Server dead end. Offer New Captain, New project, and Connect a Device as reachable
  actions, with honest copy for members.
- **P2/S.** App layout lets people reorder tabs. Skip it until the default layout settles.

### 2. Home and Captains

- **P0/M.** Captain tile grid → Captains are rows in the drawer DMs today (`ChatSidebarView.swift`). → Build
  `CaptainTilesView` from `agent.list` with squircle marks (radius derived from the box per the radius rule), a working
  badge (`currentActivityByAgentID`), an unread dot, dimmed idle and stopped states, a tap into the DM, and long-press
  for profile, automations, and stop.
- **P0/M.** Projects tab (D4). It lists Projects with their Captains, unread dots, and open Task counts, the same as
  the desktop `capy-sidebar.tsx` sections. Keep `#all` reachable. Home below the tiles shows recent DMs and Open
  tasks.
- **P1/M.** New Captain from the phone, through a sheet that reuses ★ avatar generation.

### 3. Chat transcript

- **P0/M.** Row style per place. `Chat/MessageTimelineRow.swift` uses 38pt-avatar Slack rows everywhere. → Add a
  `TranscriptStyle` with two values:
  - **Assistant** (Captain DMs and Task chats): the user's bubble on the right, the Captain's prose full-width with no
    avatar, centered time dividers, and a copy glyph.
  - **Roster** (Projects): today's rows.

  Keep the ★ `TranscriptListView` substrate.
- **P0/M.** Send landing and anchoring. Add a landing policy that scrolls a new prompt to the top ("Scroll new
  messages to top" is a General setting in Capy). Hold the reader's anchor during live changes. Make the latest and
  unread jumps explicit.
- **P1/S.** Task references carry the `TaskStateDisc` inline and keep the ★ no-fill chip look.
- **P1/S.** Worker, PR, and Drive links open native details instead of Safari.
- **P2/S.** Clamp long delegated prompts behind a fade *with* an explicit "Show more". Capy clips them with no way
  to expand.
- ★ Keep inline replies, reactions and stickers, mentions, claims, the attachment viewer, inline visuals, and the
  "Stopped before finishing" line.

### 4. Live work and turn trace

#### Turn trace rule (D3: match desktop)

Desktop on `origin/main` deliberately departs from Capy here, and the rule is the same in every chat kind:

- **The transcript is prose only.** `specs/chat-timeline.md` says execution rows "never appear. There are no work
  groups." `specs/agent-activity.md` says activity "never enters the Chat transcript."
  - `filterPaneSegments` in `chats/chat-transcript-turn.tsx` keeps only clarifications, changed-files chips, and the
    latest narration, which the final reply replaces.
  - Tests assert there is no "Worked for".
- **Live work is the typing strip** above the composer of every channel, DM, and Task (ADR 0035,
  `docs/features/chat.md`). It shows up to three avatars, a three-dot pulse, kind-of-work faces, and the short glass
  thought bubble (ADR 0036). It has no timer and no step labels.
- **Detail is on demand.** A message's "View turn details" action opens `ServerTurnDetailsDrawer`, which renders
  `features/turn-trace/TurnTrace`. Owners and Admins also get the execution journal there.
- **Stop is Agent-scoped,** not chat-scoped. It lives in the Agent actions menu ("Session › Stop" → `agent.stop`).
- **The one Capy-style trace is the Worker page.** It shows "Worked for 6m · 5 steps" as a collapsed
  chain-of-thought that shimmers while live, separators that read "Finished, worked for 28m", and a follow-up
  composer whose send turns into "Stop Worker". In the Task chat, a Worker report is one centered muted line.

#### iPhone work

- **Keep (★).** Live work stays in the header (`Chat/Engagement/HeaderEngagement*.swift`): the dots and the glass
  thought pill under the centered Captain avatar, which is where Capy puts its working dots too (Zach,
  2026-11-22). Restyle it for the stock centered iOS 26 header (D6), and still add no transcript rows.
- **P0/M.** Tapping the header's working dots opens the live turn details sheet (Zach, 2026-11-22). It grows out of
  today's `WorkingNowSheet`.
  - It shows each working Captain's current run: an elapsed clock from `runStartedAt` and step rows with the current
    one bright, ticking live from `agent.onActivity`.
  - With several Captains working in a Project, it lists one run per Captain.
  - It is the same sheet as "View turn details" and settles into that view when the turn ends.
  - This is how Capy's step-by-step view comes back: on demand, never as rows in the chat.
- **P0/M.** Turn details sheet. A message action "View turn details" opens a sheet that renders the turn trace from
  `agent.executionOutlines`, and the journal for Owners and Admins. Port the label and fold model from
  `features/turn-trace/`, and adapt its fixture tests. Today iOS has only 16 strings in `ChatDetailsView`.
- **P1/S.** Stop goes in the Captain actions menu on the Captain profile and the DM header `…`. It is not in the
  composer.
- **P1/L.** Worker view. This is the Capy-style trace on iPhone: steps as a shimmering "Worked for…" chain, "Finished,
  worked for…" separators, the newest report, cited files, PRs, and a follow-up composer whose send turns into Stop
  Worker. Port `features/workers/view/*`. It replaces `CloudAgentCard`'s "Cancel this cloud agent run?" (bug 5).
- **P1/S.** Worker reports in Task chats stay one centered muted line, as on desktop.
- Not doing: inline "Working for Ns" rows, "Worked for" groups in chat, "Waiting on…" delegation lines, or a Stop
  button in the chat composer. Desktop rejected these for chats. The Work button (D7) carries counts of running Tasks
  and Workers instead of a crew pill.

### 5. Composer and model

- **P1/M.** A grabber and a full-height drag detent, built *inside* the ★ custom composer and portal. Never swap in a
  stock sheet.
- **P1/M.** Model chip and Model sheet. Today a model change takes four taps through Settings.
  - Show a chip with the place's Captain model. It opens a searchable sheet grouped by provider, with effort
    drill-in and medium and large detents.
  - The sheet writes the **Captain's** model (`agent.configure`, per ADR 0011), or the Worker's model when a Worker
    starts. It never sets a per-thread model.
  - Fix bug 4 first.
- **P2/M.** A Subscriptions or usage view from the sheet header, reading `modelConnections.list` capacity windows
  (`usedPercent`, `resetsAt`).
- **P2/S.** Copy and color. The placeholder says "Reply" in Captain and Task places and "Ask anything" on the
  accessory. Send uses the accent fill.
- ★ Keep the attachment portal, photo flight, camera, mentions, drafts and retry, and keyboard travel.

### 6. Panes and related work

- **P0/M.** A labeled Work entry point. In a Captain DM or Task, a button with a stable count opens Tasks, Workers,
  PRs, and files for that place. Ship this before any gesture.
- **P1/L.** A pane pager and pinch overview. The pager runs from the parent chat to its child Task chats, then a
  launcher. The launcher maps:
  - Crew → Captains and Workers
  - Tasks
  - Pull requests
  - Files → Drive
  - Setup → Project settings and `WORKER.md`

  Build it in UIKit with a continuous zoom. It hosts live chat screens without remounting, so drafts stay per place.
  Show page dots under the header identity. Arbitrate the gesture against back-swipe, text selection, image zoom,
  code scroll, and swipe-to-reply. Use a one-time edge peek instead of Capy's overlapping coach text.
- **P1/L.** Worker cards and Worker detail. Adopt the `Worker` contracts (rename `CloudAgent*`, bug 5). Show place,
  state, the newest report, cited files, PRs, a follow-up composer (`worker.sendFollowUp`), and stop. Desktop has
  `features/workers/view/worker-view.tsx` to follow.
- **P1/L.** A Files/Drive pane. Move page reads from `agent.workspaceFile` to Drive reads. Browse `haus/`,
  `projects/<key>/`, and `agents/<handle>/` with previews. History, Compare, and Restore come after reading works.
  Keep HTML on the ★ sandboxed canvas.
- **P1/M.** `TaskChatHeader` shrinks from up to 40% of the screen to a compact bar (state disc, key, counts) that
  opens the Work pane.
- Skip Terminals and Side threads (decision D7).

### 7. Tasks

- **P0/M.** A Tasks tab. Today iOS only calls `task.get` and has no list.
  - It has "Open ⌄", "Mine ⌄", and "+ Filter" chips.
  - Rows are grouped by state with section count labels. Each row shows the `TaskStateDisc`, a priority icon (port
    `task-priority-icon.tsx`), the Project key, the assignee, and the age.
  - It reads `task.list` and `task.listOpen`, kept fresh by `task.onCreated` and `task.onUpdated`.
  - Add list snapshots to `TaskSnapshots`.
  - Default to Tasks you or your Captains started. Capy's "My threads" showed empty right after Cap started three.
- **P1/M.** New task from the phone, through the accessory or `+`, calling `task.create`.
- **P1/M.** Task editing in `TaskChatView`:
  - a state pill that opens a Status sheet (`task.setState`)
  - assignee (`task.assign`)
  - follow (`task.setFollow`)
  - priority, labels, and due date (`task.update`)
- ★ Keep `TaskDetailView` and the origin-message jumps.

### 8. Pull requests

- **P1/M.** A PR list, reached from You and from the place's Work view (D4, not a tab), built from Worker and Task
  PR readings and grouped Ready / Waiting on checks / Draft. Use section count
  labels and two-line rows. It grows into a cross-Project list once the Server has an installation-scoped read.
- **P1/L.** A read-only PR detail with:
  - the state, branch (copy plus toast), and diffstat
  - checks
  - the linked Task and Worker report
  - Markdown with "Show more"
  - Open in GitHub and Copy link

  `apps/server/src/haus-api/github/` has installation and repository procedures only, so this needs a Server read.
- **P2/L.** A native diff viewer fed by a Server diff read. It should have sticky file headers, collapsed context,
  syntax coloring that reuses `RichMessageCodeBlockView`, moved-block cues, and a viewed state.
- **P2.** Comment, status, and merge. These are blocked by decision D5.

### 9. Search

- **P1/M.** Promote ★ `Utility/ServerSearchView.swift` from a sheet to the Search tab.
  - Add scope chips: Messages, Tasks, Captains, Projects, People, PRs.
  - Zero-query shows Captains, Recent tasks and chats, and Actions (New task, New project, Go to …).
  - Keep scoped message search and exact message jumps.

### 10. You (Settings)

- **P1/M.** Restructure ★ `Settings/SettingsHubView.swift` as a pushed grouped list in this order:
  - profile
  - Automations, as a cross-Captain index (★ `Automations/*`)
  - General, Notifications, Appearance, App icon
  - Captains
  - Models & connections
  - Projects (keys, repos, default Worker place)
  - Devices (★, adding "Workers can run here")
  - People
  - Integrations (MCP, GitHub)
  - Server switcher (bug 2)
  - About / Sign out

  Rows use title, optional description, value, and chevron, with footers. Follow the memory "settings rows are
  native".
- **P2/S.** The Automations header gets chips and a one-line empty state.
- **P2.** Git/PR defaults only where Haus owns and enforces them.

### 11. Visual system

- **P1/S.** One accent token (`HausPlatformColor.accent`) for send and stop, the selected tab, links, keys, primary
  buttons, and toggles. Replace the scattered system blue.
- **P1/S.** A deliberate dark palette: a near-black ground, one elevated card surface, inset hairlines. Light mode
  stays first-class.
- **P1/S.** One `FilterChip` component (filled when selected, outlined "+ Filter"). Section labels carry a count
  suffix.
- **P1/S.** Squircle marks for Captains and circles for humans, everywhere.
- **P1/S.** Glass circle chrome buttons on every pushed view and sheet. Replace the blue "Done" toolbar text in
  `SettingsSheet` and `ChatDetailsView`.
- **P2/S.** A glass capsule toast under the header for copy and link actions.
- **P2/S.** `.scrollEdgeEffectStyle(.soft)` on every list. ★ The transcript already dissolves under its header.
- ★ Keep: no skeletons, unread as a dot never a count, no-fill reference chips, and "DM" copy.

### 12. Motion

- **P0.** The shimmer, tense flips, and step dimming in the trace (bundled with section 4).
- **P0.** Push and pop, the tab lens, and minimize all come from native `TabView` and `NavigationStack`.
- **P1.** Sheets use stock `.presentationDetents([.medium, .large])` for Model, Status, and pickers.
- **P1/L.** The pinch zoom into panes (section 6).
- ★ Keep the composer morph with the keyboard, the attachment flight, reaction thuds, and interruptible settling.

### 13. iOS architecture

- **P0/S.** Raise the minimum to iOS 26 (decision D1). That deletes about 12 `#available(iOS 26)` forks and unlocks
  `TabView` with `Tab(role: .search)`, `tabViewBottomAccessory`, `tabBarMinimizeBehavior`, and
  `GlassEffectContainer`.
- **P0/M.** Break up the closure bag. `HausShellView.init` takes about 35 closures. → Each tab screen reads focused
  environment sources, the way `chatEngagementSource` and `stoppedAgentSource` already do.
- **P0/M.** Nouns. Rename `CloudAgent*` to `Worker*` and add `ProjectKey` and the Task's Project, in the same wave.
- **P0/L.** Turn-trace model and streams. Add `agent.onExecutionJournal`, `project.onUpdated`, `agent.onUpdated`,
  and `modelConnections.onUpdated`, keeping one subscription per event type.
- **P1/L.** Split `HausStore` (about 45 extensions) by product noun: Chats, Tasks, Captains (with activity),
  Workers (with PRs), Drive, and Settings. They share `TRPCClient`, `TranscriptStore`, and the launch snapshot. Each
  owns its subscriptions and its reads, keyed by Server and entity.
- **P1/S.** An app-scoped `ComposerDraftStore` keyed by chat ID, covering Projects, DMs, Tasks, and Worker
  follow-ups (bug 3).
- **P1/S.** Server switching through a persisted `activeServerID`, reusing `discardServerScopedState()` (bug 2).
- ★ Re-home these, do not rewrite them: the sync-first launch snapshot, realtime reconciliation, optimistic sends,
  the transcript substrate and its benchmarks, voice calls, push routing, and the notification service extension.

## Top 10, in order

1. An iOS 26 tab bar (Home · Projects · Tasks · You · Search) with one router. Retire the drawer, the Inbox
   canvas, and the settings sheet.
2. A Home with Captain tiles and the Ask anything accessory, and a working empty Server.
3. A Tasks tab with filters, state grouping, New task, and in-chat Task editing.
4. Live work: keep the header dots and thought pill. Tapping them opens the live turn details sheet, the same
   sheet as "View turn details". Stop goes in the Captain menu.
5. A Work button per place, and the Worker view with steps, report, follow-up, and Stop Worker.
6. A Captain-style transcript in single-Captain places and roster rows in Projects.
7. Composer upgrades: full-height drag, and a model chip with the Model sheet (Captain model, not per thread).
8. The You tab and the visual system: one accent, filter chips, squircle Captains, stock centered glass chrome,
   toasts.
9. Search as a tab palette.
10. A read-only PR list (in You and the Work view) and PR detail from Worker PR data, then the diff and Drive.

## Decisions (Zach, 2026-11-22)

- **D1. iOS 26 minimum: yes.** Delete the iOS 18 fallbacks and build on native `TabView`, the tab accessory,
  minimize-on-scroll, and glass.
- **D2. Retire the iPhone Inbox page: yes.** This reverses the 2026-09-12 ruling to match desktop. Unread stays a
  dot on rows. "Happening now" moves to Captain tiles, the crew pill, and Tasks.
- **D3. Turn trace: match desktop.** Chats are prose-only in every kind. Live work is the typing strip. Detail is
  a turn details sheet. Stop is Agent-scoped. The Capy-style trace lives only in the Worker view. See section 4.
- **D4. Tabs: Home · Projects · Tasks · You · Search.**
  - Home holds Captain tiles and the Ask anything accessory.
  - Projects gets its own tab.
  - Pull requests live in You and in the place's Work view, not in the tab bar.
- **D5. PRs: read-only first.** List and detail, plus Open in GitHub and Copy link. Merge, comment, and status wait
  until the read-only surface has shipped.
- **D6. Headers: stock centered iOS 26 inline titles** with glass circle buttons, as Capy does. Desktop keeps its
  left-aligned bands.
- **D7. Panes: Work button first, pager later.** A labeled Work button with a count opens Tasks, Workers, PRs, and
  Files for the place. The swipe and pinch pager comes after that works. Terminals and Side threads are out.

## Don't copy from Capy

- The skeleton loading on PR detail and General settings (1:01–1:10, 2:00).
- The "My threads" default that shows empty while delegated work runs (0:46).
- A child thread header that shows the Captain's name instead of the thread title (0:26).
- Coach-mark text that overlaps the transcript (0:26).
- Long prompts clipped with no expand control (0:26).
- The Terminals pane and the forked side-thread model.
- A More list with 25 or more rows covering referrals, review-bot config, and components.
- Low-contrast metadata, and toolbar icons with no labels.
