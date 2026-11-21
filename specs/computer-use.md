---
summary: Normative computer-use contract (C1, ADR 0057 decision 11). A Captain sees and drives its Device's macOS desktop through the `desktop` built-in behind `execute`, relayed to agent-desktop on the Computer as a `desktop` invocation. Looking never asks. Clicking or typing is gated by the Device's Computer use setting (Ask each chat, Always allow) and a one-time approval per chat, raised in the chat as a Permission request with Deny, Always allow and Allow. Covers the command classes, the setting, the request record, the refusal and inbox item the Agent sees, the App surfaces, and the macOS permissions the Device page shows.
read_when:
  - changing computer use, agent-desktop, the `desktop` built-in, or the `desktop` invocation
  - changing the Device's Computer use setting or the in-chat Permission request
  - changing which agent-desktop commands look, act, or are refused
  - changing how a Computer reports Accessibility or Screen Recording
---

# Computer use

A Captain can see and operate the desktop of its machine, a Device running Haus Computer on
macOS. It copies Capy: looking at the screen never asks, and the first click or type in a
conversation asks a person once, with Always allow to stop asking on that Device.
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
first argument. The Server gates by it and the Computer refuses by it, so both read one list.

| Class | Commands | Gate |
| --- | --- | --- |
| look | `snapshot`, `find`, `get`, `is`, `screenshot`, `list-surfaces`, `list-apps`, `list-windows`, `list-displays`, `list-notifications`, `wait`, `status`, `version`, `skills` | Never asks |
| act | ref actions (`click`, `double-click`, `triple-click`, `right-click`, `type`, `set-value`, `clear`, `focus`, `select`, `toggle`, `check`, `uncheck`, `expand`, `collapse`, `scroll`, `scroll-to`), keyboard and mouse (`press`, `hover`, `drag`, `mouse-move`, `mouse-click`, `mouse-wheel`), apps and windows (`launch`, `close-app`, `focus-window`, `resize-window`, `move-window`, `minimize`, `maximize`, `restore`, `open-system-surface`), notifications (`dismiss-notification`, `dismiss-all-notifications`, `notification-action`), and the clipboard (`clipboard-get`, `clipboard-set`, `clipboard-clear`) | The Device's setting and the chat's approval |
| refused | everything else: `batch`, `session`, `trace`, `cursor-overlay`, `sandbox`, `mcp`, `permissions`, `key-down`, `key-up`, `mouse-down`, `mouse-up`, and unknown commands | Refused before any gate |

A command is also refused when any argument is `--session`, `--agent-id`, `--multi-agent`,
`--stdin`, or starts with `--trace`, and `--headed` is allowed only on an act command. Reading the
clipboard is an act: it is not looking at the screen.

## The Device setting

Each Device has a **Computer use** setting, held by the Server on the Computer record
(`computers.computer_use_access`).

| Value | Label | Meaning |
| --- | --- | --- |
| `ask` (default) | Ask each chat | Every chat asks once before a Captain clicks or types in applications on this Device; Always allow in that prompt switches this. Looking at the screen never asks |
| `always` | Always allow | Every chat may click and type in applications on this Device without asking |

There is no off value, as in Capy. `computer.setComputerUse` changes it; only the attacher, an
Owner, or an Admin may (the Computer steward rule `computer.setWorkers` uses). It publishes
`computer.updated`. `computer.list` returns `computerUseAccess` and `canChangeComputerUse`.

## The conversation

An approval belongs to one chat and one Device. The Server picks the chat for an act from the
invocation's run: the chat of the run's newest unanswered human request
(`readActiveRunRequest`), else the run's trigger chat (`agent_run_triggers.chat_id`). A run with
neither has no chat to ask in.

## The gate

The invocation router checks every `desktop` invocation after it resolves the machine and before
it sends `invoke`. Refused commands never reach the gate; the Computer refuses them. A look
command passes. An act command passes when the Device is `always`, or when the chat holds an
allowed request for that Device. Otherwise the router records the invocation `finished` with
outcome `failed`, sends nothing, and answers the runner with a refusal the model sees:

