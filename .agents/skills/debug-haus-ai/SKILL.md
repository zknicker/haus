---
name: debug-haus-ai
description: Debug AI bugs and performance anywhere in Haus, including model calls, prompts, context, tools and MCP, streaming, usage, and Agent execution. Use for slow, stuck, missing, duplicate, or incorrect AI behavior, including reports from recordings. Investigate with production database records and logs, and use Luna-max Raft research when relevant.
---

# Debug Haus AI

This is the repository entry point for debugging AI behavior and performance across App, Server,
Computer, and shared contracts. Trace the affected request before attributing symptoms to prompt
quality or model speed. Cover model selection and configuration, prompts, context, tools and MCP,
streaming, usage accounting, and execution. Pure visual or layout bugs follow the App UI workflow.

Start with the failing capability; do not assume every AI operation is an Agent turn. The session,
inbox, and delivery guidance below applies when an Agent execution path is involved. For other AI
paths, follow the owning API, model call, stream, or usage mapping and its focused regression tests.
Durable Server records and process logs are the first evidence source for runtime incidents;
Raft research is conditional on a useful architectural comparison, not required for every AI bug.

Use the repository's `diagnosing-bugs` skill too when it is available. This skill supplies the
Haus/Raft domain model and research-partner protocol; `diagnosing-bugs` supplies the general
red-green diagnosis loop.

## Start With The Model

Run the repository's docs-list command and read documents whose `read_when` hints match the
failing capability. For Agent execution, also read
[references/haus-agent-model.md](references/haus-agent-model.md) completely and its core docs.
Preserve the Raft-derived contract: one Agent owns one continuous global execution session across
Chats. Include only the relevant Raft-alignment workstreams.

Confirm the checkout and environment without printing secrets. Follow repository setup and dev-port
conventions. Prefer deterministic tests and seeded fixtures over noisy hosted or local Chats.

## Start With Production Evidence

For a hosted Server outage, HTTP 503, or database-health failure, first read
[Hosted Haus troubleshooting](../../../docs/operations/haus-server-troubleshooting.md).
It owns the Mac mini SSH route, Production-vault key recovery, scoped sudo policy,
and direct process/database checks. Inspect installed grants with `sudo -n -l`;
never infer root access from SSH access or treat a staged policy as installed.
Capture logs and pool/lock evidence before an authorized service restart.

For runtime incidents and performance investigations, read the production records before
declaring timing or failure evidence missing. On the Server host, query PostgreSQL read-only as
the `haus_backup` role:
`docker exec haus-postgres psql --username haus_backup --dbname haus_production -c "<select>"`.
Agent turn records, the delivery ledger, and synced execution journals
(`agent_execution_journals`, `agent_execution_journal_records`) hold the durable turn outcome,
start and end times, and tool evidence. `docs/internals/observability.md` has the journal
queries and `docs/api/agents.md` the turn and delivery records. Bound every query by incident
time and Agent/run identity.

Then read the logs for the same window: `docker logs --since <window> haus-runner` for the Agent
runner, the Server's `logs/server.log` and `logs/server.error.log` with the exact commands in the
troubleshooting doc, and the `Deploy Haus Server` and `Release` workflow run logs
(`gh run view --log`) when the incident follows a release. Join these with local journals and
native session evidence for detail inside the turn. Check failures before journal creation too.
Rows and logs can carry private content: summarize, do not paste. If the host is unreachable, say
so and continue with local evidence; an unqueried source is not missing instrumentation. Offline
deterministic bugs need no production query.

Separate dispatch delay, native preparation, tools, first/last confirmed send, and settlement.
An acknowledgment is not a completed answer, and time between tool calls is not proven inference
time. Match model, reasoning effort, session state, and available service-tier information before
comparing runs. Keep raw content out of telemetry. Add instrumentation only for a named missing
discriminator; distinguish temporary diagnostics from deliberate permanent observability changes.

## Create A Raft Research Partner When Useful

Read [references/raft-research.md](references/raft-research.md) completely. Early in the
investigation, spawn one read-only subagent when session lifecycle, delivery, tool discovery,
context handling, or runtime architecture could explain the symptom. This workflow explicitly
authorizes that delegation without a separate user request. Use `gpt-5.6-luna` at `max` reasoning
with a scoped prompt and no inherited history when the tool supports those settings. If unavailable,
report the fallback model rather than silently claiming Luna-max. Skip the partner for a proven
local defect whose mechanism has no meaningful Raft comparison. Keep it available for the
whole diagnosis; it is a conversation partner and adversarial validator, not a one-shot summarizer.
Timebox its first pass to a compact checkpoint; deepen only the sources implicated by local
evidence.

Give it the raw symptom and ask it to:

1. Read Raft's source: https://github.com/botiverse/raft-source, pinned at commit
   `26f77ef97c40d3d91aa2c5e42b0fd66b8bf39fe6` (release `v1.21.2-source.1`, daemon `1.0.43`, the
   pin in `specs/raft-alignment/prompt-divergences.md`) — clone or browse it read-only rather than reconstructing behavior from the installed CLI/binary.
