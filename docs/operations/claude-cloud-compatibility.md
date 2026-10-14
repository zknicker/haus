---
summary: Native Claude Code cloud integration evidence, automation gaps, and proposed mapping to Haus Cloud Agent work states.
read_when:
  - adding the Claude Code Cloud connection or Computer adapter
  - mapping Claude session and turn states to Cloud Agent cards
  - deciding whether native Claude cloud controls satisfy the CloudAgentProvider contract
---

# Claude Code cloud compatibility

## Continuation checkpoint (2026-10-14)

This is an implementation checkpoint, not a release-ready integration. Continue from the
current branch without assuming the final hosted verification passed.

- Recreate an isolated public HTTPS verifier and a dedicated native Network Secret, then
  prove question → delegating Agent inbox → delayed answer → native consumption using the
  final `X-Haus-Cloud-Run` transport. Earlier prototype success predates that transport fix.
- Investigate cancellation targeting when an accepted native Run remains active and a newer
  queued follow-up fails. `request-cloud-agent-cancel.ts` currently selects the newest Run and
  rejects terminal Work status; that can lose the active execution target. Add a regression
  through the real cancel dispatch, not only a simulated final native observation. Also check
  the card's Stopping projection when Work status reflects that failed follow-up.
- The temporary verifier expired after a machine restart. Its appended native Setup installer
  and allowlisted host were removed, preserving BidBeacon's base setup. The saved test Network
  Secret named “Haus Claude Cloud verification” still needs removal. Do not reuse that dead
  endpoint or assume a local verifier credential remains available.
- The Development 1Password bootstrap requires operator rotation after an earlier environment
  editor inspection exposed its value in tool output. Coordinate rotation with Cursor's shared
  identity; do not commit or copy that credential into the integration.

Latest local verification passed: full Server suite, Computer suite (1,072 passed, 36 skipped),
lint, and repository typechecks. Earlier App, API, Manual, and focused Swift checks also passed.
These checks do not establish the final hosted round trip or production activation.

## Integration status

Haus now wires independent Computer settings, provider selection, provider-scoped models, native
Claude launch/follow-up, managed callback hooks, durable input mediation, Agent-only stop, and
Pending input cards on web and iOS. Focused tests cover restart recovery and callback/launch races. Production
activation remains gated on a public HTTPS Server and a fresh native environment verification.
No production deployment or native Network Secret installation is implied by passing local tests.

Fresh VM setup and native bootstrap verification passed against an isolated public verifier.
The live bridge exposed a stripped `Authorization` header; native callbacks and input reads now
use `X-Haus-Cloud-Run` with the same per-execution credential checks. HTTP regression tests pass,
but the full hosted question/answer flow with that header still needs verification. The temporary
verifier was lost in the machine restart on 2026-10-14; its credential cannot activate production.

