---
summary: The Agent access and computer use tRPC surface (`computer.grantAgentAccess`, `computer.revokeAgentAccess`, `computer.setComputerUse`, `computer.setComputerUseAgents`, `computer.stewards`, `computer.desktopActivity`, `computer.onDesktopActivity`, `computer.stopDesktopInput`, and the `computer.list` fields), the Agent's `GET /api/agent/computers`, its refusal codes, and how the Server answers a refused invocation.
read_when:
  - calling or changing any computer use or Agent access procedure, or the `computerUse*` and `agentAccess*` fields of `computer.list`
  - changing `GET /api/agent/computers` (`haus computer list`)
  - changing the Server's invocation gate, `not-found`, `no-access`, or the `refusal` ledger column
---

# Computer use API

The App's tRPC surface for computer use. [specs/computer-use.md](../../specs/computer-use.md) is
the normative contract; this page lists the procedures. Inputs and results are the schemas in
`packages/haus-api/src/computer-use.ts` and `computer-agent-access.ts`. Server code lives in
`apps/server/src/haus-api/computer/`, `apps/server/src/computers/set-computer-use*.ts`,
`apps/server/src/computers/computer-agent-access.ts`, `apps/server/src/computer-access/`, and
`apps/server/src/computer-use/`. Every
procedure runs for an active member of `serverId`.

| Procedure | Input | Result | Who |
| --- | --- | --- | --- |
| `computer.grantAgentAccess` | `{ serverId, computerId, agentId }` | `{ computerId }` | Attacher |
| `computer.revokeAgentAccess` | `{ serverId, computerId, agentId }` | `{ computerId }` | Steward |
| `computer.setComputerUse` | `{ serverId, computerId, enabled }` | `{ computerId }` | Steward |
| `computer.setComputerUseAgents` | `{ serverId, computerId, agents: { kind: 'all' } \| { kind: 'named', agentIds } }` | `{ computerId }` | Steward |
| `computer.stewards` | `{ serverId, computerId }` | `{ attacher: { displayName, handle }, name }` | Any member |
| `computer.desktopActivity` | `{ serverId, computerId }` | `{ commands: [{ agentId, invocationId, since }] }` | Any member |
| `computer.onDesktopActivity` | `{ serverId }` | stream of `{ serverId, computerId }` | Any member |
| `computer.stopDesktopInput` | `{ serverId, computerId }` | `{ stopped }` | Any member |
| `computer.list` | `{ serverId }` | each Computer also carries `agentAccessGrants` (`{ agentId, grantedAt, grantedByUserId }`), `canGrantAgentAccess`, `canRevokeAgentAccess`, `computerUseEnabled`, `computerUseAgents`, `computerUseChangedAt`, `canChangeComputerUse` | |

- A steward is the Device's attacher, an Owner, or an Admin; anyone else is refused `FORBIDDEN`.
  Only the attacher may grant, Owners and Admins included. The settings publish
  `computer.updated`.
- A grant needs a live Agent on the Server whose home is another Device, or `BAD_REQUEST`.
  Granting one already on the list does nothing. Home Agents are always allowed and never listed.
- A revoke deletes the grant and the Agent's named computer use entry on the Device, then fences
  the Agent there: its running commands are cancelled, and an unaccepted one settles `no-access`.
  Revoking an Agent that has no grant does nothing.
- `named` needs at least one `agentId`, each a home Agent of this Device or one Agent access
  allows, or `BAD_REQUEST`. `all` covers home Agents only. `computer.list` can return a named list
  with no ids once its Captains moved, lost access, or were deleted.
- `computer.stewards`, `computer.desktopActivity`, and `computer.stopDesktopInput` answer
  `NOT_FOUND` for a Device that is gone.

A macOS Computer's reported inventory carries `computerUse`: `installed`, `version`,
`accessibility` and `screenRecording` (`granted`, `denied`, or `unknown`), `macosVersion`,
`appPath`, and `permissionsMoved: true` while an update has moved the permissions to `Haus
Computer.app` and they are not granted again. Readers ignore keys they predate.

## Agent computer list

`GET /api/agent/computers` (`haus computer list`) answers an Agent's run credential with every
Computer on its Server: `{ computers: [{ computerId, name, online, operatingSystem, home,
allowed, computerUse }] }`. `allowed` is Agent access, and `computerUse` is whether a `desktop`
call from this Agent would pass the Captains list. The CLI prints one line each, such as
`MacBook (cmp_123) · online · macOS · allowed · computer use`.

## Refusals

Every invocation kind is refused `not-found` when its `computer` matches no Computer on the
Server, or a name several share (the text lists their ids), and `no-access` when Agent access
does not allow the Agent. Those run before the router records the row and again on every resend.
`no-access` names the attacher by @handle and links the Device page. A text result from a
Computer other than the Agent's home starts with `[Ran on <name>]`.

The invocation router answers a refused `desktop` invocation itself, records the ledger row
`finished` with `agent_invocations.refusal` set to the cause (`off`, `not-listed`, `not-mac`,
`offline`, `not-ready`), and sends nothing to the Computer. A Computer's screen preflight reports
`locked`, `no-session`, or `switched-out` in the `refusal` field of `invoke-result`; the Server
records it the same way. The outcome is `failed`, or `offline` for an offline Device, and the text
is the spec's [refusal shape](../../specs/computer-use.md#refusals). Only `desktop` invocations
get those causes; other kinds are refused only `not-found`, `no-access`, or `offline`.
