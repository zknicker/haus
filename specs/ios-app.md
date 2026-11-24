---
summary: The iPhone app contract. It covers the iOS 26 tab shell and router, the route table, the push route table, the Server lifecycle (switch, membership loss, sign-out, launch restore), the transcript layout per place, live work and turn details with roles, the Work view, read-only pull requests, and iPhone Duo layout.
read_when:
  - changing navigation, tabs, routes, deep links, or push routing in apps/ios-swift
  - changing how the iPhone app switches Servers or restores at launch
  - changing iPhone transcript layout, live work, turn details, the Work view, Workers, or pull requests
  - laying out iPhone screens for iPhone Duo
---

# iPhone app

The iPhone app (`apps/ios-swift`) is a native SwiftUI client of Haus Server.

- Server owns canonical state. The app caches it, shows it, and keeps optimistic sends local.
- This spec is the contract.
- [The rearchitecture plan](../docs/plans/ios-rearchitecture.md) orders the work, and
  [the Capy parity audit](../docs/plans/ios-capy-parity-audit.md) records the decisions.

## Platform

- **Minimum:** iOS 26. Chrome is stock: `TabView`, `NavigationStack`, toolbars, sheets with detents, and Liquid
  Glass.
- **Type:** Inter, the Haus brand font.
- **Composer:** custom, along with its attachment portal.
- **iPhone Duo:** builds with the iOS 27.1 SDK.

## Shell

- **The root is a `TabView`** with five tabs in this order:

  | Tab | Holds |
  | --- | --- |
  | **Home** | Captain tiles, Happening now, recent DMs, Open tasks |
  | **Projects** | Projects, `#all`, People, Archived |
  | **Tasks** | Tasks, filtered and grouped by state |
  | **You** | Profile, Server switcher, Automations, Drive, settings |
  | **Search** | `Tab(role: .search)` |

- **The tab bar:**
  - is icon-only, and the You tab shows the person's avatar
  - minimizes on scroll (`tabBarMinimizeBehavior`)
  - carries the "Ask anything" accessory (`tabViewBottomAccessory`), which starts a Task in a chosen Project with
    a chosen Captain
- **Chat routes:** on Channel, DM, Task, and Worker routes the tab bar and the accessory hide, and the composer owns
  the bottom edge.
- **Navigation:** each tab owns one `NavigationStack`. Interactive back restores the previous screen's scroll
  position.
- **Home:**
  - The `+` starts a new Captain, for Owners and Admins.
  - Captain tiles show a working badge from live activity and an unread dot for an unread DM. A stopped or
    away Captain's name dims. Long-press offers the profile and automations.
  - Below the tiles, Happening now lists running Workers.
  - Recent lists every unread Chat and every followed Task chat with unread messages, then the newest DMs.
  - Open tasks lists `task.listOpen`. An unread Task chat gets a dot there instead of a Recent row.
  - Every unread row offers Mark Read. The Inbox week card is retired.
  - A fresh Server shows its next steps above the tiles.
- **Projects:**
  - The `+` creates a Project.
  - The "Joined ⌄" chip narrows the list to unread Projects, and "+ Filter" narrows it to one Captain's Projects.
  - Each Project row shows its Captains and its open Task count, then `#all`, People (human DMs), and an
    "Archived N" row that opens the archived list with restore.
  - Long-press opens Project details or Project settings: name, key, repos and their Devices, and the default
    Worker place.

## Router

One `@Observable` router owns:

- the selected tab
- one route stack per tab
- at most one sheet

Every open goes through `router.open(_:)`: list taps, references, search results, deep links, and push taps. No view
holds its own navigation state.

### Routes

| Route | Opens in | Notes |
| --- | --- | --- |
| `captainDM(agentId)` | Home | The implicit DM resolves to its durable chat on first message. |
| `channel(chatId, messageId?)` | Projects | `#all` included. `messageId` reveals and highlights. |
| `dm(chatId, messageId?)` | Home | Human DMs. |
| `task(taskId, messageId?)` | Tasks | The Task's own chat. |
| `worker(workerId)` | the current tab | Pushed above its Task or place. |
| `pullRequest(reading)` | the current tab | Read-only. |
| `work(place)` | the current tab | Workers, Tasks, PRs, and Files for one place. |
| `driveFile(path)` | the current tab | Sandboxed preview for HTML. |
| `settings(SettingsRoute)` | You | |
| `projectSettings(projectId)` | Projects | A Project's name, key, repos, and default Worker place. |

A route opened from inside a tab pushes onto that tab's stack. A route opened from outside (push, deep link) selects
its tab and replaces that tab's stack with the route on top of the tab's root.

- **Tabs that cannot hold a route:** You holds only `settings` routes and the Drive it browses (`driveFile`), Search
  hosts its own palette, and `settings` lives only in You. Closing Search returns to the tab it was opened from. A route opened inside a tab that cannot hold it opens as from outside; a route with no tab of its
  own then lands in Home.
- **Sheets:** "Ask anything", New project, New Captain, Archived, chat details, and scoped chat search are the
  router's one sheet. Any open closes it.

## Push route table

| Payload (`packages/haus-api/src/push.ts`) | Tap opens |
| --- | --- |
| message, `conversation.kind: channel`, `taskId: null` | `channel(chatId, messageId)` |
| message, `conversation.kind: dm`, `taskId: null` | `dm(chatId, messageId)` (or `captainDM` for an Agent DM) |
| message, `taskId` set | `task(taskId, messageId)` |
| `task_assignment` | `task(taskId)` |
| `task_assignment_burst` | the Tasks tab, filtered to "Assigned to me" |

