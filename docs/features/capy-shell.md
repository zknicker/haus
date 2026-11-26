---
summary: The App's shell — a sidebar of Captain tiles, Projects led by the #all team room, Tasks and People, with Home as a prompt box; where each sidebar fact comes from.
read_when:
  - changing the sidebar, its footer, or Home (Home's background is in appearance.md)
  - changing what a sidebar row reads or shows
---

# Capy shell

The Capy shell is the App's shell, built toward the
[Capy product model](../proposals/capy-product-model.md). It replaced the old sidebar and the
Inbox page in J4; there is no flag.

## The shell

- **Sidebar.** Top to bottom: the logo (opens Home) with Search and New task at the right, then
  Captains as avatar tiles, Projects (led by the #all team room, pinned first), Tasks, and People. On the web the logo and actions ride
  the titlebar strip; on the desktop they take the sidebar's first line, since the window band
  holds the strip.
  - Section headers ("Captains", "Projects", "Tasks", "People") are quiet 13px muted labels
    whose caret and actions show on hover. Clicking a label folds its section, and a folded
    section keeps its caret. The logo, the section labels and the row icons share one left edge.
  - Captain tiles sit under their header, the face over the name. A tile shows a dot while the
    Captain works, a danger dot when it needs attention, a muted dot while it is paused, and a
    badge for unread DM messages. A click opens your DM with that Captain; hover warms the DM and
    the Captain's record. Right-click opens the old sidebar's DM menu (open in a new tab or
    pane, View agent profile, Attachments on desktop), and People rows carry the same menu. Owners and Admins get a + that opens New Captain.
  - #all is the team room (ADR 0059): pinned as the first row under Projects, outside the
    drag order, never a Project, and never a choice in Home's Project picker.
  - A Project row is its mark, its name and an unread dot. The + opens New project. Projects
    reorder by drag or from the keyboard (Space picks a row up, the arrows move it, Space drops),
    through the old sidebar's `SortableChannelList` and its stored order.
  - A Task row is one line: the state disc, the title and an unread dot. When an unread
    message in it @mentions you, a small accent dot leads the title and the row reads and
    tooltips "Waiting on you". Waiting Tasks sort first.
  - Right-clicking a Task row opens it, opens it in a new tab on desktop, and offers the Tasks
    page's State (active or archived) and Copy reference sections
    (`features/tasks/task-menu-sections.tsx`).
  - Every row keeps the unread dot's slot whether or not it is unread, so names truncate at one
    edge down the whole sidebar.
  - People lists person-to-person DMs and appears only when you have any.
  - Alt+Down and Alt+Up open the next or previous row with unread messages, in sidebar order
    across Captains, the team room, Projects, open Tasks and People, wrapping at the ends.
- **Footer.** Your avatar menu (Settings, Sign out, the version) and icons for Tasks, Drive,
  Automations (a menu of Captains, each opening its Automations), and Activity. Drive opens the
  Files route (`/s/<slug>/artifacts`), which D5 turns into the Drive page. Tasks, Drive and
  Activity are real links: a modified or middle click opens a tab, hover warms the route, and the
  open one is the current page. Automations opens a Captain's profile through
  `useOpenAgentProfile`. The update status
  and the offline Device chip stay above them, as in the old sidebar.
- **Removed.** The Inbox row and page, the Direct messages section, the Files row, and the top
  Settings gear. `/inbox` redirects to Home, and nothing links there: the
  breadcrumb's "Haus" opens Home, a new desktop window starts on Home, a desktop tab on Home reads
  "Home" with a home glyph, and Cmd+K offers Home in place of Chat and Inbox. Every row carries its own
  unread state, so ADR 0038's unread-only rule still holds.
- **Home.** The Server's default route renders Home: a Project chip, left-aligned
  above a compact stock `PromptInput` (size `sm`, a `max-w-xl` measure) placed a little above the
  middle, as in Capy. The placeholder is "Start a Task". The bottom row holds a Machine picker
  (the Server's attached Computers; no Cloud in v1), a model picker (the runner's catalog, connected
  providers first) and Send. There is no attachment action or mic. The Project chip lists only real
  Projects (`project.list`), and the Machine defaults to that Project's default Machine. Behind the composer sits the
  theme's Home background, a built-in pattern or an uploaded image picked in Settings >
  Appearance > Background (see [Appearance](appearance.md#home-backgrounds)); the content area
  is a positioned, isolated layer above it. A Device's low-disk warning, which the Inbox carried,
  sits above the composer for the Owner or Admin who attached it.
- **First run.** A new Haus starts with no Captains and no Projects. Until both exist, Home shows a
  stock `EmptyState` in place of the composer that names what is missing and offers "Create a
  project" and, for Owners and Admins, "New Captain"; a Member reads that an Owner or Admin adds
  Captains. A Captain needs a device, so with no Captains and no Devices an Owner or Admin is led
  to "Add a device" (Settings › Devices) and "New Captain" waits, with a line saying why; a Member
  reads that an Owner or Admin connects a device and adds Captains. The theme's Home background
  sits behind it as it does behind the composer. Home draws nothing while the Captain or Project
  list loads. It reads the Device list (`computer.list`) only for an Owner or Admin with no
  Captains, waits for it only then, and treats a failed read as no Device. The sidebar keeps the
  Captains and Projects headers with their "+" and nothing below them (`home-state.ts`).
- **Activity.** The Captain activity strip (each Captain's 7-day tokens with the spike
  flag, and "N running" with its popover) heads the Activity page.

## Where the sidebar reads from

Everything the sidebar shows is live Server data; nothing is a placeholder. The sidebar's structure (which sections, which ids,
in what order) is `capySidebarSections` in `features/capy-shell/sidebar-layout.ts`; each row
projects its own entry through `features/capy-shell/sidebar-model.ts` from a narrow `select`
(`use-capy-sidebar-rows.ts`), so a message re-renders only the row it changes
(`capy-sidebar-render-isolation.test.tsx`).

| Field | Source |
| --- | --- |
| Captains, their working state, DM unread | Live (`agent.list`, `chat.list`) |
| Projects and their unread counts | Live (channels in `chat.list`) |
| Active Tasks | Live (`task.listActive`) |
| "Waiting on you" | Live: an unread @mention of you in the Task (`chat.unreadPreviews`) |
| People | Live (person DMs in `chat.list`, names from `member.list`) |

## Home's send path

Sending starts a Task with `task.start` in the chosen Project, on the picked Machine and model,
with the ask as its first message; the Server titles it (`planHomeTask` in
`features/capy-shell/home-send.ts`). Each ask carries a `requestId`, kept until a start succeeds,
so a retried send answers the same Task. `useHomeSend` starts the Task and then opens
`/tasks/<shortId>`. While the start is in flight the composer shows its submitted state, and a
failed start keeps the text and shows the error under the composer.

## Activity strip

The Captain activity strip that headed the old Inbox now heads the Activity page
(`features/captain-activity/`): each Captain's 7-day tokens with the spike flag, and "N running"
with its Happening now popover. The desktop dock badge counts unread Chats and followed Tasks
(`useUnreadCount`). Notifications are in [Notifications](notifications.md).
