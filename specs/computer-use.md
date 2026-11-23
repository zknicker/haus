---
summary: Normative computer-use contract (C1 and S2, ADR 0057 decision 11). A Captain sees and drives its Device's macOS desktop through the `desktop` built-in behind `execute`, relayed to agent-desktop on the Computer as a `desktop` invocation. A per-Device switch, Computer use allowed (off by default), and a typed Captains list (all, or named) gate every `desktop` command. Refusals are cause-specific (off, not listed, not a Mac, offline, macOS not ready, locked, nobody logged in, another user), name the attacher, and read the invocation ledger so a Captain asks once. A Device's Agent access list (home Agents plus Agents its attacher names, ADR 0057 decision 4) gates every invocation kind with `not-found` and `no-access` first. Covers the command classes, the settings, the gate and refusal text, the one-at-a-time machine lock, the screen preflight, Stop Agent Input, the App surface, and the macOS permission list.
read_when:
  - changing computer use, agent-desktop, the `desktop` built-in, or the `desktop` invocation
  - changing the Device's Computer use allowed switch, its Captains list, or its gate
  - changing a Device's Agent access list, `computer.grantAgentAccess` or `computer.revokeAgentAccess`, or the invocation gate's `not-found` and `no-access`
  - changing refusal text, the refusal ledger, Stop Agent Input, or `computer.desktopActivity`
  - changing the machine-wide desktop lock, the screen preflight, or the display hold
  - changing which agent-desktop commands look, act, or are refused
  - changing how a Computer reports Accessibility or Screen Recording
  - changing which process holds the macOS permissions (`Haus Computer.app`, its bundle ids)
---

# Computer use

