---
summary: Normative computer-use contract (C1 and S2, ADR 0057 decision 11). A Captain sees and drives its Device's macOS desktop through the `desktop` built-in behind `execute`, relayed to agent-desktop on the Computer as a `desktop` invocation. A per-Device Computer use switch (off by default) gates every `desktop` command for every Captain Agent access allows there. Refusals are cause-specific (off, not a Mac, offline, macOS not ready, locked, nobody logged in, another user), name the attacher, and read the invocation ledger so a Captain asks once. A Device's Agent access (its Machine's Agents, plus Selected Captains or All Captains on this Server, ADR 0057 decision 4 as amended 2026-11-23) gates every invocation kind with `not-found` and `no-access` first. Covers the command classes, the settings, the gate and refusal text, the one-at-a-time machine lock, the screen preflight, Stop Agent Input, the App surface, and the macOS permission list.
read_when:
  - changing computer use, agent-desktop, the `desktop` built-in, or the `desktop` invocation
  - changing the Device's Computer use switch or its gate
  - changing a Device's Agent access, `computer.grantAgentAccess`, `computer.revokeAgentAccess` or `computer.setAgentAccessScope`, or the invocation gate's `not-found` and `no-access`
  - changing refusal text, the refusal ledger, Stop Agent Input, or `computer.desktopActivity`
  - changing the machine-wide desktop lock, the screen preflight, or the display hold
  - changing which agent-desktop commands look, act, or are refused
  - changing how a Computer reports Accessibility or Screen Recording
  - changing which process holds the macOS permissions (`Haus Computer.app`, its bundle ids)
---

# Computer use

A Captain can see and operate the desktop of its machine, a Device running Haus Computer on
macOS, once its attacher turns on **Computer use** for that Device.
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

The Server holds two settings on each Device
([ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md)
decision 4, as [amended 2026-11-23](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer)).
**Agent access** decides which Agents may run any tool there, and start Workers there.
**Computer use** says whether that access includes the desktop.

| Setting | Default | Meaning |
| --- | --- | --- |
| Agent access scope (`computers.agent_access_scope`) | `selected` | `selected`: the Agent whose Machine (`agents.computer_id`) is this Device, and each Agent named by a `computer_agent_access` row, with who granted it (`granted_by_user_id`) and when (`granted_at`). `all`: every live Agent on the Server; the rows stay for a return to `selected` |
| Computer use (`computers.computer_use_enabled`) | Off | On: every Agent that Agent access allows can use every `desktop` command, looking and acting, on this Device. Off: every `desktop` call is refused |

**Agent access.**

- `computer.grantAgentAccess({ serverId, computerId, agentId })` adds a named row. Only the
  person who attached the Device may grant (`FORBIDDEN` for anyone else, Owners and Admins
  included), because the Agent then runs commands as that person's machine user. The Agent must be
  a live Agent on the Server whose Machine is another Device (`BAD_REQUEST`). Granting an Agent
  already on the list does nothing.
- `computer.revokeAgentAccess({ serverId, computerId, agentId })` deletes the named row. The
  attacher, an Owner, or an Admin may revoke (`FORBIDDEN` otherwise). When the Agent no longer has
  access afterwards, the Server fences it on the Device: it sends `agent-fence`, which cancels the
  Agent's running commands there, and their answers read `no-access`; an invocation the Computer
  had not accepted settles `no-access` without running.
- `computer.setAgentAccessScope({ serverId, computerId, scope })`. Only the attacher sets `all`;
  the attacher, an Owner, or an Admin sets `selected`, which fences every Agent it bars.
- A Computer that reconnects fences every held Agent that access no longer allows. All three
  publish `computer.updated`.

**Computer use.**

- `computer.setComputerUse({ serverId, computerId, enabled })` changes the switch. Only the
  attacher turns it on, since that widens desktop access; the attacher, an Owner, or an Admin
  turns it off (`FORBIDDEN` otherwise). It publishes `computer.updated`.
- `computers.computer_use_changed_at` records when the switch last changed. It is null while the
  switch has never been turned on.
- Migration 0154 retired the per-Captain list (`computers.computer_use_scope`,
  `computer_use_agents` and the `agents_computer_use_moved` trigger). It kept a Device on only
  where its old desktop set equalled its access set, turned every other Device that was on off
  with `computer_use_changed_at` set, and logged each one. It widened nobody.

**Reading them.**

- `computer.list` returns `agentAccessScope`, `agentAccessGrants` (`{ agentId, grantedAt,
  grantedByUserId }`, oldest first), `canGrantAgentAccess` (the attacher), `canRevokeAgentAccess`
  (the attacher, an Owner, or an Admin), `computerUseEnabled`, `computerUseChangedAt`,
  `canEnableComputerUse` (the attacher), and `canChangeComputerUse` (the attacher, an Owner, or an
  Admin).
- `GET /api/agent/computers` (`haus computer list`) gives an Agent every Computer on its Server
  with `home` (its Machine), `allowed` (Agent access), `computerUse` (whether a `desktop` call
  would pass the switch), `online`, `name`, and `operatingSystem`.
- `computer.stewards({ serverId, computerId })` tells any member who attached the Device
  (`{ attacher: { displayName, handle }, name }`), so a refusal's link lands on a page that says who
  can change it even for someone who cannot open the Device.
- Looking and acting stay together, a deliberate departure from Capy's "looking never asks": a
  per-chat ask would make the Agent wait for a person. Splitting them by `desktopCommandClass` is
  possible later.

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
| `off` | `desktop` | Computer use is off |
| `not-mac` | `desktop` | The Device reports an operating system other than macOS |
| `offline` | Every kind | The Device is not connected |
| `not-ready` | `desktop` | The Device reports agent-desktop missing, or Accessibility or Screen Recording `denied` |

The gate no longer produces `not-listed`; the ledger CHECK keeps it for rows written before
2026-11-23.

A call with no `computer` runs on the Agent's Machine and never falls back: a named Computer that
refuses ran nothing. A Device the gate cannot read refuses instead of passing. A refused command
sends nothing to the Computer. The router records the row `finished` with its `refusal` (outcome
`failed`, or `offline` for an offline Device) and answers the runner with the refusal text. On a
resend refusal it also sends `invoke-cancel`, and nothing runs (`computer-use-gate.test.ts`). An
`unknown` permission is not a refusal: agent-desktop reports its own failure. The Agent never
waits inside a tool call for a person.

A text result from a Computer other than the Agent's Machine starts with `[Ran on <name>]`.

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
   never been turned on".
2. **Who can change it.** The attacher by `@handle`, since only the attacher turns computer use
   on or gives access, and a link to the Device page's Access section
   (`<appOrigin>/s/<slug>/settings/computers/<id>#access`). The
   readiness, offline and screen causes ask the attacher to act on the Mac itself.
3. **The ledger.** A second refusal in the same run ends "Already refused this turn. Stop calling
   `desktop`." Otherwise, when this Captain was already refused for the same cause on this Device,
   it says when ("at 14:02 UTC on 2026-11-21") and "Don't ask again; wait for a reply."
4. **What to do**, on a first refusal: ask once in plain text where you're working, link that page,
   ask them to reply when it's changed or done, then stop, and try again when they reply.

For example: "Computer use is off on Studio (since 2026-11-18). Only @ada can turn it on, in
Settings → Devices → Studio (https://haus.chat/s/acme/settings/computers/cmp_…#access).
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

Settings → Devices → [Device]
([docs/features/computer-use.md](../docs/features/computer-use.md)) runs a macOS permissions
warning only while one is missing, then **Access**, then **Workers**.

- **Access** ("Who can use this Mac.") holds two rows, each a title, a sentence that says what its
  current value does, and a select
  (`apps/website/src/features/computers/device-access-rows.tsx`):
  - **Captain access**: Selected Captains ("Only Cove and Forge can run tools here.") or All
    Captains on this Server ("Any Captain on this Server can run tools here."). Under Selected,
    **Choose Captains** opens a searchable multi-select of every Captain; one whose Machine is this
    Device is checked and locked with "Uses this Mac by default". All is disabled for a viewer who
    is not the attacher, and so is checking a Captain.
  - **Computer use** (macOS only): On ("Those Captains can see the screen and click and type in
    apps.") or Off ("Captains can't see or control this Mac's screen."). On is disabled for a
    viewer who is not the attacher.
  - While a Captain is driving the Device, "Cove is using Studio" with **Stop Agent Input**.
- **Workers** holds Run Workers here (Off or Up to N), Claude Code and Codex with a status chip
  and one line of weekly plan usage, and the cloud providers.
- A change shows at once and rolls back with a toast if the Server refuses it.
- **Not your Device.** A member who opens a Device page they cannot see (a refusal link) reads who
  attached it and that they, an Owner, or an Admin can change its settings.

## What the setting guards

Computer use is per-Device consent for the `desktop` tool. It is not a sandbox. A
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
