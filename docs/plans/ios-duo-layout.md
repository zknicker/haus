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
    - A Task beside its conversation: Stop (destructive), More.
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
- **One composer.** In Task mode, the conversation's composer shows a target chip for the open Task: its activity
  glyph, its title (truncated) and ×.
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
    width is regular, custom otherwise, and always custom below iOS 27.1. The shell reads it once
    (`onShellChromeChange`) and passes it down as `\.shellChrome`.
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
- Toolbar: Stop asks for confirmation before it interrupts.
- Proof: the canvas's Task-open, rail-with-Task and half-open boards reproduce. Closing the Task returns to the
  conversation and the column state it had.

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
