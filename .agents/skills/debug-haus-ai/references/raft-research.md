# Raft Research Partner

When the skill's comparison criteria apply, use a dedicated Luna (`gpt-5.6-luna`) subagent at `max`
reasoning early and keep it alive through diagnosis and fix validation. Use a scoped prompt with
`fork_turns: "none"` when model overrides require it. No separate operator request is needed.
Its job is to supply independent Raft evidence and challenge local reasoning.

Ask for a compact first checkpoint within roughly ten minutes: contract, exact local symbols, three
falsifiable questions, strongest challenge, and gaps. Deepen research only after the local evidence
path identifies a subsystem. If research stalls, return partial evidence rather than blocking the
primary diagnosis.

## Evidence Order

Prefer:

1. Raft's public source at https://github.com/botiverse/raft-source, pinned at commit
   `05f7d8fd77d2535f993d5d90b85118438bc18216` (release `v1.13.0-source.1`, daemon `1.0.25`) — clone
   or browse it for exact behavior, rather than reconstructing it from the installed binary/CLI;
2. the installed local implementation and exact runtime symbols, when a question is about what is
   actually deployed rather than what the pinned source says;
3. current public Raft documentation;
4. current Raft blog posts describing product intent;
5. Haus's checked-in Raft-alignment notes and captured recipes;
6. inference, labeled explicitly.

Source starting points (at the pinned commit):

- `packages/daemon/src` — the agent loop, drivers, and the system prompt at
  `packages/daemon/src/drivers/__snapshots__/systemPrompt/common.md`.
- `packages/server/src/services` — delivery, tasks, and reminders.
- `packages/cli/src/commands` — the CLI surface.
- `manual/agent-knowledge` and `manual/recipes` — Raft's Manual content.

Public doc/blog starting points, for product intent the source doesn't state directly:

- `https://raft.build/`
- `https://docs.raft.build/features/agents/external/`
- `https://docs.raft.build/features/messaging/messages/`
- `https://docs.raft.build/features/agents/lifecycle/`
- `https://docs.raft.build/features/agents/troubleshooting/`
- Raft's blog under `https://raft.build/resources/blog/`

Search the public sites for the exact concept under investigation. Use primary pages, preserve page
titles and URLs, and distinguish current documentation from older narrative posts.

## Inspect The Source And Local Runtime Safely

Clone or browse the pinned `raft-source` commit read-only for exact behavior. When the operator also
has Raft Computer/daemon running locally, use that installed implementation only to check what is
actually deployed (e.g. a version mismatch against the pinned source), not as the primary way to
learn Raft's behavior:

- read the pinned source tree directly for exact domain logic, prompts, and CLI flags;
- locate the installed executable with `which`, process inspection, and `launchctl` when checking
  the deployed version;
- inspect installed package metadata and runtime package roots to confirm the running version;
- correlate discovered source with process behavior and public contracts;
- use `strings` on a bundled executable only as a last resort, when neither the pinned source nor a
  newer local source checkout covers the behavior in question.

Likely locations can include `~/.local/bin/raft-computer` and `~/.slock/runtime-pkg/`, but discover
rather than assume. Never print environment values, tokens, cookies, keychains, configuration
secrets, or unrelated message contents. Do not stop processes, mutate installed files, send test
messages, or alter daemon state.

Useful symbols previously observed include:

- `AgentVisibleDeliveryLedger.recordConsumed`
- `AgentVisibleDeliveryLedger.isModelSeen`
- `AgentProcessManager.consumeVisibleMessages`
- `RuntimeNotificationState`
- `sendStdinNotification`
- `deliverMessagesViaStdin`
- `CodexDriver.buildThreadRequest` and `startInitialTurn`
- `prepareManagedMcpRuntimeProxy`

Treat these as search leads, not guaranteed current APIs. Record the installed version and quote
only the smallest relevant implementation fragment.

## Initial Subagent Prompt

Adapt this without inserting a favored diagnosis:

> Act as the Raft research partner for a Haus Agent bug investigation. Work read-only and do not
> edit the Haus repository or the Raft source checkout. Here is the raw symptom and topology:
> [SYMPTOM]. Read Raft's source at https://github.com/botiverse/raft-source, pinned commit
> `05f7d8fd77d2535f993d5d90b85118438bc18216` (release `v1.13.0-source.1`, daemon `1.0.25`) —
> `packages/daemon/src` for the agent loop/drivers/system prompt, `packages/server/src/services`
> for delivery/tasks/reminders, `packages/cli/src/commands` for the CLI, `manual/agent-knowledge`
> and `manual/recipes` for the Manual. Research current primary sources on raft.build,
> docs.raft.build, and the Raft blog for product intent the source doesn't state directly; read
> Haus's specs/raft-alignment material; and inspect the installed local implementation read-only
> only to confirm what's actually deployed. Do not expose credentials or unrelated message
> contents. Return:
> (1) a source-backed behavioral model, (2) exact local symbols or paths supporting it,
> (3) Raft/Haus parity and deliberate divergence, (4) three to five falsifiable diagnostic
> questions, (5) the strongest challenge to the most tempting explanation, and (6) evidence gaps.
> Stay available for follow-up hypothesis and fix review.

For latency reports, include available Axiom and local phase timings in follow-up prompts. Ask
which differences could explain the measured slow stage, not merely which designs differ. Check
the current MCP implementation: old notes saying Raft exposes no Server-managed MCP are not a
current contract. Do not infer a resident-process speedup or prompt-cache benefit without matched
measurements. An optimization may intentionally improve on Raft rather than restore parity.

## Hypothesis Review

After the deterministic repro exists, send the partner:

- the smallest evidence table;
- ranked hypotheses with falsifiers;
- the proposed regression oracle.

Ask:

> Which hypothesis conflicts with Raft's implementation or published contract? What single
> observation best distinguishes the top two? Does the regression preserve a global Agent session
> while proving current-target grounding? Challenge any assumption that is not direct evidence.

Do not accept “Raft does it this way” as sufficient proof. Translate the answer into a local,
observable invariant and test it in Haus.

## Fix Review

Send the behavioral diff or smallest relevant code diff and ask:

> Does this preserve Raft's one-Agent/one-session semantics and delivery accounting? Identify any
> intentional divergence that should be documented. Name the strongest remaining failure mode and
> the focused test that would expose it.

Resolve material objections through repository source and tests. If Haus intentionally diverges,
name the owning product contract and update it rather than disguising the difference as parity.

## Failure Modes Of The Research Process

- One-shot summaries that never see the actual hypotheses or fix.
- Blog or docs interpretation overriding the pinned source's actual behavior.
- Searching only Haus's captured notes while claiming current public parity.
- Dumping broad binary strings or configs instead of reading the pinned source directly.
- Letting the research partner implement the fix and thereby lose independence.
- Substituting architectural confidence for a deterministic local regression.
