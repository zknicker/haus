---
summary: The iPhone app contract. It covers the iOS 26 tab shell and router, the route table, the push route table, the Server lifecycle (switch, membership loss, sign-out, launch restore), Tasks as agent sessions and the shared Captain chat (ADR 0062), the transcript layout per place, live work and turn details with roles, the Work view, read-only pull requests, and iPhone Duo layout.
read_when:
  - changing navigation, tabs, routes, deep links, or push routing in apps/ios-swift
  - changing how the iPhone app switches Servers or restores at launch
  - changing how the iPhone lists, starts, opens, archives, or messages Tasks, or opens a Captain chat
  - changing iPhone transcript layout, live work, turn details, the Work view, or pull requests
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
  | **Home** | Captain tiles, Recent, the active Tasks |
  | **Projects** | Projects, `#all`, People, Archived |
  | **Tasks** | My tasks, All tasks, Archived, grouped by activity |
  | **You** | Profile, Server switcher, Automations, Drive, settings |
  | **Search** | `Tab(role: .search)` |

- **The tab bar:**
  - is icon-only, and the You tab shows the person's avatar
  - minimizes on scroll (`tabBarMinimizeBehavior`)
  - carries the "Ask anything" accessory (`tabViewBottomAccessory`). Like the web App's Home composer, it starts a
    Task (`task.start`) in a chosen Project, on a chosen Machine (the Project's default Machine first) with a chosen
    model. The text is the Task's first message, and a retried send reuses the draft's request id.
- **Chat routes:** on Channel, DM, Captain chat, and Task routes the tab bar and the accessory hide, and the
  composer owns the bottom edge.
- **Navigation:** each tab owns one `NavigationStack`. Interactive back restores the previous screen's scroll
  position.
- **Home:**
  - The `+` starts a new Captain, for Owners and Admins.
  - Captain tiles open the Captain chat. They show a working badge from live activity and an unread dot while the
    Captain chat is unread. A stopped or away Captain's name dims. Long-press offers the profile and automations.
  - Recent lists every unread Chat and every followed Task chat with unread messages, then the newest DMs and the
    Captain chats the person joined (`captainChat.member`).
  - Tasks lists `task.listActive`: each row's activity disc, its title, who started it (a Captain for crew, else
    the person) and its activity. An unread Task chat gets a dot there instead of a Recent row.
  - Every unread row offers Mark Read. The Inbox week card is retired.
  - A fresh Server shows its next steps above the tiles.
- **Projects:**
  - The `+` creates a Project.
  - The "Joined ⌄" chip narrows the list to unread Projects, and "+ Filter" narrows it to one Captain's Projects.
  - Each Project row shows its Captains and its active Task count, then `#all`, People (human DMs), and an
    "Archived N" row that opens the archived list with restore.
  - Long-press opens Project details or Project settings: name, key, and the default Machine for its Tasks
    (`project.setDefaultMachine`).
- **Tasks** ([ADR 0062](../docs/adr/0062-tasks-are-agent-sessions-issues-are-the-backlog.md)):
  - A Task is an agent session with its own chat. It has a title and an 8-character short id, is active or
    archived, and has an activity: Needs you, Working, Waiting, Failed, or Idle, with the web App's words.
  - The tab's chips are the web Tasks page's: My tasks (active Tasks the person started), All tasks, and Archived
    (`task.list` with `archived`). Active lists group by activity, Needs you first; Archived lists flat. Rows are
    newest first, with the Project, `Machine · model`, and age. The `+` opens "Ask anything".
  - The Task chat's header shows the activity disc, the title, and the activity. Its `…` menu renames
    (`task.update`), copies the `[title](task://id)` reference, follows or stops following, and archives or
    restores (`task.archive`, `task.unarchive`, which starts no turn). A message sent there reaches the Task as
    steer, `chat.send`'s default, and a message to an archived Task unarchives it.
  - A Task with no chat is history from before Tasks were places. It opens read-only.
