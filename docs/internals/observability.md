---
summary: Effect-owned logs, OpenTelemetry traces and metrics, safe attributes, Server-to-Computer propagation, and the runner turn-span relay.
read_when:
  - adding telemetry, logs, spans, metrics, or operational diagnostics
  - changing the runner's turn span, its trace context, or the Server relay that re-exports it
  - changing Server-to-Computer commands or Effect process runtimes
  - configuring an OTLP collector
  - confirming a run's execution journal reached the Server, or checking a Computer's or the runner's journal resend pass
---

# Observability

The target architecture gives Haus Server and Haus Computer one Effect
runtime each. The Server runtime and Computer attachment-daemon runtime are
active through Harness turn streaming and sandbox process ownership.
Each runtime is also the observability boundary: it installs the process logger and, when an
OTLP endpoint exists, OpenTelemetry trace and metric exporters. Product modules
describe domain operations; `@haus/effect` owns exporter setup, shutdown,
privacy filtering, and Promise-to-Effect tracing.

The combined cloud-work and cross-process trace contract requires Computer protocol 15. Earlier Computers
remain connected only for the existing update workflow; they must not receive
ordinary commands with fields their strict schemas reject. Server acquires
reminder-retention and stale-task sweeps in its Effect scope, joining their
in-flight writes before closing the database. Their fixed-interval timer
adapter remains an explicit exception in the lifecycle policy.

With no `OTEL_EXPORTER_OTLP_ENDPOINT` or signal-specific endpoint, telemetry is
a local no-op and performs no network I/O. `OTEL_SDK_DISABLED=true` is the
explicit off switch. Haus uses OTLP over HTTP and honors the shared or
signal-specific header variables declared in `.env.schema`.

Nothing configures an exporter by default: development, the hosted Server, and
released Computers all run with telemetry as a no-op. To inspect traces or
metrics locally, point the endpoint variables at any OTLP/HTTP collector for
the process under test. Both signal exporters use OTLP/HTTP protobuf. Telemetry
failure never changes Agent-turn behavior.

