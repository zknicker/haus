---
summary: The Capy shell preview — a per-device flag (off by default, toggled from Cmd+K) that swaps the App's sidebar for Captain tiles, Projects, open Tasks and People, and makes Home a prompt box; what is live data, what is placeholder, and which program PR replaces each placeholder.
read_when:
  - changing the Capy shell flag, its sidebar, its footer, or Home
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
    click opens your DM with that Captain.
  - Each Project row shows its Captains' small avatars. The + opens New project.
  - Each open Task row has a second line: Captain · workers · places, or "waiting on <you>" when
    an unread message in it @mentions you. Waiting Tasks sort first.
  - People lists person-to-person DMs and appears only when you have any.
- **Footer.** Your avatar menu (Settings, Sign out, the version) and icons for Tasks, Drive,
  Automations (a menu of Captains, each opening its Automations), and Activity. The update status
  stays above them; the offline Device chip does not.
- **Removed.** The Inbox row and page, the Direct messages section, the Files row, the top
  Settings gear, and the Device chip. `/inbox` redirects to Home. Every row carries its own
  unread state, so ADR 0038's unread-only rule still holds.
- **Home.** The Server's default route renders Home: a Project chip and a Captain chip above a
  composer. The Captain defaults to the Project's first Captain. The background is the theme's
  plain background; wallpapers come later.

## Live and placeholder data

Every sidebar field is typed `Sourced<T>` when it can be a placeholder
(`features/capy-shell/placeholders.ts`): `{ source: 'live' }` or
`{ source: 'placeholder', replacedBy }`. The view model is `buildCapySidebar` in
`features/capy-shell/sidebar-model.ts`.

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

`HomeSendPaths` in `features/capy-shell/home-send.ts` names both paths. The live path,
`channel-mention`, posts the ask in the Project's channel as a message that @mentions the Captain,
through the channel composer's optimistic send (pending row, receipt, and a failed send returned
to that channel's composer), and opens the channel. J2 switches Home to `create-task`: a Task in
that Project assigned to that Captain.

## Retiring the flag

J4 flips the flag on for everyone and deletes the old shell: `AppSidebar`, `ChatNavigation`, the
Inbox page, and the flag itself.