2. Research primary public Raft sources when source doesn't settle intent: `raft.build`,
   `docs.raft.build`, and Raft's blog.
3. Read the repository's Raft-alignment specs.
4. Return a source-backed behavioral model, parity and deliberate divergences, three to five
   falsifiable questions, and a challenge to the leading hypothesis.

Do not give the partner a suspected answer as fact. Do not let it edit Haus or the Raft source
checkout, or inspect credentials. If the source checkout or the public network is unavailable,
record that evidence gap and continue with repository sources.

## Agent execution diagnosis

Apply the following session and delivery workflow when the affected AI path runs through an Agent.
For other AI paths, use the same evidence → reproduction → fix → verification sequence at the owning
boundary, without introducing Agent session or inbox assumptions.

### Establish A Deterministic Red Loop

Before ranking causes for a fix, reduce the report to a concrete observable:

- exact Agent and target topology;
- preceding work in other Chats;
- current structured envelope, notice, or wake;
- expected target and response behavior;
- actual target and response behavior;
- repeatable command or focused test with a short cycle.

Trace identities through the full path: hosted send, canonical pending delivery, Computer inbox,
delivered/seen ledgers, session input construction, task or thread routing, prompt projection, and
runtime execution. Inspect actual values at boundaries; do not infer them from UI labels.

Use the evidence already collected before adding temporary instrumentation. Give temporary probes
a unique prefix and remove them before handoff. Never log secrets or unrelated conversation bodies.

If the task is read-only, hypothetical, or lacks the state needed for a red run, produce an
**evidence-only checkpoint** instead: state the leading mechanisms and confidence, identify the
single missing discriminator, and specify the red-capable test to run once mutation or fixtures are
available. Do not present a provisional mechanism as the exact cause.

## Form And Challenge Hypotheses

Write three to five ranked, falsifiable hypotheses. Prefer mechanisms that explain every observed
fact. Explicitly test whether:

- the concrete request was delivered with the exact target;
- the identity became model-visible exactly once;
- a content-free notice reintroduced already consumed work;
- a stale notice had already entered the live runtime before persisted state was reconciled;
- a cursor or pending target advanced too early or too late;
- batching collapsed multiple targets into one active Chat;
- stale task metadata was presented as the current request;
- the model merely chose poorly despite correct input.

Send the evidence table and hypotheses to the Raft partner. Ask it which hypothesis conflicts with
Raft's implementation or contract, what observation would distinguish the top two, and whether the
proposed test oracle is strong enough. Update the ranking from evidence, not authority.

## Regress, Fix, Validate

For development prompt iterations, reset the test Agent's session before behavioral verification,
using the session-only reset that preserves workspace memory and Chat history. Confirm the fresh
native session received the revised instructions before judging model behavior. A new Channel alone
does not create a new session. Reserve the managed Agent prompt-version bump for release; do not bump
it for each local edit. Capture any failing session evidence before resetting it.

Add a focused regression at the smallest boundary that reproduces the actual mechanism before
changing implementation. For context-misassociation bugs, the oracle must keep the global session:
prior work in Chat A, then a concrete request in Chat B, with Chat B delivered once and grounded as
the current request.

Separate proof into two layers:

1. A deterministic structural test records every resumed Harness input and proves target, identity,
   ordering, visibility, and notice accounting.
2. An optional behavioral eval proves the model answers an ordinary request appropriately once its
   input is correct.

The structural test is the delivery/state-machine oracle. Do not make model wording its primary
assertion.

Implement the smallest root-cause fix. Do not create per-Chat sessions, replay full Chat histories,
or hide unrelated context unless the product contract is intentionally changing. Delete temporary
instrumentation and obsolete paths.

Then send the proposed behavior or diff to the Raft partner. Ask it to validate parity, identify any
intentional divergence that must be documented, and name one remaining failure mode. Resolve
material objections with local proof.

Run the focused regression, the owning package's test/build lane, lint and type checks required by
the repository, and the repository's pre-ship review skill. Prompt changes additionally require the
guarded prompt contract suite, operator-visible snapshot review, and behavioral evals specified by
the repository.

## Report

For a completed fix, lead with the exact cause. For a diagnosis-only checkpoint, lead with the
highest-confidence mechanism and missing discriminator. Explain why the global session remains
correct, which delivery or grounding invariant failed or may have failed, the smallest fix or next
test, deterministic proof, Raft validation, and any unverified gap. Distinguish direct evidence,
source-backed contract, and inference. Name the production query window and run ids, what the records
and logs established, and remaining gaps. Describe Raft comparisons as implementation evidence unless matched timing was
actually measured. When Grok Bot comparison is relevant, use current primary documentation and
bounded installed-app inspection; keep its undocumented model loop and latency claims explicit gaps.
