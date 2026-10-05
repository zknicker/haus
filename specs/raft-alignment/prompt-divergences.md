# Agent system prompt — Haus vs Raft divergence register

Field-by-field diff of Haus's composed Agent system prompt
(`apps/computer/src/harness/managed-instructions.ts`) against the current Raft prompt, read from
source.

**Pinned Raft source:** <https://github.com/botiverse/raft-source> at commit
`05f7d8fd77d2535f993d5d90b85118438bc18216` (release `v1.13.0-source.1`, daemon 1.0.25).
The reference render is `packages/daemon/src/drivers/__snapshots__/systemPrompt/common.md`
(26,764 characters); the builder is `packages/daemon/src/drivers/systemPrompt.ts`, and event
input is `packages/daemon/src/agentRuntimeInput.ts`. See
[raft-system-prompt.md](raft-system-prompt.md). Diffed 2026-09-28.

**How to read this.** *Parity* means the text matches the pinned Raft render apart from the
product-noun substitution. *Deliberate* means an owning spec, ADR, or test requires the
difference. *TODO* means the difference exists without an owner and should either be justified
or removed. Haus substitutes `haus` for `raft`, `Haus` for `Raft (former Slock)` in prose, and
`HAUSMSG` for the `RAFTMSG` heredoc delimiter; that substitution is assumed everywhere.

## Tracking rule and budget

Haus tracks the **current** Raft release from source. Raft-verbatim text is text present in the
Raft prompt at the pinned commit. It is the fixed part of the budget: never trimmed, paraphrased,
or reordered to make room, and adopting a current Raft clause may raise the budget by exactly its
size. When Raft deletes a clause, the Haus copy becomes Haus-only and must justify itself with a
row below or be cut. Haus-only text is the variable part: each addition justifies itself with a
row below, and mechanics belong in Manual topics, skills, or event input (ADR 0012). Re-pin by
updating the commit above and re-diffing every row.

Raft's own writing rule (`systemPrompt.ts` header) governs placement: durable collaboration
principles live in the standing prompt; event formats, delivery mechanics, and event-specific
actions live in the event input.

`managed-instructions.test.ts` caps the composed prompt at **32,529** characters. The cap is a
ratchet that forces a deliberate decision, not a hard limit: a justified addition raises it to
the measured render in the same change, with a one-line reason in the history below. Never
delete, trim, merge, or deduplicate other prompt text just to make room; shrinking the prompt is
its own change with its own reason. History: introduced at 32,500 (2026-08-18), raised to
40,270 by 2026-09-23, lowered to 32,359 by the 1.0.25 re-baseline, raised by exactly 42 to 32,401 when
Raft's `task assign` / `task unassign` family entries were restored, lowered to 32,395 when
Asks were deleted (ADR 0037), ratcheted down to 32,220 by later Haus-only simplifications, and
raised by exactly 224 to 32,444 when the Formatting section gained the chat-register rule
(operator decision, 2026-10-01), then lowered to 32,416 when solo step-by-step progress moved
into a thread on the acknowledgment (ADR 0029 amendment, 2026-10-02), then lowered to 32,399
when the Haus-only `## Personality` section arrived (2026-10-03), paid for by shortening the Cloud
agents section's delivery sentences and measured with a one-word personality, then raised to
32,529 for reminder title guidance: Reminders gained the Haus-only `--title` label /
`--description` sentence (2026-10-05). Measured line-by-line against the pinned
render, about 18,500 characters of the Haus prompt are Raft-verbatim.

## Re-baseline on Raft 1.0.25, 2026-09-28

Operator-approved. Render 40,270 → 32,359 characters.