- **Issues** have no iPhone screen. An Issue push opens Home on its Server, a bare `GEN-12` stays text, and an Issue
  turn trigger decodes for turn details.

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
| `captain(agentId, messageId?)` | Home | The Captain's one shared chat, the web App's `/captain/<agentId>`. It resolves through `chat.list` (`kind: captain`); before that lists it, the first send names the Captain (`targetKind: captain`). |
| `channel(chatId, messageId?)` | Projects | `#all` included. `messageId` reveals and highlights. |
| `dm(chatId, messageId?)` | Home | Person-to-person DMs. |
| `task(taskId, messageId?)` | Tasks | The Task's own chat. |
| `pullRequest(reading)` | the current tab | Read-only. |
| `work(place)` | the current tab | Pull requests and Files for one place. |
| `driveFile(path)` | the current tab | Sandboxed preview for HTML. |
| `settings(SettingsRoute)` | You | |
| `projectSettings(projectId)` | Projects | A Project's name, key, and default Machine. |

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
| message, `conversation.kind: dm`, `taskId: null` | `dm(chatId, messageId)` |
| message, `conversation.kind: captain`, `taskId: null` | `captain(agentId, messageId)`, the Captain read from `chat.list`; `dm(chatId, messageId)` while the list does not hold the chat yet |
| message, `taskId` set | `task(taskId, messageId)` |
| `issue_assignment`, `issue_comment` | Home at its root, on the push's Server |

- **Another Server:** a payload for a Server other than the active one switches Servers first (see below), then
  routes. A Server the person no longer belongs to drops the tap and shows a notice.
- **Consuming the tap:** the app consumes the tap only once routing succeeds.
- **Cold launch:** the tap waits in a queue until the router mounts, then runs once.
- **Foreground pushes:** suppressed only for the chats on screen: the selected tab's top route, and
  in Task mode the conversation beside the Task.

## Server lifecycle

- **Active Server:** the app persists `activeServerID`. It never derives the active Server from list order.
- **Launch snapshot:** keyed by Server. A cold launch paints the active Server's snapshot, never another Server's.
- **Switching Servers:** stop that Server's streams, drop its in-flight reads (late responses are ignored), then
  load the new Server's snapshot and streams. Each tab's stack resets to its root.
- **Membership loss:** clear the Server's snapshot and drafts, switch to another Server or the empty state, and say
  why.
- **Sign-out:** clear every Server's snapshot, drafts, and staged attachments.
- **Drafts and staged attachments:** keyed by Server and destination: a Chat id, or a Task id before its chat is
  known.
- **Read marks and push suppression:** only the chats on screen may mark read or suppress their pushes: the
  selected tab's top route, and in Task mode the conversation under the Task too.
  Mounted chats in other tabs never do.

## Places and transcripts

- **Transcripts are prose only** (`specs/chat-timeline.md`): no work groups, "Working for" rows, delegation lines,
  or placeholder rows.
- **Captain chats and Task chats** use the assistant layout. The person's messages are right-aligned bubbles. The
  agent's replies are full-width prose with no avatar and a copy control. Turns are separated by centered times.
- **Projects and `#all`** use roster rows: avatar, name, time, then the message. Inline replies, reactions, mentions,
  claims, and visuals render in every place.
- **Task references:** a `[title](task://id)` link is a chip with the Tasks glyph and its own words. A Task under
  the message it started from shows a preview card: its disc (active or archived), title, message count, unread,
  and newest messages.

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
- **Stop** is on the Captain (`agent.stop`), not in the composer. It appears in the Captain's menu in the Captain
  chat header, on the profile, and on a tile long-press. A pending stop reads differently from a settled one.

## Work view

- **Work pill:** each place with open pull requests shows a floating pill above its composer (grid glyph, count, ⌃).
  It opens `work(place)`, which lists the place's pull requests and Files under All, Pull requests, and Files.
- **A place's pull requests** are the readings of its Tasks (`task.get`): a Task's own, or for a Chat the Tasks
  started from it and, in a Captain chat, that Captain's crew.

## Pull requests

