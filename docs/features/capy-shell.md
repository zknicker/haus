---
summary: The Capy shell preview — a per-device flag (off by default, toggled from Cmd+K) that swaps the App's sidebar for Captain tiles, Projects, open Tasks and People, and makes Home a prompt box; what is live data, what is placeholder, and which program PR replaces each placeholder.
read_when:
  - changing the Capy shell flag, its sidebar, its footer, or Home (Home's background is in appearance.md)
  - replacing a Capy shell placeholder with real data (J2, J3, W2)
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
  - A Captain tile shows a dot while the Captain works and a badge for unread DM messages. A
    click opens your DM with that Captain. Owners and Admins get a + that opens New Captain.
  - Each Project row shows its Captains' small avatars. The + opens New project.
  - Each open Task row has a second line: Captain · workers · places, or "waiting on <you>" when
    an unread message in it @mentions you. Waiting Tasks sort first.
  - People lists person-to-person DMs and appears only when you have any.
  - Alt+Down and Alt+Up open the next or previous row with unread messages, in sidebar order
    across Captains, Projects, open Tasks and People, wrapping at the ends.
- **Footer.** Your avatar menu (Settings, Sign out, the version) and icons for Tasks, Drive,
  Automations (a menu of Captains, each opening its Automations), and Activity. Drive opens the
  Files route (`/s/<slug>/artifacts`), which D5 turns into the Drive page. The update status
  and the offline Device chip stay above them, as in the old sidebar.
- **Removed.** The Inbox row and page, the Direct messages section, the Files row, and the top
  Settings gear. `/inbox` redirects to Home. Every row carries its own
  unread state, so ADR 0038's unread-only rule still holds.
- **Home.** The Server's default route renders Home: a Project chip and a Captain chip above a
  composer. The Captain defaults to the Project's first Captain. Behind it sits the theme's
  Home background, a built-in pattern or an uploaded image picked in Settings > Appearance >
  Background (see [Appearance](appearance.md#home-backgrounds)).
- **Activity.** The Inbox's Captain activity strip (each Captain's 7-day tokens with the spike
  flag, and "N running" with its popover) heads the Activity page.

## Live and placeholder data

Every sidebar field is typed `Sourced<T>` when it can be a placeholder
(`features/capy-shell/placeholders.ts`): `{ source: 'live' }` or
`{ source: 'placeholder', replacedBy }`. The sidebar's structure (which sections, which ids,
in what order) is `capySidebarSections` in `features/capy-shell/sidebar-layout.ts`; each row
projects its own entry through `features/capy-shell/sidebar-model.ts` from a narrow `select`
(`use-capy-sidebar-rows.ts`), so a message re-renders only the row it changes
(`capy-sidebar-render-isolation.test.tsx`).

| Field | Source today | Replaced by |
| --- | --- | --- |
| Captains, their working state, DM unread | Live (`agent.list`, `chat.list`) | — |
| Projects and their unread counts | Live (channels in `chat.list`) | — |
| A Project's Captains | Live channel membership (`participantAgentIds`) | J3, home Projects |
| Open Tasks and their assignee | Live (`task.listOpen`) | — |
| "Waiting on you" | Live: an unread @mention of you in the Task (`chat.unreadPreviews`) | — |
| Worker counts and places | Placeholder, stable per Task (`previewTaskWorkers`) | W2, Workers |
| People | Live (person DMs in `chat.list`, names from `member.list`) | — |

## Home's send path

Sending creates a Task with J2's `task.create`: in the chosen Project, assigned to the chosen
Captain. The first line of the ask is the title (cut to 200 characters) and the rest is the
description (`planHomeTask` in `features/capy-shell/home-send.ts`). `useHomeSend` creates the
Task and then opens its page. While the create is in flight the composer shows its submitted
state, and a failed create keeps the text and shows the error under the composer.

## Retiring the flag

J4 flips the flag on for everyone and deletes the old shell: `AppSidebar`, `ChatNavigation`, the
Inbox page, and the flag itself.