| Change | Where it went |
| --- | --- |
| Startup step 3 notice essay, the post-startup "process stays alive" note, and `## Message Notifications` | Into the inbox notice itself: `composeInboxNotice` (`apps/computer/src/inbox-format.ts`) closes every notice with withheld-not-absent, not-a-request, pull commands, and honest-deferral guidance, modelled on Raft's `formatInboxUpdateRuntimeInput`. The prompt adopts Raft's step 3 ("Handle the input supplied for this turn. If there is no pending work, stop."), step 5, and its "collaborate asynchronously" Messaging paragraph |
| Task mechanics (message task suffix, status flow, assignee independence, claim flags, `task create` semantics, `--assignee`, receipts, duplicate avoidance) | The `tasks` Manual topic (`packages/agent-manual/src/product-topics.ts`). The prompt keeps Raft's current `### Tasks` plus Haus's conversation rule, same-turn `done`, `closed`, the stale window, and a pointer |
| Cut — Raft deleted them | "put to sleep when idle"; the stderr `Error:`/`Code:`/`Next action:` block and error-prefix taxonomy; the second credential paragraph; the third copy of the claim rule in CRITICAL RULES (now Raft's "Prefer running one … per tool call"); the etiquette claim bullet; the pull-request closed-gate-set paragraph (replaced by Raft's "Do not infer approval…" paragraph); `Formatting — URLs in non-English text`; the workspace "code checkouts" and "first choose the project directory" tail; the "Keep MEMORY.md current" bullet; `## Capabilities`; "coding conventions" in What to memorize |
| Cut — Haus-only, no owner | The heredoc delimiter rationale sentence |
| Trimmed | Capability and execution-surface selection, by about 500 characters, keeping every tested sentence |
| Adopted from Raft | The `**Visibility**` block in Channel awareness; the draft no-op bullet; `### Reading history & references` as one section; Raft's current wording for the credential paragraph, Runtime Context preamble, thread unfollow, etiquette "report on it", Live constraints reception ("a task description"), Formatting refs, the MEMORY.md paragraph, and compaction safety ("recovery point"); `## Live constraints` and `## Formatting — Mentions & Channel Refs` at Raft's heading level |

## Section-by-section register

Sections are in Haus's render order.

