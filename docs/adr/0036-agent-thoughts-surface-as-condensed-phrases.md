---
summary: Agent reasoning surfaces as one short first-person phrase in a glass thought bubble on the typing strip — the Server's Gemini 3.5 Flash-Lite rephrasing of a Codex title, a scrubbed reasoning excerpt, or a scrubbed description of a tool action (with a scrubbed excerpt of what a finished one returned, so it can state a finding), in terms of the human request the run is answering, skipped when it is only Agent housekeeping, else a filtered local heuristic; paced by workstream with "still" lines after a quiet stretch; always on, never persisted.
read_when:
  - changing the typing strip's thought bubble, chat.onThought, or the agent-thought Computer frame
  - changing how reasoning is captured, excerpted, summarized, or kept on the Computer
  - changing which tool actions become thoughts, or how their descriptions are scrubbed
  - changing which tool results ride a thought, or how result excerpts are scrubbed
  - changing HAUS_GEMINI_API_KEY, the thought summarizer, its SKIP rule, its request context, or its fallback
    - changing how a run's repeated thought lines are phrased, extended, or shown again
  - changing how often a request's thoughts show (the workstream cadence, still lines) or the novelty gate
  - changing how long a thought bubble holds on screen
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
extends a bubble whose line repeats while it is still up. Amended 2026-09-28: a line speaks in
the Agent's own voice about its own step and never narrates what the requester wants or asked.
Amended 2026-09-29: few bubbles, each worth reading. The Server paces each request's thoughts (the
first early, then 20-, 30-, 45-second gaps), shows a later line only for a new phase or a result,
drops lines that reword one already shown or name tools and formats, and the prompt reads like a
thinking summary with no forced openers. Amended again 2026-09-29: a finished command, search,
page, or tool sends a scrubbed excerpt of what it returned so a line can state a finding; the
time ladder gives way to a workstream cadence (a new part of the work or a finding shows after a
short floor, and the same work continuing shows a "still" line only after a quiet stretch); and
bubbles hold five to seven and a half seconds.

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
   actions. Full arguments never leave the Computer (`thought-action.ts`).
