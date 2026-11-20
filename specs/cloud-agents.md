---
summary: Cloud places for Workers. How a Worker runs on `cursor` or `claude`, carried by a Computer that holds the provider login. Covers the provider boundary, turns on a hosted run with rules inlined in the brief, follow-up delivery and stalls, reports taken from the provider's result, the Claude adapter (sign-in, environment pin, monitoring, status mapping), Cursor readiness and the Cursor adapter, the per-provider model setting, and provider settings and usage.
read_when:
  - changing the `cursor` or `claude` Worker place, a provider adapter, or the provider boundary
  - changing how a cloud Worker's report is derived from the provider result, or the `Haus-Outcome` line
  - changing cloud follow-up delivery, stalls, or the Run tag
  - changing the Claude adapter, its sign-in, environment pin, polling, or status mapping
  - changing Cursor readiness, Cursor authentication, the Cursor SDK pin, or Cursor usage reporting
  - changing the cloud model setting, the Cursor model catalog, or the model a turn requests
  - looking for the former Cloud Agents spec (its contract is now specs/workers.md)
---

# Cloud places

`cursor` and `claude` are [Worker](workers.md) places that run on a provider's hosted agent instead
of a Haus Computer. Everything provider-neutral, including the record, the CLI, reports, follow-ups,
stop, supervision, the card, and pull request readings, is in [Workers](workers.md). This spec
covers what differs on a cloud place.