| Section | Difference | Status / owner |
| --- | --- | --- |
| Identity line | `an AI agent in Haus` vs `in Raft (former Slock)` | Deliberate — AGENTS.md coding rule 11; `specs/haus-rename.md` |
| Who you are | Parity | — |
| Current Runtime Context | Parity for the preamble. Rows differ: Haus renders `- Agent: @handle (id)`, Hostname, OS, Runtime, Workspace, Home timezone; Raft renders Role, Agent ID, Server ID, `Computer: name (id)`, Hostname, OS, Daemon, Workspace. Raft renders the section only in its configured variant; Haus always does | Deliberate — ADR 0019; the home timezone is load-bearing for the `time=` header (specs/messages.md); the role renders as `## Initial role` |
| How these instructions apply | Parity | — |
| Communication — CLI ONLY, command families | Haus drops Raft's admin channel/server management, Integrations, Action cards, Wiki bridge, `raft version`, sender-side mention actions, `user info`, built-in apps, `auth whoami`, and task `amend/history/convert/delete` (task `assign/unassign` restored verbatim when Haus gained the verbs). Haus adds Triggers, Skills, Agents, Cloud agents, `channel info`, and `message follow/unfollow`. Inbox has no Raft trailing description | Deliberate — specs/haus-cli.md is the CLI contract; ADRs 0017/0021/0027/0028, specs/cloud-agents.md, specs/skills.md |
| Agent creation guidance in Manual and Cove factory notes | Haus creates directly on the human's request, then hints an ordinary introduction using the confirmed handle. Raft retains human-committed action cards; its agentic greeting is a private instruction to the new Agent. Haus creation posts no Message and has no `--say` | Deliberate — ADR 0028; agent creation, CLI, Manual, and Cove factory tests |
| Credential handling, CRITICAL RULES | Parity | — |
| Startup steps 1, 2, 3, 5 | Parity | — |
| Startup step 4 | Parity **plus** "Haus exception: react to a human's thanks, ack, or sign-off to you with one emoji fitting its tone, no send (`haus message react --message-id <id> --emoji <emoji>`); an explicit FYI gets nothing." No literal emoji, which would become every Agent's default | Deliberate — specs/inbox.md silence semantics; emoji choice per the `replies` Manual topic; the Agent API accepts exactly one emoji; gated by `fyi-silence-channel` / `fyi-silence-dm` / `ack-reaction-thanks` / `ack-reaction-with-request` / `ack-reaction-variety` in `bun run eval:prompt` |
| Messaging — async paragraph | Parity | — |
| Messaging — header spec and examples | Haus adds `type=trigger` (Raft has `third_party_app`), the `@sender — <description>:` suffix, home-timezone wall-clock `time=` with a staleness sentence, and `msg=` "(first 8 chars)" without "of UUID". Haus's `type=system` paragraph drops Raft's task-event examples and adds the assignee-receipt sentences | Deliberate — ADR 0027 (triggers), specs/agent-profile.md (description rides the envelope), specs/messages.md (local wall clock), ADR 0015 + ADR 0026 (no task-event receipts; assignment receipt) |
| Sending messages | Parity, including the draft paths and no-op bullet, **plus** the Haus placement paragraph: acknowledgment, questions for the human, and the final answer go as inline replies where the request arrived; step-by-step progress of solo work goes in a thread on the acknowledgment (its send receipt names the target), never in a thread on the request; `--reply-to`, thread targets, `--done`, `replies` Manual pointer | Deliberate — ADR 0029 and its 2026-10-02 amendment (inline replies, progress threads), ADR 0035 (`--done`); covered by `thread-instructions.test.ts`, `managed-instructions.test.ts`, and `test:agents solo-progress-threads-on-ack` |
| Reminders | Haus replaces Raft's "the receipt/fire system message is visible in that surface" with "Anchoring … does not transfer wake ownership"; adds the `--title` short-label / `--description` sentence after the Raft lines, script reminders, the `recipes/technique/reminder-cron` pointer, and fire placement with `--cause` | Deliberate — ADR 0026 (a fire writes nothing to chat), ADR 0016, specs/automation-provenance.md; the Server's reminder title limit (`instructions.test.ts`) |
| Triggers | Haus-only section, including its own fire-arrival and `--cause` placement sentences (the same text as Reminders) | Deliberate — ADR 0027, specs/triggers.md |
| Cloud agents | Haus-only section, ending at bringing back a concise outcome with a link. Revision mechanics (`cloud-agent send --work`), the work thread's role (review rounds and progress there; one requester line per real state change), and following the requester into the work thread live in the `cloud-agents` Manual topic the family entry requires reading first | Deliberate — specs/cloud-agents.md; cloud-agent instruction tests, `product-topics.test.ts` |
| Threads | Haus intro keeps a request and its answer where it arrived and follows the human into threads; target construction replaces Raft's "Start a new thread" example and its "Reply where the conversation is" preference bullet. Read-before-reply, own-message threads (the progress-thread mechanism), history, unfollow, and no-nesting are parity | Deliberate — operator-approved conversation policy (ADR 0029, amended 2026-10-02); covered by routing evals `conversation-natural-followups`, `task-conversation-routing` (no thread for one-step work), and `solo-progress-threads-on-ack` |
| Discovering people and channels | Parity | — |
| Channel awareness | Parity, including Visibility | — |
| Capability and execution-surface selection | Haus-only. Raft 1.0.25 has no such section; its Integrations family bullet carries a short surface-choice rule tied to Agent Login, which Haus lacks. Haus keeps a trimmed section: surfaces, inventory scope, and the MCP `execute` discovery path | Deliberate — ADR 0017, specs/mcp.md; gated by `mcp-granted-lookup` / `mcp-revoked-honest-failure` and `managed-instructions.test.ts` |
| Reading history & references | Parity | — |
| Tasks | Parity for the claim rule, top-level-only, failed-claim routing, and review-then-done sentence. Haus adds **Keep the conversation together** (acknowledge and answer where asked), same-turn `done`, reversible `closed`, the `TASK_IN_REVIEW_STALE_DAYS` stale close, and points to the `tasks` Manual topic where Raft points to "the Raft Manual" | Deliberate — operator-approved conversation policy; ADR 0015 (`closed`), `apps/server/src/tasks/close-stale-tasks.ts`; covered by `instructions.test.ts` and `product-topics.test.ts` |
| Splitting tasks | Parity | — |
| @Mentions | Parity **plus** one Haus-only bullet: to need a human's decision or action, @mention them where the work lives, with one question, a default only if reversible, and what you prepared; their reply wakes you; irreversible acts wait for an explicit yes. Raft keeps this in its `recipes/decision/when-to-ask-human` recipe; Haus lifts it into the prompt because deleting `haus ask` removed the only prompt-taught way to need a human. Haus renders one name, so the display-name bullet interpolates the same value twice | Deliberate — ADR 0037 (replaces the retired Asks family entry, net −6 characters; a later mention-the-asker clause was cut again once an inline reply to a human's message came to address them like a mention, 32,393 → 32,281), specs/identity.md; `managed-instructions.test.ts`, `human-ask-reply-wakes` |
| Communication style | Parity | — |
| Conversation etiquette | Parity **plus** "Silence is deliberate" (step 4 holds in a DM: an explicit FYI gets nothing, a thanks or ack one reaction), "DM knowledge is not room knowledge", and "Welcome new teammates" | Deliberate — specs/inbox.md (silence), specs/sessions.md §"Knowledge and discretion", ADR 0028 (welcome fires on a message, so it cannot live in a Manual topic) |
| Live constraints | Parity | — |
| Formatting — Mentions & Channel Refs | Haus drops Raft's `#1` numeric channel form and adds "Haus renders your message as Markdown, GFM tables included," extended with a chat-register rule: plain sentences, no bold for emphasis or as labels, lists/headings/tables only for genuinely structured content | Deliberate — specs/mentions.md (no numeric refs); Haus App renders GFM (docs/internals/widgets.md); chat register is an operator decision 2026-10-01 (agents overused bold in chat), covered by managed-instructions.test.ts |
| Workspace & Memory | Parity **plus** the MEMORY.md re-read sentence ("at natural boundaries … including after context compression"; "Your session resets rarely…") and the "Apply remembered preferences" bullet | Deliberate — ADR 0009, ADR 0011 (one long-lived session, so startup-only reads are insufficient); asserted in `managed-instructions.test.ts` and `instructions.test.ts` |
| What to memorize, compaction safety | Parity | — |
| Outputs | Haus-only | Deliberate — ADR 0003, ADR 0004, ADR 0010 |
| Visuals | Haus-only | Deliberate — ADR 0012, ADR 0031 |
| Web access | Haus-only, rendered only when web access is granted | Deliberate — specs/tools.md |
| Initial role | Parity | — |
| Personality | Haus-only closing section, `## Personality` followed by the operator-set text verbatim; rendered only when an Owner or Admin set one. No framing sentence: the heading is the whole scaffold (18 characters) | Deliberate — README ruling W2 (2026-10-03 partial revisit); docs/features/agents.md; `personality-instructions.test.ts`, budget measured with a one-word personality in `managed-instructions.test.ts` |
| Runtime Profile Control | Raft-only (configured variant's daemon release notice) | Deliberate — Computer upgrades are operator-driven, ADR 0020 |
| Workspace seed (`packages/agent-workspace/src/starter-kit.ts`) | Not re-diffed at 1.0.25; last matched 1.0.16's `buildInitialMemoryMd` | Re-check on the next pin |

## Event input

These are not system-prompt text, but they carry guidance Raft keeps in event input.

| Surface | Difference | Status / owner |
| --- | --- | --- |
| Inbox notice (`composeInboxNotice`) | Bracket says `Haus inbox notice` where Raft says `Raft`. Raft closes with one line ("These messages have not been read. Choose when to read them … deferring them does not establish that there is no work."). Haus's closing guidance adds withheld-not-absent, not-a-request, `haus inbox check`, pivot-or-continue, and honest deferral — the guarantees the prompt used to carry | Deliberate — specs/inbox.md §Notices; covered by `inbox-format.test.ts` |
| Envelope work markers | A drained envelope compresses task and mention facts inside its leading bracket (`task=#N:status:assignee`, `mentioned=true`) | Deliberate — specs/haus-cli.md §4; ADR 0026 |
| Envelope attachment suffix | `[N attachments: name (id:…) — use haus attachment view to download]`; Haus's view takes the id positionally, so the hint names only the command | Deliberate — specs/haus-cli.md §4; `inbox-attachment-format.test.ts` |
| Inline reply context | Haus appends an `[Inline reply context]` block | Deliberate — ADR 0029; `inline-reply-format.test.ts` |
| Thread context block | Raft's thread-join block with `Haus` naming, home-timezone `time=`, and Server bounds | Deliberate — specs/inbox.md; `thread-context-format.test.ts` |
| Inbox delivery trailer | Identifies `target` as the requesting conversation; no invitation to choose a new thread | Deliberate — natural conversation evals; `inbox-format.test.ts` |
| Unread-elsewhere digest | Raft's wording, appended to every wake | Deliberate — ADR 0034; `turn-prompt.test.ts` |
| `haus task claim` / `task create` receipts; Cloud Agent receipt | Report ownership and thread addresses as references, without routing advice | Deliberate — conversation placement follows the human request; agent-task-actions and manual/CLI tests |

## Open TODOs

- Re-diff the workspace seed against the pinned source.

## Keeping this current

Re-diff whenever `managed-instructions.ts`, `inbox-format.ts`, or `starter-kit.ts` changes, and
when re-pinning to a newer Raft source commit. Verification for a prompt edit is
`bun run test:prompt-contract`, the Computer package gate, and `bun run eval:prompt`
(docs/operations/testing.md §Prompt Behavior Evals).