A Captain can see and operate the desktop of its machine, a Device running Haus Computer on
macOS, once a person turns on **Computer use allowed** for that Device.
[ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 11
places it behind `execute`; this spec is the contract.

## The tool

`desktop` is a built-in in the `execute` catalog beside `browser`
([MCP](mcp.md#agent-browser)). It appears in `tools.search` and `tools.describe` and needs no
grant.

- Its input is `{ args: string[] }`, one [agent-desktop](https://github.com/vercel-labs/agent-desktop)
  command such as `["skills","get","desktop"]`, `["snapshot","--app","Finder","-i"]`, or
  `["click","@s8f3k2p9:e8"]`. agent-desktop reads the macOS accessibility tree and acts on refs
  from a snapshot; the Agent learns it from its bundled skills (`skills get desktop`).
- Each call is one invocation of kind `desktop`
  ([runtime-drivers.md](runtime-drivers.md#invocations)), with the invocation's id, ledger,
  outcomes, and a 60-second timeout. An offline machine answers `offline` at once.
- A Computer runs one desktop command at a time across the whole machine, because every Agent and
  every Server attachment shares one screen. See [One command at a time](#one-command-at-a-time).
- A screenshot is written on the machine, and the result names its path. A `screenshot` with no
  `.png` path is written beside the invocation's log as `<invocation-id>.png` and pruned with
  it after seven days. The Agent views it with its edit tool's `view` or `view_image`.
- Computer use runs on macOS. A Computer on another system answers `failed` with "Computer use
  runs on macOS Devices."

## Command classes

`desktopCommandClass` in `packages/haus-api/src/computer-use.ts` classifies a command by its
first argument. The Computer refuses by it.

| Class | Commands |
| --- | --- |
| look | `snapshot`, `find`, `get`, `is`, `screenshot`, `list-surfaces`, `list-apps`, `list-windows`, `list-displays`, `list-notifications`, `wait`, `status`, `version`, `skills` |
| act | ref actions (`click`, `double-click`, `triple-click`, `right-click`, `type`, `set-value`, `clear`, `focus`, `select`, `toggle`, `check`, `uncheck`, `expand`, `collapse`, `scroll`, `scroll-to`), keyboard and mouse (`press`, `hover`, `drag`, `mouse-move`, `mouse-click`, `mouse-wheel`), apps and windows (`launch`, `close-app`, `focus-window`, `resize-window`, `move-window`, `minimize`, `maximize`, `restore`, `open-system-surface`), notifications (`dismiss-notification`, `dismiss-all-notifications`, `notification-action`), and the clipboard (`clipboard-get`, `clipboard-set`, `clipboard-clear`) |
| refused | everything else: `batch`, `session`, `trace`, `cursor-overlay`, `sandbox`, `mcp`, `permissions`, `key-down`, `key-up`, `mouse-down`, `mouse-up`, and unknown commands |

A command is also refused when any argument is `--session`, `--agent-id`, `--multi-agent`,
`--stdin`, or starts with `--trace`, and `--headed` is allowed only on an act command. The
Computer runs look and act commands and answers `failed` for a refused one.

## The Device settings

**2026-11-23, not yet implemented.**
[ADR 0057's Machine amendment](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)
replaces this section, "The gate" and "App" until the rewrite:
- An Agent's home is its Machine, which a person can change.
- Agent access is Selected Captains or All Captains on this Server, and only the attacher widens
  it.
- Computer use is one switch over every Agent with access. The Captains list, its `all` scope and
  `not-listed` go. Only the attacher turns the switch on; the attacher, Owners and Admins turn it
  off.
- The migration turns a Device's switch off wherever one switch would widen its desktop access.

The Server holds two lists on each Device
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)
decision 4). **Agent access** decides which Agents may run any tool there. **Computer use**
decides which of those may also drive the desktop.

| Setting | Default | Meaning |
| --- | --- | --- |
| Agent access (`computer_agent_access`) | Home Agents only | Every Agent whose machine is this Device is always allowed and never listed. Any other Agent on the Server is allowed only by a named row, with the person who granted it (`granted_by_user_id`) and when (`granted_at`) |
| Computer use allowed (`computers.computer_use_enabled`) | Off | On: eligible Captains can use every `desktop` command, looking and acting, on this Device. Off: every `desktop` call is refused |
| Captains (`computers.computer_use_scope` plus `computer_use_agents`) | All | `{ kind: 'all' }` covers every Agent whose machine is this Device, including ones added later. `{ kind: 'named', agentIds }` allows only the listed Agents, each a home Agent or one Agent access allows |

**Agent access.**

- `computer.grantAgentAccess({ serverId, computerId, agentId })` adds a named row. Only the
  person who attached the Device may grant (`FORBIDDEN` for anyone else, Owners and Admins
  included), because the Agent then runs commands as that person's machine user. The Agent must be
  a live Agent on the Server and not one of the Device's home Agents (`BAD_REQUEST`). Granting an
  Agent already on the list does nothing.
- `computer.revokeAgentAccess({ serverId, computerId, agentId })` deletes the named row and the
  Agent's `computer_use_agents` row on the Device in one transaction. The attacher, an Owner, or
  an Admin may revoke (`FORBIDDEN` otherwise). When a row was deleted, the Server fences the
  Agent on the Device: it sends `agent-fence`, which cancels the Agent's running commands there,
  and their answers read `no-access`; an invocation the Computer had not accepted settles
  `no-access` without running. A Computer that reconnects fences every held Agent the list no
  longer allows.
- Both publish `computer.updated`.

**Computer use.**

- `computers.computer_use_changed_at` records when the switch last changed. It is null while the
  switch has never been turned on. Migration 0150 dated every existing Device at the migration.
- Named entries live in `computer_use_agents`, keyed by Device and Agent. A row goes when its Agent
  or Device is deleted, when its Agent's access to the Device is revoked, and, through a trigger
  on `agents.computer_id`, when a home Agent moves to another machine, so moving back needs
  consent again. A named list can end up empty, which allows nobody.
- `computer.setComputerUse({ serverId, computerId, enabled })` changes the switch, and
  `computer.setComputerUseAgents({ serverId, computerId, agents })` changes the list. A person names
  at least one Captain, and each must be a home Agent or one Agent access allows (`BAD_REQUEST`
  otherwise). Only the attacher, an Owner, or an Admin may change either (`FORBIDDEN`). Both
  publish `computer.updated`.

**Reading them.**

- `computer.list` returns `agentAccessGrants` (`{ agentId, grantedAt, grantedByUserId }`, oldest
  first), `canGrantAgentAccess` (the attacher), `canRevokeAgentAccess` (the attacher, an Owner, or
  an Admin), `computerUseEnabled`, `computerUseAgents`, `computerUseChangedAt`, and
  `canChangeComputerUse`.
- `GET /api/agent/computers` (`haus computer list`) gives an Agent every Computer on its Server
  with `home`, `allowed` (Agent access), `computerUse` (whether a `desktop` call would pass the
  Captains list), `online`, `name`, and `operatingSystem`.
- `computer.stewards({ serverId, computerId })` tells any member who attached the Device
  (`{ attacher: { displayName, handle }, name }`), so a refusal's link lands on a page that says who
  can change it even for someone who cannot open the Device.
- Looking and acting stay together, a deliberate departure from Capy's "looking never asks": a
  per-chat ask would make the Agent wait for a person. There is no Projects scope; name Captains.

## The gate

The invocation router resolves the call's `computer` field (an id, then a unique name, case
insensitive; `computer:` prefix allowed) and gates every invocation before it records the ledger
row, so a refusal is never first written `offline`
(`apps/server/src/agent-invocations/invocation-gate.ts`). It gates again whenever it resends an
unaccepted invoke on a Computer's reconnect. The first cause that applies wins:

| Cause (`refusal`) | Applies to | When |
| --- | --- | --- |
| `not-found` | Every kind | No Computer on the Agent's Server has that id or name, or several share the name (the text lists their ids) |
| `no-access` | Every kind | Agent access does not allow this Agent |
| `off` | `desktop` | Computer use allowed is off |
| `not-listed` | `desktop` | The list is named and this Agent is not on it |
| `not-mac` | `desktop` | The Device reports an operating system other than macOS |
| `offline` | Every kind | The Device is not connected |
| `not-ready` | `desktop` | The Device reports agent-desktop missing, or Accessibility or Screen Recording `denied` |

A call with no `computer` runs on the Agent's home and never falls back: a named Computer that
refuses ran nothing. A Device the gate cannot read refuses instead of passing. A refused command
sends nothing to the Computer. The router records the row `finished` with its `refusal` (outcome
`failed`, or `offline` for an offline Device) and answers the runner with the refusal text. On a
resend refusal it also sends `invoke-cancel`, and nothing runs (`computer-use-gate.test.ts`). An
`unknown` permission is not a refusal: agent-desktop reports its own failure. The Agent never
waits inside a tool call for a person.

A text result from a Computer other than the Agent's home starts with `[Ran on <name>]`.

## The screen preflight

Inside the machine lock, before agent-desktop runs, the Computer reads `ioreg -n Root -d1 -a`
`IOConsoleUsers` (`apps/computer/src/desktop/console-session.ts`):

| Refusal | When |
| --- | --- |
| `no-session` | No session is on the console with its login done |
| `switched-out` | The console session belongs to another macOS user |
| `locked` | This user's session has `CGSSessionScreenIsLocked`, or `IOConsoleLocked` is set |

Every command, look or act, is refused on those without running agent-desktop. The Computer
answers `failed` with short Capy-style text and the `refusal` field of `invoke-result`; the Server
records the refusal on the ledger and replaces the text with the full refusal shape below. When
CoreGraphics reports the main display asleep but the session is unlocked, the Computer wakes it
with `caffeinate -u -t 2` and runs the command. Act commands run under `caffeinate -d`, started
after the lock is taken, so the display stays awake for the command only; look commands hold
nothing. There is no Keep awake setting: Energy settings own system sleep (see
[headless Devices](../docs/operations/computer-use-headless-devices.md)).

## Refusals

Every refusal follows one shape (`apps/server/src/computer-use/desktop-refusal-text.ts`):

1. **What was refused and why**, per cause. Off says how long: "(since 2026-11-18)", or "and has
   never been turned on". Not listed names only this Captain, never others on the list.
2. **Who can change it.** The attacher by `@handle`, "or an Owner or Admin" for the settings, and
   a link to Settings → Devices → [Device] (`<appOrigin>/s/<slug>/settings/computers/<id>`). The
   readiness, offline and screen causes ask the attacher to act on the Mac itself.
3. **The ledger.** A second refusal in the same run ends "Already refused this turn. Stop calling
   `desktop`." Otherwise, when this Captain was already refused for the same cause on this Device,
   it says when ("at 14:02 UTC on 2026-11-21") and "Don't ask again; wait for a reply."
4. **What to do**, on a first refusal: ask once in plain text where you're working, link that page,
   ask them to reply when it's changed or done, then stop, and try again when they reply.

For example: "Computer use is off on Studio (since 2026-11-18). @ada, or an Owner or Admin, can
turn it on in Settings → Devices → Studio (https://haus.chat/s/acme/settings/computers/cmp_…).
Ask once in plain text where you're working, link that page, and ask them to reply when it's
changed. Then stop. When they reply, try again."

## One command at a time

Each attached Server runs its own `__attachment-daemon` process, so the queue is a kernel file
lock, not an in-process queue, and the lock and the command share one owner
(`apps/computer/src/desktop/desktop-lock.ts`). The Computer starts `/usr/bin/lockf -k
<data-root>/computer-use.lock /bin/sh` in a new process group. Once the lock is held, the shell
reports "held" on a control pipe and waits for "go", which the daemon sends after the screen
preflight; a refusal closes its stdin instead and nothing runs. The shell then runs the command
with a watchdog that kills the whole group the moment the daemon's stdin closes. So:

- a daemon that dies, while waiting or while the command runs, never leaves a command driving
  the screen, and the kernel drops the lock with the group;
- cancel and timeout kill the group, lock and command together;
- waiting needs no polling.

## Stop Agent Input

- `computer.desktopActivity({ serverId, computerId })` lists the open `desktop` commands on a
  Device (`{ commands: [{ agentId, invocationId, since }] }`, oldest first) for any member.
  `computer.onDesktopActivity` notifies when it changes.
- `computer.stopDesktopInput({ serverId, computerId })` sends the existing `invoke-cancel` for
  every open `desktop` invocation on that Device and returns `{ stopped }`. Any member may stop,
  because stopping only takes control away.
- The Computer runs each command in its own process group and kills the whole tree on cancel. The
  Agent's answer is outcome `cancelled` with "A person stopped agent input on <Device> from Haus,
  so this command was cancelled. Stop using `desktop` there and tell the person what you were
  doing."
- agent-desktop 1.3.1's `mouse-up` and `key-up` refuse to run outside a session, so nothing
  releases held input after a cancel. A `drag` killed mid-hold may leave the button logically down
  until the next real mouse event.
- The setting turning off mid-command does not stop it. The command finishes (60 seconds at most)
  or is stopped; the next one is refused.

## App

- **Agent access.** Settings → Devices → [Device] has an **Agent access** section on every
  Device, before Computer use (`apps/website/src/features/computers/agent-access-card.tsx`):
  - Its description: "An allowed Captain runs commands on this device as its user, and anyone who
    can message the Captain can ask it to."
  - **Captains on this device**, always first and never removable: "Always allowed: Cove and
    Forge."
  - One row per granted Captain, "Allowed by Ada", with **Remove** for a viewer who can revoke.
    Remove takes the row out at once and puts it back if the Server refuses.
  - **Add Captain**, a menu in the section header for the attacher only, listing Captains on the
    Server that are neither home here nor already allowed. It is disabled when none are left.
- **Computer use.** The **Computer use** section, on macOS Devices:
  - **Computer use allowed**, a switch, described "Captains can see the screen and click and type
    in applications on this Device."
  - **Captains**, shown while the switch is on: an inline multi-select of "All Captains", each
    Captain on this Device, and each Captain Agent access allows. Its description says "All
    Captains on this Device, including ones added later (now Cove and Forge)." or "Only Cove."
    "All Captains" means the home Captains only.
  - While a Captain is driving the Device, "Cove is using Studio" with **Stop Agent Input**.
  - **macOS permissions**, shown while the switch is on: see [macOS permissions](#macos-permissions).
  - A viewer who cannot change the settings sees them disabled.
- **Not your Device.** A member who opens a Device page they cannot see (a refusal link) reads who
  attached it and that they, an Owner, or an Admin can change its settings.

## What the setting guards

Computer use allowed is per-Device consent for the `desktop` tool. It is not a sandbox. A
Captain whose machine is a Device already runs `bash` there as the machine user, with that user's
full power: `osascript`, `open`, any CLI the user installed, and the Computer's own files. That is
the local-trust model Workers already carry
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md), amended 2026-11-20). The gate
on that power is which Device is the Captain's machine, not this switch.

Within that model Haus keeps the consent path honest. agent-desktop stays off the `PATH` that
`bash` invocations get, and only `desktop` invocations run it. A Captain that wants to see or
drive the screen is taught the `desktop` tool, which the switch gates; nothing in Haus hands it a
quieter route.

## macOS permissions

agent-desktop needs Accessibility (Device Control and Data Access on macOS 27 and later) to read
and drive apps and Screen Recording for screenshots. macOS charges both to the responsible
process, and Haus Computer ships as `Haus Computer.app` (`chat.haus.computer`) so that process is
a named app with the Haus icon: the LaunchAgent runs the bundle executable, every attachment
daemon it spawns and every agent-desktop, `screencapture`, and `bash` child below them inherit it,
and System Settings lists "Haus Computer". Haus never runs agent-desktop's `permissions --guide`:
its drag-to-add panel has no drop target on macOS 27.3, where the Accessibility list is "System &
App Protection Override" and adding goes through + → Override System Protections → Choose Apps. Development builds are `chat.haus.computer.dev` ("Haus Computer Dev"), so an ad-hoc build
never replaces the release grant. CLI commands run from a terminal (`setup`, `start`, `restart`)
never spawn attachment daemons themselves, because those would be charged to the terminal; they
load or kickstart the LaunchAgent and the resident spawns the daemons. When LaunchServices opens
the app with no arguments (a double-click, or System Settings' Quit & Reopen), it starts the
LaunchAgent unless Haus Computer was stopped, and exits.

The Computer probes readiness in a fresh `agent-desktop permissions` process every time, because a
grant made after a process started is invisible to that process's own Screen Recording check. Each
attachment daemon probes when it sends its inventory and again every minute, and sends a new
inventory only when the answer changed. It reports `computerUse`: whether the embedded
agent-desktop installed, its version, `accessibility` and `screenRecording` (each `granted`,
`denied`, or `unknown`), `macosVersion` (`sw_vers -productVersion`), and `appPath`, the running
`.app`.

The Device page lists one row per permission, with Granted or Not granted, a one-line purpose,
**Open Settings** (`x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
or `?Privacy_ScreenCapture`, which the desktop App opens with the system handler), and the steps
for that macOS version (`computerUsePanes` in `packages/haus-api/src/computer-use.ts`):

| macOS | Accessibility pane | Steps |
| --- | --- | --- |
| before 27 | Accessibility | + → Haus Computer → turn it on |
| 27.0–27.2 | Device Control and Data Access | + → Haus Computer → turn it on |
| 27.3 and later | System & App Protection Override | + → Override System Protections → Choose Apps → Haus Computer → Control Your Entire Mac and All Apps |

Screen Recording is "Screen & System Audio Recording" from macOS 15. While a permission is not
granted, a row shows the bundle path (`appPath`, else `~/.local/share/haus-computer/Haus
Computer.app`) with **Copy path** for the file picker's ⌘⇧G, says to do it on the Device itself
(Screen Sharing for a Mac without a display), and **Check again** asks for a fresh probe. Coming
back to the App window (focus) also asks for one, so a grant shows without a Refresh. There is no
drag-to-add: macOS 27.3 has no drop target, and Haus never runs `permissions --guide`. If
agent-desktop failed to install, the section says to update Haus Computer instead.

Grants never carry over to a new holder: the Computers that ran as a bare executable lose theirs
when they become `Haus Computer.app`. When the resident service's executable moves to a different
holder, the Computer writes `<data-root>/computer-use-permissions-moved.json`, and while that
marker exists and a permission is not granted it reports `permissionsMoved: true`. The Device page
then says "Haus Computer is an app now, so macOS asks again" above the permission rows. The first probe that
sees both granted removes the marker. An update inside the same app moves nothing.

agent-desktop is built into every Computer. `apps/computer` pins `agent-desktop` 1.3.1, and the
compiled Computer embeds its arm64 CLI and macOS helper (`agent-desktop-binary.ts`). On first use
the Computer writes both to `<data-root>/tools/agent-desktop/1.3.1/`, checks each against its
pinned SHA-256, and runs the CLI with `AGENT_DESKTOP_MACOS_HELPER_PATH` set to the helper. It never
looks on `PATH`, that folder is never on the `PATH` `bash` invocations get, and a person installs
nothing (`agent-desktop-isolation.test.ts`). `__release-check` verifies the embedded copies
against the pins.

## Deferred

- Computer use on Linux and Windows Computers, and on cloud machines.
- Desktop recordings and live desktop view.
- Stop Agent Input in the Electron App's tray.
- Detecting a person's own input while a Captain acts.
- Measuring what still works on a locked Mac; every command refuses until then.
- A Keep awake setting.
