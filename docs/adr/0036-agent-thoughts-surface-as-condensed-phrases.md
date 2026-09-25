---
summary: Agent reasoning surfaces as one short first-person phrase in a glass thought bubble on the typing strip — the Server's Gemini 3.5 Flash-Lite rephrasing of a Codex title or a scrubbed reasoning excerpt, skipped when it is only Agent housekeeping, else a filtered local heuristic; always on, never persisted.
read_when:
  - changing the typing strip's thought bubble, chat.onThought, or the agent-thought Computer frame
  - changing how reasoning is captured, excerpted, summarized, or kept on the Computer
  - changing HAUS_GEMINI_API_KEY, the thought summarizer, its SKIP rule, or its fallback
---

# ADR 0036: Agent thoughts surface as condensed phrases

## Status

Accepted 2026-09-25; amended the same day to skip housekeeping and route Codex titles through
the Server. Amends [ADR 0023](0023-agent-work-projects-as-activity-and-chat-engagement.md)
("reasoning stays on the Computer") and the presentation section of
[ADR 0035](0035-chat-engagement-shows-as-typing.md) ("thought text is never shown").

## Context

The typing strip says an Agent is answering and, through activity faces, what kind of work it
is doing. It cannot say what the Agent is working on. That knowledge exists only in reasoning,
which ADR 0023 keeps out of the Server's activity journal because it is raw, long, and may quote
anything the Agent read.

A released Computer runs on a member's machine and never sees the Haus environment schema, so it
cannot hold a summarizer key, and shipping one would leak it. Summarization therefore belongs to
the Server.

## Decision

**Thoughts are always on.** There is no flag. Every Server shows them; only the phrase quality
depends on whether the Server has a Gemini key.

**The Computer excerpts; the Server phrases.** When a reasoning block ends, the Computer sends at
most one `agent-thought` frame:

1. A block that leads with a bold title (Codex reasoning summaries) becomes a finished title
   locally (`kind: 'phrase'`, `text`). Titles that open with an -ing verb gain "I'm"
   ("Inspecting chart data" → "I'm inspecting chart data").
2. Any other block (Claude Code, Grok, Pi, untitled Codex) becomes an excerpt
   (`kind: 'reasoning'`, `reasoning`): URLs, paths, emails, and token-like strings removed, then
   the first 3,000 characters. Blocks with under 40 characters left are skipped.

For either kind, the Server asks Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, minimal
thinking, temperature 0.8, at most 32 output tokens) for one first-person line, with a
four-second deadline; a title rides as `<title>` and an excerpt as `<reasoning>` under the same
instruction. Each request draws one opening style ("I'm…", a bare verb, "Now…", "I think…", a
short reaction, or the thing being worked on) so a run's lines vary; the answer is capped at ten
words. The excerpt is held only for that call and never stored or logged.

**Housekeeping is skipped.** The same prompt tells Gemini to answer exactly `SKIP` when the input
is only the Agent's own process — reading its notes, memory, Manual, instructions, or skills;
checking its inbox or messages; claiming, assigning, or updating tasks; deciding whether or how
to reply; or reading earlier conversation just to orient — and to describe the work instead when
the input also names work on the person's request. `SKIP` drops the thought: no bubble, and no
fallback second opinion. People watching a Chat want to see work on their request; "I'm reading
my memory first" is noise. A labeled set of 32 excerpts and titles
(`apps/server/src/server-agents/evals/thought-housekeeping-cases.json`, half housekeeping, with
mixed cases that must show) measured skip precision 98% and recall 100% over 192 calls; rerun
`agent-varlock -- ./node_modules/.bin/varlock run -- bun scripts/thought-housekeeping-eval.ts`
before changing the prompt.

