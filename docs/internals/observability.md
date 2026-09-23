---
summary: Effect-owned logs, OpenTelemetry traces and metrics, safe attributes, and Server-to-Computer propagation.
read_when:
  - adding telemetry, logs, spans, metrics, or operational dashboards
  - changing Server-to-Computer commands or Effect process runtimes
  - configuring an OTLP collector
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

Development Server and Computer processes export directly to Axiom's US East
edge deployment. The production Server exports directly. A released Computer
exports OTLP protobuf to authenticated `/computer/telemetry/v1/traces` and
`/computer/telemetry/v1/metrics` Server endpoints using its existing attachment
credential. Server decodes and rebuilds the payload before forwarding it with
the Server-owned Axiom credential. The relay limits requests to 1 MiB and bounds
the decoded collections. Malformed protobuf and invalid instrument shapes are
rejected. Telemetry failure never changes Agent-turn behavior.

The relay admits only known Computer operations and metric instruments. It
removes arbitrary attributes, events, links, exception messages, scope metadata,
schema URLs, and claimed release information. Server supplies service,
environment, Server ID, and Computer ID from its own configuration and the
authenticated attachment. Metric instance IDs must be UUIDs and are namespaced
under that Computer to keep cumulative streams separate. Agent IDs must belong
to an Agent currently assigned to the authenticated Computer.

Run, Chat, and request IDs remain bounded diagnostic claims. A compromised
Computer can still lie about its own timing and outcomes. These records are not
an authenticated audit trail or an authorization input. Confirm important facts
against durable Haus records.

Operation traces use `haus-operations` and metrics use `haus-metrics`.
Every signal carries the standard `deployment.environment.name` resource
attribute, so dashboards can default to production while retaining direct
development-versus-production comparisons. The independently rotated
`Axiom Development OTLP - Haus` and `Axiom Production OTLP - Haus`
credentials live in their lifecycle vaults. The schema owns endpoints, dataset
headers, and environment identity; test remains offline.

The hosted Server receives this configuration in its rendered production
environment. A released Computer never receives the production Axiom
credential. When no direct OTLP endpoint is present, its daemon runtime falls
back to the authenticated Server relay and marks the signals as production.

Axiom accepts metrics only as OTLP/HTTP protobuf. Both signal exporters use
OTLP/HTTP protobuf. Server's narrow wire-schema projection is checked against
the installed exporters by a loopback test for both signals.

## Operator views

`Haus Operations` answers what happened. Each row is one timed operation,
such as Server startup, Agent dispatch, Agent turn, browser work, or MCP work.
Scheduler checks emit metrics rather than individual spans; their downstream
dispatches remain timed operations. Start with the production filter and the latest
`haus.server.startup` span. Its successful status, timestamp,
`service.version`, `haus.release.id`, and `haus.release.revision` prove that
the corresponding Server release reached its listening state. A git push alone does not.
A startup record is historical evidence, not proof that the process is still
healthy. Check current availability and recent work as well.

Use the recent Agent turns and slow-or-failed turns views for daily triage. A
turn span carries safe Agent, run, model, and runtime identifiers. Open it to
see the trace tree: Server dispatch and Computer execution share a trace when
both sides reported successfully. A missing Computer child is inconclusive:
execution or telemetry delivery may be missing. Confirm the durable turn and
Computer state before attributing it to execution failure. A failed child means
the recorded operation failed. Long gaps between
the Server and Computer spans isolate delivery or queueing delay from model and
tool execution time.

The Agent summary separates completed, silent, failed, interrupted, and unknown
outcomes. Unknown means the turn has no reported product outcome, not that it
succeeded. The completion percentage divides completed and silent turns by
completed, silent, and failed turns. Interruptions and unknown outcomes remain
visible separately. The outcome filter affects turn tables, not headline
denominators. No matching turns produces an empty statistic, not a green zero.

Filter by Agent ID to investigate one Agent. Copy a row's `trace_id` into the
Trace ID field to show its Server and Computer operations in time order.
The trace detail table ignores Agent, service, and outcome filters so they
cannot hide a parent or child operation. The environment and time range still
apply. The background work section groups dispatch, Browser, MCP, and Trigger
operations rather than internal scheduler polling.

`Haus Metrics` answers whether the system is healthy in aggregate. Operation
count is traffic; duration percentiles show normal and tail latency; outcome is
the success or failure split. Effect fiber gauges and counters describe runtime
pressure. A rising active-fiber gauge without matching completions suggests
stuck work. A sudden failure-rate increase or p95 jump is a regression even
when individual turns still succeed. Filter by deployment environment first,
then service and operation. Development and production share datasets so the
same saved views work everywhere without mixing environments accidentally.

Metric rates account for cumulative-counter resets per process before combining
streams. Failed and interrupted operation rates have separate charts. Internal
fiber charts live in a collapsed diagnostics section because fibers are not
Agent turns and fiber failures are not a product failure count.

Telemetry is operational evidence, not the canonical product record. Confirm
exact messages, silent completion, token usage, and durable turn outcome in
Haus's Agent Activity and Turn Details UI.

### Agent turn timing

Completed turn spans include request-local monotonic measurements under `haus.turn.*`:

| Attribute | Boundary, in milliseconds |
| --- | --- |
| `harness_ready_ms` | Turn tracing begins to the main native session creation attempt; includes launch setup, MCP discovery, instruction preparation, and any bootstrap refresh |
| `bootstrap_ms` | Time inside a required bootstrap refresh; absent when no refresh ran |
| `session_create_ms` | Duration of the main native session creation/resumption attempt, including a failed attempt |
| `first_stream_ms` | Turn tracing begins to the first recognized runtime stream event, which may be a finish or error rather than model text |
| `first_tool_ms` | Turn tracing begins to the first runtime tool-call event; absent for tool-free turns |
| `first_send_ms`, `last_send_ms` | Turn tracing begins to the first/last Server-confirmed committed send observed by the Computer proxy |
| `after_last_send_ms` | Last confirmed send to turn result observation, including trailing memory and cleanup work |

These attributes also accompany returned failed/interrupted turn results when the boundary was
reached. They are not live milestones; they export when the span settles. Missing fields mean
unobserved boundaries, not zero duration. Phase durations overlap the cumulative milestones and
must not be summed together. Neither a first send nor a last send proves that an answer is complete:
acknowledgments are ordinary sends. Held, refused, and ambiguous transport-failure sends do not
produce confirmed-send timings. These timings do not measure App rendering or provider-internal
queueing/reasoning. Local journals remain the detailed tool evidence.

`haus.reasoning.effort` is the applied Computer setting passed to the adapter, not proof of
provider execution policy. `haus.tokens.input`, `output`, `cache_read`, and `cache_write` carry
the same normalized per-turn usage as the durable summary when available. A missing usage object
omits all four; normalized counts inherit the runtime adapter's treatment of unavailable subfields.
The relay accepts finite nonnegative timings through seven days, integral token counts through
12 digits, and only the product's known reasoning settings. No content or new metric dimensions
are exported.

## Trace shape

The first distributed traces cover the operations where failures otherwise
cross the most ownership boundaries:

- Agent dispatch on Server → Agent turn on Computer → MCP discovery or invocation on Server;
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

The Computer loopback proxy supplies the active turn's trace context to Server
MCP routes. It ignores Agent-supplied trace headers and clears context when the
turn's runner authority ends. Malformed context starts a new trace without
changing an otherwise valid MCP operation. Third-party MCP servers do not
receive internal trace headers.

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
