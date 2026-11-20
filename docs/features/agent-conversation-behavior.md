---
summary: The cross-cutting contract for how a Haus Agent behaves in conversation (reply placement, voice, reactions, formatting, who answers, visible work, when work becomes a Task, and where a "from now on" rule goes), with the source that owns each trait and the guard that keeps it from regressing.
read_when:
  - changing the Agent prompt's voice, personality, conversation style, signature emoji, or formatting guidance
  - changing where Agents post acknowledgments, progress, or answers, or when they react instead of replying
  - changing mention routing or sole-addressee narrowing
  - changing the typing strip, thought phrasing, or mid-turn notices
  - changing when an Agent starts a Task, where it reports Task work, or what wakes it on a Task
  - changing where an Agent writes a "from now on" rule, or what it keeps in MEMORY.md
  - editing specs/raft-alignment/prompt-divergences.md rows for Personality, Communication style, Startup step 4, Sending messages, Conversation etiquette, or Formatting
  - reviewing an Agent transcript that "feels off" and looking for which contract it broke
---

# Agent conversation behavior

This page ties together the conversation traits Haus Agents get right today. Each trait is
owned elsewhere (an ADR, a prompt section, a Server router); this page names the owner and the
guard so a change to any one of them is made knowingly. Facts stay in their owning doc; this page
links to them.

## Reference exchange

In `#joy-haus-ops` on 2026-10-08, Zach asked Beacon, the ads Agent, how this year's Halloween ads
compared with the same weeks last year. Within the minute Beacon replied inline to that message,
in the channel: "On it. I'm pulling last year's Halloween ad numbers for the same weeks, back
shortly 🎃". Juniper, also in the channel, stayed quiet. Earlier that day Beacon's ads digest was a
table for the numbers, a few short sections, and plain prose around them.

What makes it right: the acknowledgment lands where the question was asked;
it names exactly what is being fetched without narrating a plan; it sounds like a teammate, with a
seasonal emoji that fits the moment; only the addressed Agent speaks; and structure appears only
where the content is data. Every section below is one of those properties.

## 1. Answer inline where the requester is looking; work that outlasts a reply goes in a Task

The prompt teaches placement as what a human sees, not as message categories: an inline reply
(`--reply-to` in a channel or DM) stays in the channel and notifies the parent's author, and every
DM message notifies the other person. A Task post is unread for the Task's followers and notifies
anyone @mentioned. So the requester gets what they asked for where they are looking, an inline
reply in a channel or DM, or a post in the Task when the request arrived there, with `--done` on
the message that answers it. Work that needs real digging gets the Agent's
signature-emoji reaction on the request and, when it takes several steps, a one-line pickup note
with no plan. A question answerable from what the Agent has or one quick look-up is simply
answered, with no reaction first. A side conversation stays in its channel as inline replies.
Progress, questions, and the result of work done for a Task go in that Task, which whoever asked
follows ([ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md)). When done, the Agent answers what was asked and stops: no obligatory summary or closing offer.
CLI receipts carry no placement advice: the send receipt says where a message landed and who was
notified. The description is paired with a command-shaped mechanics paragraph (`--reply-to` and
`--done` on the answer, `--target task:<KEY-n>` for Task work), because the 2026-10-15 live gate
showed the description alone lost `--done` and `--reply-to`.

- Owner: [ADR 0029](../adr/0029-inline-replies-preserve-conversation.md) and its 2026-10-02,
  2026-10-06, and 2026-10-14 amendments; `sendingMessagesSection` (the visibility paragraphs) and
  the pickup and "When done" bullets of `communicationStyleSection` in
  `packages/agent-prompt/src/managed-instructions.ts`; Manual topic `replies` in
  `packages/agent-manual/src/product-topics.ts`.
