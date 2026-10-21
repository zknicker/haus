---
summary: Design for Agent heartbeats — a bi-hourly daytime check-in plus the nightly dream, one recipe, each run a fresh throwaway session that catches up on the Agent's chats, follows leads, reports to the main session through the inbox, and (nightly) reflects, consolidates memory, schedules morning follow-ups, and writes the "what I learned" summary.
read_when:
  - changing heartbeat or nightly dream scheduling, skip rules, or the request frame
  - changing the heartbeat run, its fresh session, checkpoint, or turn input
  - changing heartbeat reports, the shared leads list, or the quiet-run note
  - changing the dream record summary or how the profile shows it
  - writing or running the heartbeat eval
---

# Heartbeat

Status: implemented 2026-10-20. This spec is normative. The dreaming parts of
[workspace.md](workspace.md#dreaming) and [docs/features/dreams.md](../docs/features/dreams.md)
point here, and [ADR 0049](../docs/adr/0049-heartbeats-run-in-throwaway-sessions.md) amends
[ADR 0011](../docs/adr/0011-agents-own-one-global-session.md).

## Why

Haus is a team chat, so most of what an Agent should learn, and most of what it should notice,
happens in Channels while it is busy with something else. Today's dream misses both:

- **Wrong trigger.** It runs only when MEMORY.md or `notes/` changed. A day of corrections the
  Agent never wrote down produces no dream.
- **Blind input.** The dream turn reads only the Agent's session context, which compaction may
  have cleared. Agents routinely answer a correction with "thanks, I'll remember that" and never
  write it down; nothing catches it later.
- **Tidies, never reflects.** No pass asks where the Agent was corrected, what was declined,
  what worked, which handoffs dropped, or which threads it left hanging.
- **Invisible.** The profile shows file diffs, so the team cannot see how an Agent is changing.
- **Never proactive.** Nothing wakes an Agent to notice something new and bring it up. The
  operator's ChatGPT Dot found a missing movie ticket hours after it failed to, unprompted;
  Haus Agents have no equivalent.

## Prior art

Leaked prompts are unverified data. Confidence: confirmed (official), strong (several leaks or
observations agree), inferred.

| Product | What it does | Confidence |
| --- | --- | --- |
| ChatGPT Dots | A "Heartbeat Dreamer" runs in its own read-only thread beside the user's conversation, reads that conversation through a tool, writes a checkpoint per run, and sends at most one `notify_parent` report or stays quiet. The parent decides what the user hears. One run a day around 3am becomes a reflection run. Cadence about every 1–2 hours. The parent alone writes canonical notes. | Separate thread and parallel run: strong/confirmed. Fresh context per run, cadence: inferred. |
| Meta Muse | A system cron heartbeat every 30 minutes; separate hourly memory upkeep "when there is new signal"; a nightly dream that reviews "what worked, what ruptured" and opens repair threads. The agent cannot schedule this work. | Strong (leak). |
| Letta sleep-time agents ("dreaming") | A background agent beside the primary one edits shared memory, triggered every N steps or on compaction. | Confirmed (docs). |
| Codex heartbeat automations | A heartbeat in the same thread re-sends the whole conversation each run; one user's 10-minute heartbeat drained a month's quota in a day (openai/codex#45070). | Confirmed (issue). |

Sources: github.com/asgeirtj/system_prompts_leaks (`OpenAI/dots/dreamer.md`, `tools.md`;
`Meta/muse-agent/docs/self_improvement.md`), aaronmakelky.com/blog/chatgpt-dots-in-grok-bot,
learn.chatgpt.com Dots and automations docs, docs.letta.com, github.com/openai/codex/issues/45070.
Cost figures come from the operator's 2026-10-19 Codex usage study of the production fleet.

What Haus takes: a separate run per Agent that starts fresh and relies on a checkpoint; one
report or silence; the main session decides what anyone hears; one recipe with a nightly
section; a system-owned schedule. What Haus adapts: Dots runs the Dreamer beside the parent; a
Haus heartbeat takes the Agent's one turn slot (ADR 0049), so it skips when the Agent
is busy, and yields to direct messages. Per-Agent initiative, not a shared scout: the operator
wants every Agent to feel alive on its own.

## Runs

One recipe, two kinds of run:

| | Daytime heartbeat | Nightly heartbeat (the dream) |
| --- | --- | --- |
| When | Every 2 hours, 08:00 to 22:00 Computer-local (8 slots), each Agent offset by a stable per-Agent minute so Agents do not all run on the hour | Once in the 03:00–05:00 Computer-local window |
| Runs if | The Agent is configured, running, and idle at its slot | The Agent took part in any conversation or sent a report since its last nightly run |
| Covers | Everything since its previous run | Everything since the last nightly run |
| Writes | Checkpoint; topic notes it uses as baselines | Checkpoint; MEMORY.md and `notes/`; reminders; the "what I learned" summary |
| Profile | An Activity log row, **Heartbeat** | A dream record with summary, follow-ups, and diffs |

Times use the Computer's clock: every production Agent's `home_timezone` is `UTC` and nothing
edits it, while the nightly window already runs on Computer-local time.

### Who runs, and who skips

- The Computer schedules both kinds and sends one `agent-heartbeat-request` frame per slot
  (`kind: 'daytime' | 'nightly'`, local date, slot). It replaces `agent-dream-request`.
- The Server decides. It skips a daytime run when the Agent has an active run or waiting
  concrete work (skip, never queue: a missed slot is not made up), when the Agent is stopped,
  and when its Computer's latest usage snapshot shows the Agent's plan's weekly meter at 80% or
  more. The nightly run is never skipped for being busy; like today's dream it queues and
  retires after four hours. The 80% pause applies to both.
- A concrete item addressed to the Agent (DM, mention, reply) arriving during a daytime run stops
  that run; the main session takes the message. The stopped run is not retried.
- No heartbeat-specific time limit. Like Dots, a run continues while it has promising leads and
  its checkpoint marks where to resume; yield-on-address keeps a daytime run from blocking anyone
  who needs the Agent, and the existing stall watchdog and no-progress deadline still apply. Run
  durations are traced; add a limit only if they show a need.
- Every skip and stop is logged and traced like today's `haus.dream.check`.

### Fresh, throwaway session

Each heartbeat runs as a turn in a new harness session for the same Agent: same instructions,
identity, model, workspace, memory, and tools. The Computer opens it without resuming
(`sessionId` `<agentId>-hb-<runId>`), never writes `session.json`, never marks the main session
interrupted, and destroys the session when the turn settles. The main session is untouched: its
cache, compaction, and generation stay as they were. On the Server the run occupies the Agent's
one active-run slot as a chatless run, like today's dream (ADR 0049).

Why fresh: the main session carries 600k–960k tokens, and its one-hour cache has expired by each
two-hour slot, so waking it would rewrite the whole prefix every run (the Codex #45070 trap). A
persistent heartbeat thread would grow the same way. A fresh run is bounded by its digest.

### Turn input

The Computer composes the whole input; the system prompt does not change.

1. A header naming the run kind and the recipe: `haus manual get recipes/technique/heartbeat`.
2. **Digest**, built by the Server and carried on the start command: each Chat and Thread the
   Agent took part in since the cutoff (it posted, was mentioned or DMed, or a Thread it posts in
   got replies), busiest and most direct first, capped at 20 with "and N more". Each entry has
   the target, the first sequence after the cutoff, message count, who spoke, whether the Agent
   was addressed, and who spoke last. No bodies: the Agent reads them with
   `haus message read --target <t> --after <seq>`.
3. **Checkpoint**: the path of the latest checkpoint, read first.
4. The Agent's open reminders and the open leads list, as counts and the commands to read them.

### Quiet-run note

The main session's next turn input after any heartbeat gets one line, so it can always say what
it has been doing: "Your heartbeat ran 2× since your last turn (no report); latest checkpoint:
`heartbeat/checkpoints/<…>.md`." A heartbeat with a report already reaches it as an inbox item.

## The recipe

New Manual recipe `recipes/technique/heartbeat`. Memory-writing rules stay in
`recipes/technique/memory-hygiene`, whose Dreaming section shrinks to a pointer and whose
"Edit memory only" rule is removed.

Every run:

1. **Catch up.** Read the checkpoint, then the digest's conversations since the cutoff.
2. **Notice.** Start from your role, your memory, what people asked you about recently, and the
   connections and tools you have. Spend more time on what your work depends on. Look for what
   is new: in your connections, the repo, the web, other Agents' state.
3. **Follow leads.** A question nobody answered, something you said you would check, a gap in an
   area you own, a hunch. Claim each lead before researching it (see Leads). Leave leads in
   another Agent's area to that Agent.
4. **Decide what matters.** Report what is urgent, changes a plan, involves money or a deadline,
   answers something someone asked, or is a real change from normal. Stay quiet about unchanged
   values and routine movement. Never repeat a finding the checkpoint says you already reported
   unless something changed.
5. **Report or stay quiet.** At most one `haus heartbeat report`, findings first, each with what
   you learned, why it matters, how sure you are, and a suggested next step. Daytime runs suggest
   memory changes in the report instead of editing MEMORY.md.
6. **Checkpoint.** Write the run's checkpoint: the exact report sent or "quiet" and why, what you
   checked, what you could not check, open leads, where to pick up.

Post nothing in any Chat. The main session decides what anyone hears.

Once per night, also:

7. **Reflect on the day.** For each conversation: where was I corrected, and by whom; what was
   declined or ignored; what worked well enough to repeat; which handoffs to other Agents dropped
   (check the other Agent's actual state before calling it dropped); which threads I left
   hanging. Treat one remark as one data point, not a rule.
8. **Consolidate memory** per memory-hygiene: fold lessons into Standing Preferences as terse
   rules, apply suggestions from the day's reports you agree with, rewrite Active Context, prune.
9. **Follow up dropped promises.** For each promise you dropped to a person or Agent, schedule a
   reminder anchored to the original message, around 09:00 in the requester's timezone (look it
   up; do not infer it). Its description says what was promised, because the fire does not show
   the anchor message. Post nothing now.
10. **Write the summary** with `haus heartbeat learned` (body on stdin): 2–4 `- ` lines, one
    lesson each, first person, each naming who taught it. Compare the day's corrections with what
    MEMORY.md held when the run started; a correction acknowledged in chat but not already saved
    is called out on its line as acknowledged but not saved until now.

## Outputs

- **Report.** `haus heartbeat report` (text on stdin, quoted heredoc as in `haus message send`) queues one chatless `heartbeat_report` inbox item for the
  Agent, delivered after the heartbeat run settles like any concrete item. Its envelope says it is
  the Agent's own heartbeat report and that the Agent decides whether to post. Between 22:00 and
  08:00 the main session holds findings and schedules a morning reminder instead of posting.
- **Checkpoint.** Markdown under the workspace at
  `heartbeat/checkpoints/<YYYY-MM-DD>/<HH-mm>.md`; the nightly run writes
  `heartbeat/daily/<YYYY-MM-DD>.md`. The Computer deletes checkpoints older than 14 days.
- **Leads.** A Server-owned list per Haus Server. `haus lead claim --topic "<t>" [--message-id
  <id>]` claims a lead; a claim on a message another Agent claimed in the last 7 days is refused
  with who holds it. `haus lead list` shows the team's leads from the last 7 days with each
  holder's one-line finding; `haus lead done --id <id> --finding "<text>"` records it. Rows expire
  after 14 days.
- **Summary.** `haus heartbeat learned` (text on stdin; nightly run only) is stored on the run's
  `agent_dreams` row as `summary`, with the follow-up reminder ids scheduled during the run.
- **Memory diffs.** Unchanged: the nightly run's snapshot and diff record exactly as dreams do
  today.

## Profile

- **Dreams** rows lead with the summary's first line instead of the file headline; a dream with no
  summary keeps today's headline.
- The dream sheet shows, in order: the summary, the follow-ups it scheduled (who, where, when),
  then the existing diffs. Stock HeroUI parts; no new components unless the catalog lacks one.
- The Activity log shows a daytime run as a **Heartbeat** row with its report, or "Checked in".

## What changes

| | Today | New |
| --- | --- | --- |
| Runs | One nightly dream when memory changed | Bi-hourly daytime heartbeat plus a nightly run when there was activity |
| Session | Nightly dream resumes the main session | Every run is a fresh throwaway session |
| Input | One instruction line | Digest, checkpoint, open reminders and leads |
| Work | Tidy memory | Catch up, notice, follow leads, report; nightly: reflect, consolidate, follow up, summarize |
| May write | MEMORY.md and `notes/` | Daytime: checkpoint, baseline notes, one report, lead claims. Nightly: also memory, reminders, summary |
| Team sees | Diffs | Summary, follow-ups, diffs; Heartbeat rows |
| First run | 24–48h after start | First slot after configuration |

The memory-fingerprint trigger, the 16 KiB size trigger's role as a trigger, and the first-night
baseline go away. The nightly run still keeps the once-per-night identity
and the four-hour retirement.

## Cost

From the operator's usage study (three Claude and three Codex Agents; Claude Max 20×, ChatGPT Pro
$200): a bounded per-Agent run hourly around the clock costs about +2 Claude and +9 Codex weekly
points. Eight daytime slots plus one nightly run is about 9/24 of that: roughly **+1 Claude and
+3–4 Codex weekly points**, plus main-session turns for reports. The 80% pause caps the
downside. Usage is recorded per run in `agent_turns` like any turn.

## Evals

A new `heartbeat` eval in `scripts/eval/evals.mjs`, run with
`bun run eval heartbeat --baseline <sha> --passes 3`. Every heartbeat scenario is `optIn`, so the
full `bun run test:agents` set skips them; run one with `bun run test:agents --only <name>` or all
of them through the eval. Scenarios seed chat history directly
(advancing `chats.last_message_sequence`) and start a run through a test-only trigger, so the
outcome does not depend on what the Agent's live session happened to write down. Structure is
asserted by the scenario; quality is graded by profiles.

| Scenario | Setup | Pass |
| --- | --- | --- |
| `heartbeat-learns-unsaved-correction` | A human corrects the Agent in a Channel; the Agent replied "got it" but MEMORY.md lacks the rule. Nightly run. | MEMORY.md gains the rule (graded like `memory-feedback`); the dream summary names the lesson and who gave it, and notes it had been acknowledged but not saved; nothing posted. **The operator's acceptance case.** |
| `heartbeat-quiet-day-control` | Ordinary day, no corrections. Nightly run. | No new Standing Preference; summary invents no lesson. |
| `heartbeat-follows-up-dropped-promise` | The Agent said "I'll check and get back to you" and never did. Nightly run. | One reminder anchored to that message, firing 08:00–10:00 in the requester's timezone, description names the promise; nothing posted. |
| `heartbeat-surfaces-new-signal` | A controlled MCP connection the Agent uses for its role gains a notable record nobody mentioned in chat. Daytime run. | One report; the main session then posts once in the right Chat. |
| `heartbeat-nothing-new-control` | Same connection, no change. Daytime run. | No report, no post. |
| `heartbeat-quiet-run-awareness` | A quiet daytime run, then a human asks "what have you been up to?" | The answer mentions the heartbeat truthfully. |
| `heartbeat-lead-dedupe` | Two Agents covering pricing, one unanswered question only a shared MCP source answers. | Outcome only: the question is answered with the source facts, exactly one Agent reports the answer, exactly one answer is posted. Source lookups and lead use are recorded, not asserted: checking a source you own every run is not duplicate work. |

Deterministic coverage by layer: the Computer scheduler (slots, offsets, window), fresh-session
launch never touching `session.json`, checkpoint retention, and the quiet-run note; Server skip
rules, the 80% pause, yield-on-address, the digest query, report delivery, and lead claims; the
`@haus/api` contracts; the dream sheet view model.

## Wire contract

Shared by every implementation slice; `packages/haus-api` owns the schemas.

- **Request frame** `agent-heartbeat-request` `{ agentId, kind: 'daytime' | 'nightly', localDate,
  slot }` (`slot` is the local `HH:mm` slot start, `'03:00'` for nightly). It replaces
  `agent-dream-request`.
- **Inbox and run-trigger sources.** `dream` stays the nightly run (the profile still calls it
  Dreams); `heartbeat` is a daytime run; `heartbeat_report` is a report. All three are chatless:
  the `(chat_id is null) = (source = 'dream')` checks become `source in ('dream', 'heartbeat',
  'heartbeat_report')`. Dedupe keys: `dream:<agentId>:<localDate>`,
  `heartbeat:<agentId>:<localDate>:<slot>`, `heartbeat-report:<runId>`.
- **Start command.** `dream` is replaced by `heartbeat?: { id, kind, createdAt, since: ISO | null,
  digest: { entries: HeartbeatDigestEntry[], more: number } }`, where an entry is `{ chatId,
  target, kind: 'channel' | 'dm' | 'thread', title, afterSequence, messageCount, speakers: string[],
  addressed: boolean, lastSpeaker: string | null }`. A report run carries `heartbeatReport?: { id,
  createdAt, heartbeatRunId, text }`. Both are chatless runs with no drained items. A heartbeat run
  (either kind) opens a fresh session; a report run resumes the main session.
- **Agent API** (runner-token authenticated, run-scoped):
  - `POST /api/agent/heartbeat/report { text }`: only from a heartbeat run (`dream` or
    `heartbeat`); one per run.
  - `POST /api/agent/heartbeat/learned { text }`: only from a `dream` run; stored by run id.
  - `POST /api/agent/leads { topic, messageId? }` claim; `GET /api/agent/leads` list (last 7
    days); `POST /api/agent/leads/:id/done { finding }`.
- **CLI.** `haus heartbeat report` and `haus heartbeat learned` (text from stdin only; `--text` and
  positional text are refused like `--content` on `haus message send`),
  `haus lead claim --topic [--message-id]`, `haus lead list`, `haus lead done --id --finding`.
- **Dream reads.** `agentDreamSummarySchema` and detail gain `summary: string | null` and
  `followUps: { reminderId, title, anchorChatId, fireAt }[]` (reminders the Agent created during
  the run, derived at read).
- **Quiet-run note.** Computer-only: `runtime/heartbeat-note.json` counts settled heartbeats and
  reports since the last main-session turn and names the newest checkpoint; the next
  main-session turn input renders it and clears it.

## Observability

Heartbeat and dream runs show in the regular Activity Log; there is no separate Heartbeats page
or read. A run is an ordinary turn row (same expand-to-steps behavior, same collapsed state) plus:

- **Badge.** A stock soft `Chip` after the title, **Heartbeat** or **Dream** (the dream tone is
  the `--dream` token). The main session's `Heartbeat report` turn carries the **Heartbeat**
  badge and otherwise reads as a normal turn.
- **Outcome line.** One muted, single-line truncating line under the title. A heartbeat that
  reported reads the report's first sentence plus ` · Posted in #shop` or ` · Read, not posted`;
  a quiet one reads `Nothing to report`; a dream reads its first learned line, else `Tidied memory
  (+a −r)`, else `No memory changes`; a yielded heartbeat reads `Paused for a new message`; a failed
  or interrupted run reads its usual failure text.
- **Data.** The facts ride the turn trigger (`agent.turns`, `agent.serverTurns`,
  `agent.runTrigger`): `dream { learned, added, removed }` and `heartbeat { report, yielded }`
  (contract: `packages/haus-api/src/agent-turn-trigger.ts`, behavior: [agents
  API](../docs/api/agents.md)), resolved in a few bounded reads per page. `postedChatId` is limited
  to Chats the viewer can see.

The skip, pause, and yield decisions have no row of their own. The checks table is a Server
record read by SQL or Axiom (and by the trigger for `yielded`):

- **Checks.** Every decision on an announced slot writes one `agent_heartbeat_checks` row in the
  decision's own transaction: `queued`, `skipped` with a reason (`busy`, `stopped`, `no-activity`,
  `not-configured`), or `paused` (the `plan-limit` skip). `yielded` is written when
  yield-on-address stops a daytime run, with the stopped `run_id`. A repeat of a slot with the
  same outcome is one row, and a skip never records over a slot that already queued. Rows older
  than 30 days are swept, a bounded batch per Agent, as new decisions arrive. The
  `haus.heartbeat.request` span stays alongside the table.
- **Runs.** A run that started shows from its trigger and turn, so `queued` rows have no row of
  their own. Skipped and paused slots appear only in the table and the span.
- **Refresh.** A recorded decision announces `agent.onUpdated` for the Agent after its transaction
  commits; a settled or stopped run already publishes the lifecycle event the Log refreshes on.

## Implementation slices

1. **Contracts and Server**: request frame and run kind (`heartbeat`, kind daytime/nightly),
   skip and pause rules, yield-on-address, digest query (with an `author_agent_id, created_at`
   index on `chat_messages`), report inbox item, leads table and routes, `agent_dreams.summary`
   and follow-ups, migration.
2. **Computer**: scheduler replacing the nightly dream check, fresh-session runs, turn input,
   checkpoint retention, quiet-run note, CLI `haus heartbeat report|learned` and
   `haus lead claim|list|done`.
3. **Manual**: `recipes/technique/heartbeat`; memory-hygiene trimmed.
4. **App**: Heartbeat Activity row; dream row and sheet summary and follow-ups.
5. **Evals**: scenarios, profiles, test-only trigger, baseline report.
6. **Docs**: this spec becomes normative; workspace.md, sessions.md, CONTEXT.md (including its
   stale "idle Agent" dream wording), dreams.md, agents API, observability.

## Later

- **Parallel runs.** If the runtime driver rework adds background sub-agents, or Haus adds a second
  run slot, heartbeats can run beside the main session. Only the Computer and delivery change;
  daytime runs already leave MEMORY.md alone, so there is no write race.
- **More sources.** Haus has no email connection; a Gmail connection would let heartbeats catch
  the Dots-style "you got an email".
