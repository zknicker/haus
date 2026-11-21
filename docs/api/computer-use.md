---
summary: The computer use tRPC surface (`computer.setComputerUse`, `computer.setComputerUseAgents`, `computer.stewards`, `computer.desktopActivity`, `computer.onDesktopActivity`, `computer.stopDesktopInput`, and the `computer.list` fields), its refusal codes, and how the Server answers a refused `desktop` invocation.
read_when:
  - calling or changing any computer use procedure or the `computerUse*` fields of `computer.list`
  - changing the Server's gate on `desktop` invocations or the `refusal` ledger column
---

# Computer use API

The App's tRPC surface for computer use. [specs/computer-use.md](../../specs/computer-use.md) is
the normative contract; this page lists the procedures. Inputs and results are the schemas in
`packages/haus-api/src/computer-use.ts`. Server code lives in `apps/server/src/haus-api/computer/`,
`apps/server/src/computers/set-computer-use*.ts`, and `apps/server/src/computer-use/`. Every
procedure runs for an active member of `serverId`.

| Procedure | Input | Result | Who |
| --- | --- | --- | --- |
| `computer.setComputerUse` | `{ serverId, computerId, enabled }` | `{ computerId }` | Steward |
| `computer.setComputerUseAgents` | `{ serverId, computerId, agents: { kind: 'all' } \| { kind: 'named', agentIds } }` | `{ computerId }` | Steward |
| `computer.stewards` | `{ serverId, computerId }` | `{ attacher: { displayName, handle }, name }` | Any member |
| `computer.desktopActivity` | `{ serverId, computerId }` | `{ commands: [{ agentId, invocationId, since }] }` | Any member |
| `computer.onDesktopActivity` | `{ serverId }` | stream of `{ serverId, computerId }` | Any member |
| `computer.stopDesktopInput` | `{ serverId, computerId }` | `{ stopped }` | Any member |
| `computer.list` | `{ serverId }` | each Computer also carries `computerUseEnabled`, `computerUseAgents`, `computerUseChangedAt`, `canChangeComputerUse` | |

- A steward is the Device's attacher, an Owner, or an Admin; anyone else is refused `FORBIDDEN`.
  The settings publish `computer.updated`.
- `named` needs at least one `agentId`, each an Agent whose machine is this Device, or
  `BAD_REQUEST`. `computer.list` can return a named list with no ids once its Captains moved or
  were deleted.
- `computer.stewards`, `computer.desktopActivity`, and `computer.stopDesktopInput` answer
  `NOT_FOUND` for a Device that is gone.

A macOS Computer's reported inventory carries `computerUse`: `installed`, `version`,
`accessibility` and `screenRecording` (`granted`, `denied`, or `unknown`), `macosVersion`,
`appPath`, and `permissionsMoved: true` while an update has moved the permissions to `Haus
Computer.app` and they are not granted again. Readers ignore keys they predate.

## Refusals

The invocation router answers a refused `desktop` invocation itself, records the ledger row
`finished` with `agent_invocations.refusal` set to the cause (`off`, `not-listed`, `not-mac`,
`offline`, `not-ready`), and sends nothing to the Computer. A Computer's screen preflight reports
`locked`, `no-session`, or `switched-out` in the `refusal` field of `invoke-result`; the Server
records it the same way. The outcome is `failed`, or `offline` for an offline Device, and the text
is the spec's [refusal shape](../../specs/computer-use.md#refusals). Other invocation kinds are
unaffected.