**Fallback.** Without `HAUS_GEMINI_API_KEY`, or when Gemini fails, refuses, or is late, the
Server shows the title or a local condensation of the excerpt (its first sentence without
narration filler), unless a small keyword filter judges that leading sentence to be the same
housekeeping — "my memory", "inbox", "claim a task", "the manual", "whether to reply" — with an
exemption for sequenced work ("…, then pulling sales"). It is deliberately narrow (it keeps "the
memory leak" and "release notes") and so misses some housekeeping: on the same set, 92% precision
and 75% recall.

Every phrase is one plain line of at most 80 characters with no trailing period and no URLs,
paths, emails, or tokens.

**Rate.** Each run sends at most one thought every four seconds. Blocks that finish inside that
window wait in a single slot where the newest replaces any older one, so the bubble shows current
work without a backlog. This Computer interval is the authoritative limit. The Server also
ignores a run's thought frames, titles and excerpts alike, closer than three seconds apart, before
any lookup or model call, to bound summarizer spend if a Computer misbehaves.

**Transport is volatile and Chat-scoped.** The Server admits a frame with the same identity
checks as an activity frame (assigned Computer, active accepted run), writes nothing, and, once
the phrase is ready, announces it once per Chat that run engages (ADR 0035). Admission runs in
the Computer's frame order; summarization runs as background work so it never delays the
Computer's later frames. `chat.onThought({ serverId, chatId })` delivers
`{ agentId, runId, chatId, serverId, text, at }` with `chat.onEngagement`'s access checks. There
is no read, replay, or reconnect recovery: a missed thought is gone.

**Key.** `HAUS_GEMINI_API_KEY` is a Server secret resolved per lifecycle from the
`Google AI Studio - Haus` item in the Development and Production vaults, delivered to the hosted
Server like every other Server-validated value, and optional in both
([environment](../operations/environment.md)).

**Presentation.** A glass bubble rises over the thinking Agent's avatar in the strip, holds for
about two seconds, and leaves; a newer thought replaces it, and the engagement ending clears it.
Faces render above it. Reduced motion crossfades.

## Consequences

- Reasoning excerpts from every harness pass through the Server to Google, a third party the
  Agent's own provider did not choose. Nothing is persisted on the way.
- A Server's human members can read a paraphrase of Agent reasoning. The phrase describes the
  whole run, so a reader of one engaged Chat may glimpse work for another Chat the same run
  engages. Chat scoping limits this to readers of a Chat the run is actually answering.
- Summaries cost about $0.09 per 1,000 thoughts, paid by the Server's key; Codex titles are now
  paid calls too. The heuristic costs nothing.
- A thought can vanish: a skipped block leaves the previous bubble to fade and shows nothing new,
  and Gemini occasionally skips real work (2 of 96 real-work calls in the eval).
- The frame contract is unchanged, so mixed versions keep working: an older Server still relays
  titles as they are, and an older Computer's titles are rephrased by a newer Server.
- A mixed-version deployment degrades to no thoughts, never to an error: a Server that predates
  this frame ignores it like any unknown frame, and a Computer that predates it sends none.
- Claude Code emits reasoning text only because the harness requests summarized thinking
  display; a runtime that omits thinking shows no bubbles.
- Activity History, Turn Details, and the execution journal are unchanged.

## Rejected alternatives

**Summarizing on the Computer.** The first prototype did this, gated to local development. A
released Computer cannot hold the key, so thoughts could never ship.

**Folding thoughts into `agent.onActivity`.** Activity is a durable, positioned journal with
snapshot recovery; a volatile, content-bearing fact would break both contracts.

**A Server-scoped `agent.onThought`.** Would hand every member paraphrases of work in Chats
they cannot read.

**Claude Haiku through a warm `claude -p` process.** Fast, but its session history re-sent every
earlier block (about $2 per 1,000 summaries of plan quota), it ranked below Flash-Lite in a
38-block blind-graded eval, and it only fit Claude reasoning.

**Relaying Codex titles as they are.** Free, but titles like "Claiming the task" or "Reviewing
memory notes" are housekeeping too, and only the Server can judge them. The frame kind stayed
`phrase` so no protocol change was needed.

**A separate housekeeping classifier before the summary.** A second paid call and more latency
for a judgment the summarizing call can make in the same answer.