- **Read-only.** Haus never acts on a pull request.
- **The list** groups readings as Ready, Waiting on checks, and Draft.
- **The detail** shows:
  - the Captain whose crew opened it, and when Haus last read it
  - the state, the review, and the diffstat
  - the checks rollup
  - the Task it came from
  - Open in GitHub and Copy link
- **Later:** bodies, diffs, and a Server-wide list wait for a Server read.

## Models

- **Model in a Captain chat's `…` menu**, with the current model under it, opens the Model sheet: searchable,
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
Layout follows size classes and the system's bar placement, never orientation or screen bounds.
[The Duo layout plan](../docs/plans/ios-duo-layout.md) builds it.

- **Bars:**
  - Wherever the system lays bars out vertically, the stock tab bar and toolbars sit in the trailing rail as glass
    capsules, with Back or Close at the top. That covers the outer display in every pose, the inner display in
    landscape, and Split View.
  - At regular width the stock bars are used in every orientation, below iOS 27.1 too (an iPhone Plus or Pro Max
    in landscape).
  - `HausBottomChrome` is drawn only on compact displays with horizontal bars.
  - Nothing Haus draws spans more than one pane.
- **Ask anything:** on vertical bars and at regular width, it is the list column's compose button.
- **Toolbar items** carry a title and a symbol. A detail column's items share one capsule. Search lives only in
  the Search tab.
- **Inner display, fully open** (regular × regular):
  - A list column leads and a detail column trails. The list column is flush with the screen edges, its controls
    sit at its top, and the detail column owns its composer.
  - Dragging the list column's edge snaps it to full width, a 76 pt icon rail of recent conversations, or hidden.
- **Task mode:**
  - A Task opened from its card in a conversation opens beside that conversation. The two get equal panes meeting
    at the fold, and the list steps aside to the rail.
  - The conversation's composer gets a target chip for that Task, inside the pill after the plus, and sends to it
    as steer. The chip's × sends to the conversation again.
  - The chip and an inline reply never share the composer: choosing Reply lets go of the chip, and opening the
    Task from its card again drops the reply.
  - A file opened from the Task pane opens in a sheet over both panes. Anything else that stacks (Work, a file
    or pull request link) closes the Task and stacks over its conversation.
  - The toolbar holds the Task's More menu, and Close is at the top of the Task pane. There is no Stop, as on the
    web App. Interrupting a Task is a later delivery choice in the composer (Steer, Queue, Interrupt).
  - The Task pane shows who started it, its activity, its title, then Activity (its turn details) and Files (the
    files its agent created). It has no composer.
  - Closing the Task returns to the conversation and the list column it had. A Task from the Tasks list or a link
    replaces the selection instead.
- **Half-open:**
  - Two equal panes either side of the reserved folding region: side by side like a book, or above and below on a
    surface.
  - Like a book with no Task open, the full list reaches the fold and the detail starts past it.
  - No control comes within 28 pt of the fold. Custom chrome uses `ReservedRegion`.
- **Task mode follows the fold's orientation:** beside its conversation where the fold runs top to bottom, below it
  where the fold runs across (inner portrait). Fully open the two meet at the fold, so half opening moves nothing but
  the clearance. With no fold they split evenly side by side.
- **Closing the Duo** with a Task open beside its conversation shows the Task on the outer display, and Back returns
  to the conversation. The stack never changes.
- **Pose changes** keep the selection, drafts and their targets, scroll anchors, the focused composer, and the open
  sheet. Focus follows the draft: folding a chip composer leaves the keyboard on the Task chat.
- **Keyboard:** the focused composer rides it, and with bars vertical the toolbar keeps its items while the tab bar
  compresses. The mention card stands on the composer.
- **Routing at regular width:** every tab splits.
  - The bottom of the tab's stack is the selection in the detail column, and the rest stacks over it. Folding and
    unfolding never rewrite a stack.
  - A conversation opened inside a split tab replaces the selection. Anything else stacks over it.
  - A Task opened from its card in the conversation directly beneath it becomes the side pane.
