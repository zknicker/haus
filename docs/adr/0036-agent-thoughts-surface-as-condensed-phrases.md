---
summary: Agent reasoning surfaces as one short first-person phrase in a glass thought bubble on the typing strip — the Server's Gemini 3.5 Flash-Lite rephrasing of a Codex title, a scrubbed reasoning excerpt, or a scrubbed description of a started tool action, in terms of the human request the run is answering, skipped when it is only Agent housekeeping, else a filtered local heuristic; always on, never persisted.
read_when:
  - changing the typing strip's thought bubble, chat.onThought, or the agent-thought Computer frame
  - changing how reasoning is captured, excerpted, summarized, or kept on the Computer
  - changing which tool actions become thoughts, or how their descriptions are scrubbed
  - changing HAUS_GEMINI_API_KEY, the thought summarizer, its SKIP rule, its request context, or its fallback
  - changing how a run's repeated thought lines are phrased, extended, or shown again
---

# ADR 0036: Agent thoughts surface as condensed phrases

## Status

Accepted 2026-09-25; amended the same day to skip housekeeping and route Codex titles through
the Server. Amended 2026-09-27: reading what the request is about counts as work, the check on
Gemini's own line catches only clear reply drafting and bookkeeping, and a run's first thought
skips the Server and App spacing. Amended again 2026-09-27: the Server phrases each thought
against the human message the run is answering, and a started tool action becomes a thought
candidate too, so scrubbed command descriptions now travel Computer → Server → Google. Amends
[ADR 0023](0023-agent-work-projects-as-activity-and-chat-engagement.md) ("reasoning stays on the
Computer", "raw tool arguments never leave the Computer") and the presentation section of
[ADR 0035](0035-chat-engagement-shows-as-typing.md) ("thought text is never shown"). Amended
again 2026-09-27: a run's last shown lines ride along so it stops repeating itself, and the App
extends a bubble whose line repeats while it is still up.

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

3. **Actions are thoughts too.** Codex rarely writes reasoning while its tools run (Cove's
   27-second forecast turn had none during the fetch), so when a real tool action starts the
   Computer offers a scrubbed description (`kind: 'action'`, `action`, at most 200 characters):
   a shell command line with URLs reduced to host and path words
   (`curl api.open-meteo.com/v1/forecast`), secret-named flags, headers, and variables emptied
   (`GITHUB_TOKEN=…`, `Authorization: Bearer …`), emails, credentials, and token-like strings
   removed, and absolute paths cut to their basename; a file read or edit as its basename
   (`read launch-checklist.md`); a web search as its query; a page as its host and path words;
   and any other or MCP tool as its name plus up to three short scrubbed scalar arguments,
   never a credential-named one (`password`, `api_key`). Real
   actions are the Activity projector's `running_command`, `reading_files`, `editing_files`,
   `searching_web`, `browsing`, and `using_tool` calls; a shell call that only runs the `haus` CLI
   classifies as skipped there and never becomes a thought, and message checks and sends are not
   actions. Raw output and full arguments never leave the Computer (`thought-action.ts`).

For every kind, the Server asks Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, minimal
thinking, temperature 0.8, at most 32 output tokens) for one first-person line, with a
four-second deadline; a title rides as `<title>`, an excerpt as `<reasoning>`, and an action as
`<action>` under the same instruction. An action adds a short note, sent only with actions: say the
work the action serves in plain words (a forecast API call is "Pulling the forecast"), never the
command, flags, file name, or host, and SKIP reads and edits of the Agent's own memory, notes, or
instructions files. Each request draws one of six opening styles (three bare -ing verbs, "Next,"/"First,", a short
reaction, or "I'm…") so a run's lines vary and at most about a sixth open with "I"; the answer is
capped at ten words. The prompt asks for plain words from the request (the city, the day, the
build), no hedging, no trailing "now", and the work rather than what went wrong ("Double-checking
the dates", not "Fixing those date errors"). `finishThoughtPhrase` also strips a trailing "now" or
"right now", the model's verbal tic. The excerpt is held only for that call and never stored or logged.

**Request context.** A title like "Planning data retrieval" says nothing a person could
recognize, so the Server gives Gemini the request too. Before phrasing, it reads the newest human
message the run engages on (the same visibility rows that make it engage, ADR 0035), across every
Chat it engages, so a run engaged in several Chats is phrased against its most recent request.
Mention links become their label (`[@Blippy](agent://…)` → `@Blippy`), the excerpt scrubber
removes URLs, paths, emails, and tokens, and the first 500 characters ride as a `<request>`
block ahead of the title or excerpt. The request's instructions are appended to the system prompt
only when a request rides along, so a thought without one is judged by exactly the old prompt: an
earlier draft that folded them into the main prompt turned "Claiming weather task and preparing
fetch" into SKIP even without a request. Those instructions say the request is context, never the
input and never a reason to show a line: SKIP is decided from the input alone, as if no request
were given, and claiming, keeping, or closing a task, saving to memory, and drafting, reviewing, or
preparing the Agent's own reply or summary stay SKIP however closely they name the request's topic.
Only when the input is work does the line keep its own verb and object and take the request's
nouns where the input is vague ("Planning data retrieval" for "check the weather in NYC" →
"Checking the weather in NYC"). The no-invention rule widens only to the request:
a place, day, or name may come from the input or the request, never from anywhere else. A first
draft that named the request in the main instructions phrased housekeeping as the request's work
("I'm claiming weather task" → "Checking the weather in NYC") in 14 of 15 paired cases. The request
is read only when the Server has a Gemini key, held for the call, and never stored or logged.

**Housekeeping is skipped.** The same prompt tells Gemini to answer exactly `SKIP` when the input
is only the Agent's own process — reading its notes, memory, Manual, instructions, or skills;
checking its inbox or messages; claiming, assigning, syncing, or updating its tasks; deciding
whether or how to reply; acknowledging or offering to help; or reading earlier conversation just
to orient — and to describe only the work when the input also names work on the person's request.
Reading, searching, or fetching anything the request is about (the checklist, the thread, the CI
logs) is work even when a title frames it as planning or starting ("Initiating focused CI search"),
and so is judging the request itself ("whether the build is safe to ship"). The prompt also forbids
adding a place, day, or name the input does not mention; its earlier examples ("the city, the
day") surfaced as invented details ("Maintaining the build for the city"). `SKIP` drops the thought: no bubble, and no
fallback second opinion. People watching a Chat want to see work on their request; "I'm reading
my memory first" is noise. Composing, drafting, or double-checking the Agent's own reply in the
Chat is housekeeping too ("Ah, let me double-check this draft first" was a real bubble); drafting an
email or document the person asked for is work. Because Flash-Lite still phrases some reply
drafting and bookkeeping, the Server checks the model's line with `isHousekeepingPhrase`, a
narrower list than the fallback filter below: only clear reply drafting ("Drafting the
availability reply", "Planning the acknowledgment send"), the Agent's own memory, notes, or
instructions, claiming or syncing its tasks, and whether to reply. It deliberately keeps lines about
work that merely name an inbox, a manual, memory usage, or a decision, such as "Searching his
email inbox for the invoice" or "Checking memory usage on the worker", which the fallback filter,
formerly applied here too, skips.
A labeled set of 99 excerpts, titles, and actions
(`apps/server/src/server-agents/evals/thought-housekeeping-cases.json`, with mixed cases that must
show, real Codex titles from two spot tests, wording rules, 29 cases that carry a request, and 11
actions) measured over 297 calls on 2026-09-27 skip precision 94% and recall 92%, 16% of lines
opening with "I", and no "now" filler. The request cases pair terse titles, which must name a word
from the request, with housekeeping titles that must still skip. With the request, 4 of 56 shown
lines missed the request's subject; the same cases sent without it (`--no-request`) missed it in
22 of 53 ("Pulling the data records"). The context costs skip recall on the hardest pairs: on the
request cases recall fell from 91% to 82%, because a blocked task or a summary reply that names
the request's topic still sometimes comes out as the request's work ("I'm maintaining task in
progress despite blocker" → "Checking the build status"). Every action case was judged correctly
in all three runs (MEMORY.md reads and edits skipped, `curl api.open-meteo.com/v1/forecast` for a
weather request → "Checking the weather in NYC"). The v5 prompt, unchanged for inputs without a
request or action, scored 91–96% precision and 89–93% recall on the 69 cases it was tuned on, and
the previous prompt and filter 87% and 88%. Flash-Lite at temperature 0.8 moves single-run numbers by about five points. The runner checks filler, length, per-case banned and
required words, and the "I" share; rerun
`agent-varlock -- ./node_modules/.bin/varlock run -- bun scripts/thought-housekeeping-eval.ts --runs 3`
before changing the prompt.

**Repeats.** With the request as context, Flash-Lite pulled a run's lines toward the request's
subject: one replayed turn showed "Checking the build status" three times. Dropping repeats would
leave dead air, so the Server instead remembers the last two lines it announced for each run in
each Chat (in memory, like the spacing guard; forgotten after ten quiet minutes or a restart) and
sends them with the next source: "The previous status was "…" (and before it, "…"). Describe
what's new in this step; don't restate it. If this step is the same activity continuing, you may
say so briefly in new words, or SKIP if it's housekeeping." A system note, also present only
then, says a changed opening or word order is still a repeat and that the new line should take
what the step adds from the input, never invent it. A run's first thought carries neither, so it
is phrased exactly as before. A run engaging several Chats is phrased once per distinct set of
previous lines, usually one. On seven sequences (the spot tests' real turns plus two synthetic
runs that repeat a command, three runs each), consecutive shown lines that repeat fell from 5.1%
duplicates and 14.1% near-duplicates (normalized equality; content-word overlap of at least 0.6)
to 0% and 1.2%; the note alone, without the system note, left 5.2% and 20.8%. Replaying the two
spot tests' eleven turns, repeated consecutive bubbles fell from 5 to 0 over three passes, and
bubbles per turn rose from 2.1 to 2.3.

**Fallback.** Without `HAUS_GEMINI_API_KEY`, or when Gemini fails, refuses, or is late, the
Server shows the title or a local condensation of the excerpt (its first sentence without
narration filler), unless a small keyword filter judges that leading sentence to be the same
housekeeping — "my memory", "inbox", "claim a task", "the manual", "whether to reply", "drafting
the reply" — with an
exemption for sequenced work ("…, then pulling sales"). It is deliberately narrow (it keeps "the
memory leak" and "release notes") and so misses some housekeeping: on the 48-case set, 93% precision
and 67% recall. An action has no fallback: a command line is not a phrase, so without a summary
it shows nothing.

Every phrase is one plain line of at most 80 characters with no trailing period and no URLs,
paths, emails, or tokens.

**Rate.** Each run sends at most one thought every four seconds, whatever its kind. Candidates that
arrive inside that window wait in a single slot where the newest replaces any older one, so the
bubble shows current work without a backlog, with one preference: an action never displaces a
waiting title or excerpt, while a title or excerpt displaces a waiting action, since the model's
own words beat inferred ones. This Computer interval is the authoritative limit. The Server also
ignores a run's thought frames, of every kind, closer than three seconds apart, before
any lookup or model call, to bound summarizer spend if a Computer misbehaves; until one of the
run's thoughts has been announced that window is one second, so a skipped opening ("Claiming the
task") never holds back the first bubble about work. Summaries finish after varying delays, so two
bubbles could still land under four seconds apart; the App therefore holds a thought that arrives
within four seconds of the last shown bubble until that mark, a newer one replacing it while it
waits. An engagement's first thought never waits, so every Agent's first bubble shows as soon as
it is phrased.

**Supply.** Bubbles can only be as frequent as reasoning blocks. Codex reports one bold title per
block and often none while it runs tools: in the 2026-09-27 spot test a 25-second Cove turn produced
two blocks, both housekeeping, so it showed no bubble under any filter. A replay of that test's
eleven turns through every stage lost nothing to the Computer slot or the Server window; the losses
were the summarizer's SKIP and blocks that finished after the `--done` reply. Actions add supply
where titles are silent: replaying the two spot tests' eleven turns (three runs each) with actions
and request context gave that Cove turn one bubble at +20 seconds ("I'm pulling the 3-day NYC
forecast", from its `curl api.weather.gov/…` call) where it had none, and the eleven turns 23.3
bubbles per pass against 21.7 before; each turn's `MEMORY.md` reads and edits were skipped.

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
Faces render above it. Reduced motion crossfades. When the same run's line arrives again, equal
after case, punctuation, and spacing are ignored, while its bubble is still up, the bubble stays
without re-entering: its hold restarts from that moment, capped at eight seconds from when it
appeared so a stuck line still leaves, and the extension neither waits for nor resets the
four-second spacing. The same line after its bubble has left shows as a new bubble, which reads
as "still on it".

## Consequences

- Reasoning excerpts from every harness, scrubbed descriptions of the commands, files, searches,
  and tools each run starts, and the first 500 scrubbed characters of the human message each run
  is answering, pass through the Server to Google, a third party the Agent's own provider did not
  choose. The operator accepted this on 2026-09-27; nothing is persisted on the way.
- A Server's human members can read a paraphrase of Agent reasoning. The phrase describes the
  whole run, so a reader of one engaged Chat may glimpse work for another Chat the same run
  engages. Chat scoping limits this to readers of a Chat the run is actually answering.
- Summaries cost about $0.09 per 1,000 thoughts, paid by the Server's key; Codex titles are now
  paid calls too. The heuristic costs nothing.
- A thought can vanish: a skipped block leaves the previous bubble to fade and shows nothing new,
  and Gemini occasionally skips real work (11 of 234 real-work calls across the two eval runs).
- Mixed versions degrade silently: an older Server still relays titles as they are, and an older
  Computer's titles are rephrased by a newer Server. An `action` frame fits none of an older
  Server's frame shapes, so it falls through as an unknown frame and is dropped; an older Computer
  never sends one.
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
