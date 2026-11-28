---
summary: Build plan for Haus on iPhone Duo, from the design Zach accepted on 2026-11-27. Stock tab bars and toolbars move into the trailing rail, every tab becomes list | detail, the list column can be dragged down to an icon rail, and a Task opened from its card splits the screen at the fold with one composer. It lists the decisions, slices D0 to D5 with the router, chrome and header changes each needs, the 27.1-SDK API signatures confirmed in D0, and verification by pose.
read_when:
  - building or reviewing any iPhone Duo layout, pose, or fold behavior in apps/ios-swift
  - changing the iPhone tab shell, HausBottomChrome, Ask anything, ChatScreenHeader, or toolbar placement at regular width or on vertical bars
  - changing TabPanes, RouteOrigin, AdaptiveSplitView, the list column width, or the icon rail
  - opening a Task beside its conversation, or the composer's target chip
---

# iPhone Duo layout plan

This plan builds Haus for iPhone Duo. It replaces D1 to D3 in
[Phase 5 of the rearchitecture plan](ios-rearchitecture.md#phase-5-iphone-duo-after-s1b-builds-with-the-ios-271-sdk),
and [specs/ios-app.md](../../specs/ios-app.md#iphone-duo) holds the contract.

- **Design reference:** the "Haus on iPhone Duo" canvas (https://claude.ai/artifact/FpMwyTsWnnxS1tRJz6dTyn). Build
  from its "Council pick" rows. The four options above them are history. The mocks show Tasks with Issue-style keys
  (JOYH-2), but Tasks have no key, so read them as the Task's title.
- **Apple guidance:**
  - The [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo) HIG page.
  - The Tech Talks "Prepare your app for iPhone Duo" and
    ["Raise the bar with iPhone Duo"](https://developer.apple.com/videos/play/tech-talks/111462/).

## Why

On the Duo's inner display, today's app draws phone chrome across both panes:

- The custom bottom tab bar and the Ask anything bar each span the whole screen.
- The open chat has no composer of its own.
- The trailing rail, where the Duo puts bars in landscape, sits empty.

In Zach's recording, Claude, ChatGPT and Grok on the same device each keep a list column, a detail column with its
own composer, and their toolbar buttons in the trailing rail.

## Decisions

- **Stock bars.** The system draws its tab bar and toolbars as glass capsules in the trailing rail wherever it lays
  bars out vertically: the outer display in every pose, the inner display in landscape, and Split View.
  - At regular width Haus uses the stock bars in every orientation. In inner portrait the system draws them
    horizontally.
  - `HausBottomChrome` stays only where bars are horizontal at compact width, which means regular iPhones.
  - The system ignores custom bar content, so nothing custom goes in the rail.
- **Ask anything.** When bars are vertical or the width is regular, Ask anything is the list column header's compose
  button. It presents the same `.askAnything` sheet, and no accessory bar sits under the panes.
- **Chat header.** `ChatScreenHeader`'s identity (mark, name, live-work pill) stays at the top of the detail column,
  leading-aligned.
  - Its actions become `ToolbarItem`s, each with a `Label` (title and symbol), and the system draws them in the rail
    as one capsule.
  - Per screen:
    - Captain chat: Call, More.
    - Project: Files, More.
    - A Task beside its conversation: the Task's More. There is no Stop, as on the web App. Interrupting is a
      later delivery choice (Steer, Queue, Interrupt) in the composer.
    - Search hit: Jump to latest, More.
  - Scoped chat search moves into More.
- **Every tab splits at regular width.**
  - You: the settings list leads, and a row's screen fills the detail column.
  - Search: hits open in the detail column, scrolled to the match.
- **List column.** It starts from today's `AdaptiveSplitView` widths (min 270, ideal 330, max 360) and is flush with
  the screen edges. It is never a floating card.
- **Icon rail.** Dragging the list column's edge snaps it to full width, a 76 pt rail, or hidden.
  - The rail shows compose at the top and expand at the bottom.
  - Between them it lists recent conversations as Captain marks and Project `#` tiles. Unread is an accent dot, and
    a Captain or Task at work gets a green dot.
  - The selected item gets a tinted tile and a 4 pt leading indicator.
- **Task mode.** Tapping a Task's card in a conversation opens the Task beside that conversation.
  - The two take equal panes meeting at the fold: the conversation leads and the Task trails.
  - The list column steps aside to the rail.
  - The Worker side pane it replaces is already deleted, with its `TabPanes` and `AdaptiveSplitView` plumbing.
- **One composer.** In Task mode, the conversation's composer shows a target chip for the open Task inside the pill,
  after the plus: its activity glyph, its title (truncated) and ×.
  - Words sent with the chip go to the Task's chat as steer (ADR 0062).
  - × points the composer back at the conversation.
  - The Task pane has no composer of its own.
- **Task pane.**
  - Its header shows whoever started the Task (a Captain or a person), the title, the activity status, and Close.
  - Below the header are Activity and Files.
  - The detail column has one vertical bar for the whole column, so the pane's own controls stay in the pane.
- **Fold clearance.** No control sits within 28 pt of the fold when the Duo is half open. That number is Haus's
  choice, not Apple's.
- **Selection.** One treatment everywhere: a `systemFill`-tinted row with 12 pt corners, in lists, settings and the
  rail. No row is accent-filled.
- **Status copy.** A Task shows its ADR 0062 activity status: Working, Waiting, Idle, Failed, or Needs you.
- **Themes.** The mocks are dark-first. Light and dark both ship from the existing tokens.

## Slices, in order

Each slice is one PR. D0 to D3 can land before ADR 0062's iPhone work. D4 and D5 need its Task chats on main.

### D0. Build with the 27.1 SDK

- Local and Simulator builds use Xcode 27.1 (`DEVELOPER_DIR` or `xcode-select`), matching the release workflow's
  `Xcode_27.1.app`.
- Set `project.yml`'s `xcodeVersion` to 27.1. It is XcodeGen compatibility only and does not pick the SDK.
- Keep the iOS 26.0 deployment target. Gate every Duo API with `#available(iOS 27.1, *)` (the visibility priority
  needs only 27.0), and fall back below it to today's size-class behavior.
- Building with the 27.1 SDK ends letterboxing. The app doesn't set `UIRequiresFullScreen`, which would bring it
  back, so keep it unset.
- **Done (2026-11-27).** The app target built clean with Xcode 27.2 (27B52, iOS 27.2 SDK, Swift 6.4.2) for the
  iPhone Duo (iOS 27.2) and iPhone 17 Pro (iOS 26.3) Simulators. Nothing needed a code change; the new SDK adds
  warnings only. `xcodeVersion` is 27.1.
- **Confirmed in the iOS 27.2 SDK's `.swiftinterface` files and UIKit headers.** `anyAppleOS 27.1` means iOS 27.1.

  | API | Exact declaration | Available |
  | --- | --- | --- |
  | `EnvironmentValues.toolbarVerticalEdge` | `var toolbarVerticalEdge: HorizontalEdge? { get }` (SwiftUICore) | iOS 27.1 |
  | `View.toolbarVerticalBehavior(_:)` | takes `ToolbarVerticalBehavior`: `.automatic`, `.disabled` | iOS 27.1 |
  | `View.toolbarVerticalCompressionBehavior(_:)` | takes `ToolbarVerticalCompressionBehavior`: `.automatic`, `.prefersToolbarItems`, `.prefersTabBar` | iOS 27.1 |
  | `ToolbarItemVisibilityPriority` | `.automatic`, `.low`, `.high`, `init(lowerThan:)`, `init(higherThan:)`, `Comparable`; applied with `ToolbarContent.visibilityPriority(_:)` | iOS 27.0 |
  | `ToolbarContent.axisBehavior(_:)` | takes `ToolbarItemAxisBehavior`: `.automatic`, `.horizontalOnly`, `.verticalPreferred` | iOS 27.1 |
  | `GeometryProxy.reservedRegions` | `func reservedRegions(kind: ReservedRegion.Kind, options: ReservedRegion.QueryOptions = [], layoutDirectionBehavior: LayoutDirectionBehavior = .mirrors) -> [ReservedRegion]` | iOS 27.1 |
  | `ReservedRegion` | `id`, `kind` (`.occlusion`, `.division`), `frame: CGRect`, `margins: EdgeInsets`, `isActive: Bool`; `QueryOptions.includeInactive` | iOS 27.1 |
  | `ArrangementView` | `init(primary:secondary:)`, styled by `.arrangementViewStyle(_:)`: `.automatic`, `.split` (`.axes(_:)`), `.overlay` | iOS 27.1 |
  | `View.onHingeChange` | `func onHingeChange(isEnabled: Bool = true, _ action: @escaping (_ oldContext: DeviceHingeContext, _ newContext: DeviceHingeContext) -> Void)` | iOS 27.1 |
  | `DeviceHinge` | `status` (`.closed`, `.partiallyOpen`, `.fullyOpen`), `angle: Angle`; `DeviceHingeContext.hinge: DeviceHinge?` | iOS 27.1 |
  | UIKit `UITraitCollection.verticalBarEdge` | `UIVerticalBarEdge` (`.unspecified`, `.leading`, `.trailing`), not optional; `systemTraitsAffectingVerticalBarEdge` | iOS 27.1 |
  | UIKit bar behavior | `UIViewController.preferredVerticalBarBehavior` (`.automatic`, `.disabled`), `UINavigationItem.verticalBarCompressionBehavior` (`.prefersBarItems`, `.prefersTabBar`) | iOS 27.1 |

- **What the interfaces don't say.** They don't state that the division region is empty when the Duo is fully
  open or closed. A region carries `isActive`, and inactive regions come back only with `.includeInactive`, so
  query with the default options. They also don't carry the rule that `ArrangementView` stays out of
  `NavigationSplitView`, `List` and `ScrollView`; that rule comes from Apple's documentation. `DeviceHinge`
  has no pose type: its `status` is the pose.
- **Tab bar hiding: answered for the outer display.** Each tab root sets `.toolbar(.hidden, for: .tabBar)`. With
  the Duo closed, the outer display's rail shows the status bar, the camera and Home's `+`, and no tab bar. The
  system had already moved the navigation bar's trailing `+` into the rail without any code change.
  `HausBottomChrome` stays in the content column and ends at the rail. On the open inner display in landscape the
  rail likewise shows only the status items, and `HausBottomChrome` spans both panes. `.toolbar(_:for:)` is
  soft-deprecated in favor of `toolbarVisibility(_:for:)` (iOS 18) and doesn't warn.
- **Column resizing: the system does it.** Neither SwiftUI nor `UISplitViewController` gains a column-resize API in
  27.x, but on the open inner display a drag on the list column's edge resizes it. Dragging left from 320 pt
  stopped at the column's `min` (about 280 pt with today's widths), and dragging on toward the edge neither went
  past `min` nor hid the column. So the system drag can't reach the rail or hidden states by itself.
- **Proof.** The app runs edge to edge on the iPhone Duo Simulator's outer display (closed, 1398 × 2034 px),
  signed in against the local dev Server, with no letterbox bars. `simctl io screenshot` on the Duo needs
  `--display=1` for the outer display or `--display=3` for the inner one (2007 × 2853 px).

### D1. Stock bars and the chat toolbar

- `AuthenticatedHausView+Tabs.swift`: give each `Tab` its title and symbol: Home, Projects, Tasks, You (the
  viewer's photo), Search.
  - Where `toolbarVerticalEdge` is non-nil or the width is regular, drop `.toolbar(.hidden, for: .tabBar)` and the
    `HausBottomChrome` overlay, and let the `TabView` draw its own bar.
- `AuthenticatedHausView+Destinations.swift`: on those displays, stop hiding the tab bar on every route, and stop
  applying `.hausHiddenNavigationBar()` to chats.
- `ChatScreenHeader`: on those displays, keep the identity and live-work pill in the column and move Back, Call,
  More and scoped search into `ToolbarItem`s. On compact horizontal displays it stays as it is.
- Ask anything moves into the list header's compose button on those displays.
- `HausRouter.showsTabBar` keeps its rule. On the outer display, a pushed screen hides the tab bar and Back sits at
  the top of the rail.
- Proof: in every pose, no Haus bar spans more than one pane, and the outer display shows the system rail.
- **Built (2026-11-27).**
  - `ShellChrome` (`HausUI/Adaptive/ShellChrome.swift`) holds the decision: stock when bars are vertical or the
    width is regular, custom otherwise. Below iOS 27.1 bars are never vertical, so the size class alone decides:
    an iPhone Plus or Pro Max on iOS 26 turned to landscape is regular width and splits under stock bars. It had
    been always custom there, which floated the bottom chrome over the split's composer and hid the bars that
    bring a hidden list back. The shell passes it down as `\.shellChrome`.
  - Back is the system's own back button, not a Haus `ToolbarItem`: with the navigation bar shown, the system
    draws it. A Chat that is a split selection has none.
  - The compose button is on Home and Projects. Tasks keeps its `+`, which already presents Ask anything. You gets
    none until D2 gives it a list column.
  - On the open inner display in landscape the list column's toolbar stays at the top of the column (title
    leading, compose and `+` in one capsule), and the tab bar is one glass capsule at the bottom of the rail.
  - With stock chrome the Chat route and both transcripts ignore only the vertical safe area, so they end at the
    rail. Horizontal padding didn't work: the transcript's own `ignoresSafeArea()` ran past it.
  - A pushed screen's `toolbarVisibility(.hidden, for: .tabBar)` doesn't hide the tab bar in the rail. Each tab's
    content sets the visibility from `HausRouter.showsTabBar` instead.

### D2. Every tab splits

- `TabPanes.swift`: `splitsWhenWide` returns true for every tab.
- `AuthenticatedHausView+Tabs.swift`: You and Search go through `adaptiveStack` like the other tabs.
- You:
  - In `HausRouter`, a `.settings` route on You replaces the split selection, the way a conversation does.
  - In `RouteScreen`, `.settings` gets its own screen kind, so the detail column draws it instead of a blank pane.
  - With nothing selected, the detail column shows General.
- Search:
  - `canStack` lets Search hold the conversation routes its hits open.
  - `AuthenticatedHausView+Roots.swift` opens a hit `.inside` at regular width, so the hit replaces the selection
    instead of switching tabs.
  - The hit's conversation opens scrolled to the match, and the match is banded.
- Proof: each tab matches its "Every tab" board, and folding never rewrites a stack. Router tests cover both
  splits.
- **Built (2026-11-27).**
  - Every tab splitting made `splitsWhenWide` always true, so it is gone: the split follows `TabLayout` alone.
    `HausRouter.selects` holds the replace-the-selection rule per tab, and `HausTab.emptySelection` gives You
    General before anything is selected.
  - On You the hub's Drive row selects too: Drive's root `.driveFile(path: "")` replaces the selection like a
    settings row, and folders opened inside it stack.
  - `RouteScreen.none` is gone: `.settings` was its only route.
  - The list column and the detail column are two `SettingsSheet` instances. The hub highlights its selected
    row and selects instead of pushing; the detail's `root` screen draws everything it pushes, so the screens
    over a selection share one saved-profile overlay and one set of avatar sessions, as on a compact stack.
  - Search holds every route but settings, so a hit's Work or file stacks over it beside the list. An outside
    open with no tab of its own never lands in Search, and compact Search still opens hits from outside.
  - Projects, Tasks, You and Search lists mark the selection with `listSelection`. Home's list does too, from D4.
  - Proof: router tests in `HausRouterSplitTabsTests` and `HausRouterPanesTests`; Duo inner-display screenshots
    of You (General and Captains), Search with a hit banded, Projects and Tasks; iPhone 17 Pro You and Search
    unchanged.

### D3. The icon rail

- `AdaptiveSplitView` gains a column state: full, rail or hidden.
  - Full uses today's widths. Rail sets the column to a fixed 76 pt. Hidden uses `.detailOnly`.
  - The system already resizes the column by drag, clamped to `min` (D0). First try lowering `min` to 76 pt and
    snapping the settled width: above 160 pt stays full, below it snaps to rail. Hidden comes from the system's
    sidebar button. If the settled width can't be observed reliably, use a 12 pt drag handle on the column's edge
    instead: releasing below 160 pt snaps to rail, and below 40 pt hides the column.
- Each tab's root renders as a rail in that state:
  - Home: recent conversations.
  - Projects: Project tiles.
  - Tasks: Task activity glyphs.
  - You: settings symbols.
  - Search: no rail state, so its column is full or hidden.
- The column state is remembered per Server, beside the launch snapshot.
- Proof: dragging reaches all three states, and the rail's selection matches the detail column.
- **Built (2026-11-27).**
  - Shipped the 12 pt drag handle, not the system drag. The system never draws its column narrower
    than 280 pt on the open inner display: with `min` at 76 pt, and even with a fixed
    `navigationSplitViewColumnWidth(76)` from the first frame, the column measured 280 pt
    (`onGeometryChange` on a column-filling frame), and `ideal` is ignored the same way. So the
    system drag can never cross 160 pt, and its column can't be the rail.
  - The system's column holds only the full list (`.all`). For the rail and hidden it is
    `.detailOnly`, and the rail is Haus content leading the whole split in an `HStack`, with a
    hairline on its edge. Inside the detail column the rail sat under that column's bar, which
    spans the column: a pushed screen's Back and the Task title landed over the rail. The split
    keeps its place in the `HStack`, so toggling the rail never remounts it. `ListColumnHandle` sits on the full list's and the rail's trailing edge;
    its grabber follows the finger, and letting go snaps by where the edge lands
    (`ListColumnLayout.released`): under 40 pt hidden, under 160 pt the rail, else the full list.
    The handle carries VoiceOver actions for the three states. The system's own drag still resizes
    the full list between 280 and 360 pt. Whether the handle and that drag share the edge without a
    fight is unproved: the Simulator here can't drag.
  - Hidden also comes from the system sidebar button, which stands beside the full list and over a
    hidden column; showing it brings back the full list. On the rail the system button is removed
    (`toolbar(removing:)`), since the rail's bottom button does the same and the system one added
    a toolbar row over the detail.
  - The rail's Show list makes the same choice as the handle (`\.revealListColumn`, set by the split).
    Beside a Task it brings back the full list for that Task alone, as a drag does, and never writes
    the stored column. It had written `.full` to the stored column, which Task mode ignored.
  - `ListColumn` (HausModels) is the state, `ListColumnPreference` (HausAppModel) keeps it per
    Server in `UserDefaults` per user, owned by `ServerLifecycle` beside the launch snapshots and
    cleared with them. It never reaches Server.
  - Rails: `ListRail` over `ListRails` items built from rows the lists already draw. Home lists
    Recent (people show their avatar, Tasks their disc), Projects its Projects in list order with
    `#all` last, Tasks the current view's Tasks as discs, You its selecting settings rows (not
    Appearance or the app icon, which change in place). Compose is the Ask anything sheet on Home,
    Projects and Tasks; You has none. Unread wins over the green work dot.
  - Headers: the list column title is the system's large title, which the Duo draws bold and
    leading in the toolbar row. A custom 26 pt title item pushed compose and `+` into an overflow
    menu at 280 pt. The Task chat's identity moves to `.topBarLeading`, leading-aligned, under
    stock bars, and its navigation title is empty there, since the system drew the title a second
    time and squeezed the identity. `toolbar(removing: .title)` crashed the Task screen on iOS 27.2
    (EXC_BAD_ACCESS copying its `AlertModifier`), so it isn't used. Compact iPhones keep both centered titles.
  - Proof: `ListColumnLayoutTests`, `ListRailsTests`, `ListColumnPreferenceTests` and the lifecycle
    tests; Duo inner-display screenshots of each state forced by a temporary launch argument.

### D4. Task mode

- `HausRoute.swift`: add a `RouteOrigin` case for a Task card.
  - `HausRouter.open` with that origin pushes the `.task` route over the current conversation instead of replacing
    the selection.
  - A Task opened from the Tasks list or a link still becomes the selection.
- `TabPanes`: add the side pane back. A `.task` directly over a conversation route (`.captain`, `.dm`, `.channel`)
  is the side pane.
- `AdaptiveSplitView`: add a side pane; with one, the column state becomes rail.
  - The detail column lays the conversation and the Task out in an `HStack`. Under 27.1 the two panes meet at
    the `reservedRegions(kind: .division)` fold when it is present, and split evenly otherwise.
- `HausRouter.visibleConversation` becomes a set: the conversation and the Task are both visible, for mark-read and
  push suppression.
- Composer: add the target chip. A draft is kept per target. Sending posts to the Task's chat.
- Task pane:
  - Activity reads the Task's turn details.
  - Files reads the files the Task wrote.
  - If either read doesn't exist on the Server when D4 starts, add it under `apps/server/src/haus-api/task/` in the
    same slice.
- Toolbar: the Task's More only. Stop was dropped after review (see the D4 notes).
- Proof: the canvas's Task-open, rail-with-Task and half-open boards reproduce. Closing the Task returns to the
  conversation and the column state it had.
- **Built (2026-11-27).**
  - `RouteOrigin.taskCard`: a Task's preview card opens through `InAppReferenceRoutes.openTaskCard` and pushes
    the Task over the conversation on top. In a split, a Task already beside that conversation gives way to the
    new one. On compact iPhones the card push is the same full-screen Task chat as before.
  - `TabPanes.split(selection:stack:side:)`: `side` is a `.task` directly over a `.captain`, `.dm` or `.channel`
    (`HausRouter.sidePane(in:)`). `closeSidePane` pops it, and a write of the conversation's stack drops it.
  - `HausRouter.visibleConversations` is a set. It feeds `HausStore.openChatIDs`, which replaces `openChatID`
    and `canvasChatID` (they always held the same Chat), `PushNotifications.viewingChatIDs` and
    `DeliveredPushCleanup.identifiers(_:openedChatIDs:)`. `OpenChatPages` is gone.
  - Column: `AdaptiveSplitView(besideTask:)` shows `TaskModeColumn`, which is the rail (hidden on Search) until the
    Task closes. It never writes the stored `ListColumn`, so closing restores the old state.
  - Panes: `TaskModeSplit` lays out conversation | Task in an `HStack`. `TaskModePanes` splits them evenly, or
    meets at a top-to-bottom division region from `reservedRegions(kind: .division)` (default options, so only
    an active fold) with 28 pt of padding on each pane's fold edge. That is how fold clearance is met. Half open
    is unproved, because this pose can't be set from here.
  - One composer: `ComposerDraftStore.target` sends the conversation's composer to the Task's own draft
    (`.task(id)`). Sends go to the Task's chat through `chat.send`, whose `delivery` defaults to `steer`, and
    the Server passes it only to the Task chat's recipient (`enqueue-recipients.ts`). The chip's × calls
    `release`, and the card calls `aim` to bring the chip back. The placeholder reads "Steer the Task".
  - The chip sits inside the pill, as the mock draws it. The plus and the chip are one leading control
    (`ComposerLeadingControls`), the field's width is measured from them, and in the card they lead the controls
    row. The chip's title stops at 110 pt. `submit` moved to `MessageComposerView+Send.swift` to make room. The
    first build floated the chip over the transcript, which let message text show around it.
  - The chip and an inline reply never share the composer. Choosing Reply on a message lets go of the chip, so
    the reply goes to the conversation; aiming at the Task again (its card) drops the reply. Before, a reply
    picked with the chip up sent the Task's draft into the conversation as a reply (`ChatScreenView+Reply.swift`).
  - Opens in Task mode: a file from the Task pane's Files opens in a router sheet (`HausSheet.driveFile`), so
    both panes stay. Anything else that stacks (Work, a file chip, a pull request) closes the Task and stacks
    over its conversation, so Back returns to the conversation alone. Before, the route stacked over the Task,
    which left the Task trapped full screen in the detail stack.
  - Closing: the Task pane leaves from the frame it had open (`TaskModePanes.placements`), instead of snapping to
    the column's center while it fades.
  - The pane is blank until the Task's record loads (`TaskPaneAgent.loading`). "No activity yet." and "No files
    yet." show only for a loaded Task with no agent.
  - Toolbar: `taskModeChrome` swaps the conversation's items (`\.chatHeaderYieldsToolbar`) for the Task's More
    menu.
    - The first build also had Stop, through `agent.stop`. Review dropped it: the web App has no Stop for a
      Task, and `agent.stop` leaves the Task's agent stopped until an admin restarts it.
    - Interrupting stays a later feature, the web App's delivery choice (Steer, Queue, Interrupt).
  - Launch: the shell's chrome resolves before the first frame. `ShellChromeScope` builds `AuthenticatedHausView`
    with `ShellChrome` read from `toolbarVerticalEdge` and the size class. Before, an `onChange` set it after the
    first frame, so `HausBottomChrome` faded in on the Duo before the stock bars took over. Regular iPhones still
    get custom chrome from the first frame.
  - List header: the full list column always removes the system sidebar toggle. At 280 pt the toggle, compose
    and `+` truncated "Projects". The handle and the rail collapse the list, and the system button still shows
    over a hidden column.
  - Pane: `TaskPaneView` shows the starter, an activity pill, Close, the title, and Activity | Files.
    - Activity is `TurnDetailsCaptainSection` over the turn details source (`agent.turns` plus live runs).
    - Files is `artifact.list` filtered to the Task's agent as `creator`, recursively. No Server read was added.
  - Home's list marks its selected row with `listSelection`.
  - Proof:
    - Tests: `HausRouterTaskModeTests`, `ComposerTargetTests`, `TaskModeLayoutTests`, and the updated
      push-cleanup and foreground tests.
    - Screenshots of the Duo inner display in landscape, each forced by a temporary launch argument:
      - `#all` beside its Task: the rail, the chip in the pill, and More in the rail.
      - Projects with its full title.
      - A cold launch recorded and cut into frames: the opening ghost, then stock bars, with no bottom chrome
        between them.
    - Screenshots of the iPhone 17 Pro: the card pushing the Task full screen, and Home unchanged.

### D5. Poses and continuity

- Half-open like a book: equal panes either side of the folding region. Custom chrome uses `ReservedRegion` to keep
  the fold clearance.
- Folding to the outer display keeps the stack.
  - With a Task beside its conversation, the outer display shows the Task, the top of the stack. Back returns to the
    conversation.
  - Pose changes keep the selection, each draft and its chip target, scroll anchors, and the open sheet.
- Keyboard:
  - The focused composer rides the keyboard.
  - Bars compress with the system's task-oriented vertical compression.
  - The @mention picker anchors above the composer.
- Inner portrait uses the same splits with the system's horizontal bars. Its mock still has to be drawn before this
  slice is proved.
- Proof: the Device Hub pass below runs clean.
- **Built (2026-11-28).** Pose checks (half open, fold and unfold mid-draft, keyboard, portrait) are Zach's on the
  Simulator; everything below is proved by tests and a build only.
  - The fold: `Fold` (`HausUI/Adaptive/Fold.swift`) is the division region in a view's own coordinates, read by
    `FoldReader` with `.includeInactive`, so layouts know where the fold is fully open too and nothing jumps when
    the Duo half opens. Only an active fold costs clearance. `Fold.clearSide` gives a control the larger side of an
    active fold, 28 pt clear.
  - Task mode follows the region's orientation. A fold running top to bottom (landscape) puts the Task beside its
    conversation; one running across (inner portrait) puts the Task below it. Fully open they meet at the fold's
    midline, half open each keeps 28 pt off it, and with no region (other regular-width screens) they split evenly
    side by side. `TaskModeSplit` places both with one `Layout`, so turning the Duo or half opening it never
    remounts the conversation. The Task pane's hairline moves to its top edge when stacked (`\.taskPaneEdge`).
  - A conversation alone keeps to the larger side of an active book fold. Half open like a book with no Task, the
    full list reaches the fold (`ListColumnLayout.foldedWidth`, the column's min, ideal and max all set to it) with
    its rows 28 pt clear, the stored column state untouched, and the handle hidden until the Duo opens. If the
    system won't draw the column that wide, the detail still keeps its content off the fold.
  - Fold audit of custom chrome: the rail's marks stop above a fold running across it and Show list waits below it
    (`ListRailFold`); the handle's grip and touch area keep to the larger side of one (`handleSpan`); the composer,
    its chip, the jump and unread pills and the Task pane's controls live inside panes that already keep clear.
    System bars are the system's to place. Tabletop (a horizontal fold with no Task) is still Later: the list and
    transcript run across it.
  - Continuity: `PoseCarry` (HausUI) carries what screens hold across the remount a fold causes. The shell calls
    `carry()` just before `router.layout` changes; each screen takes back its value under a `PoseKey` scoped by tab
    and route (`poseScope`). Carried: each transcript's scroll anchor (the coordinator registers and resumes it
    before the reader touches it, unless a reveal wins), the open turn details sheet, message drawer and model
    sheet, the reply being composed, the Task pane's segment, the Projects filter and the Search query and scope.
    Composer focus is keyed by draft, not screen, so folding a chip composer hands the keyboard to the Task chat,
    which writes the same `.task(id)` draft. Router-owned sheets never remount. Drafts, chip targets and the
    selection were already Store and router state; `HausRouter.besideTask(of:in:)` now owns the chip rule.
  - Keyboard: conversations use `.toolbarVerticalCompressionBehavior(.prefersToolbarItems)`
    (`keepsToolbarItemsWhileTyping`): Call, Files and the Task's More act on what is being typed, and switching tabs
    mid-sentence can wait. The keyboard reader measures from its own view's bottom, so a conversation ending at a
    fold above the keyboard doesn't lift its composer. The mention card already stands on the composer; at regular
    width it stays 330 pt wide at the composer's leading edge, as the keyboard board draws it.
  - Not done: a screen's sheets other than those named (attachment viewer, avatar generation, rename alerts) close
    on a fold.
  - **First Simulator walk (2026-11-28).** Half open like a book and half-open Task mode drew right, and open → closed
    mid-draft kept everything. Three bugs, fixed:
    - Unfolding left the list about 350 pt wide: the system keeps a column's width when its range changes, so the
      fold's fixed width leaked. `ListColumnWidth` now fixes the column back at the width it had before the fold
      until the system draws it there, then hands the range back.
    - Selecting `#all` after a fold raised its keyboard: a screen registered its value under the key it had when it
      appeared, so a composer that gained a Task's chip stayed registered under its own draft and carried stale
      focus. `PoseCarry.register` now moves a screen's registration when its key changes, and anything carried
      that no screen took is dropped the moment the reader navigates (`settle`).
    - Closing with a Task beside its conversation, fully or half open, lost the Task and the selection (a plain
      chat folded fine). Logging showed the router still held `#all > task` at the fold and the Task's draft
      survived in the Store; then the compact stack the fold rebuilt wrote itself empty about 450 ms later, before
      either of its screens had appeared. The call stack showed SwiftUI popping the compact stack during the
      scene's move to the outer display (`NavigationColumnState.pop`, run in the window's rotation). Pinning the
      split to the regular size class did not stop it and was removed. The bounded workaround: the router refuses
      a rebuilt stack's write that drops more than one route before its top screen has appeared (`setStackPath`,
      `stackAppeared`), once per fold, bumping `stackRevision` so the stack redraws from its path. With it the
      fold keeps the Task, its chip, draft and focus, fully or half open. Back pops one screen and is always
      taken. Each refusal logs one fault under `chat.haus.ios` / `pose`; remove the workaround once that fault
      stops firing on a newer iOS. The mark goes when the stack's top screen appears, and when the router
      replaces the tab's path itself (`open`, `showRoot`, `setPath`), since the stack then redraws from it.
      You's Settings screens resolve through `SettingsSheet`'s own destinations and report their appearance
      too (`onScreenAppear`); before, a fold over Settings refused every later multi-level Back in You.
      Also hardened: a compact stack torn down after the layout moved on writes
      nothing, and a transcript notes its anchor when a scroll settles instead of forcing table layout inside
      the pose change.
    - Inner portrait: turning the Duo had the system write the split's column visibility, which was stored as
      the reader hiding the list, and the system sidebar button sat under the conversation's own bar, so the list
      could not come back. Haus now refuses every system visibility write, removes the system button, and draws
      its own Show list in a hidden column's detail (`showListButton`). In inner portrait the system still opens
      on the detail alone, as iPad portrait does, and its sidebar button puts the list beside the detail
      (checked on the Duo Simulator 2026-11-28). Haus accepts that system behavior. The Chat composer sat under the
      horizontal tab bar, because the keyboard reader's floor is the home indicator; it now clears whichever is
      higher, the keyboard or the screen's bottom inset (`ChatComposerInset`).
  - Proof: `FoldClearanceTests`, `PoseCarryTests`, `TaskModeLayoutTests`, `HausRouterFoldTests`; Duo inner display
    fully open in landscape unchanged.

## Later

- **Tabletop pose:** the conversation above the fold, the composer and keyboard below it. Not mocked yet.
- **Live Task strip on the outer display:** the conversation stays on top with a strip for its Task, as the canvas's
  outer board shows. Showing that from a stack whose top is the Task needs its own design.
- **Project Overview page:** open Tasks, Captains and pinned files behind a Chat | Overview segment. The canvas
  shows it, but no Server read backs it today.
- **Outer display's Task sheet** with an approval gate.

## Verification

Follow [Change Routing](../operations/testing.md#change-routing) and the rearchitecture plan's
[Verification](ios-rearchitecture.md#verification). The app has no iOS CI build, so every slice runs these while
coding:

- `swift test` in `apps/ios-swift`, with router tests for the rules it changes:
  - every tab splits
  - You and Search selection
  - the Task-card origin and side pane
  - the column state
  - the visible set
- A Simulator build of the app target with Xcode 27.1.
- A Device Hub pass on the iPhone Duo Simulator, with a `simctl` screenshot per pose compared against the matching
  canvas board:
  - closed
  - open in landscape
  - open in portrait
  - half open
  - fold and unfold mid-draft