This file was the Cloud Agents spec. ADR 0056 made cloud agents Workers. The durable work record
and pull request readings moved to [Workers](workers.md#record) and
[Pull request readings](workers.md#pull-request-readings).

## The carrier

A cloud Worker's provider login lives on a Computer, never on the Server. Each cloud Worker has a
carrier Computer, chosen once at start ([Places](workers.md#places)). The carrier runs the provider
adapter for that Worker: launch, follow-ups, monitoring, stop, and reconciliation. Provider prompts
in flight, credentials, raw transcripts, and hosted workspace files stay on the carrier or with the
provider.

A carrier needs only a ready provider capability. The **Workers can run here** switch governs
local execution, not carrying.

The carrier journals launch intent and acknowledged provider ids in its private data directory,
without credentials. Reconnect recovers acknowledged ids even when their report to the Server was
lost. An intent without an acknowledgement stops at its five-minute launch deadline, or at once on
stop. Disconnecting joins local monitoring without stopping the hosted run. While the carrier is
offline the Worker reads **Status unconfirmed**. On reconnect the Server pushes reconcile frames, at
most 200 entries each, naming every unsettled turn the carrier holds and any stop recorded while it
was offline. A turn the Server settled `stopped` while the hosted run was live, as a deleted
Project's Task does, is named with a stop too. Removing the carrier settles its cloud Workers' unsettled turns as failed
`machine-removed`, with the provider URL kept so the Agent can still look. The provider login left
with the carrier, so the Worker takes no more turns: a later follow-up is refused with
`WORKER_CARRIER_REMOVED`, and the Agent starts a new Worker.

## The provider boundary

`CloudProvider` (today `CloudAgentProvider` in `apps/computer/src/cloud-agents/`) is the whole
provider interface: `readiness()`, `start()`, `read()`, `subscribe()`, `cancel()`, plus `connect()`
and `disconnect()` for the credential the others depend on. Everything above it is provider-neutral.
Everything below it, including credentials, prompts, and raw status mapping, belongs to the
adapter. An in-memory fake with scripted transitions covers the whole path without a provider
account.

The Server checks the carrier's reported readiness at start, so an unavailable provider writes
nothing. Once the Server has recorded a turn, a definite provider refusal settles it failed
`launch-refused`, and a launch that never confirms settles failed at its five-minute deadline.

## A turn on a cloud place

The Server composes the turn's input ([What a Worker reads](workers.md#what-a-worker-reads)). For a
cloud place, the rule files are inlined into the provider prompt, because a cloud Worker has no
drive folder. The Haus Worker instructions for a cloud place add two things:

- end each commit with `Haus-Task: <KEY-n>`, as on a Computer;
- end the final message with a `Haus-Outcome:` line ([Reports from the provider](#reports-from-the-provider)).

A cloud Worker cannot call `haus worker report`. No Haus credential, hook, or callback runs inside
the provider's environment.

Each prompt's first line is a Run tag, `HAUS_CLOUD_RUN=<workerId>/<turnId>`. The adapter uses it to
find its own prompt in the provider's session log.

### Reports from the provider

A cloud turn's report comes from the provider's result. The adapter takes the final result text
and reads its last lines:

```text
Haus-Outcome: needs-you
Haus-Person: @zach
```

| Provider result | Report |
| --- | --- |
| Finished, with `Haus-Outcome: done`, or with no `Haus-Outcome` line | `done` |
| Finished, with `Haus-Outcome: needs-you` | `needs-you`, the text as its ask, `Haus-Person` as its person when the Server accepts it |
| Finished, with `Haus-Outcome: failed` | `failed` |
| Stopped to ask a question (Claude `requires_action`) | `needs-you`, the question as its ask, no person |
| Error with result text | `failed` |
| Error with no result text | No report, failed `provider-error` |
| Expired | No report, failed `provider-expired` |
| Cancelled by Haus | `stopped` |

The `Haus-` lines are removed from the posted text. A `Haus-Person` the Server refuses leaves the
ask for the Agent, and the Agent's inbox item says so. The text is clipped at 8,000 characters for
the report. The full result, up to 64 KiB, stays on the turn as provider evidence, and
`haus worker inspect --worker <id> --report` prints it. Branches and pull request URLs the provider
reports become the report's pull requests.

A needs-you report from a provider question is answered with `haus worker send`, which is an
ordinary follow-up turn. A person answering directly in the provider's own UI is not observed.

## Follow-up delivery

A follow-up on a cloud place is sent to the same hosted agent. Each send uses the turn id as the
provider idempotency key, so a retry after a lost answer never starts a second provider run.

On both providers the carrier sends a follow-up only after every earlier turn has settled in any
way, as [Follow-ups and stop](workers.md#follow-ups-and-stop) requires. One turn gives one report.
Waiting behind a run the provider still reports as running has no deadline, because Cursor expires
runs itself and a person or the Agent can stop a Claude turn. Claude would take a prompt mid-turn,
but Haus never sends one, because that would steer a working turn and merge two turns into one
result. W2 deletes today's Claude early send and its shared-result settlement.

A failed send is classified by the adapter.

- **Definite refusal.** Authentication, unknown agent, invalid input, or another 4xx except 408,
  409, 425, and 429. The turn settles failed `launch-refused` with the provider's message.
- **Retryable.** Those four statuses, 5xx, network, or SDK unavailable. The carrier retries with
  backoff from 5 seconds, doubling to one minute, and journals attempts with the pending turn. A
  busy provider never fails a turn. After two minutes of failures the carrier asks the provider to
  interrupt whatever holds the session and retries once. If that also fails, the turn stays
  `queued`, reports `stallCode: followup-auto-interrupt-failed` on every retry, and keeps retrying.

While a follow-up waits, the carrier reports the turn `queued` with an `activity` line naming why.

A turn the Server recorded that the carrier never journaled never reached the provider. Reconcile
names such a turn only when the Server will never start it again, as with a migrated turn whose
follow-up never reached this carrier, so the carrier settles it at once: failed `launch-refused`
(`errorCode: turn-not-journaled`), or `stopped` when stopped. A follow-up the carrier drained to
the Server stays the Server's. A late acknowledgement cannot replace that settlement, and the carrier asks the
provider to cancel the late run.

### Stalls

A stall is a live turn that needs attention without settling: an auto-interrupt that failed, or a
Claude prompt the adapter cannot find behind its scan bound (`claude-prompt-not-found`). The
Server queues one `worker_stall` item ([inbox](inbox.md#worker-items)) per stall and two-hour
window, so a stuck turn wakes its Agent once, then sparsely. A settled Worker raises no stall. The
Agent decides whether to wait, stop, or interrupt with `haus worker send --interrupt`.

## Claude provider

The Claude adapter (`apps/computer/src/cloud-agents/claude/`) drives Claude Code's cloud sessions.

- **Sign-in.** It uses the carrier's claude.ai subscription login from the host credentials file
  or keychain entry, refreshed as Claude Code refreshes it. Every `claude` cloud command receives
  that login as `CLAUDE_CODE_OAUTH_TOKEN`. Readiness asks Claude's OAuth profile whether the login
  still works and takes the session controller's organization from it. An API key is never a
  Claude cloud login. Haus stores no Claude credential and never signs Claude Code out.
- **Launch.** `claude --cloud <prompt>` runs in a throwaway blobless checkout of the repository at
  the starting ref, deleted afterwards. The folder-trust prompt is accepted automatically, and the
  checkout uses the GitHub CLI's sign-in when it is installed. Follow-ups run
  `claude -p --cloud <session> --output-format json <prompt>`.
- **Environment pin.** Every Claude launch on a carrier runs against one chosen environment, shown
  in the Computer's Claude settings. A carrier with no pin auto-pins the account's environment
  named **Default**, case-insensitively, else its oldest, never its newest. The auto-pin is
  permanent, and an Owner or Admin can repoint it. The pin is Computer-local
  (`claudeEnvironmentId`). Before `claude --cloud` runs, Haus writes it into
  `.claude/settings.local.json` in the throwaway checkout as `remote.defaultEnvironmentId`. Every
  launch checks the pin against Anthropic's live environment list
  (`GET /v1/environment_providers`), and a missing or archived pin refuses the launch with no
  fallback. A follow-up resolves no environment. The environment's id and name land on the Worker,
  and `haus worker inspect` shows them.
- **Monitoring.** The carrier polls the session controller about every 10 seconds: session
  `worker_status` (`running`, `idle`, `requires_action`), `status` (`active`, `archived`), and the
  event log. It reads the log newest first until it finds this turn's tagged prompt, with a bound
  on the scan, then keeps that window and resumes from its newest event. The tagged prompt's event
  id becomes the turn's `providerRunId`. Each turn's window ends at the next Haus-tagged prompt,
  which only arrives after the turn settled.
- **Mapping.**

  | Claude session state | Turn |
  | --- | --- |
  | Tagged prompt not yet in the log | `queued`, or failed `provider-expired` if the session is archived |
  | Tagged prompt never found, or result past the scan bound with the session idle | `working` with stall `claude-prompt-not-found` |
  | `requires_action` | Settled `needs-you`, the open question or the requested tool as its ask |
  | `idle` with no open background tasks after a result | Settled from the result ([Reports from the provider](#reports-from-the-provider)) |
  | Haus's own interrupt acknowledged and the worker not running | `stopped` |
  | Session archived | Failed `provider-expired` |
  | Otherwise | `working`, with the latest activity |

- **Stop and answers.** Stop ends open background tasks, then sends an interrupt with request id
  `haus-cancel-<turnId>`. Before delivering an answer to a session waiting on a question, the
  carrier interrupts the pending question and waits for the worker to go idle.
- **Links.** Claude has no desktop deeplink, so **Open in Claude** opens claude.ai/code.

Claude's branch and pull request are inferred from its own `git push` command and the pull request
URL it writes, so they can be missed. A pull request URL in the final message is the reliable path, which is
why the Haus Worker instructions ask cloud Workers to end with it.

## Cursor readiness and authentication

| Capability | Ready when | Purpose |
| --- | --- | --- |
| Cursor runtime | `cursor-agent` is installed and its native session is usable | Local Cursor execution |
| Cursor cloud place | `@cursor/sdk` resolves a user API key from `CURSOR_API_KEY` or `~/.cursor/sdk/auth.json` | Carrying `cursor` Workers |

When the cloud place is not ready, readiness reports `not-connected` (no credential resolves),
`expired` (a stored credential is past its own expiry), or `provider-unavailable` (`@cursor/sdk`
cannot load or reach Cursor). `CURSOR_API_KEY` is Cursor's own variable, outside Haus's environment
contract.

Haus reuses provider-native state on the Computer. It never scrapes Cursor's keychain entries,
copies credentials to the Server, or invents a credential format. `Cursor.auth.login()` is the
one-time bootstrap: it supplies a sign-in link and stores a revocable, expiring user API key after
approval. Haus opens the link on the person's current device and polls for completion. Only an
explicit human action starts it, never an Agent turn. A user API key bills Cursor work to that
person's Cursor plan.

## Cursor implementation

The Cursor adapter uses the public `@cursor/sdk`. `Agent.create()` returns a handle, and the first
`send()` creates the hosted run. Follow-ups call `send()` on the same hosted agent. Haus settles a
turn from its run's `FINISHED`, `ERROR`, `CANCELLED`, or `EXPIRED` result, never from the hosted
agent going `IDLE`.

| Cursor run status | Turn |
| --- | --- |
| `QUEUED` | `queued` |
| `CREATING`, `RUNNING` | `working` |
| `FINISHED` | Settled from the result |
| `ERROR` | `failed` report with result text, else failed `provider-error` |
| `CANCELLED` | `stopped` |
| `EXPIRED` | Failed `provider-expired` |

The raw status is kept on every observation. The SDK's `Run` handle folds `EXPIRED` into an error,
so a read recovers expiry only from the terminal error Cursor reports with it, while the event
stream carries the raw status. A run that expires while nothing streams can therefore settle as
`provider-error` instead of `provider-expired`. That is a provider limit.

The carrier subscribes to the run's event stream while it is active. The end of a stream is never
a settlement. A detached stream hands off to a run read every 5 seconds, backed off to 60 seconds
after a provider failure, until the run is terminal. A streamed terminal status settles the turn
through one observation that carries both the status and the run's evidence.

A stop that Cursor rejects with `run_not_cancellable` after the run already stopped never blocks
reconciliation. A failed stop against an active run retries on the 60-second backoff.

The SDK does not expose the hosted agent's URL, so **Open in Cursor** links
`https://cursor.com/agents?id=<agentId>`.

Cursor SDK `1.0.30` is pinned, with a Bun patch that bounds otherwise unbounded fetches to 30
seconds per request. Streams keep their caller-owned abort signal. Recheck the patch and the stream
disposal bridge on every SDK upgrade, and remove them once the public SDK bounds requests and joins
subscriptions. Installed-SDK tests cover both.

Cursor names a branch's repository in whatever shape its git metadata carries. Every form reads
back to `owner/name` on GitHub, or `host/owner/name` elsewhere, and a reference with no repository
is dropped. Git metadata is a hosted-workspace snapshot, not per-turn attribution.

## Model

A person picks the cloud model once per Server for each provider. The default is **Auto**. Agents
cannot choose it: no CLI flag or start input carries a model for a cloud place.

- For Cursor, Auto is Cursor's per-run router, sent as the catalog id `default`.
- For Claude, Auto sends no model, so the account default applies.

**Catalog.** The Computer that holds a Cursor connection reads `Cursor.models.list()` and reports
it in its inventory as `cloudAgentProviders[].models = { autoAvailable, models, refreshedAt }`, or
`null`. Each model is `{ id, displayName, description, family, order, effort, fast }`. The mapping
(`apps/computer/src/cloud-agents/model-catalog-mapping.ts`) turns Cursor's `default` entry into
`autoAvailable`, keeps Cursor's order and at most 200 models, cleans labels, derives `family`, and
keeps only two parameters. `effort` normalizes Cursor's three spellings into
`{ options, defaultValue, providerParamId }`, and `fast` is `{ defaultValue }`. Every other
parameter is never sent. The Computer refreshes the catalog on start, on an account change, and
daily, and keeps the previous catalog for the same account when a read fails.

**Setting.** The setting is `{ kind: 'auto' } | { kind: 'model', id, params: { effort?, fast? } }`,
one `cloud_agent_model_settings` row per Server and provider, read by any member through
`cloudAgentSettings.get` and written by an Owner or Admin through `cloudAgentSettings.setModel`.
A write refuses a model, `effort` value, or `fast` flag that the freshest catalog does not offer.

**Turns.** The Server resolves the model for every cloud turn. It sends the saved model only when
the carrier's newest catalog lists it, else Auto: `default` when the catalog has `autoAvailable`,
else no model. It sends each saved parameter the model still offers under its `providerParamId`
and drops the rest. Each turn records `model: { id, params, fallbackFrom, droppedParams }`.

## Settings and usage

Computer settings show the Cursor runtime and the Cursor cloud place as separate capabilities even
on one Cursor account, because the CLI and the SDK use different credential stores. The cloud
place row has Connect and Disconnect, and a pending sign-in can be resumed from it. The App reaches
it through `cloudAgentProvider.get`, `.connect`, `.cancelSignIn`, and `.disconnect`, which the
Server authorizes to Owners and Admins and relays to the Computer. Only readiness, account
metadata, and the public sign-in link cross to the Server. The sign-in attempt lives on the
Computer for five minutes, one per provider.

Haus reports per-turn tokens and optional cost when the SDK provides them. It never claims plan
capacity, remaining allowance, or reset time, because Cursor exposes no supported surface for them.

## Intentionally missing

- No provider credential or raw provider transcript on the Server.
- No per-Computer default provider. The default place is the Project's
  ([Places](workers.md#places)).
- No Haus credential, hook, or callback inside a provider's environment.
- No pull request facts taken from Cursor. Readings come from GitHub or the carrier's `gh`.
- No Drive writes from a cloud Worker.

## Regression guards

| Contract | Guard |
| --- | --- |
| A `Haus-Outcome` line types the report, and its absence reads `done` | `apps/computer/src/cloud-agents/report-from-result.test.ts` (W2) |
| A provider question settles `needs-you` with the question as its ask and no person | `apps/computer/src/cloud-agents/claude/observation.test.ts` |
| Cursor and Claude both send a follow-up only after every earlier turn settles | `apps/computer/src/cloud-agents/send-delivery.test.ts` |
| A carrier that reconnects reconciles every unsettled turn it holds | `apps/server/test/worker-reconcile.test.ts` (W2) |
