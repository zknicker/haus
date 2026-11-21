---
summary: The computer use tRPC surface (`computer.setComputerUse` and the `computer.list` fields for the Computer use allowed switch), its refusal codes, and the refusal the Server answers a `desktop` invocation with while the switch is off.
read_when:
  - calling or changing `computer.setComputerUse` or the `computerUseEnabled` fields of `computer.list`
  - changing the Server's gate on `desktop` invocations
---

# Computer use API

The App's tRPC surface for computer use. [specs/computer-use.md](../../specs/computer-use.md) is
the normative contract; this page lists the procedures. Inputs and results are the schemas in
`packages/haus-api/src/computer-use.ts`. Server code lives in
`apps/server/src/haus-api/computer/set-computer-use.ts` and
`apps/server/src/computers/set-computer-use.ts`, with the gate in
`apps/server/src/computer-use/computer-use-gate.ts`. Every procedure runs for an active member of
`serverId`.

## The Device switch

| Procedure | Input | Result |
| --- | --- | --- |
| `computer.setComputerUse` | `{ serverId, computerId, enabled: boolean }` | `{ computerId }` |
| `computer.list` | `{ serverId }` | each Computer also carries `computerUseEnabled` and `canChangeComputerUse` |

`computerUseEnabled` is off by default. Only a steward of the Computer (its attacher, an Owner,
or an Admin) may change it; anyone else is refused `FORBIDDEN`. A change publishes
`computer.updated`.

A macOS Computer's reported inventory carries `computerUse`: `installed`, `version`,
`accessibility` and `screenRecording` (`granted`, `denied`, or `unknown`), and `permissionsMoved:
true` while an update has moved the permissions to `Haus Computer.app` and they are not granted
again. Readers ignore keys they predate.

## The refusal

While the switch is off, the invocation router answers every `desktop` invocation itself, outcome
`failed`, records the invocation finished, and sends nothing to the Computer. The text is the
spec's: "Computer use is off on <Device>. A person can turn on Computer use allowed in Settings →
Devices → <Device>." Other invocation kinds are unaffected.