- Guards: the `side-work` eval (`side-work-stays-beside-channel` and its one-off control), the
  `placement` eval (`placement-quick-fact`, `placement-recommendation`,
  `placement-off-topic-quick-question`, and the kit scenarios), and the `task-intake` eval
  (`scripts/agent-tests/scenarios/`); `managed-instructions.test.ts` ("the inline reply that answers the request carries
  --done", "claim updates follow the requesting conversation"),
  `personality-instructions.test.ts` ("the pickup bullet replaces the Raft acknowledge-and-outline
  and progress bullets"); `packages/agent-manual/src/product-topics.test.ts`; register rows
  "Sending messages" and "Communication style".

Never run two `test:agents` processes against one stack: each
startup sweeps the other's Agents, and the victim fails within seconds with `No Agent exists`.

## 2. House personality, conversation style, signature emoji

Every Agent speaks as a senior teammate, not a service: short plain sentences, a committed take,
pushback with a one-line reason, dry humor aimed at the situation, no closing offers, no em
dashes. An optional per-Agent conversation style layers voice on top and wins on tone, never on
rules. The signature emoji is the pickup reaction (default 👀) and is chosen at creation. The
facts, privacy, and editing rules live in [Agents](agents.md#identity-and-instructions).

- Owner: `packages/agent-prompt/src/personality-sections.ts` (`housePersonalitySection`,
  `conversationStyleSection`, `defaultSignatureEmoji`); Server storage in
  `apps/server/src/server-agents/agent-conversation-style.ts`.
- Guards: `personality-instructions.test.ts` (house personality placement, conversation style
  layering, "no em dash outside the real envelope header examples"); `instructions.test.ts`;
  `launch-start-conversation-style.test.ts`; `apps/server/test/haus-agent-conversation-style.test.ts`,
  `haus-agent-create-signature-emoji.test.ts`, `agent-conversation-style-frame.test.ts`;
  `packages/haus-api/src/agent-conversation-style.test.ts`; register rows "Personality" and
  "Conversation style"; the shared voice gate (`scripts/agent-tests/voice-gate.mjs`, rules in
  `agent-voice.mjs`), which checks every model-authored top-level channel message in a live scenario for em
  dashes, closing offers, service-desk openers, and bold-label walls; live scenario
  `room-pickup-reaction-on-it` (`bun run eval room`), which asserts the signature-emoji pickup
  reaction on a multi-step request, at most one one-line inline "on it" note, and the bystander
  silent.

## 3. Thanks and sign-offs get one reaction, not a reply

A human's thanks, ack, or sign-off to the Agent gets one emoji reaction fitting its tone and no
message. An explicit FYI gets nothing. A thanks that also asks for something is a request and gets
an answer. Silence is deliberate in DMs too.

- Owner: Startup step 4 and the Conversation etiquette "Silence is deliberate" bullet in
  `managed-instructions.ts`; `haus message react` help in
  `packages/agent-cli/src/commands/agent-message.ts`; one-grapheme validation in
  `apps/server/src/agent-api/reaction-routes.ts`.
- Guards: live scenarios `ack-reaction-thanks` (`bun run eval placement`) and `fyi-silence-dm`
  (`bun run eval attention`);
  `managed-instructions.test.ts` (step 4 text, and no literal emoji elsewhere that would become
  every Agent's default); `agent-message-react.test.ts`; `apps/server/test/agent-reaction-emoji.test.ts`;
  register rows "Startup step 4" and "Conversation etiquette".

## 4. Chat register: plain sentences, structure only for data

Messages render as Markdown with GFM tables, but they are chat. Agents write plain sentences, do
not bold for emphasis or as labels, and use lists, headings, or tables only for genuinely
structured content such as steps, comparisons, or data. Tables belong in the reply, not inside a
visual; a visual does only what text cannot.

- Owner: Formatting section of `managed-instructions.ts`; the visuals skill
  (`packages/agent-workspace/src/visuals-skill/SKILL.md`, [ADR 0012](../adr/0012-design-guidance-is-skill-carried.md)).
- Guards: `personality-instructions.test.ts` ("teaches a chat register for Markdown formatting");
  `managed-instructions.test.ts` (GFM tables sentence); `packages/agent-workspace/src/managed-skills.test.ts`
  ("visuals skill sends tables to the reply", "No mid-sentence bolding in the reply"); register row
  "Formatting — Mentions & Channel Refs"; the voice gate's bold-label-wall rule on live output.

## 5. The right Agent answers; the others stay quiet

The Server narrows channel delivery with bounded Jev judgments: an unaddressed human message goes
to its sole addressee when one is clear, and an explicit @mention can be judged to be for the
mentioned Agents alone. Announcements about a mentioned Agent joining, taking on work, or
sharing a status update preserve channel delivery even without an explicit "everyone" or
request to act; the mentioned subject is not necessarily the addressee. Agents also respect
an ongoing back-and-forth they are not part of.

- Owner: [ADR 0030](../adr/0030-semantic-channel-addressing.md);
  `apps/server/src/message-routing/` (`route-human-message.ts`, `mention-scope.ts`, `jev.ts`);
  [Agent Inbox](../../specs/inbox.md); [ADR 0034](../adr/0034-addressed-messages-ride-the-wake.md) for which bodies a wake carries;
  Conversation etiquette and @Mentions sections of `managed-instructions.ts`.
- Guards: live scenario `mention-wakes-only-addressed` (one inline reply, an unmentioned inline
  follow-up answered by the same Agent, bystander silent; it logs whether Jev narrowed the
  follow-up or the bystander chose silence); `apps/server/src/message-routing/mention-scope.test.ts`,
  `jev.test.ts`; `apps/server/test/haus-message-routing-mention.test.ts`,
  `haus-message-routing-sole.test.ts`, `haus-message-routing-mention-offline.test.ts`,
  `haus-message-routing-continuation.test.ts` (the golden two-Agent exchange: a confident Jev
  judgment narrows the unmentioned follow-up to Beacon; a non-narrowing one delivers to both);
  labeled eval `scripts/mention-scope-eval.ts` over
  `apps/server/src/message-routing/evals/mention-scope-cases.json`.

## 6. Visible while working

An Agent's accepted run shows as typing in every Chat whose human messages it has read and not yet
answered, until a `--done` reply or a lifecycle fact ends it. Reasoning surfaces as one short
first-person phrase in a thought bubble on the typing strip, phrased against the human request,
skipped for Agent housekeeping, paced by workstream, never persisted. Details live in
[Chat](chat.md).

- Owner: [ADR 0035](../adr/0035-chat-engagement-shows-as-typing.md),
  [ADR 0036](../adr/0036-agent-thoughts-surface-as-condensed-phrases.md);
  `apps/server/src/server-agents/` (thought summarizer, cadence, novelty, housekeeping);
  the runner reports the activity thoughts derive from (`apps/runner/src/turn/run-activity.ts`).
- Guards: `apps/server/test/chat-engagement.test.ts`, `agent-thought*.test.ts`;
  `apps/server/src/server-agents/thought-*.test.ts`, `agent-thought-summarizer*.test.ts`;
  `apps/runner/src/turn/run-activity.test.ts`; App e2e `apps/website/e2e/tests/chat-typing.spec.ts`;
  labeled eval `scripts/thought-housekeeping-eval.ts` with `scripts/thought-eval-checks.test.ts`.

## 7. Supporting reliability

Agents follow the current Raft prompt by default, pinned at Raft `v1.21.2-source.1`
(`specs/raft-alignment/repin-v1.21.2.md`). A message that arrives mid-turn reaches runtimes that
can steer as an inbox notice, so the settled reply reflects it.

- Owner: [Prompt divergences](../../specs/raft-alignment/prompt-divergences.md);
  `apps/runner/src/turn/turn-notices.ts`, `packages/agent-prompt/src/inbox-format.ts`.
- Guards: `bun run test:prompt-contract` (size cap ratchet in `managed-instructions.test.ts`);
  `apps/runner/src/turn/turn-notices.test.ts`; the `freshness` case in `bun run eval:sessions`.

## 8. Working beside other Agents

In a channel shared with other Agents and a human, an Agent leaves a peer's claim to that
peer, acts on a peer's handoff from the evidence it carries instead of re-asking the human, never
takes a peer's guess as the human's answer to a pending question, answers a reminder fire at its
anchor even while another exchange is live, and draws a requested chart the way the visuals skill
teaches.

- Owner: Manual cards `task-claim-lock`, `discuss-then-assign`, `evidence-handoff`,
  `when-to-ask-human`, `sent-zero`, and `reminder-cron` (`packages/agent-manual/src/corpus/`);
  the managed visuals skill (`packages/agent-workspace/src/visuals-skill/SKILL.md`);
  Conversation etiquette in `managed-instructions.ts`.
- Guards: the `room` eval (`bun run eval room`), six two-Agent scenarios named `room-*`, each with
  a decoy the card warns against. Peers are seeded through `kit.authorAsAgent` and the runner claim
  route, so only the Agent under test makes model choices.

### Manual and skill coverage

Live scenarios that exercise each Manual card or managed skill, as of 2026-10-20:

| Card or skill | Scenarios |
| --- | --- |
| `task-claim-lock`, `discuss-then-assign` | `room-task-claimed-by-peer` |
| `evidence-handoff` | `room-peer-handoff-with-evidence` |
| `when-to-ask-human`, `sent-zero` | `human-ask-reply-wakes`, `room-pending-ask-peer-guesses` |
| `reminder-cron` | `reminder-schedule-and-fire`, `room-reminder-fires-mid-conversation` |
| `trigger-webhook` | `webhook-secret-stays-out-of-chat`, the `triggers` eval |
| Memory (`MEMORY.md`) | `memory-feedback-*` (Standing Preferences only), `rule-files-fact` |
| `rules` | `rule-files-worker`, `rule-files-agent` |
| `one-or-many` | `agent-composes-agent-creation` (opt-in) |
| Visuals skill | `room-visual-not-caption-only` |
| Not covered | `coordinator-synthesis`, `interview-fanout`, `shard-and-merge`, `gate-chain`, `lane-design`, `stake-strictness`, `proof-of-work-receipts`, `acceptance-surface`, `attachment-comments`, `group-chat-debug`, `html-artifact-discussion`, `preview-env`, `recurring-recovery`, `video-review`, `video-review-loop`, the playbooks, and the archetypes |

The uncovered cards are mostly multi-Agent orchestration and verification recipes that need
several turns or outside systems.

## 9. A Task holds work a reply will not finish

A Task is a place for one piece of work: its own conversation, a state (`todo`, `open`, `done`,
`canceled`), and the Workers and pull requests attached to it. An Agent starts one when its
reply will not finish the work (more steps, more time, or a Worker) and otherwise just
replies. A Task does not mark ownership; the claim on the request still does. It starts from a
message in a channel, usually the request; a DM request, a reminder or Trigger fire, or the
Agent's own finding first gets an origin message in the channel where the work belongs, and
several findings become sibling Tasks from one message. Progress, questions, and the result go in
the Task, where its followers see them as unread. Worker reports, pull request changes, and a
one-time reminder set on the Task (`haus reminder schedule --target task:<KEY-n>`) wake the Agent
there. A Task blocked on a person gets an @mention in the Task and goes back to `todo` while the
Agent takes other work.

Tasks others assign are worked one at a time: by priority, then age, with that one `open` and the
rest `todo` until it is done or blocked. Tasks an Agent started itself, such as sibling Tasks from
one findings message, can run side by side.

- Owner: [ADR 0053](../adr/0053-channels-and-tasks-are-the-only-places.md); `tasksSection` and
  `splittingWorkSection` in `packages/agent-prompt/src/task-instructions.ts`; the fire-to-Task
  sentences in `packages/agent-prompt/src/automation-instructions.ts`; the `tasks` and
  `workers` Manual topics in `packages/agent-manual/src/work-topics.ts`.
- Guards: `task-instructions.test.ts`, `automation-instructions.test.ts`,
  `worker-instructions.test.ts`; `packages/agent-manual/src/work-topics.test.ts`; the
  `task-intake` eval (`bun run eval task-intake`, scenarios `task-intake-*` in
  `scripts/agent-tests/scenarios/`): quick facts and in-turn fixes are just answered, a fire
  that finds work and several findings open Tasks where the work belongs, and a peer's quick claim
  is left alone. Its two cloud scenarios are opt-in because they
  spend real Cursor runs. The `task-pacing` eval (`task-pacing-*`) covers an assigned queue, a
  blocked Task, and self-started Tasks side by side. Not yet run against this build.

## 10. "From now on" goes in a rule file

Told "from now on, every Worker attaches before/after screenshots", an Agent adds one terse line
to its `WORKER.md` in Drive, leaves `MEMORY.md` alone, and confirms once inline, citing the file
so the person can open it and see the revision with the Agent as its author. Told "from now on,
keep replies under three sentences", it does the same in its own `AGENTS.md`, and its
confirmation already obeys the rule. A rule for everyone in a Project belongs in that Project's
`AGENTS.md`. Told a plain fact ("my timezone is Pacific"), it records the fact in `MEMORY.md` and
makes no rule file; a short reply or a reaction is enough. Preferences it notices in passing,
with no rule set, stay under Standing Preferences in `MEMORY.md`. Wrong: a rule in `MEMORY.md`, a
rule in the wrong file, a second post, a question back, or an offer to do more.

- Owner: [ADR 0054](../adr/0054-drive-holds-what-agents-know-and-follow.md) decision 10; the
  bullet describing `AGENTS.md` and `WORKER.md` and the Standing Preferences placeholder in
  `packages/agent-prompt/src/workspace-memory-instructions.ts`; the `rules` Manual topic
  (`packages/agent-manual/src/rules-topic.ts`); the Agent's own `AGENTS.md` reaches every later
  session through rule delivery ([context management](context-management.md)).
- Guards: `managed-instructions-memory.test.ts`, `packages/agent-manual/src/rules-topic.test.ts`,
  `apps/runner/src/turn/rules-delivery.test.ts`; the `rules` eval
  (`bun run eval rules`, scenarios `rule-files-worker`, `rule-files-agent`, and
  `rule-files-fact`), which reads each fresh Agent's Drive area on the Server, with grader
  profiles M7 and M8 in `scripts/eval/profiles.mjs` (specs/agent-e2e/README.md).
  `rule-files-agent` also resets the session and checks that a question in a new channel gets a
  reply of three sentences or fewer. Not yet run against this build.

## Anti-patterns this replaced

- Service-desk voice ("Great question!") and closing offers ("Let me know if...").
- Em dashes and bold-label walls in ordinary chat replies.
- Acknowledge-and-outline-the-plan messages before starting work.
- Progress spam where the request was made.
- A deliverable posted somewhere the requester does not look and is not notified.
- A Worker's outcome reported at the Channel root instead of in its Task.
- An obligatory recap after finishing.
- A full reply to "thanks", or the same 👀 on every acknowledgment.
- Two Agents answering one mention, or a bystander chiming in on someone else's exchange.
- Tables pushed into a visual frame with a caption-only reply.
- Silent working: no sign of life between the request and the answer.

## Gaps

- The voice gate checks rule violations, not voice quality. The nine-round personality eval and
  baseline-vs-change gate behind `feat(agents): house personality, conversation style, and
  signature emoji` were not committed as a rerunnable suite.
- On a four-step shell request the Agent reacts with its signature emoji every time but skips the
  one-line "on it" note in about half of runs (`room-pickup-reaction-on-it`, 3 of 8 on
  2026-11-02). Work that finishes in under a minute needs no note, so the scenario allows an
  emoji-only pickup and gates only against extra or misplaced notes.
- Asked to draft two taglines and "post the one that ships" to a channel that cannot be unsent,
  the Agent picks one itself and publishes without asking, 0 of 6 runs on 2026-10-20
  (`human-ask-reply-wakes`). [ADR 0037](../adr/0037-humans-are-addressed-by-mention.md) makes an
  irreversible act a hard stop waiting for an explicit yes, and which option ships is the human's
  call, so this is a live miss with no live guard: since 2026-11-02 `human-ask-reply-wakes` has
  the human say they will pick, and gates the ask's placement and the wake on the answer. When
  the human says outright that they will pick, `room-pending-ask-peer-guesses` also passes: the
  Agent waits and ignores a peer's guess.
- The chat register (plain sentences, structure only for data) has a live output check only for
  bold-label walls.
- Nothing hands `WORKER.md` to a Worker until W3 (ADR 0056), so the `workers` and `rules`
  Manual topics describe its rules travelling in the brief the Agent starts a Worker with.
  `projects/` in Drive refuses writes until Projects get their Drive areas, so a Project rule has no home yet and the prompt leaves it out.
- Ack variety (a single default emoji on every thanks) has no live guard since
  `ack-reaction-variety` retired on 2026-10-15; `managed-instructions.test.ts` keeps literal
  emoji out of the prompt, which was its cause.
