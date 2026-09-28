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
row below or be cut. Haus-only text is the variable part: an addition fits by simplifying or
relocating other Haus-only text into Manual topics, skills, or event input (ADR 0012); raising
the budget for it needs an explicit operator decision. Re-pin by updating the commit above and
re-diffing every row.

Raft's own writing rule (`systemPrompt.ts` header) governs placement: durable collaboration
principles live in the standing prompt; event formats, delivery mechanics, and event-specific
actions live in the event input.

`managed-instructions.test.ts` caps the composed prompt at **32,359** characters — a reviewed
ratchet, not a runtime limit. History: introduced at 32,500 (2026-08-18), raised to 40,270 by
2026-09-23, lowered to 32,359 by the 1.0.25 re-baseline. Measured line-by-line against the pinned
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
| Communication — CLI ONLY, command families | Haus drops Raft's admin channel/server management, Integrations, Action cards, Wiki bridge, `raft version`, sender-side mention actions, `user info`, built-in apps, `auth whoami`, and task `assign/unassign/amend/history/convert/delete`. Haus adds Triggers, Skills, Agents, Asks, Cloud agents, `channel info`, and `message follow/unfollow`. Inbox has no Raft trailing description | Deliberate — specs/haus-cli.md is the CLI contract; ADRs 0017/0021/0027/0028, specs/asks.md, specs/cloud-agents.md, specs/skills.md |
| Credential handling, CRITICAL RULES | Parity | — |
| Startup steps 1, 2, 3, 5 | Parity | — |
| Startup step 4 | Parity **plus** "Haus exception: an explicit FYI / no-response-needed message settles silently, with no send at all." | Deliberate — specs/inbox.md silence semantics; gated by `fyi-silence-channel` / `fyi-silence-dm` in `bun run eval:prompt` |
| Messaging — async paragraph | Parity | — |
| Messaging — header spec and examples | Haus adds `type=trigger` (Raft has `third_party_app`), the `@sender — <description>:` suffix, home-timezone wall-clock `time=` with a staleness sentence, and `msg=` "(first 8 chars)" without "of UUID". Haus's `type=system` paragraph drops Raft's task-event examples and adds the assignee-receipt sentences | Deliberate — ADR 0027 (triggers), specs/agent-profile.md (description rides the envelope), specs/messages.md (local wall clock), ADR 0015 + ADR 0026 (no task-event receipts; assignment receipt) |
| Sending messages | Parity, including the draft paths and no-op bullet, **plus** the Haus placement paragraph (`--reply-to`, thread targets, `--done`, `replies` Manual pointer) | Deliberate — ADR 0029 (inline replies), ADR 0035 (`--done`); covered by `managed-instructions.test.ts` |
| Reminders | Haus replaces Raft's "the receipt/fire system message is visible in that surface" with "Anchoring … does not transfer wake ownership"; adds script reminders, the `recipes/technique/reminder-cron` pointer, and fire placement with `--cause` | Deliberate — ADR 0026 (a fire writes nothing to chat), ADR 0016, specs/automation-provenance.md |
| Triggers | Haus-only section | Deliberate — ADR 0027, specs/triggers.md |
| Cloud agents | Haus-only section | Deliberate — specs/cloud-agents.md; cloud-agent instruction tests |
| Threads | Haus intro keeps a request and its answer where it arrived and follows the human into threads; target construction replaces Raft's "Start a new thread" example and its "Reply where the conversation is" preference bullet. Read-before-reply, own-message threads, history, unfollow, and no-nesting are parity | Deliberate — operator-approved conversation policy (ADR 0029); covered by routing evals |
| Discovering people and channels | Parity | — |
| Channel awareness | Parity, including Visibility | — |
| Capability and execution-surface selection | Haus-only. Raft 1.0.25 has no such section; its Integrations family bullet carries a short surface-choice rule tied to Agent Login, which Haus lacks. Haus keeps a trimmed section: surfaces, inventory scope, and the MCP `execute` discovery path | Deliberate — ADR 0017, specs/mcp.md; gated by `mcp-granted-lookup` / `mcp-revoked-honest-failure` and `managed-instructions.test.ts` |
| Reading history & references | Parity | — |
| Tasks | Parity for the claim rule, top-level-only, failed-claim routing, and review-then-done sentence. Haus adds **Keep the conversation together**, same-turn `done`, reversible `closed`, the `TASK_IN_REVIEW_STALE_DAYS` stale close, and points to the `tasks` Manual topic where Raft points to "the Raft Manual" | Deliberate — operator-approved conversation policy; ADR 0015 (`closed`), `apps/server/src/tasks/close-stale-tasks.ts`; covered by `instructions.test.ts` and `product-topics.test.ts` |
| Splitting tasks | Parity | — |
| @Mentions | Parity. Haus renders one name, so the display-name bullet interpolates the same value twice | Deliberate — specs/identity.md |
| Communication style | Parity | — |
| Conversation etiquette | Parity **plus** "Silence is deliberate", "DM knowledge is not room knowledge", and "Welcome new teammates" | Deliberate — specs/inbox.md (silence), specs/sessions.md §"Knowledge and discretion", ADR 0028 (welcome fires on a message, so it cannot live in a Manual topic) |
| Live constraints | Parity | — |
| Formatting — Mentions & Channel Refs | Haus drops Raft's `#1` numeric channel form and adds "Haus renders your message as Markdown, GFM tables included." | Deliberate — specs/mentions.md (no numeric refs); Haus App renders GFM (docs/internals/widgets.md) |
| Workspace & Memory | Parity **plus** the MEMORY.md re-read sentence ("at natural boundaries … including after context compression"; "Your session resets rarely…") and the "Apply remembered preferences" bullet | Deliberate — ADR 0009, ADR 0011 (one long-lived session, so startup-only reads are insufficient); asserted in `managed-instructions.test.ts` and `instructions.test.ts` |
| What to memorize, compaction safety | Parity | — |
| Outputs | Haus-only | Deliberate — ADR 0003, ADR 0004, ADR 0010 |
| Visuals | Haus-only | Deliberate — ADR 0012, ADR 0031 |
| Web access | Haus-only, rendered only when web access is granted | Deliberate — specs/tools.md |
| Initial role | Parity | — |
| Runtime Profile Control | Raft-only (configured variant's daemon release notice) | Deliberate — Computer upgrades are operator-driven, ADR 0020 |
| Workspace seed (`packages/agent-workspace/src/starter-kit.ts`) | Not re-diffed at 1.0.25; last matched 1.0.16's `buildInitialMemoryMd` | Re-check on the next pin |

## Event input

These are not system-prompt text, but they carry guidance Raft keeps in event input.

| Surface | Difference | Status / owner |
| --- | --- | --- |
| Inbox notice (`composeInboxNotice`) | Bracket says `Haus inbox notice` where Raft says `Raft`. Raft closes with one line ("These messages have not been read. Choose when to read them … deferring them does not establish that there is no work."). Haus's closing guidance adds withheld-not-absent, not-a-request, `haus inbox check`, pivot-or-continue, and honest deferral — the guarantees the prompt used to carry | Deliberate — specs/inbox.md §Notices; covered by `inbox-format.test.ts` |
| Envelope work markers | A drained envelope compresses task, Ask, and mention facts inside its leading bracket (`task=#N:status:assignee`, `ask=<status>[:@handle]`, `mentioned=true`) | Deliberate — specs/haus-cli.md §4; ADR 0026; specs/asks.md |
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