Telemetry is operational evidence, not the canonical product record. Production
debugging reads the durable records instead: Agent turn records, the delivery
ledger, and synced [execution journals](#execution-journal-sync) in the Server
database, plus the Server and runner logs described in
[Hosted Haus troubleshooting](../operations/haus-server-troubleshooting.md).
Confirm exact messages, silent completion, token usage, and durable turn outcome
in Haus's Agent Activity and Turn Details UI.

## Agent turn timing

Turn spans include monotonic measurements under `haus.turn.*`. The runner takes
them for both harnesses (Claude Agent SDK and Pi) in its shared turn path
(`apps/runner/src/turn/turn-timings.ts`), as whole milliseconds from the moment
it starts the run, which is the turn span's start:

| Attribute | Boundary, in milliseconds |
| --- | --- |
| `harness_ready_ms` | Run start to the native session open; includes connection lookup, journal open, Agent context read, instruction composition, and the bootstrap fingerprint |
| `session_create_ms` | Time inside the native session open or resume, including a failed attempt |
| `first_stream_ms` | Run start to the first normalized harness event of any type, which may be progress, a finish, or an error rather than model text |
| `first_tool_ms` | Run start to the first harness tool-call event; absent for tool-free turns |
| `first_send_ms`, `last_send_ms` | Run start to the first/last Server-confirmed committed send through the runner's `haus` proxy |
| `after_last_send_ms` | Last confirmed send to the moment the runner builds the span frame, after tools settle and the summary is recorded |

`bootstrap_ms` was the Computer's bootstrap-refresh phase. The runner has no
bootstrap refresh, so runner turns never carry it.

Turns with a confirmed send also carry two counts. `haus.turn.sent_chats` is the number of Chats
the turn sent into, and `haus.turn.done_chats` is how many of those received a last send marked
`haus message send --done` ([ADR 0035](../adr/0035-chat-engagement-shows-as-typing.md)). The
difference is Chats left typing until turn end after an answer without `--done`. Silent engaged
Chats appear in neither.

These attributes also accompany returned failed/interrupted turn results when the boundary was
reached. They are not live milestones; they export when the span settles. Missing fields mean
unobserved boundaries, not zero duration. Phase durations overlap the cumulative milestones and
must not be summed together. Neither a first send nor a last send proves that an answer is complete:
acknowledgments are ordinary sends. Held, refused, and ambiguous transport-failure sends do not
produce confirmed-send timings. These timings do not measure App rendering or provider-internal
queueing/reasoning. Synced execution journals remain the detailed tool evidence.

`haus.reasoning.effort` is the setting the runner passed to the harness, not proof of
provider execution policy. `haus.tokens.input`, `output`, `cache_read`, and `cache_write` carry
the same normalized per-turn usage as the durable summary when available. A missing usage object
omits all four; normalized counts inherit the runtime adapter's treatment of unavailable subfields.
The `runner-turn-span` frame's `timings` object takes only these fields: integer milliseconds
from zero through seven days, Chat counts through 10,000 with `done_chats` at most `sent_chats`,
and only the product's known reasoning settings. A frame with any other key or an out-of-bound
value is refused whole. No content or new metric dimensions are exported.

## Trace shape

The first distributed traces cover the operations where failures otherwise
cross the most ownership boundaries:

- Agent dispatch on Server → Agent turn on the runner → MCP discovery or invocation on Server;
- Browser request on Server → Browser operation on Computer;
- MCP discovery and invocation;
- delivery retry sweeps and reminder ticks report aggregate health metrics, not spans.
- Trigger fire persistence, including accepted, duplicate, and refused outcomes.
- Computer wakeups and Agent configuration nudges after durable commits run under the Server
  post-commit supervisor. Their failure cannot turn committed product work into a failed API
  response; the durable inbox remains the retry authority.

Server commands carry only a strict W3C `traceparent`. It is execution context,
not product state: do not persist it in Chats, messages, Agent history, or
execution journals. Receivers reject malformed context at the API boundary and
start a new trace when context is absent.

The runner opens one turn span per run: a child of the start frame's
`traceContext`. A frame without context still gets a turn id for its MCP calls,
but the Server exports no turn span for it. Its MCP client sends that
turn span's `traceparent` to Server MCP routes, so MCP spans are the turn's
children. Each run gets a fresh turn span, so context never carries into the
next turn. The Agent cannot set MCP headers: MCP calls come from runner code,
and the `haus` proxy rebuilds every forwarded request's headers. Malformed
context starts a new trace without changing an otherwise valid MCP operation.
Third-party MCP servers do not receive internal trace headers.

## Runner turn spans

The runner has no exporter and no telemetry credential. After a turn settles it
sends one `runner-turn-span` frame (`packages/haus-api/src/runner-turn-span.ts`)
up the authenticated runner socket, and the Server re-exports it through its own
trace pipeline as `haus.agent.turn` under `service.name` `haus-runner` and
`haus.telemetry.source` `haus-runner-relay`. The socket already carries the
runner token, so the relay needs no extra route, credential, or protobuf
encoding in the runner.

The frame carries the turn span's own id, start and end time from the durable
turn summary, and the Agent, Server, chat, run, model, and runtime ids, outcome,
failure kind, message count, output produced, token counts, reasoning setting,
and the [turn timings](#agent-turn-timing). It never carries message content,
prompts, or tool output. Each frame is one span; ids are bounded to 128
characters, counts to integers, and the duration to seven days. The runner
drops a frame the schema refuses.

The frame names no trace. The Server stamps the trace id, parent span, and
sampling from its own record of the run's dispatch, so a runner cannot place a
span in another run's trace. `RunnerLink` records the `traceContext` of every
`runner-start` it sends in a bounded in-memory map keyed by run id
(`apps/server/src/runner/dispatched-turn-traces.ts`): the first dispatch of a
run wins, entries expire after six hours, and the map holds at most 10,000 runs.
A span is accepted once, only when its Agent and Server ids match the dispatch.
A span for a run this process did not dispatch, dispatched without trace
context, already relayed, or older than the window is dropped. A Server restart
clears the map, so spans of runs dispatched before it are lost.

Telemetry never fails or slows a turn. The span is sent after the turn's summary,
never queued while the Server is unreachable (product frames still queue), and
dropped when the socket already has 1 MiB buffered. The Server drops spans with
invalid ids or timing and logs a relay failure without closing the runner
socket. With no trace exporter configured the span export is a cheap no-op.

A relayed span does not pass through `withTelemetrySpan`, so `relaySpan`
records its operation metrics itself through the same `haus.operation.count`
and `haus.operation.duration` instruments, with `operation` `agent.turn` and
`outcome` mapped from the turn status (`completed` → `success`, `failed` →
`failure`, `interrupted` → `interruption`). Duration is the summary's end minus
its start. These metrics record even when the Server exports no traces, and
they carry the Server's resource (`service.name` `haus-server`), since the
runner has no metric pipeline. Only spans the relay accepts are counted, so a
replayed, foreign, or expired span is not counted twice or at all.

Do not force a Trigger fire and a later inbox drain into one parent chain.
Retries and turns that drain multiple causes make that relationship ambiguous.
Trigger persistence and execution dispatch remain separate timed units.

Every instrumented operation emits `haus.operation.count` and
`haus.operation.duration` with only `operation` and `outcome` dimensions.
Outcomes distinguish `success`, `failure`, and `interruption`. An Agent that
finishes without posting a message is successful; silent completion is not a
missing result. Duration remains in milliseconds, with the OTLP unit `ms` and
finite histogram buckets through one hour. Do not change an existing metric's
numeric unit without introducing a new instrument name.
Each process supplies `service.instance.id` so cumulative metrics from separate
Computers can be distinguished before aggregation. Instance identity is a
resource attribute, not an Agent or turn metric label.
A failed `haus.mcp.operation` span carries `haus.failure.kind`, a closed enum (`auth`, `timeout`,
`http_status`, `jsonrpc`, `protocol`, `transport`, `other`) that splits upstream rejections from
transport loss without recording upstream text. `protocol` marks the MCP request-validation codes
(`-32020`–`-32022`), such as a missing `Mcp-Param-*` header.
Trace spans may add identifiers from the closed allowlist in
`packages/effect/src/telemetry.ts`. Never attach prompts, messages, MCP
arguments/results, file contents, URLs, tokens, arbitrary errors, or user
labels. Add a new attribute only when its operational question is concrete and
its cardinality and sensitivity are understood.

Use `instrumentOperation` for periodic health checks that do not represent a
unit of product work. Use `withTelemetrySpan` for a meaningful operation in an
existing Effect program. Do not surround it with another named `Effect.fn`
for the same work. Scheduler coordination uses `Effect.fnUntraced`, retaining
Effect concurrency and cleanup without exporting helper-function spans.
Use `tracePromise` only at an actual Promise boundary; composing a span inside
an existing program avoids launching a second runtime execution just to trace it.

## Execution journal sync

Every run's execution journal lands in Postgres
([ADR 0048](../adr/0048-execution-journals-sync-to-the-server.md)). To confirm that a given run
landed, query the Server database:

```sql
select j.run_id, j.run_started_at, j.updated_at,
       j.outline is not null as outlined,
       (select count(*) from agent_execution_journal_records r
         where r.server_id = j.server_id and r.agent_id = j.agent_id
           and r.run_id = j.run_id) as records
from agent_execution_journals j
where j.run_id = '<runId>';
```

The row is present with `outlined = true` once the run has settled and fully synced. A run that is
still running has records but no outline yet.

On the Computer, a fully synced settled run has a `<runId>.uploaded` marker next to its journal in
`<dataRoot>/servers/<serverId>/agents/<agentId>/runtime/execution-journal/` (`<dataRoot>` is
`HAUS_COMPUTER_DATA_ROOT`, default `~/.haus/computer`). A journal without a
marker is still pending. The Computer resends every unmarked journal younger than 30 days on
each ordinary connect, newest first and one run at a time. The resend pass needs no command: it
has caught up when every recent journal has its marker. The daemon logs a refused run, a failed
resend pass, or a live run that overflowed while offline to stderr with
a `[haus]` prefix. The runner keeps the same markers for its runs under
`<HAUS_RUNNER_DATA_DIR>/agents/<agentId>/runtime/execution-journal/` (default `/data`), resends
the same way on each connect to the Server, and logs the same failures to stderr. Bulk check per
Agent:

```sql
select agent_id, count(*) as runs, min(run_started_at) as oldest, max(updated_at) as last_sync
from agent_execution_journals where server_id = '<serverId>' group by agent_id;
```

## Hosted MCP processes

`haus.hosted-mcp.lifecycle` measures connector startup/readiness and
`haus.hosted-mcp.request` measures private transport, provisioning, and revocation.
Both carry `haus.mcp.connector` and use the Server release and environment resource.
Existing `haus.mcp.operation` spans retain discovery/invocation outcomes. Local logs
report readiness and restart counts. Arbitrary child output is discarded; worker pid
events are cleanup input only. Server `/healthz` exposes connector readiness and restart
counts, including degraded recovery. See [Hosted MCPs](../operations/hosted-mcp.md).

## Failure contract

Telemetry must not change product behavior. Promise operations cross through
`tracePromise`, which retains the original expected failure object. Defects
retain their complete Effect Cause at existing settlement seams. Exporters are
process-scoped resources and receive bounded flush and shutdown during normal
Server or Computer disposal.

Logs remain the immediate local diagnostic record. Traces connect work across
processes; metrics answer rate, latency, and failure-ratio questions. Do not
duplicate arbitrary logs as span events or use OpenTelemetry as the canonical
product timeline.

User-facing Agent analytics do not query OpenTelemetry. Computer owns one
request-local `AgentActivityRun` per turn. It uses Effect exit and interruption
semantics to pair each semantic operation with exactly one terminal outcome,
then places compact category totals on the durable turn summary. Server stores
those exact totals alongside message and token counts; App uses the live
activity journal only for the expandable timeline and active-turn fallback.
