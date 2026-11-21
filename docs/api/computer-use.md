---
summary: The computer use tRPC procedures (`computer.setComputerUse`, `computerUse.requests`, `computerUse.decide`, `computerUse.onRequestUpdated`), their inputs, results, refusal codes, the `computerUse.requestUpdated` event, and the refusal a gated `desktop` invocation answers.
read_when:
  - calling or changing `computer.setComputerUse` or the `computerUseAccess` fields of `computer.list`
  - calling or changing `computerUse.requests`, `computerUse.decide`, or `computerUse.onRequestUpdated`
  - changing the Server's gate on `desktop` invocations or the `computer_use` inbox item
---

# Computer use API

The App's tRPC surface for computer use. [specs/computer-use.md](../../specs/computer-use.md) is
the normative contract; this page lists the procedures. Inputs and results are the schemas in
`packages/haus-api/src/computer-use.ts`. Server code lives in
`apps/server/src/haus-api/computer-use/` and `apps/server/src/haus-api/computer/set-computer-use.ts`,
over the domain in `apps/server/src/computer-use/`. Every procedure runs for an active member of
`serverId`.

## The Device setting

| Procedure | Input | Result |
| --- | --- | --- |
| `computer.setComputerUse` | `{ serverId, computerId, access: 'ask' \| 'always' }` | `{ computerId }` |
| `computer.list` | `{ serverId }` | each Computer also carries `computerUseAccess` and `canChangeComputerUse` |

Only a steward of the Computer (its attacher, an Owner, or an Admin) may change it; anyone else
is refused `FORBIDDEN`. A change publishes `computer.updated`.

## Permission requests

| Procedure | Input | Result |
| --- | --- | --- |
| `computerUse.requests` | `{ serverId, chatId }` | `{ requests }`, newest first |
| `computerUse.decide` | `{ serverId, requestId, decision: 'allow' \| 'always' \| 'deny' }` | `{ requestId }` |
| `computerUse.onRequestUpdated` | `{ serverId, chatId }` | `computerUse.requestUpdated` events |

Each request carries `agentId`, `chatId`, `computerId`, `computerName`, `command`, `detail`,
`state` (`requested`, `allowed`, `denied`), `standing`, `requestedAt`, `decidedAt`,
`decidedByName`, `waitingForName` (the Computer's attacher), and `canDecide` (the viewer is a
steward of the request's Computer).

`requests` and `onRequestUpdated` require Chat access (`FORBIDDEN` or `NOT_FOUND`); the stream
rechecks it before every event. `decide` refuses:

| Code | When |
| --- | --- |
| `FORBIDDEN` | The viewer is not a steward of the request's Computer |
| `CONFLICT` | The request was already decided |
| `NOT_FOUND` | No such request on this Server |

`always` also sets the Computer to `always` and publishes `computer.updated`. Every decision
enqueues one `computer_use` inbox item for the requesting Agent in the request's chat (dedupe key
`computer-use:<requestId>`), wakes it, and announces `computerUse.requestUpdated`.

## Event

`computerUse.requestUpdated` is `{ type, serverId, chatId, requestId, emittedAt }`, announced when
a request in the chat is created or decided. It carries ids only; the App invalidates
`computerUse.requests`.

## The gate

The invocation router answers an act `desktop` invocation itself, outcome `failed`, without
sending `invoke`, unless the Device is `always` or the chat holds an `allowed` request. The texts
are the spec's: "This chat hasn't allowed computer use on <Device> yet. …" when it asks (or a
request is already open), and "Computer use on <Device> asks a person in a chat, and this turn has
no chat to ask in." when the run has no chat. Look commands and refused commands pass through.
