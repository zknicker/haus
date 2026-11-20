---
summary: The Capy shell preview — a per-device flag (off by default, toggled from Cmd+K) that swaps the App's sidebar for Captain tiles, Projects, open Tasks and People, and makes Home a prompt box; where each sidebar fact comes from.
read_when:
  - changing the Capy shell flag, its sidebar, its footer, or Home
  - changing what a Capy shell sidebar row reads or shows
  - flipping the flag on for everyone or deleting the old shell (J4)
---

# Capy shell

The Capy shell is a parallel App interface built toward the
[Capy product model](../proposals/capy-product-model.md). It sits behind one per-device
preference, `capyShell`, which is off by default. With it off, the App is exactly as before.

Turn it on or off with **Toggle Capy shell** in Cmd+K. There is no Settings row. The choice is
stored in `localStorage` under `haus.capy-shell` and follows into other open windows
(`features/capy-shell/capy-shell-preference.ts`).

## What changes with the flag on

- **Sidebar.** Top to bottom: the logo (opens Home) with Search and New task at the right, then
  Captains as avatar tiles, Projects, Open tasks, and People. On the web the logo and actions ride
  the titlebar strip; on the desktop they take the sidebar's first line, since the window band
  holds the strip.
  - Section headers ("Captains", "Projects", "Open tasks", "People") are plain body-size labels
    with their actions at the right, as in Capy. Clicking a label folds its section; there is no
    caret. The logo, the section labels and the row icons share one left edge.
  - Captain tiles sit under their header, the face over the name. A tile shows a dot while the
    Captain works, a danger dot when it needs attention, a muted dot while it is paused, and a
    badge for unread DM messages. A click opens your DM with that Captain; hover warms the DM and
    the Captain's record. Right-click opens the old sidebar's DM menu (open in a new tab or
    pane, View agent profile, Attachments on desktop), and People rows carry the same menu. Owners and Admins get a + that opens New Captain.
  - A Project row is its mark, its name and its unread badge. The + opens New project. Projects
    reorder by drag or from the keyboard (Space picks a row up, the arrows move it, Space drops),
    through the old sidebar's `SortableChannelList` and its stored order.
  - An open Task row is one line: the state disc, the key, the title and the unread badge. When
    an unread message in it @mentions you, the key turns accent with a small accent dot and the
    row reads and tooltips "Waiting on you". Waiting Tasks sort first.
  - People lists person-to-person DMs and appears only when you have any.
  - Alt+Down and Alt+Up open the next or previous row with unread messages, in sidebar order
    across Captains, Projects, open Tasks and People, wrapping at the ends.
- **Footer.** Your avatar menu (Settings, Sign out, the version) and icons for Tasks, Drive,
  Automations (a menu of Captains, each opening its Automations), and Activity. Drive opens the
  Files route (`/s/<slug>/artifacts`), which D5 turns into the Drive page. Tasks, Drive and
  Activity are real links: a modified or middle click opens a tab, hover warms the route, and the
  open one is the current page. Automations opens a Captain's profile through
  `useOpenAgentProfile`. The update status
  and the offline Device chip stay above them, as in the old sidebar.
- **Removed.** The Inbox row and page, the Direct messages section, the Files row, and the top
  Settings gear. `/inbox` redirects to Home. Every row carries its own
  unread state, so ADR 0038's unread-only rule still holds.
- **Home.** The Server's default route renders Home: a Project chip and a Captain chip, left-aligned
  above a compact stock `PromptInput` (size `sm`, a `max-w-xl` measure) placed a little above the
  middle, as in Capy. The placeholder is "Ask <Captain> anything", and the bottom row holds only
  Send: `task.create` carries no files, so there is no attachment action, and there is no model
  picker or mic. The Captain defaults to the Project's first Captain. The page keeps the theme's
  plain background; its content area is a positioned, isolated layer, so a full-bleed Home
  background can sit behind the composer. A Device's low-disk warning, which the Inbox carried,
  sits above the composer for the Owner or Admin who attached it.
- **First run.** A new Haus starts with no Captains and no Projects. Until both exist, Home shows a
  stock `EmptyState` in place of the composer that names what is missing and offers "Create a
  project" and, for Owners and Admins, "New Captain"; a Member reads that an Owner or Admin adds
  Captains. A Captain needs a device, so with no Captains and no Devices an Owner or Admin is led
  to "Add a device" (Settings › Devices) and "New Captain" waits, with a line saying why; a Member
  reads that an Owner or Admin connects a device and adds Captains. Home draws nothing while the
  Captain or Project list loads. It reads the Device list (`computer.list`) only for an Owner or
  Admin with no Captains, waits for it only then, and treats a failed read as no Device. The sidebar keeps the Captains and
  Projects headers with their "+" and nothing below them (`home-state.ts`).
- **Activity.** The Inbox's Captain activity strip (each Captain's 7-day tokens with the spike
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
| Open Tasks | Live (`task.listOpen`) |
| "Waiting on you" | Live: an unread @mention of you in the Task (`chat.unreadPreviews`) |
| People | Live (person DMs in `chat.list`, names from `member.list`) |

## Home's send path

Sending creates a Task with J2's `task.create`: in the chosen Project, assigned to the chosen
Captain. The first line of the ask is the title (cut to 200 characters) and the rest is the
description (`planHomeTask` in `features/capy-shell/home-send.ts`). `useHomeSend` creates the
Task and then opens its page. While the create is in flight the composer shows its submitted
state, and a failed create keeps the text and shows the error under the composer.

## Retiring the flag

J4 flips the flag on for everyone and deletes the old shell: `AppSidebar`, `ChatNavigation`, the
Inbox page, and the flag itself.