4. **Results are findings.** Titles, excerpts, and actions only say what the Agent is doing; a
   person waiting wants what it found. So when a running command, web search, page, or tool
   finishes, the Computer offers its description again with a `result`: an excerpt of what it
   returned, at most 400 characters (`thought-result.ts`). It reads each runtime's text shape
   (Codex's `formatted_output`, a `stdout`, text content parts, a plain string), skips failures
   (a tool error or a nonzero exit code), strips markup and JSON punctuation, and scrubs every line
   at least as hard as a command line: URLs to host and path words (credentials and queries
   gone), emails, paths to basenames, token-like strings, the values of secret-named flags,
   headers, and keys (`"api_key":"…"`, `Authorization: Bearer …`), and the value of every
   environment-style assignment (`HOME=…`, `DATABASE_URL=…`). Under 24 meaningful characters (a
   status code, "ok") sends nothing. No result is ever sent for file reads or edits (contents and
   diffs are not findings), for an action whose description names a credential (`token`, `auth`,
   `bearer`, `cookie`, `api_key`, `secret`, `password`), reads the environment or a secret store
   (`env`, `printenv`, `op`, `varlock`, `security`, `.env`, `.netrc`, key files), or touches Haus
   bookkeeping (a `haus` call inside a compound command, `MEMORY.md`, `notes/`, `AGENTS.md`,
   `SKILL.md`). An earlier draft also refused any description with a scrubbed `…` in it; live,
   that dropped the forecast, because a long field name (`precipitation_probability_max`) scrubs
   as token-like, so the check names credentials instead. The Server passes the excerpt to one
   summarizer call and never stores or logs it; a frame whose excerpt fails the schema is dropped
   whole, silently. Codex, Claude Code, Pi, and Grok Build all reach the Computer through the AI
   SDK harness's `tool-result` part, so every runtime sends results; live coverage is Codex
   (`formatted_output`), and the Claude Code and Pi text shapes are read but not yet seen live.

For every kind, the Server asks Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`, minimal
thinking, temperature 0.8, at most 32 output tokens) for one first-person line, with a
four-second deadline; a title rides as `<title>`, an excerpt as `<reasoning>`, and an action as
`<action>` under the same instruction. An action adds a short note, sent only with actions: say the
work the action serves in plain words (a forecast API call is "Pulling the forecast"), never the
tool, command, flags, file name, or host, and SKIP reads and edits of the Agent's own memory,
notes, or instructions files. A result rides as `<result>` after its action with one more note,
sent only then: when it plainly shows something the person would want (a forecast, a price, a
version, a count, a yes or no), reply with that finding in at most eight plain words instead of
the activity, with no -ing opener needed; read codes and field names for their meaning but never
quote the result or copy its lines, field names, codes, or markup; never state a finding it does
not show; and when it shows nothing clear (errors, links, status codes, markup, a fragment),
describe the work as usual. Its cue asks for "the finding or the status line". The note's first
draft used "Saturday looks wet, Sunday's clearer" as its example, and the forecast cases answered
with exactly that sentence; with the example gone, those cases fell back to the activity until the
cue named the finding. The examples are now from other domains ("The newest release is 2.3.1",
"The day pass is €12", "All five checks passed"). The answer is capped at ten words.

**Voice.** The line reads like a thinking summary (`thought-v21-findings`, in `thought-summary-prompt.ts`): at most eight plain words
anyone could follow, naming what the work is about, never how it is done — no tools, commands,
formats, or plumbing (CLI, API, JSON, markdown, jq, curl, script, file, path, tags, "requesting the
data") — opening with an -ing verb that names the one specific thing ("Reconciling the date
formats", not "Working on the export"), or, when the input itself states a result, that result.
Never a place, day, name, or result the input does not mention: an example result in an earlier
draft ("Saturday looks rainy") came back verbatim for a weather title that said no such thing. No
"I think", no filler opener ("Next,", "OK,", "Hmm,", "Still"), no "now", and the work rather than
what went wrong ("Double-checking the dates", not "Fixing those date errors"). Earlier prompts drew
one of six openings per call, including "Next,"/"First," and "Hmm,"/"OK,", so lines varied; live,
that read as filler ("Next, requesting the API data", "OK, cross-checking the API data"), and with
few lines variety no longer matters, so the draw is gone. `finishThoughtPhrase` strips a leading
filler opener ("Next,", "OK,", "Hmm,", "Still" before an -ing verb) and a trailing "now" or "right
now" the model adds anyway; the Server puts "Still" back only on a still line (see below). Every
input ends with a one-line cue: "Reply with the status line, or SKIP if this is only housekeeping"
for a request's first line, "Reply NEW: or STILL: and the status line, or SKIP if this is only
housekeeping" after it, and "the finding or the status line" when a result rides along.
A bare "or SKIP" skipped real work more often (four false skips in 315 calls); "SKIP only if the
input holds no work at all" let more housekeeping through (18 misses).

**Own voice.** The person watching wrote the request, so a line that restates it ("Zach wants me
to check the build") tells them nothing. The prompt says the line is
about the Agent's own step, never what the user, the person, or anyone by name wants, asked, or
needs; an input that opens by restating the ask is read past to the Agent's own step; and the line
names the one thing being checked while staying inside the 8-word cap, opening included, by
dropping dates, places, and qualifiers ("Reconciling the date formats", not "Working on the
export"). An input that only restates the ask or how the answer should look, with no step of the
Agent's own, is SKIP even when the next step is guessable. `narratesRequest` (in `@haus/api`) backs this up
on the model's line, and only for person subjects: "the user/person/requester" anywhere, a leading
"they/he/she" (or "what they…"), and the requester's own display name (full or first word,
whole-word, any case), each followed by a want, ask, need, or looking-for verb (contractions like
"they're asking" included) or a possessive "request/ask/question" ("Zach's request for…", not
"Zach's request logs"). Any other subject is work, so "Postgres wants an index" or "CI requested a
rerun" passes. The Server reads the name with the request (the message author's display name); it
filters the answer and the local fallback but is never sent to the model, and with no name only the
generic subjects apply. A match is SKIP. The excerpt is held only for that call and never stored or logged.

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

**Repeats and novelty.** With the request as context, Flash-Lite pulled a run's lines toward the
request's subject: one replayed turn showed "Checking the build status" three times. The first fix
sent the last two lines and asked for what is new, allowing "the same work goes on in fresh words"
to avoid dead air; on seven sequences that cut consecutive duplicates from 5.1% to 0%, but live it
produced the 2026-09-29 complaint: a 115-second Bun releases turn showed fifteen bubbles, ten of
them rewordings of "scanning the release notes markdown". Dead air is fine; a person waiting wants
to know the work moved on. So the Server remembers the lines it announced for each run's request
in each Chat (up to four; in memory, like the cadence; forgotten after ten quiet minutes or a
restart) and sends them with the next source as `Already shown: "…", then "…".` A system note,
present only then, asks for a workstream label with the line: `NEW:` when the input starts a
different part of the work — another subject (a different product, service, place, day, or
document), a different kind of step (reading, then comparing, then deciding) — or states what it
found or is highlighting; `STILL:` only when it is the same step on the same subject as the last
line, reworded, narrowed, retried, or continued, naming the specific thing still being worked on
or a small result so far ("STILL: Digging through the Q3 invoices" after "Reading the Q3
invoices"); and `SKIP` for housekeeping and for choosing or testing the Agent's own tools or
methods (a search engine, a parser, a site's API). That last rule lives only here: in the base
prompt it also skipped real first lines ("Planning weather data retrieval") in 9 of 330 calls. The
first draft of this note said "clearly different" and used a Bun example; it labeled "Moving on to
Cloudflare Pages limits" after a Vercel line, and every comparison step after a reading step,
STILL. An unlabeled answer counts as new, and "Still digging…" without a colon as still. A
request's first thought carries neither the lines nor the note, so it is phrased by the base prompt
alone. A run engaging several Chats is phrased once per distinct set of shown lines, usually one,
and paced as new when any Chat hears a new line.

The Server then judges the line itself (`thought-novelty.ts`). A line that names a tool, format,
or plumbing word (CLI, jq, curl, grep, JSON, YAML, XML, HTML, markdown, API, endpoint, URL, tag,
parse or parser, scrape, shell, terminal…) the request itself does not use is dropped, so "Checking
the jq changelog" still shows for a question about jq while "Analyzing HTML parsing for heading
extraction", a live Bun line, does not. A line from a result that states something rather than an
-ing step is a finding and counts as new whatever the label. A "new" line that matches or rewords
a shown one (normalized equality, or content-word Jaccard overlap of at least 0.6 with a crude
plural stem and look-alike verbs folded together: reading, reviewing, checking, and scanning are
one step, as are pulling, fetching, and finding) continues that work instead, so "Reading the
release notes for Bun" after "Reviewing the latest Bun release notes" is a still line, not a new
bubble. A still line that opens with an -ing verb reads "Still …" ("Still scanning the Bun release
notes"); it is dropped when it matches any shown line or rewords an earlier still line, so a long
stretch never loops on the same sentence. Both checks apply to the local fallback too, whose lines
are always new, and a dropped line counts as no bubble.

**Cadence.** A person waiting on a long turn wants to know what the Agent is doing and never to be
left wondering; the previous time ladder (the first at once, then 20-, 30-, 45-second gaps) kept
the count low but left a two-minute turn silent for most of its second minute and let the next
line land on any small step. The Server now paces by workstream, per request (the run's newest
engaged human message; live, Codex steered consecutive prompts into one run, so a steered message
starts over), in `thought-cadence.ts`:

- The first line shows as soon as one is phrased. Before it, frames wait a second apart, so a
  skipped opening ("Claiming the task") never holds it back for long.
- After a bubble, the next frame waits out a floor of 15 seconds, or 10 for a finished action with
  a result, so a run that moves through many small steps shows the major ones and news shows
  sooner. Frames inside the floor are not dropped: one waits, the highest rank and then the newest
  (a result beats a title or excerpt beats a bare action), and is phrased when the floor ends
  against the lines shown by then. Any frame arriving while one is being phrased waits the same
  way.
- A new line (a new workstream or a finding) shows as soon as it is phrased.
- A still line shows only once the request has gone 28 seconds without a bubble. Phrased sooner,
  the freshest one is held and shown when the quiet runs out, unless a new line shows first; since
  it was phrased after the floor, it is never more than 13 seconds stale. With about a second of
  summary, no stretch of work with any frames in it goes quiet for much more than half a minute.

The admission and request lookups run in the Computer's frame order before any of this, since the
request decides the cadence; phrasing and announcing run as background work. A held or waiting
frame keeps the Chats it was admitted for; if the run ends first, the App ignores a thought whose
run no longer engages the Chat. The cadence costs summaries: every frame past the floor is phrased,
at most one per request every few seconds, where the ladder phrased at most one per gap.

Measured 2026-09-29. The previous prompt (`thought-v20-results`) scored, in two runs of 342 calls
on 114 cases, 97–98% skip precision and 95% recall with about eight wording problems; its "no names
of secrets" clause stayed out, since restored it cost two to four false skips per run. The eval
set is now 127 cases and 13 sequences: seven finding cases (forecasts as codes and as text, a
release list, a price list, a CI status whose excerpt carries a `tok_…` runner token that must
not appear, status-code noise, and coordinates that must not become weather), still and new cases
after a shown line, and sequences replayed through this cadence on a fake clock
(`scripts/thought-eval-sequences.ts`): a two-minute single-workstream Bun turn, a 150-second
three-provider hosting comparison, and a weather turn with a finding. Two cases changed
intentionally: a same-fetch title after a shown line now expects STILL rather than SKIP, and the
weather and Bun sequence budgets rose from two and four to three and five for their still lines.
In two runs of 254 calls, `thought-v21-findings` scored 100% skip precision (no false skips,
against three or four) and 92% recall (eight misses, as before), with thirteen wording problems,
most of them finding cases that stated the activity instead; the token never appeared, and the
coordinates never became weather. The workstream label matched on 20 of 28 cases with shown lines;
"Comparing HTTP server changes" after "Reading the Bun release notes" still comes back STILL. Of
26 sequence runs, 3 overshot their budget (the hosting comparison showed nine lines in 150
seconds, one per provider step and finding, against a budget of seven), none repeated a line, and
the longest quiet stretch after a first bubble was 28 seconds except where a sequence had no frames
for longer. Live on Codex (gpt-5.6-sol), three full passes of the weather, Bun, Lisbon, and
hosting prompts (turns of 37–46, 40–44, 44–56, and 47–88 seconds) showed 2, 1–3, 2, and 2–4
bubbles, holding 5.9–7.5 seconds each; the longest silence from the request to the turn's end was
28 seconds; and three of the fifteen lines after a first were findings ("Mostly sunny and
mid-sixties this weekend", "Found releases v1.4.2, v1.4.1, and v1.4.0"), none quoting output.
Before the verb folding and the HTML and parser words, a two-minute Bun turn showed seven lines,
one of them "Analyzing HTML parsing for heading extraction".

**Fallback.** Without `HAUS_GEMINI_API_KEY`, or when Gemini fails, refuses, or is late, the
Server shows the title or a local condensation of the excerpt (its first sentence without
narration filler), with a leading sentence that restates the ask dropped (or cut to the own-work clause after
it: "The user wants the forecast, so let me check the weather API" → "I'm checking the weather
API"), unless a small keyword filter judges that leading sentence to be the same
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
bubble shows current work without a backlog, with one ranking: a finished action with a result
beats a title or excerpt, which beats a bare started action, since a finding is the most a person
can learn and the model's own words beat inferred ones. Results that finish in the same window
(Codex runs its fetches in parallel) ride one frame, both descriptions and each result cut to 200
characters; replaying a live weather turn, newest-wins kept an empty alerts check over the
forecast that finished with it. The Server's cadence above is the stricter limit once a line has
shown, and it also bounds summarizer spend if a Computer misbehaves. Summaries finish after
varying delays, and two Agents can think at once, so the App keeps bubbles at least five seconds
(the shortest hold) apart, holding an early thought until that mark, a newer one replacing it while
it waits. That is under the Server's floor, so it rarely delays a request's own bubbles. An
engagement's first thought never waits, so every Agent's first bubble shows as soon as it is
phrased.

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

**Presentation.** A glass bubble rises over the thinking Agent's avatar in the strip, holds, and
leaves; a newer thought replaces it, and the engagement ending clears it. Bubbles are rare now,
so each holds until someone glancing up has read it: about 3.5 seconds to notice it and move the
eyes there plus 350ms a word, between five and seven and a half seconds (an eight-word line holds
about 6.3 seconds; the old hold was 2.3). Faces render above it. Reduced motion crossfades. When
the same run's line arrives again, equal after case, punctuation, and spacing are ignored, while
its bubble is still up, the bubble stays without re-entering: its hold restarts from that moment,
capped at twelve seconds from when it appeared so a stuck line still leaves, and the extension
neither waits for nor resets the five-second spacing. The Server no longer sends a request's line twice, so a repeat reaches the
App only from an older Server.

## Consequences

- Reasoning excerpts from every harness, scrubbed descriptions of the commands, files, searches,
  and tools each run starts, and the first 500 scrubbed characters of the human message each run
  is answering, pass through the Server to Google, a third party the Agent's own provider did not
  choose. The operator accepted this on 2026-09-27; nothing is persisted on the way. Since
  2026-09-29, up to 400 scrubbed characters of what a finished command, search, page, or tool
  returned go too — a forecast, a price list, a release list, a page's text. Scrubbing removes
  credentials, environment values, emails, and paths, but not everything a page or API can say
  about a person or a business; an Agent reading private data through a tool sends an excerpt of
  it to Google for one call.
- A Server's human members can read a paraphrase of Agent reasoning. The phrase describes the
  whole run, so a reader of one engaged Chat may glimpse work for another Chat the same run
  engages. Chat scoping limits this to readers of a Chat the run is actually answering.
- Summaries cost about $0.09 per 1,000 thoughts, paid by the Server's key; Codex titles are now
  paid calls too, and the workstream cadence phrases every frame past its floor, several times
  the ladder's calls on a long turn. The heuristic costs nothing.
- A thought can vanish: a skipped block leaves the previous bubble to fade and shows nothing new,
  and Gemini occasionally skips real work (11 of 234 real-work calls across the two eval runs).
- Mixed versions degrade silently: an older Server still relays titles as they are, and an older
  Computer's titles are rephrased by a newer Server. An `action` frame fits none of an older
  Server's frame shapes, so it falls through as an unknown frame and is dropped; an older Computer
  never sends one. A `result` on an action is a strict-schema change: a Server that predates it
  drops a result-bearing action as unknown, so that Server sees only the start of each action.
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

**A time ladder.** The previous cadence (first at once, then 20-, 30-, 45-second gaps) met the
bubble count on short turns but chose lines by the clock: whatever small step ran when a gap
opened got the bubble, and a two-minute turn went quiet for most of its second minute. Pacing by
workstream shows each new part of the work and each finding, and fills a long stretch with a
"still" line.

**Deterministic workstreams alone.** Word overlap cannot tell "Comparing the HTTP changes" (a new
step) from "Scanning the release notes" (the same one); the model can, given the shown lines. The
overlap check stays as a backstop that turns a reworded "new" line into a still line.

**Newest result wins.** Parallel fetches finish within a second of each other, and the newest was
as likely the empty alerts check as the forecast; merging keeps both.

**Fresh words for the same work.** The earlier repeat note let a run say the same work goes on in
new words so the strip never went quiet; it filled long turns with rewordings. A still line now
fills a stretch only after 28 quiet seconds, says "Still", and never rewords an earlier still line.

**A random opening per call.** Six drawn openings ("Next,", "Hmm,", "I'm…") made lines vary but read
as filler, and with a few lines per turn there is little to vary.

**Relaying Codex titles as they are.** Free, but titles like "Claiming the task" or "Reviewing
memory notes" are housekeeping too, and only the Server can judge them. The frame kind stayed
`phrase` so no protocol change was needed.

**A separate housekeeping classifier before the summary.** A second paid call and more latency
for a judgment the summarizing call can make in the same answer.
