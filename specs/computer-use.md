---
summary: Normative computer-use contract (C1, ADR 0057 decision 11). A Captain sees and drives its Device's macOS desktop through the `desktop` built-in behind `execute`, relayed to agent-desktop on the Computer as a `desktop` invocation. A per-Device switch, Computer use allowed (off by default), gates every `desktop` command; with it off the Server refuses the call and tells the model where to turn it on. Covers the command classes, the switch, the refusal the Agent sees, the App surface, and the macOS permissions the Device page shows.
read_when:
  - changing computer use, agent-desktop, the `desktop` built-in, or the `desktop` invocation
  - changing the Device's Computer use allowed switch or its gate
  - changing which agent-desktop commands look, act, or are refused
  - changing how a Computer reports Accessibility or Screen Recording
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
- A Computer runs one desktop command at a time across its Agents, because they share one screen.
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

## The Device switch

Each Device has one switch, held by the Server on the Computer record
(`computers.computer_use_enabled`).

| Setting | Default | Meaning |
| --- | --- | --- |
| Computer use allowed | Off | On: Captains can use every `desktop` command, looking and acting, on this Device. Off: every `desktop` call is refused |

`computer.setComputerUse({ serverId, computerId, enabled })` changes it; only the attacher, an
Owner, or an Admin may (the Computer steward rule `computer.setWorkers` uses). It publishes
`computer.updated`. `computer.list` returns `computerUseEnabled` and `canChangeComputerUse`.

## The gate

The invocation router checks every `desktop` invocation after it resolves the machine and before
it sends `invoke`. With the switch on, the invocation is sent. With it off, the router records
the invocation `finished` with outcome `failed`, sends nothing to the Computer, and answers the
runner with the text the model sees:

"Computer use is off on <Device>. A person can turn on Computer use allowed in Settings → Devices
→ <Device>."

<Device> is the Computer's reported name, or "this Device" when it has none. The Agent never
waits inside a tool call for a person.

The gate runs again whenever the router resends an unaccepted `desktop` invoke on a Computer's
reconnect. If the switch was turned off in between, the router records the refusal, answers the
runner with the same text, sends `invoke-cancel` instead of the invoke, and nothing runs
(`computer-use-gate.test.ts`).

## App

- **Device page.** Settings → Devices → [Device] has an **Access** section with a **Computer use
  allowed** switch row on macOS Devices, described "Captains can see the screen and click and type
  in applications on this Device." A viewer who cannot change it sees the switch disabled.
- **Readiness.** The Access section shows the readiness warning from
  [macOS permissions](#macos-permissions).

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

agent-desktop needs Accessibility to read and drive apps and Screen Recording for screenshots,
granted to the process that runs Haus Computer. The Computer runs `agent-desktop permissions` when
it builds its inventory and reports `computerUse` in it: whether the embedded agent-desktop
installed, its version, and `accessibility` and `screenRecording`, each `granted`, `denied`, or `unknown`. The
Device page shows a warning under Access while agent-desktop is missing or either permission is
not granted, asking for a Haus Computer update or naming which System Settings → Privacy &
Security pane to open,
and the inventory Refresh button rechecks it.

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