- **Another Server:** a payload for a Server other than the active one switches Servers first (see below), then
  routes. A Server the person no longer belongs to drops the tap and shows a notice.
- **Consuming the tap:** the app consumes the tap only once routing succeeds.
- **Cold launch:** the tap waits in a queue until the router mounts, then runs once.
- **Foreground pushes:** suppressed only for the chat that the selected tab's top route shows.

## Server lifecycle

- **Active Server:** the app persists `activeServerID`. It never derives the active Server from list order.
- **Launch snapshot:** keyed by Server. A cold launch paints the active Server's snapshot, never another Server's.
- **Switching Servers:** stop that Server's streams, drop its in-flight reads (late responses are ignored), then
  load the new Server's snapshot and streams. Each tab's stack resets to its root.
- **Membership loss:** clear the Server's snapshot and drafts, switch to another Server or the empty state, and say
  why.
- **Sign-out:** clear every Server's snapshot, drafts, and staged attachments.
- **Drafts and staged attachments:** keyed by Server and destination. A Worker follow-up is keyed by Worker id.
- **Read marks and push suppression:** only the selected tab's top route may mark a chat read or suppress its pushes.
  Mounted chats in other tabs never do.

## Places and transcripts

- **Transcripts are prose only** (`specs/chat-timeline.md`): no work groups, "Working for" rows, delegation lines,
  or placeholder rows.
- **Captain DMs and Task chats** use the assistant layout. The person's messages are right-aligned bubbles. The
  Captain's replies are full-width prose with no avatar and a copy control. Turns are separated by centered times.
- **Projects and `#all`** use roster rows: avatar, name, time, then the message. Inline replies, reactions, mentions,
  claims, and visuals render in every place.
- **Worker reports in a Task chat** are one centered muted line.

## Live work and turn details

- **Live work** shows in the chat header: dots and the glass thought pill under the centered identity. In a Project
  it names the working Captains.
- **Opening turn details:** tapping the header indicator, or a message's "View turn details" action, opens the turn
  details sheet (medium and large detents).
- **What the sheet shows, by role:**
  - **Everyone:** live steps from `agent.activeActivity` and `agent.onActivity`, reconciled by run id. The elapsed
    clock comes from `runStartedAt`. Settled turns come from `agent.turns`.
  - **Owners and Admins:** additionally `agent.executionOutlines` and the journal (`agent.executionJournal`,
    `agent.onExecutionJournal`). These subscribe only while the sheet is open.
- **Stop** is on the Captain (`agent.stop`), not in the composer. It appears in the Captain's menu in the DM header,
  on the profile, and on a tile long-press. A pending stop reads differently from a settled one.

## Work view and Workers

- **Work pill:** each place with work shows a floating pill above its composer (grid glyph, count, ⌃). It opens
  `work(place)`, which lists the place's running and finished Workers, Tasks, pull requests, and Files.
- **The Worker view** shows:
  - the place and harness
  - steps as a "Worked for…" chain that shimmers while live
  - "Finished, worked for…" separators
  - the newest report, cited files, and pull requests
  - a follow-up composer (`worker.sendFollowUp`), whose send becomes Stop Worker (`worker.stop`) while a turn runs
- **Keeping it live:** `worker.onUpdated`.

## Pull requests

- **Read-only.** Haus never acts on a pull request.
- **The list** groups readings as Ready, Waiting on checks, and Draft. It comes from the Worker and Task readings of
  the place.
- **The detail** shows:
  - the state, the branch (copy with a toast), and the diffstat
  - the checks and review rollups
  - the linked Task and Worker report
  - Open in GitHub and Copy link
- **Later:** bodies, diffs, and a Server-wide list wait for a Server read.

## Models

- **Model in a Captain DM's `…` menu**, with the current model under it, opens the Model sheet: searchable,
  grouped by model connection, with effort drill-in. It is not in the composer, because it sets the Captain's
  model everywhere, not this draft's.
- **What it writes:** the Captain's model (`agent.configure`), never a per-chat model.
- **Read-only:** for Members, or when configure is refused. Configure rotates the Captain's session.
- **Usage** reads `modelConnections.list` capacity windows.

## Loading and empty states

- Blank while loading. Show cached Server data during refresh and reconnect.
- An empty state appears only after a read has loaded and is truly empty.
- No skeletons.
- A fresh Server gives every role reachable next steps: New project, Connect a Device, New Captain. `agent.create`
  needs a home Project and a Device.

## iPhone Duo

Per Apple's [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo).
Layout follows size classes, never orientation.

- **Outer display** (compact width): in every pose, the tab bar, toolbar, and navigation controls sit in a column on
  the trailing edge, with Back or Close at the top. The accessory and composer stay at the bottom of the content.
- **Inner display, fully open** (regular × regular):
  - A narrower list pane leads, with its controls at the top of the pane. A wider content pane trails.
  - In landscape, controls sit on the trailing edge. In portrait, top and bottom bars return.
- **Half-open:**
  - Two equal panes either side of the reserved folding region: side by side like a book, or above and below on a
    surface.
  - No control crosses the fold. Custom chrome uses `ReservedRegion`.
- **Pose changes** keep drafts, scroll anchors, and the open sheet.
- **Routing at regular width:** Home, Projects, and Tasks split; You and Search keep their stacks.
  - The bottom of the tab's stack is the selection in the content pane, and the rest stacks over it. Folding and
    unfolding never rewrite a stack.
  - A conversation opened inside a split tab replaces the selection. Anything else stacks over it.
  - A Worker opened straight from its Task sits in an equal pane beside the Task, and the list steps aside. That
    Task is the visible conversation.
