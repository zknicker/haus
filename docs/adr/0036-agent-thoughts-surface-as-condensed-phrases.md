---
summary: Proposed prototype — the Computer condenses each reasoning block into one short status phrase (Codex titles, else Gemini 3.5 Flash-Lite) that the typing strip shows as a glass thought bubble; raw reasoning never reaches the Server, and nothing is persisted.
read_when:
  - changing the typing strip's thought bubble, chat.onThought, or the agent-thought Computer frame
  - changing how reasoning is captured, summarized, or kept on the Computer
  - enabling HAUS_AGENT_THOUGHTS outside local development or promoting the prototype
---

# ADR 0036: Agent thoughts surface as condensed phrases

## Status

Proposed 2026-09-24, prototype. Behind `HAUS_AGENT_THOUGHTS`, on only for the local
development stack. Amends [ADR 0023](0023-agent-work-projects-as-activity-and-chat-engagement.md)
("reasoning stays on the Computer") and the presentation section of
[ADR 0035](0035-chat-engagement-shows-as-typing.md) ("thought text is never shown").

## Context

The typing strip says an Agent is answering and, through activity faces, what kind of work it
is doing. It cannot say what the Agent is working on. That knowledge exists only in reasoning,
which ADR 0023 keeps on the Computer because it is raw, long, provider-private, and may quote
anything the Agent read.

## Decision

**Condensed phrases may reach the Server; raw reasoning never does.** When a reasoning block
ends, the Computer produces at most one phrase of about seven words, present tense, no trailing
period, capped at 80 characters, with URLs, paths, emails, and token-like strings removed:

1. A block that leads with a bold title (Codex reasoning summaries) uses the title as is, with no
   model call.
2. Otherwise, reasoning from any harness (Claude Code, Grok, Pi, untitled Codex) is rewritten by
   Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, minimal thinking, temperature 0.2, at most 24
   output tokens) through the Gemini API with `HAUS_GEMINI_API_KEY`. One stateless request per
   block, first 3,000 characters only, four-second deadline; a failed or late answer drops the
   thought. The block text goes only from the Computer to Google, never to the Server.
3. Without a key, a local heuristic takes the first sentence without narration filler.

A 38-block eval (six models, blind-graded) chose Flash-Lite for the best quality with p50 0.73s,
p95 1.6s, and one length overrun in 76 calls.

Untitled blocks under 40 characters are skipped, and each run sends at most one thought every
four seconds.

**Transport is volatile and Chat-scoped.** The Computer sends `agent-thought`
`{ agentId, runId, text, at }`. The Server admits it with the same identity checks as an
activity frame (assigned Computer, active accepted run), writes nothing, and announces it once
per Chat that run engages (ADR 0035). `chat.onThought({ serverId, chatId })` delivers it with
`chat.onEngagement`'s access checks. There is no read, replay, or reconnect recovery: a missed
thought is gone.

**Presentation.** A glass bubble rises over the thinking Agent's avatar in the strip, holds for
about two seconds, and leaves; a newer thought replaces it, and the engagement ending clears it.
Faces render above it. Reduced motion crossfades.

## Consequences

- A Server's human members can now read a paraphrase of Agent reasoning. The phrase describes
  the whole run, so a reader of one engaged Chat may glimpse work for another Chat the same run
  engages. Chat scoping limits this to readers of a Chat the run is actually answering.
- Reasoning excerpts from every harness are sent to Google for summarization, a third party
  the Agent's own provider did not choose. This is the prototype's main privacy cost.
- Summaries cost about $0.09 per 1,000 blocks. Codex titles and the heuristic cost nothing.
- The development key temporarily comes from the "Google AI Studio - RankWrangler" 1Password
  item; a dedicated Haus key must replace it before this leaves prototype.
- Claude Code emits reasoning text only because the harness requests summarized thinking
  display; a runtime that omits thinking shows no bubbles.
- Nothing is stored; Activity History, Turn Details, and the execution journal are unchanged.

## Rejected alternatives

**Folding thoughts into `agent.onActivity`.** Activity is a durable, positioned journal with
snapshot recovery; a volatile, content-bearing fact would break both contracts.

**A Server-scoped `agent.onThought`.** Would hand every member paraphrases of work in Chats
they cannot read.

**Sending raw reasoning and summarizing on the Server.** Violates the ADR 0023 boundary.

**Claude Haiku through a warm `claude -p` process.** Fast, but its session history re-sent every
earlier block (about $2 per 1,000 summaries of plan quota), it ranked below Flash-Lite, and it
only fit Claude reasoning.
