---
summary: Proposal (accepted by Zach 2026-11-21 after council review) for how Agents get permission and answers. Settings grant permissions and conversations only ask questions. Captains in DMs, channels and Projects ask in plain @mention text, with Raft parity. A gated capability refuses with text that tells the Captain to ask in plain text and link the setting, and the person's reply wakes it to retry. Computer use stays a per-Device setting (Off or Allowed) with an optional list of which Captains may use it. Workers, a Task's 1:1 Claude Code or Codex runs, get the harness's native question card on the Worker page: Haus ends the turn when the harness asks, and the answer resumes the same session as the next turn. Workers never get permission prompts. Replaces the per-chat Ask and grant design of 2026-11-21.
read_when:
  - adding a way for an Agent or a Worker to ask a person a structured question
  - adding a permission prompt, a grant, or an approval card anywhere in Haus
  - changing computer use's Device setting, its gate, its refusal text, or who may use it
  - changing how a Worker's harness question (AskUserQuestion, request_user_input) reaches a person
  - revisiting ADR 0037 (humans are addressed by mention) or specs/permissions.md
---

# Proposal: settings grant, conversations ask

Status:
- **Direction locked by Zach on 2026-11-21:** "I think this separation between multiplayer spaces
  like projects and worker threads is great."
- **Accepted by Zach on 2026-11-21** after the council review, with the four decisions recorded
  under [Council](#council).
- It replaces the per-chat Ask record, grant scopes and Ask cards that this proposal held earlier
  the same day. Git history keeps that version.
- **Amended 2026-11-23** by
  [ADR 0057's Machine amendment](../adr/0057-agents-run-on-the-server-and-machines-run-their-tools.md#amendment-2026-11-23-the-machine-replaces-the-home-computer):
  computer use is one switch over every Captain with access to the Device, so the Captains list
  under [Computer use](#computer-use) retires. Settings grant, conversations ask stands.

Research inputs live in the shared session notes folder, outside the repo:
- `capy-ask-permission-findings.md` and `capy-asks-shots/` cover Capy 0.9.2.
- `harness-ask-permission-survey.md` covers Claude Code, Codex, Cursor and Managed Agents.
- `raft-ask-approval-findings.md` covers Raft at db5e399.
- `worker-native-ask-feasibility.md` covers what Haus's Worker drivers can do today.

## The model

**Settings grant permissions, and conversations only ask questions.** Each kind of place gets the
treatment that fits it.

| | Captains (DMs, channels, Projects) | Workers (a Task's Claude Code or Codex run) |
| --- | --- | --- |
| Who is in the room | Several people and several Agents | One person or Agent steering one run |
| Asking a question | Plain @mention text, as in Raft ([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md)) | The harness's native question tool, shown as a card on the Worker page |
| Getting permission | A setting a person changes. The refusal text says which one | None. Workers run with approvals off under local trust ([specs/workers.md](../../specs/workers.md)) |
| Does the run wait | Never. The turn ends, and the reply wakes the Captain | Never inside a tool call. Haus ends the turn when the harness asks, and the answer resumes the same session |

Why the split:
- **A Captain** has one session across every chat and runs one turn at a time
  ([specs/sessions.md](../../specs/sessions.md)). A turn blocked on a person would stall it
  everywhere. A channel also has many people in it, and a card in a shared transcript raises
  questions with no good answer: who may press it, what everyone else sees, and what happens when
  two people answer. Raft has the same room, and it has no question record and no tool permissions.
- **A Worker** is the shape every harness's question tool was built for: one run, one person
  watching. Capy takes over the composer the same way in its 1:1 threads.

## Captains: plain text, settings, refusals

There is no Ask record, no buttons, no channel pill, no per-chat grant and no Deny state. When a
gated call is refused:
1. The Server refuses it at once with text that names the setting and its deep link.
2. The Captain asks the person in plain text, linking the setting.
3. The person changes the setting and replies. The reply wakes the Captain like any reply.
4. The Captain retries.

The runner, both harnesses, `RunTools`, and the Agent inbox don't change. The refusal is an
ordinary invocation result, as "Computer use is off" is today
(`apps/server/src/computer-use/computer-use-gate.ts`).

**Refusal text.** Every gate refusal follows one shape, so the Manual can teach it once:
- **What was refused, and why.** Each cause gets its own text: the setting is Off, this Captain
  isn't on the list, macOS permissions aren't granted, or the Device is offline or isn't a Mac.
  Off wins when several apply, and the readiness causes never send the Captain to a setting.
- **Who can change it.** The attacher's `@handle` if they are in the chat, otherwise "an Owner or
  Admin", and the Captain @mentions them. The link opens the Device's settings page. For someone
  who can't view that Device, the page says who can change it.
- **How long it has been this way.** This comes from `computer_use_changed_at`. A setting that was
  never turned on says so.
- **Whether this Captain was already refused here.** The invocation ledger already records gate
  refusals, so the text can say "You were already refused here at 14:02 and asked then. Don't ask
  again." A second refusal in the same turn says "Already refused this turn. Stop calling `desktop`."
- **What to do.** Ask once in plain text where you're working, and tell the person to reply when
  they've changed it. Then stop. "I changed it" in a reply isn't authorization: retry, and let the
  gate decide.

For example: "Computer use is off on MacBook (since Nov 18). @zach, or an Owner or Admin, can turn
it on in Settings → Devices → MacBook (/s/acme/settings/computers/cmp_…). Ask once in plain text
where you're working, link that page, and ask them to reply when it's on. Then stop."

### Computer use

Computer use stays a per-Device setting, Computer use allowed, Off or Allowed, and is off by
default. It gains one setting: **which Captains may use it**.

| Setting | Default | Meaning |
| --- | --- | --- |
| Computer use allowed | Off | Off refuses every `desktop` command. Allowed lets eligible Captains look and act |
| Captains | All Captains on this Device | `{kind: 'all'}` or `{kind: 'named', captainIds}` with at least one id. A static list, like Raft's per-Agent eligibility |

- **All includes later Captains.** It covers every Captain whose machine is this Device, including
  ones added later. The picker says so: "All Captains on this Device (now Cove, Forge)".
- **Named Captains only.** Named entries live in a join table that cascades on Captain deletion. A
  Captain that moves to another machine leaves the list, so moving back needs consent again.
- **Who may change it.** Both settings keep today's rule: the attacher, an Owner, or an Admin.
- **No Projects scope.** Each Captain belongs to exactly one Project
  ([ADR 0055](../adr/0055-projects-own-agents-and-tasks.md)), so "the Captains of Project X" is
  already a list of names. A Project scope would be a second way to say the same thing, and it would
  change silently when a Captain moves Project. Name Captains instead.
- **Look and act stay together.** Capy's "looking never asks" needs a per-chat ask, which this model
  drops. Allowed means both.
- **The refusal never names other Captains on the list.** They may belong to Projects the chat
  can't see.

## Workers: the native question card

When a Worker's harness calls its question tool, Haus ends the turn itself and shows the questions
on the Worker page. The tool is Claude Code's `AskUserQuestion` or Codex's `request_user_input`.
The answer resumes the same session as the next turn. There is no live wait, no timer, and no
waiting turn holding a slot. Each step is enforced by Haus, never left to the model.

1. **Capture.** The driver catches the question request, validates it, and journals it on the
   Computer. It sends a question frame, and the Server stores the questions on the turn.
2. **End the turn.** The driver ends the turn itself.
   - Claude Code: a deny with `interrupt: true` to the CLI's `can_use_tool` request.
   - Codex: `turn/interrupt` after answering the request with an error.
   - Claude cloud: the existing interrupt.
3. **Settle.** The Server settles the turn `needs-you`, and the report carries the stored
   questions. A turn whose process dies after capture also settles `needs-you` with them, never
   `no-report` or `machine-offline`.
4. **Answer.** The person answers from the card. The Server closes the question, first answer wins,
   and queues the answer as the next turn's input.
5. **Resume.** The answer reads as Capy's numbered "**question** → answer" list. The harness
   resumes the session with full context, so the only cost is a colder prompt cache.

- **Card.** Capy's composer takeover on the Worker page, never on the Task's own composer:
  - "1 of 3";
  - numbered options with number keys, and checks for multi-select;
  - "Or type an answer";
  - Later, Dismiss and Next, then Review and Send answers (⌘↵).
  
  Review uses look D, Capy's plain list (`/prototype/asks/review-looks` keeps the alternatives).
- **Any follow-up answers the open question.** A person's follow-up, the Agent's
  `haus worker send`, or a typed reply on iPhone becomes its free-text answer. That's one path, so
  there's no `haus worker answer` and no queue behind a waiting turn.
- **One post and one wake.** The `needs-you` report is the post, the existing `worker_report` wake
  carries the questions, and there's no new inbox kind.
  - The report @mentions the newest person whose follow-up was in the asking turn's input.
  - Otherwise it goes to the delegating Agent, as a needs-you report without a person does today.
    The Agent answers from what it knows or @mentions someone in the Task.
- **Questions only.** Every other `can_use_tool` request is denied, which keeps today's outcome:
  Claude Code's own dangerous-`rm` checks stay closed, and MCP elicitation stays declined. A Claude
  cloud `requires_action` that isn't `AskUserQuestion` settles as a plain needs-you report with no
  card.
- **Cursor.** It can't surface the tool, so it keeps the free-text needs-you footer. The card shows
  its ask with only "Or type an answer".

### Feasibility per place

**No place can do this today.** The evidence, with file and line, is in
`worker-native-ask-feasibility.md`.

| Place | Today | What it takes | Risk |
| --- | --- | --- | --- |
| Claude Code on a Computer | Launched like the Agent SDK does: stream-json, `bypassPermissions`, `AskUserQuestion` in `--disallowedTools` (`claude-worker-driver.ts`). The driver drops requests from the CLI | Allow the tool, add `--permission-prompt-tool stdio`, catch `can_use_tool` for `AskUserQuestion`, journal the questions, and deny with interrupt. Deny every other request | Medium. Needs a minimum Claude Code version |
| Codex on a Computer | `codex app-server` with `approvalPolicy: never`. `request_user_input` isn't offered in the default mode, and Haus answers it with method-not-found (`server-requests.ts`) | Turn on the experimental default-mode `request_user_input` feature, catch `item/tool/requestUserInput`, then `turn/interrupt` | Medium to high. The flag and its payload are unconfirmed on 0.159.0. Spike first |
| Claude cloud | The session goes `requires_action`, Haus interrupts, and the turn ends needs-you. The answer goes in as a new prompt | Already this design. Parse `AskUserQuestion` payloads into structured questions, and keep other kinds as plain needs-you | Low |
| Cursor cloud | No run status means waiting on a person | The needs-you footer only | None |

Each driver reports which question support its installed harness version has. Live capability is
shown only after driver-level proof of capture, interrupt, settlement, restart, and resume.

**Later, if wanted.** A short live hold, 2 to 5 minutes and only while someone has the Worker page
open, could answer inside the same tool call. It needs a Server-owned state machine and its own
slot rules, so it waits until the interrupt-and-resume path proves too slow in practice.

## Edge cases

| Case | What happens |
| --- | --- |
| **A Worker asks and nobody is watching** | The turn settles `needs-you` at once, so no slot is held. The report @mentions the person whose follow-up started that turn, or wakes the delegating Agent. The question stays open until it is answered, dismissed, or its Task or Worker closes, with no expiry |
| **A Worker asks after its turn timeout or stall window** | No wait exists to time out, because the turn ends the moment the question is captured. A cloud question settles the turn, so it is never a stall |
| **The process dies after the question is captured** | That covers a restart, an upgrade, 30 minutes offline, or an expired credential. The Server already holds the questions, so the turn settles `needs-you` with them, not `no-report` or `machine-offline`. If it dies before capture, today's failure stands |
| **Several Workers ask at once** | Each settles separately. Their `worker_report` wakes coalesce per Task as today, up to 20, and the rest arrive in the next batch. Each Worker page shows its own card |
| **A Worker asks twice in one turn** | It can't: the turn ends at the first question. Overlapping question requests in one turn are refused with an error, and only the first is kept |
| **Who may answer in a shared Task** | A person who can post in the open Task, or the delegating Agent through `haus worker send`. Other Agents can't. Authority is rechecked on submit. The first answer to the whole question set wins, and a later answerer sees "Answered by Zach", with their draft kept so they can send it as an ordinary follow-up |
| **A human and the Agent both answer** | First wins. The Agent is woken only when it is the addressee, so it doesn't race a person who was asked |
| **A Worker in a cloud place** | Claude cloud uses the same flow, with structured options when the payload is `AskUserQuestion`. A permission `requires_action` is a plain needs-you report with no card. Cursor uses the free-text footer |
| **A Claude cloud session expires with a question open** | Answering shows "This session ended. Start a new turn with your answer", which starts a new turn from the brief and the answer |
| **The answer arrives while the Computer or carrier is offline** | It queues as the next turn's input and launches when the place returns. Today's owed-stop fence still holds: nothing launches until the old process has ended |
| **The Worker is stopped, or its Task closes, with a question open** | Stop has nothing to stop, since the turn is already settled. It closes the question, and a later follow-up starts a turn as today. Closing the Task, or the Worker, cancels the question, and answers are refused with "This Task is closed" |
| **The place's "Workers can run here" switch turns off** | The answer is refused with `WORKER_PLACE_OFF`, like any follow-up, and the card says why |
| **Dismiss** | It closes the question for everyone, attributed ("Dismissed by Zach"), and starts no turn. The Worker stays `needs-you` until someone sends a follow-up. Later only hides the card on that device |
| **A Worker asks again and again** | Each ask costs a turn and a needs-you report, which the Agent and people see. A baseline eval measures how often Workers ask before this ships, and the Worker instructions say when to ask |
| **The installed harness is too old** | That harness keeps today's behavior: the tool stays disallowed and Workers use the needs-you report. Support is reported for each harness version |
| **A question from a subagent** | Claude Code doesn't offer `AskUserQuestion` inside subagents, so only the root session asks |
| **iPhone** | It has no card in this epic. It shows "Waiting on an answer" with the questions as text, and a typed follow-up answers them |
| **A Captain is refused computer use repeatedly** | Each refusal says how long the setting has been this way and when this Captain was last refused in this chat. A second refusal in a turn is a hard stop. Refusals are instant and cost no Device time, so a loop only wastes tokens. A Captain woken days later can see that it already asked |
| **Several Captains are refused in one channel** | Each refusal names only that Captain's own ledger entry, so each asks at most once. If they find the same request already standing in the channel, the Manual tells them to point to it |
| **The setting turns off mid-action** | The running `desktop` command finishes (60 seconds at most) or is stopped with Stop Agent Input. The next one is refused. A command resent on reconnect is re-gated, as it is today |
| **A Captain isn't on the list** | "Computer use on MacBook isn't allowed for Ledger. @zach, or an Owner or Admin, can add it (link)." The text names no other Captains |
| **A Captain moves to another machine, or is deleted** | Its list entry goes. Moving back needs someone to add it again |
| **The person who asked can't open the Device's settings** | The link lands on a page that says who can change the setting |
| **The person flips the setting but never replies** | The Captain stays asleep, as with any unanswered @mention. The refusal text asks them to reply, and the Captain's reminders cover follow-through as today |

## What changes

- **Specs.**
  - `specs/computer-use.md` gains the Captains list, `computer_use_changed_at`, and the refusal
    shape.
  - `specs/workers.md` gains the question capture, the `needs-you` report carrying questions, and
    "any follow-up answers an open question".
  - `specs/cloud-agents.md` splits Claude `requires_action` into question and non-question.
  - `specs/permissions.md` keeps "Haus does not expose interactive tool approval prompts" and adds
    that Workers ask clarifying questions only.
- **Server.**
  - The gate reads the list and writes cause-specific refusals from the ledger.
  - The Captains list is a typed setting plus a join table.
  - Turns store their questions.
  - The settlement mapping treats a captured question as `needs-you`.
- **Computer.**
  - The Claude Code and Codex drivers capture questions, journal them, interrupt, and deny every
    other request.
  - The Worker protocol gains a question frame.
  - Each driver reports question support per harness version.
- **API.** The Worker report schema gains an optional `questions` field, and the Task message
  projection renders answers as the numbered list.
- **App.**
  - The Device page gets the Captains picker.
  - The Worker page gets the question card, with `/prototype/asks/*` holding its designs.
  - Worker rows read "Waiting on an answer" for a `needs-you` report that carries questions.
- **Agent surface.** No new command and no new inbox kind. The `worker_report` formatter renders
  questions. The Worker instructions get a line on when to ask, and it is size-capped and
  baseline-evaluated. The Manual gets one topic on refusals.
- **Captains.** The runner, both Captain harnesses, `RunTools` and the Agent inbox are unchanged.
  Only the refusal text they receive changes.
- **ADR 0037** gets a dated amendment. It still holds for conversations: no question records or
  cards there. A Worker's harness question is the exception, scoped to the Worker page.

## Council

Reviewed on 2026-11-21 by Codex (`gpt-6.1-sol`, read-only), Gemini (`gemini-4-neon-high`) and a
fresh Opus reviewer, against the brief `council-settings-grant-brief.md`. Their full outputs are
`council-settings-{codex,gemini,opus}.md` in the notes folder.

**All three agreed, and the design changed:**
- **The bounded live wait is gone.** The first draft ended a 30-minute wait by telling the model to
  "end this turn needs-you". The model can ignore that, the instruction can't reach a dead process,
  and the model would retype options it had already sent as structured data. Haus now interrupts
  the turn itself and settles from the questions it captured.
- **Capture before anything else.** The Server stores the questions first, so a restart or an
  offline Computer settles `needs-you`, not `no-report`.
- **Every other prompt is denied.** "Auto-allow everything else" would have approved Claude Code's
  dangerous-`rm` prompts, so every other request is denied. Claude cloud permission waits never
  become question cards.
- **Later is local only.** It doesn't end a wait, and Dismiss is attributed.
- **One post and one wake.** No `worker_question` kind and no `haus worker answer`, because any
  follow-up answers the open question.
- **The Captains list is typed and cascades.** A moved or deleted Captain drops off it, and "All"
  says it includes later Captains.
- **Refusals got specific.** Each cause has its own text, the ledger says when this Captain was
  already refused, and the text names no other Captains and never sends a non-steward to a page
  they can't open.

**Two were declined:**
- **A `waiting` turn sub-state.** The interrupt makes it unnecessary, because `needs-you` already
  says it.
- **A 60-second grace before waking the Agent.** The Agent is woken only when it is the addressee.

**Decided by Zach on 2026-11-21:**
1. **Interrupt and resume.** A Worker's question ends the turn, and the answer resumes the same
   session as the next turn. A live hold stays a later option.
2. **Review look D**, Capy's plain list.
3. **Notifications.** A Worker's question notifies the newest person whose follow-up was in the
   asking turn, otherwise the delegating Agent.
4. **"All Captains" includes Captains added later,** and the picker says so.
