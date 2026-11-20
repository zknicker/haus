---
summary: Normative contract for model connections. A Server holds Agents' model logins (Claude setup-tokens, ChatGPT and SuperGrok device-code sign-ins, and xAI, Gemini and OpenRouter API keys), encrypted at rest, several per provider. The Owner manages them in Settings → Models, and each Agent uses one, defaulting to the first. The runner receives them over its socket, keeps them in memory, runs device sign-ins, and sends refreshed tokens back for a compare-and-swap.
read_when:
  - changing Settings → Models connections, sign-in dialogs, or the Agent's connection picker
  - changing how the Server stores, encrypts, or resolves model logins
  - changing the runner-model-connections, runner-sign-in, runner-connection-credential (and its ack), or runner-connection-status frames
  - changing HAUS_SECRETS_KEY or sealed secrets
  - changing plan capacity per connection
---

# Model connections

[ADR 0057](../docs/adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md) decision 8.
An Agent's model login is a **model connection**: one account's access to one provider, held by
the Server and configured in the App. Workers keep their machines' own logins
([ADR 0056](../docs/adr/0056-agents-run-quiet-workers-anywhere.md)). Model connections serve
Agents on the runner only.

## Providers and sign-in kinds

| Provider | Models | Sign-in |
| --- | --- | --- |
| Claude | `claude-*` | Paste a `claude setup-token` value |
| ChatGPT | GPT models | Device-code sign-in (Pi's `openai-codex`) |
| xAI | `grok-*` | Device-code sign-in with SuperGrok or X Premium, or an API key |
| Gemini | `gemini-*` | API key |
| OpenRouter | ids containing `/` | API key |

`modelProviderFor(modelId)` in `packages/haus-api/src/model-connections.ts` is the one rule that
maps a model to its provider. The Server uses it to resolve a connection, and the runner opens that
connection's provider.

## Storage

- Connections belong to a Server. A provider can hold several, each with a unique label, in order.
  The first is the provider's default.
- Each row holds a status, `ready` or `failed` with the provider's detail. A connection is `ready`
  until a provider refuses it.
- The credential is sealed with AES-256-GCM under `HAUS_SECRETS_KEY`, in a
  `{ v, kid, iv, tag, ct }` envelope, so the key can rotate. Nothing returns a credential to the
  App, or any hint of one.
- Without `HAUS_SECRETS_KEY` the Server refuses to store a connection and sends the runner none.
  It does not fail at boot.
- Each connection has a web search switch. It turns on the provider's own search for Agents on
  that connection: native search for ChatGPT, xAI and Gemini, and OpenRouter's web server tool for
  OpenRouter. It can be on only for those four, and starts on for them. Claude keeps its native
  WebSearch outside this switch. The runner receives it in the snapshot, and R3c turns it into the
  provider's search tool.
- An Agent stores an optional connection id. Removing that connection clears it, and the Agent
  falls back to its provider's default.

## Who can do what

- The Server Owner adds, renames, reorders, reconnects and removes connections.
- Every member sees each connection's provider, label, default and status.
- Choosing an Agent's connection follows the authority that configures the Agent.

## Resolution

At run start the Server picks the Agent's connection if it is set and serves the model's provider.
Otherwise it picks that provider's first connection on the Agent's Server, and otherwise none. It
sends the choice as `runner-start.modelConnectionId`. The runner never picks. A run with no
connection, or with one the runner doesn't hold, fails before any model call as an access
`session-failure`: "No <provider> connection. Connect one in Settings → Models."

## The runner

- **Snapshot.** The Server sends `runner-model-connections` after `runner-hello-accepted` and after
  every change. It carries every Server's connections, with credentials opened. The runner keeps
  the latest snapshot in memory and never writes a credential to disk or reads one from its
  environment.
- **Claude.** The run's setup-token goes into that launch's environment. A changed token changes
  the warm-process launch key.
- **Pi.** Each connection gets its own provider credentials, behind a Server-backed
  `CredentialStore`. Refresh tokens are single-use, so a rotated credential is the only good copy
  until the Server stores it.
  - Every stored credential has a `credentialVersion`, which the snapshot carries.
  - When Pi refreshes a token, the runner uses it at once. It holds it as a pending rotation and
    sends `runner-connection-credential { connectionId, credential, previousRefresh, baseVersion,
    rotationId }`.
  - The Server locks the row and stores the credential only if its stored refresh token still
    equals `previousRefresh`. It answers `runner-connection-credential-ack` before any snapshot,
    with `stored` (the new version), `superseded` (another rotation won) or `failed` (storage
    threw; nothing changed).
  - A resent rotation the Server already stored is acked `stored` again.
  - The runner never lets a snapshot replace a pending rotation or a newer local version. It
    clears a rotation only on `stored` or `superseded`, and resends it after `failed` (backing off
    from 1 s to 60 s) and on every reconnect.
  - A connection sends one rotation at a time.
  - Every change to a connection in the runner's book, snapshots included, goes through that
    connection's queue.
- **Status.** The runner sends `runner-connection-status`: `failed` with the provider's message
  when a turn ends in an access failure, and `ready` once a turn reaches the model again. It sends
  only changes.
- **Sign-in.** It runs through the runner, because the runner holds Pi's providers.
  1. The App starts a sign-in.
  2. The Server sends `runner-sign-in-start`.
  3. The runner runs Pi's device-code login and sends `runner-sign-in-code` with the verification
     link and code. The App shows both.
  4. The runner sends `runner-sign-in-finished` with the credential, or why it failed.
  5. The Server seals the credential and stores it as a new connection.
  - Finishing and cancelling are one serialized transition. A finish moves the sign-in to
    `storing` before the Server writes anything. A cancel before that moves it to `cancelled`,
    sends `runner-sign-in-cancel`, and the finished credential is discarded. A cancel during
    `storing` is refused ("completing"), and the App waits for the result.
  - With no runner attached, starting a sign-in answers at once that the runner is not connected.
  - A pending sign-in expires after 15 minutes.

## Settings → Models

- A Connections group sits at the top of the page, with one card per provider.
- Each connection is a row: its label, Connected or the failure, and its plan capacity. The row
  menu has Rename, Make default, Reconnect and Remove.
- ChatGPT, xAI, Gemini and OpenRouter rows have a Web search switch, starting on. Only the Owner
  can change it.
- Each provider card has a Connect action:
  - Claude: paste a setup-token.
  - ChatGPT and SuperGrok: a dialog shows the link and code, and closes when the connection lands.
  - xAI, Gemini and OpenRouter: enter an API key.
- The page's other groups stay: the Cloud Agent model, image-generation keys, and the runtimes and
  models that Devices report.
- On the Agent profile, a Connection select sits beside the model. A failed connection shows on
  the profile with "Reconnect in Settings → Models".

## Plan capacity

The runner reads each plan connection's capacity, at most every 15 minutes and after an access
failure, and sends it to the Server. Settings → Models shows it on the connection's row. Readers:

- ChatGPT plans: the ChatGPT usage endpoint.
- Claude plans: Anthropic's OAuth usage endpoint with the setup-token.
- SuperGrok: none until xAI exposes one.

R6c builds the readers.

## Retired

`HAUS_RUNNER_CLAUDE_SETUP_TOKEN`, `HAUS_RUNNER_{XAI,GEMINI,OPENROUTER}_API_KEY`,
`haus-runner login chatgpt`, the runner's login file under `/data/logins/`, and the logins list in
`runner-inventory`. Live runner tests read credentials from test-only variables.