The installed local Claude CLI `2.1.282` was used for native launches on 2026-10-13. Fresh private
checkout launch succeeded through the production adapter without human trust input:
[adapter launch proof](https://claude.ai/code/session_01UbdbHi1VSV8nkwSEXoEhpd).
This local version does not establish the hosted executor's version. The bootstrap verification
requires protocol 1 and fail-closed hook support (currently version 2.1.295 or newer).

A hosted probe honored `--model haiku` but did not receive inline `--settings` environment
variables or hooks. An invalid inline remote environment ID was ignored. Therefore Haus uses
the native account's default environment selected with `/remote-env`; it does not expose a
misleading environment-ID setting. The secure setup uses native Network Secrets and the native
environment Setup script, with a dedicated callback credential instead of an OP bootstrap.
Network Secrets attach after Setup, so the nonsecret hook installer is publicly downloadable and
the Server host must be explicitly allowed for that download. Runtime bootstrap and callback
operations remain authenticated. The two native credentials use distinct headers:
`X-Haus-Cloud-Bootstrap` for connection handoff and `X-Haus-Cloud-Run` for execution callbacks.

## Native control evidence

| Operation | Observed result |
| --- | --- |
| `claude --cloud <prompt>` from BidBeacon | Created a hosted session, printed its ID and URL, exited successfully. Required an interactive terminal. |
| Repository and environment | Hosted checkout at `/home/user/repo`, HEAD `691d692`, saved BidBeacon Claude Cloud environment, automatic fleet hook, skills, and loopback PostgreSQL ready. |
| `claude -p --cloud <session-id> --output-format json <prompt>` | Returned `{ok, session_id, url}` and delivered a follow-up to the same session. The result acknowledges delivery, not execution completion. |
| New launch with `-p --cloud <prompt> --output-format json` | Rejected with exit 1: new cloud creation is interactive only. |
| `claude --cloud <session-id>` | Rejected with exit 1: attaching to an existing cloud session is not enabled for this account. |
| `claude agents --json --all` | Lists local/background sessions; the hosted probe was absent. Not a cloud status reader. |
| `claude stop <cloud-session-id>` | Rejected with exit 1: no matching local job. Not cloud cancellation. |
| Native question | AskUserQuestion produced an explicit Awaiting input state and pending question controls in the cloud UI. |
| Answer sent as ordinary CLI follow-up | Delivery was acknowledged, but the structured question remained pending. Selecting its option in the UI resumed the probe. |
| Background task | Session sidebar read Idle and response was finished while a Bash task was still running. Idle is not a job completion signal. |
| Stop background task in UI | Task changed to Stopped. This proves task cancellation, not cancellation of the entire hosted job. |
| Stop a pending question turn in UI | UI passed through Stopping, then marked the question tool Stopped and the response finished. The local stop command does not control hosted work; the native controller proof is below. |
| Follow-up after UI stop, from a new CLI process | Delivered to the same session, confirmed stopped question and sleep task, returned the final receipt marker, and reported a clean checkout at the same HEAD. |

Probe session: [Haus native cloud lifecycle probe](https://claude.ai/code/session_0155ngXGBGXBFf2mhdmMbGrg).
UI observations corroborate execution but are not a machine observation API
for the production Computer adapter.

Environment selection uses the native account default. The prescribed `/remote-env` selection
is an operator step; Haus does not mutate it per job. Inline settings overrides were tested and
did not configure the hosted environment.

## Work-state mapping

The implemented mapping extends ADR 0041 and the shared schemas with Pending input.
Unverified lifecycle signals in the table remain investigation notes, not inferred outcomes.

| Claude evidence | Haus job presentation | Rule |
| --- | --- | --- |
| Session provisioning, cloning, setup, active execution | Working | Setup phases belong in the activity line, not new headline states. |
| Correlated native technical question | Pending input, new nonterminal state | Require a provider signal. Carry the reason and the provider page link; notify the delegating Agent once per new wait. Questions were live-tested. Permission waits remain unverified and are not synthesized into this state. |
| Idle with outstanding background tasks | Working | Preserve pending-work evidence; do not settle from idle or assistant prose. |
| Confirmed completion of the delegated execution | Done | Require a correlated completion result and no outstanding work for that execution. |
| Individual tool failure followed by normal continuation | Remains active until execution settles | A failed tool is not automatically a failed job. The probe recovered from a failed path lookup. |
| Confirmed execution failure | Failed | Preserve the actual provider error; do not infer failure from an account access error or observation outage. |
| Confirmed interrupted execution after a stop | Cancelled | A stop request first uses the existing Stopping overlay. Cancelling one background task does not prove the whole execution stopped. |
| Environment reclaimed with recoverable session history | Separate session availability | Do not automatically expire completed work. Determine what outstanding execution was lost and whether it can resume. Not live-tested. |
| Session archived | Unavailable for new follow-ups | Do not relabel historical Done work as Cancelled or Expired. Not live-tested. |
| Missed observations or Computer disconnected | Existing freshness warning | An observation outage is not a provider job outcome. |

Cursor's Working, Done, Failed, Cancelled, and Expired mapping remains intact.
Do not remove shared states because Claude does not emit the same vocabulary.
Each adapter emits only states it can substantiate. Pull-request state remains
independent from execution state, and follow-ups still queued inside Haus do
not replace the previous accepted execution's headline.

A confirmed input wait takes priority over elapsed silence in the card's
status line. Show what needs answering rather than replacing it with a generic
No update warning. Preserve the existing height-stable card and Open in Claude
action; do not add an embedded copy of Claude's question form in the first
integration.

Claude's session ID alone is insufficient as the identity of every follow-up.
The adapter must correlate each accepted prompt with its own execution and
outcome. No provider turn-ID or idempotent launch contract was established by
the tested CLI receipts. Never resend an uncertain launch or silently switch
providers because the launch command timed out.

The existing card derivation uses `providerRunId !== null` to identify the
newest execution the provider accepted. That is backed by Cursor's Run API.
Claude's session-only delivery acknowledgment cannot fill that field with a
different genuine provider Run ID for every follow-up. Establish an explicit
delivery receipt and outcome correlation at the adapter boundary before
changing the derivation; never fabricate vendor identities from Haus IDs.

## Input mediation

The operator's selected interaction model is Agent-mediated input. The card's
top-right chip reads Pending input; it contains no multiple-choice controls.
A cloud question creates one durable inbox attention for the Haus Agent that
delegated the work. That Agent answers from the task instructions and known
context when it can. Otherwise it asks the human through an ordinary message
in the originating Chat or work Thread, then relays the answer and resumes the
cloud execution. Server does not post the question as unsolicited chat prose.

Represent a pending request independently from terminal result attention:
request identity, work and execution identity, question text and answer
constraints, creation time, and answer/resolution status. Repeated observations
of the same request must not produce repeated inbox wakes. Only the delegating
Agent and authorized human managers may resolve it. An answer must target the
still-pending request; cancellation or a superseding request makes a late
answer stale. Keep the card Pending input during human escalation rather than
marking the work failed or done.

Questions and permission grants are different. A delegated technical choice
can use the Agent's existing authority. A request to expand access or perform
an action outside that authority must retain its human approval requirement.
Do not solve input handling by switching to bypassPermissions.

### Native answer path, live-tested

In an isolated fixture, the repository's PreToolUse hook answered the real
AskUserQuestion call with the original questions and a structured answers
mapping. The hosted session continued and returned the fixed probe answer
alpha without a UI click. No product repo, Cursor configuration, credential,
or Haus runtime was changed by this test.

[Hosted question-hook probe](https://claude.ai/code/session_01Eu6xh6sJwV9yVNjC5To49h).
This proves native answer injection, not the complete Haus inbox bridge.
It corrects the earlier implication that a hosted native question necessarily
requires a person to answer in Claude's UI.

Anthropic documents SDK canUseTool callbacks for questions and approvals,
structured hook answers, and an unattended print-mode switch
`--permission-prompts none` that removes AskUserQuestion and denies unresolved
approval prompts. The SDK callback describes a process the application owns;
it is not established as a controller for an existing web cloud session.
Similarly, the unattended print-mode switch was not verified on the hosted
cloud launcher. Prefer mediated questions for the Haus integration rather
than disabling them globally.

The supported hook input also includes prompt and tool-call identities, a
possible route to correlation missing from the CLI acknowledgment alone.
Hooks can provide an authenticated callback path; the work-scoped callback,
durable answer storage and explicit delayed continuation are proven below; VM-loss and production recovery remain unverified.
Do not keep a hook blocked indefinitely while waiting for a human.

### Hosted deferral, live-tested limitation

A second isolated fixture recorded selected hook identity fields, returned
PreToolUse defer for its first question, and recorded a later answer through
UserPromptSubmit. The hosted UI marked the initial question Stopped. The later
CLI message ran, but the original tool result had become an internal error;
the original question tool did not re-enter PreToolUse. The answer arrived as
a new conversational message, not a result for the deferred tool.

[Hosted defer/resume probe](https://claude.ai/code/session_01Ux2VnKvY6PzfiN1cn3pUpN).
Its receipt log confirmed a shared promptId for the original prompt and
question, a genuine toolUseId, and a different promptId for the answer message.
This improves the correlation evidence, but does not establish durable
native-cloud tool resumption.

The SDK documents defer and resume for an application-owned print-mode
process. Do not assume its semantics transfer to the web session's driver.
The proposed Haus bridge must persist the input request and answer, enforce
request identity, and explicitly continue the work after a delayed answer.
Prove that round trip before shipping it; SDK callback support and the
immediate hook answer do not by themselves prove long-lived hosted waits.

### Delayed Haus mediation, hosted proof

The throwaway [prototype](../../apps/server/test/prototypes/claude-input/README.md)
uses a real disposable Haus Server and PostgreSQL database. A native hook registers
one question and fires an Agent-owned Trigger with an idempotency key. Haus stores
one real inbox item while its Computer is offline. The Server restarts before the
Computer attaches and receives/acknowledges the concrete inbox start frame.

A bounded Claude invocation reads that actual envelope plus original task context.
The prototype Computer driver relays its answer using a real Agent runner credential,
then sends an explicit native CLI continuation to the same hosted session. The
resumed PreToolUse hook supplies the original questions and stored answer to a new
AskUserQuestion. Only PostToolUse consumption resolves the durable input request.
This substitutes a small driver for the production Haus Computer turn runner;
production tool wiring and human escalation are not yet verified.

Two hosted trials delayed the answer by at least one and two minutes, after the
original Stop and a Haus restart. Native consumption carried a new genuine prompt
and tool-use identity; Claude's actual Bash output read back `alpha` from the proof
file. [First hosted trial](https://claude.ai/code/session_01BvNSogSh8YqMirvQu5v8pL)
and [second hosted trial](https://claude.ai/code/session_01MmFJfdk6ZTMsupBzQovMrW).

The live test also established that native hook `session_id` is a runtime UUID,
while the CLI uses a separate hosted `session_...` identity. Store both explicitly.
Do not pass the hook UUID into `--cloud` or confuse native Idle with resolved input.

Focused PostgreSQL integration coverage checks restart recovery, inbox deduplication,
runner authorization, wrong-session and changed-question rejection, idempotent
answers/receipts, conflicting answers/receipts, and cancelled requests.

The production version needs atomic request/inbox registration and a dedicated input
inbox source, a work-scoped callback credential, durable continuation dispatch,
ambiguous-send reconciliation, and VM-loss/cancellation recovery. The prototype
Trigger and job-specific HMAC are deliberately temporary.

## Programmatic interruption, live-tested

The earlier cancellation conclusion was too broad: `claude stop` does not manage hosted
sessions, but the cloud worker accepts native `control_request` events with
`request: { subtype: "interrupt", cancel_queued: true }`. On 2026-10-13, the installed
CLI's headless cloud stream transport rejected attachment (`--output-format stream-json`
unsupported). Its binary nevertheless contains the native cloud interrupt controller.

A scoped probe used the existing native Claude OAuth login in memory, posting the event to
`POST /v1/code/sessions/<id>/events` on `api.anthropic.com`, with the controller envelope
`{ session_id, events: [{ payload: <native control request> }] }`. No credentials were copied
to a new store or exposed in prompts or evidence. The session's public `session_` address maps
to the API's genuine `cse_` identity; both identify the same hosted session.

Two independent interrupts were verified in
[the hosted fixture](https://claude.ai/code/session_01UbdbHi1VSV8nkwSEXoEhpd):

- A pending AskUserQuestion changed from `requires_action` to `idle`; the UI marked it Stopped.
- An executing turn changed from `running` to `idle`. The event stream emitted
  `task_notification` with `status: "stopped"` for the probe's actual Bash task.

Both returned a native `control_response` success matching the caller's request ID, with
`cancelled: []` and `still_queued: []` (neither trial had queued follow-ups). HTTP acceptance
alone was not used as cancellation proof. A later native CLI follow-up returned
`HAUS_CLOUD_CANCEL_RESUME_OK` in the same session. Interrupt ends current work, not the durable
conversation. Native queued-message sweeping and permission waits remain separate live-test gaps; Haus queue fencing and restart recovery have deterministic coverage.

This is a working first-party protocol behind an **internal, undocumented controller API**.
The community implementation below documents it from source; it is not an Anthropic support
guarantee. Anthropic's documented Managed Agents `user.interrupt` event is a different
API-key product (`sesn_` sessions), not a controller for subscription Claude Code cloud sessions.

Haus exposes interruption through the delegating Agent's `haus cloud-agent stop`, using the
existing native credential loader. Human cards retain their existing design without a Stop
button. A turn interrupt alone leaves explicitly backgrounded Bash tasks running. The adapter
first sends native `stop_task` requests with durable task-specific request IDs, waits for their
matching success responses and terminal task notices, then sends the final turn interrupt. This
sequence passed through the production controller and coordinator against an executing hosted
fixture on 2026-10-13. Computer journals one immutable intent before dispatch and recovers the matching native
receipt after restart. A receipt must confirm an empty queue; idle execution and terminal receipts
for tracked tasks are also required. HTTP acceptance or idle alone never means Cancelled.
Uncertain delivery remains Stopping without a fresh blind interrupt. Known scheduled wakeups
block cancellation pending native cleanup; the controller does not provide a complete schedule
inventory, so unknown counts are never claimed as proven absence.

Server invalidates pending questions and fences follow-ups while stopping. Confirmed cancellation
settles the fenced live Runs; a later send creates a new Run in the same session. Claude
`send --interrupt` is refused before admission: stop, wait for Cancelled, then send. The native
interrupt is session-wide and lacks a prompt compare-and-set, so concurrent Claude UI submissions
remain outside Haus's serialization. Native environment activation still requires a public HTTPS
Server and a fresh bootstrap verification.

Sources: [controller implementation](https://github.com/ThatCrispyToast/claude-rc-api/blob/main/API_REFERENCE.md#32-sending-events-steering),
[Anthropic cloud CLI contract](https://code.claude.com/docs/en/claude-code-on-the-web#send-follow-ups-from-the-cli),
[separate Managed Agents interrupt API](https://github.com/anthropics/skills/blob/main/skills/claude-api/curl/managed-agents.md#interrupt-a-running-session).

## Sources

- [Claude cloud launch and follow-ups](https://code.claude.com/docs/en/claude-code-on-the-web).
- [Hosted environment selection](https://code.claude.com/docs/en/cloud-environments#select-an-environment-from-the-cli).
- [CLI reference and local background controls](https://code.claude.com/docs/en/cli-reference).
- [SDK question and approval handling](https://code.claude.com/docs/en/agent-sdk/user-input).
- [Native hook answer and defer contracts](https://code.claude.com/docs/en/hooks#tools-that-require-user-interaction).
- [Unattended print-mode behavior](https://code.claude.com/docs/en/headless#turn-off-permission-prompts-in-unattended-runs).
- [Current Haus Cloud Agent contract](../../specs/cloud-agents.md).
- [ADR 0041: Cloud Agent cards mirror Cursor](../adr/0041-cloud-agent-cards-mirror-cursor.md).