- **No request open.** It records a request (below) and answers: "This chat hasn't allowed
  computer use on <Device> yet. Haus asked in the chat. End your turn; an inbox item tells you
  when someone answers. Looking at the screen needs no approval."
- **A request already open** in that chat for that Device answers the same text and records no
  second request.
- **No chat.** It answers: "Computer use on <Device> asks a person in a chat, and this turn has
  no chat to ask in." and records nothing.

The Agent never waits inside a tool call for a person. The approval wakes it through the inbox,
which keeps the inbox the only way to wake an Agent.

## Requests

`computer_use_requests` holds one row per request: id, Server, chat, Computer, Agent, run, tool
call id, the command (`args[0]`) and its detail (the remaining arguments joined by spaces, cut to
200 characters), state (`requested`, `allowed`, `denied`), `standing`, `requested_at`,
`decided_at`, and `decided_by_user_id`. At most one row per chat and Device is `requested`.

`computerUse.decide({ serverId, requestId, decision })` answers a request, with `decision` one of
`allow`, `always`, or `deny`. Only a steward of its Computer may decide; anyone else is refused
`FORBIDDEN`. A request already decided is refused `CONFLICT`.

- `allow` sets it `allowed`. Every later act in that chat on that Device passes.
- `always` sets it `allowed` with `standing`, and sets the Device's setting to `always` in the
  same transaction.
- `deny` sets it `denied`. A later act in that chat raises a new request.

Each decision enqueues one inbox item of source `computer_use` in the request's chat for its
Agent, with dedupe key `computer-use:<requestId>`, and wakes it. It is human-caused, so it lifts
wake pauses and failure holds and does not count against the chain budget. Its text:

- allow: "<person> allowed computer use on <Device> in this chat. Next: run the desktop command
  again."
- always: "<person> always allowed computer use on <Device>. Next: run the desktop command again."
- deny: "<person> denied computer use on <Device> in this chat. Next: don't click or type there;
  say what you need, or go on without it."

Requests keep the execution journal's 30-day window, as invocation records do, except that an
`allowed` row stays while its chat and Computer exist, because it is the approval.

## App

`computerUse.requests({ serverId, chatId })` returns the chat's requests, newest first, each with
`agentId`, `computerId`, the Device's name, the command and detail, state, `standing`, the
decider's name, timestamps, and `canDecide`. `computerUse.onRequestUpdated({ serverId, chatId })`
announces `computerUse.requestUpdated` when a request in that chat is created or decided; it
carries ids only, and the App invalidates the query.

- **Device page.** Settings → Devices → [Device] has an **Access** section with a **Computer use**
  row on macOS Devices: the label, the description of the current value from the table above, and
  a select with Ask each chat and Always allow. A viewer who cannot change it sees the value as
  text.
- **Permission request.** An open request shows above the chat's composer as a panel labeled
  Permission request: "<Captain> wants to control applications on <Device>", a box with the
  command and `desktop · <detail>`, and Deny, Always allow, and Allow. A viewer who cannot decide
  sees "Waiting for <Device owner>" instead of the buttons.
- **Markers.** A decided request shows in the transcript at its decision time as a muted line:
  "Allowed on <Device>", "Always allowed on <Device>", or "Denied on <Device>".

## macOS permissions

agent-desktop needs Accessibility to read and drive apps and Screen Recording for screenshots,
granted to the process that runs Haus Computer. The Computer runs `agent-desktop permissions` when
it builds its inventory and reports `computerUse` in it: whether agent-desktop is installed, its
version, and `accessibility` and `screenRecording`, each `granted`, `denied`, or `unknown`. The
Device page shows a warning under Access while agent-desktop is missing or either permission is
not granted, naming what to install or which System Settings → Privacy & Security pane to open,
and the inventory Refresh button rechecks it.

agent-desktop is found like agent-browser, on the Computer's runtime search path, and installed
with `npm install -g agent-desktop`. A missing binary answers `failed` with that command.

## Deferred

- Revoking a chat's approval. Changing the setting back to Ask each chat keeps approvals already
  given.
- Computer use on Linux and Windows Computers, and on cloud machines.
- Desktop recordings and live desktop view.
