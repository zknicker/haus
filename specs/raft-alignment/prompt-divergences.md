# Agent system prompt — Haus vs Raft divergence register

Field-by-field diff of Haus's composed Agent system prompt
(`apps/computer/src/harness/managed-instructions.ts`) against the prompt builder in
**Raft Computer 1.0.16** (`/Users/zknicker/.local/bin/raft-computer`, Node SEA binary dated
2026-08-10; extracted with `strings -n 6`). Diffed 2026-09-08; parity restore pass 2026-09-09.

Raft's builder is `buildPrompt` with per-section helpers (`buildCommunicationSection`,
`buildTasksSection`, `buildMentionsSection`, `buildConversationEtiquetteSection`, …) plus
`buildInitialMemoryMd` for the workspace seed. `strings` drops blank and short (<6 char) lines,
so section text recovered this way is exact per line but not per paragraph break.

**How to read this.** *Deliberate* means an owning spec or ADR requires the difference.
*TODO* means the difference exists without an owner and should either be justified or removed.
Haus substitutes `haus` for `raft` in every command name and `Haus` for
`Raft (former Slock)` in prose; that substitution is assumed everywhere and not listed per row.

The identity migration uses `HAUSMSG` as the quoted message heredoc delimiter.
This changes only the taught command spelling, not delivery or consent behavior.

## Prompt size budget

`managed-instructions.test.ts` caps the composed prompt at 40,000 characters.
That budget is a reviewed ratchet, not a runtime limit — no adapter enforces a length
(Codex developer instructions, the Claude Code system-prompt append, and Pi all accept more), and
Raft 1.0.16 renders roughly 41,900 characters with no size guard of its own. The budget was
introduced at 32,500 on 2026-08-18, raised seven times to 38,450, then lowered to 37,500 on
2026-09-07. It exists because prompt text changes the behavior of every Agent and the easiest fix
for any behavior is one more sentence. It was raised to 40,000 on 2026-09-09 — the render went
37,406 → 39,971 — because restoring the four Raft clauses in the table below is fixed-part growth
under the rule in the next paragraph, not new Haus-only text.

The budget is split by origin. **Raft-verbatim text is the fixed part**: it is never trimmed,
paraphrased, or reordered to make room, and restoring a Raft clause that Haus had replaced with
an analogue may raise the budget by exactly the restored amount, with the row below and a one-line
commit rationale. **Haus-only text is the variable part**: an addition must fit inside the
current budget by simplifying or relocating other Haus-only text into Manual topics or skills
(ADR 0012), never by cutting Raft text; raising the budget for Haus-only growth needs an
explicit operator decision. Measured against Raft 1.0.16, Haus's Raft-verbatim text is roughly
22,500 characters and its Haus-only product text roughly 5,100.

Every change to the composed prompt adds, changes, or removes a row here and runs the prompt
contract suite. Any `TODO — no owner` row is debt; there are none today.

## Restored to parity on 2026-09-08

These four were unowned drifts, not decisions, and each plausibly contributed to an unaddressed
Agent starting work another Agent had been asked to do:

| Field | Was | Now |
| --- | --- | --- |
| Tasks decision rule | "Most messages are not tasks… just do it and reply — never claim, never promote", plus a two-condition promotion rule | Raft's claim gate verbatim: action beyond replying → claim first; answering or conversing → no claim |
| Startup step 3 | Compressed notice text without the honest-deferral clause | Raft's wording, including "if you choose not to read, that is a deferral to report honestly" and "New messages may be delivered to you automatically while your process stays alive." |
| Startup step 4 | "Reply … only when a visible response is useful" | Raft's coupled "process it and reply with `haus message send`", with the FYI carve-out demoted to one marked exception |
| @Mentions | Display-name bullet dropped | Raft's bullet restored: display name is presentation, identity reasoning uses the stable name |
| Workspace seed (`packages/agent-workspace/src/starter-kit.ts`) | An instruction to the Agent's first turn ("introduce yourself briefly, learn what you own") | Raft's inert `buildInitialMemoryMd` template: `No role defined yet.` / `- No notes yet.` / `- First startup.` |

## Restored to parity on 2026-09-09

Four Raft-verbatim clauses Haus had replaced with shorter analogues. Raft-verbatim text is the
fixed part of the budget, so restoring them raised the cap by exactly the restored amount
(37,406 → 39,971 characters, budget 37,500 → 40,000).

| Field | Was | Now |
| --- | --- | --- |
| Live constraints and pull-request closure | Two compressed paragraphs under `### Live constraints and closure` | Raft's full section: the four declaration/propagation/reception/action seats and the numbered closed-gate-set merge rule, under Raft's heading text at Haus's `###` level |
| Capability and execution-surface selection | Three shortened paragraphs, no inventory bullets, no sub-section | Raft's section body and its `#### Runtime tools and Server-managed MCP` sub-section verbatim, minus the Agent Login inventory bullet, the `#### Raft Agent Login integrations` block, and the Agent Login clause in the surface-selection sentence; Haus's MCP-troubleshooting paragraph stays as a Haus-only addition after them |
| Startup steps 1 and 5 | Shortened wording that preserved the requirement | Raft's wording verbatim |
| Communication style closing paragraph | Contractions expanded, "Self-check:" lead-in dropped | Raft's wording verbatim |

## Per-driver notice variants restored on 2026-09-23

Raft 1.0.16 picks its notice wording per driver from `supportsStdinNotification`: stdin-capable
drivers render `includeStdinNotificationSection: true` with `messageNotificationStyle: "direct"`;
the rest render `includeStdinNotificationSection: false` with `"poll"`, which swaps startup
step 3's closing sentence and omits `## Message Notifications`. (Raft's third style, `notice`,
is also a mid-turn body — "While you are busy … the daemon may write an inbox notice like" — so
it is not the variant for a runtime that cannot be written to mid-turn.) Haus had rendered the
`direct` variant for every runtime, promising mid-turn notices to Codex, whose adapter runs
`codex exec` with stdin closed and cannot steer a live turn, so its busy notices wait for the next
turn.

`supportsMidTurnNotices` in `apps/computer/src/harness/runtime-harness.ts` is the single source
(Claude Code and Pi steer natively; Grok Build steers through Haus's `@ai-sdk/harness-acp` patch,
which sends `_x.ai/interject`; Codex does not), threaded through `composeAgentInstructions` as the
render input's `midTurnNotices`. The first cut on 2026-09-23 grouped Grok Build with Codex; it was
corrected the same day, and Grok Build's prompt is byte-identical to Claude Code's.

| Field | Mid-turn runtimes (Claude Code, Grok Build, Pi) | Next-turn runtime (Codex) |
| --- | --- | --- |
| Startup step 3 closing sentence | Unchanged: Raft's stdin sentence | "Haus will automatically start a new turn when new messages arrive." — Raft's poll sentence, with "restart you" corrected because the Haus session stays alive across turns on every runtime |
| Startup step 3 notice handling | Unchanged | Kept, where Raft's poll variant drops it: every Haus wake can carry a notice (ADR 0033), so the notice contract still applies |
| Post-startup IMPORTANT note | Unchanged | "Your process stays alive across turns. Haus cannot write into a turn while it runs, so messages that arrive while you are working are delivered at the start of your next turn; call `haus message check` at natural breakpoints to read the pending messages." Raft's poll drivers carry a driver-specific per-turn-process note here instead; Haus's process is not per-turn |
| `## Message Notifications` | Unchanged (`direct` variant plus Haus additions) | Omitted, as in Raft's poll variant. The Haus additions it carried ("do not acknowledge", locally cached bodies) remain in step 3 |

The mid-turn render is byte-identical to the previous prompt, so the budget test, which renders
that variant, is unchanged (40,173 of 40,200). The next-turn render is 39,129. Covered by
`managed-instructions.test.ts` (both variants) and `instructions.test.ts` (one case per runtime).

## Section-by-section register

Sections are in Haus's render order. "Parity" means the text matches Raft 1.0.16 apart from the
product-noun substitution.

| Section | Difference | Status / owner |
| --- | --- | --- |
| Product naming | Product prose uses `Haus` and commands use `haus`; capability and authority clauses retain their reviewed wording apart from these names | Deliberate — `specs/haus-rename.md`; operator-requested rename |
| Identity line | `an AI agent in Haus` vs `in Raft (former Slock)` | Deliberate — AGENTS.md coding rule 11 |
| Who you are | Parity | — |
| Current Runtime Context | Haus renders `- Agent: @handle (id)`, Hostname, OS, Runtime, Workspace, Home timezone. Raft renders Agent ID, Server ID, `Computer: name (id)`, Hostname, OS, Daemon, Workspace, and has no timezone line | Deliberate — ADR 0019 (Server owns collaboration, Computer owns execution); the home timezone is load-bearing for the `time=` header (specs/messages.md) |
| How these instructions apply | Parity | — |
| Communication — CLI ONLY | Command families differ: Haus drops Raft's admin channel/server management, Integrations, Wiki bridge, `raft version`, and `task assign/unassign/convert/delete`; Haus adds Inbox, Triggers, Skills, Agents, Asks, Cloud agents, and `channel info` | Deliberate — specs/haus-cli.md is the CLI contract; ADRs 0021/0027/0028, specs/asks.md, specs/cloud-agents.md, specs/skills.md |
| Action cards | Raft prepares typed action cards a human reviews and commits. Haus has no action cards and no `action prepare`: an Agent creates an Agent directly with `haus agent create` when a human in that Chat asked, and the new Agent inherits its creator's execution configuration. The prompt names the `Agents` family and routes creation policy to the `agent` Manual topic | Deliberate — ADR 0028 supersedes the prepared-action clauses of ADR 0024 |
| Communication — error taxonomy | Haus adds `INVALID_*`, `*_NOT_FOUND`, `AMBIGUOUS_ID`; drops Raft's "Command-syntax errors are emitted by the parser" sentence | Deliberate — specs/haus-cli.md error contract |
| Credential handling | Haus keeps both intent paragraphs; drops Raft's "**Profile credential resolution is strict**" paragraph | Deliberate — Raft-only mechanism: `--profile`/`RAFT_PROFILE`/`$RAFT_HOME`/`~/.slock/profiles/` resolution has no Haus equivalent, and the Agent CLI wrapper carries identity instead (specs/haus-cli.md §wrapper injection) |
| CRITICAL RULES | Parity | — |
| Startup step 1 | Parity (restored 2026-09-09) | — |
| Startup step 2 | Parity: "Read MEMORY.md (in your cwd) and then only the additional memory/files you need to handle the current turn well." | — |
| Startup step 3 | Parity **plus** "The notice is not itself a request, so do not acknowledge it." Next-turn runtimes swap the closing sentence per Raft's poll variant and keep the notice clause (see "Per-driver notice variants") Its opening condition ("If there is no concrete incoming message to handle but this turn includes a Haus inbox notice") stays Raft-verbatim even though a turn may now carry both concrete envelopes and a notice: Raft's own wakes are hybrid and carry this exact wording, so a Haus-only clarification here would be the divergence | Deliberate — specs/inbox.md §Golden flow ("a notice is not a request"); ADR 0033 |
| Startup step 4 | Parity **plus** "Haus exception: an explicit FYI / no-response-needed message settles silently, with no send at all." | Deliberate — specs/inbox.md coverage row ("Agent instructions teach notice, pull, silence, and deferral semantics"); gated by `fyi-silence-channel` / `fyi-silence-dm` in `bun run eval:prompt` |
| Startup step 5 | Parity (restored 2026-09-09) | — |
| Post-startup IMPORTANT note | Parity for mid-turn runtimes; a next-turn note for runtimes that cannot steer a live turn | Deliberate — restores Raft's per-driver variants (see "Per-driver notice variants" above) |
| Messaging header spec | Haus adds `type=trigger`, the `@sender — <description>:` suffix, home-timezone `time=` semantics, and the assignee-receipt paragraph. Raft's `time=` is a bare timestamp and its `type=` set is `human`/`agent`/`system` | Deliberate — ADR 0027 (triggers), specs/agent-profile.md (description rides the envelope), specs/messages.md (local wall clock), ADR 0015 + ADR 0026 (assignment receipt) |
| Sending messages | Parity, including the draft-recovery paths | — |
| Sending messages — blind-review seat | Raft-only paragraph dropped: `--reviewer-isolation` on `raft message send` / `task claim` / `task update`, `RAFT_REVIEWER_ISOLATION=1`, and the content-free held-state disclosure it implies | Deliberate — Raft-only mechanism: Haus's CLI has no such flag or env var and no blind-review seat to assign, so the paragraph would name an unreachable surface. `managed-instructions.test.ts` asserts the string never appears in the render |
| Reminders | Haus drops Raft's "the receipt/fire system message is visible in that surface"; adds `--cause`, script reminders, and the `recipes/technique/reminder-cron` Manual pointer | Deliberate — ADR 0026 (a fire writes nothing to chat), ADR 0016, specs/automation-provenance.md |
| Triggers | Haus-only section | Deliberate — ADR 0027, specs/triggers.md |
| Cloud agents | Haus-only section: automatic completion delivery, work-thread implementation and revisions, and coordinating Agent acknowledgment and concise outcome in the requester conversation, following the human into the work thread | Deliberate — specs/cloud-agents.md; cloud-agent instruction tests |
| Threads | Haus keeps a request and its full answer in the requesting conversation, following the human into threads. Replaces the generic incoming-header-to-new-thread example with factual channel/DM target construction; retains read-before-reply, own-message threads, unfollow, and no nesting | Deliberate — operator-approved conversation policy and Fable review. Fixes conflicting guidance, not prompt-budget pressure. Natural tests motivate the change without proving the example caused each failure; rendered-prompt and repeated routing tests cover it |
| Discovering people and channels | Parity | — |
| Channel awareness | Parity | — |
| Third-party app message safety | Raft-only section — Haus has no `type=third_party_app` sender kind | Deliberate — specs/messages.md sender kinds; revisit if Haus ever admits external app senders |
| Capability and execution-surface selection | Parity for the section body and `#### Runtime tools and Server-managed MCP` (restored 2026-09-09), with three documented subtractions and one addition: the Agent Login inventory bullet and the `#### Raft Agent Login integrations` block are omitted, the surface-selection sentence drops ", an Agent Login integration" from its list of mechanisms a provider may be reachable through, the runtime-inventory bullet reads "It is not populated by the `haus` CLI" in place of Raft's "`raft integration list`", and Haus's MCP paragraph teaches discovery and invocation through the fixed `execute` tool, preserving the local-configuration troubleshooting boundary |  Deliberate — Raft-only mechanism: Haus has no Integrations or Agent Login surface, so naming one would teach a surface an Agent cannot reach; specs/mcp.md, ADR 0017; gated by `mcp-granted-lookup` / `mcp-revoked-honest-failure` |
| Reading history | Parity | — |
| Historical references | Parity | — |
| Tasks — decision rule, status flow, workflow steps 1–2, `task create`, creating new tasks | Parity | — |
| Tasks — "A system notification about task changes" bullet | Dropped | Deliberate — ADR 0015: "Task state changes do not create receipt messages" |
| Tasks — `closed` status | Additive sentence after Raft's status flow | Deliberate — ADR 0015 (reversible `closed`), specs/tasks.md |
| Tasks — conversation routing and same-turn completion | Haus's local conversation guidance continues each request where it was asked, following the human's lead, from acknowledgment to result. A separate sentence retains `done` for a claimed message fully finished in the same turn | Deliberate — operator-approved conversation policy. Workflow step 3 is intentionally replaced with the operator-approved positive conversation rule after live tests showed an additive exception still sent ordinary replies into threads. This is a behavior change, not a budget reduction. Claim authority, formal Asks, automation placement, and approval requirements retain their own contracts. Covered by `task-thread-routing`, `task-conversation-routing`, and harness instruction tests |
| Tasks — stale close | Additive sentence: an `in_review` task silent for `TASK_IN_REVIEW_STALE_DAYS` is closed as stale by the Server | Deliberate — `apps/server/src/tasks/close-stale-tasks.ts` |
| Tasks — `--assignee @peer`, receipts, Owners/Admins | Haus replaces Raft's "A server owner/admin may use `--assignee @someone-else`" with peer assignment plus receipt semantics | Deliberate — ADR 0015 amended by ADR 0026 |
| Splitting tasks | Parity | — |
| @Mentions | Parity. Haus renders one name, so the display-name bullet interpolates the same value twice | Deliberate — specs/identity.md has no separate Agent display name in the prompt render input |
| Communication style | Parity (closing paragraph restored 2026-09-09) | — |
| Conversation etiquette | Parity **plus** two Haus bullets: "**Silence is deliberate.**" and "**DM knowledge is not room knowledge.**" | Deliberate — specs/inbox.md coverage row (silence) and specs/sessions.md §"Knowledge and discretion" ("the prompt teaches discretion") |
| Live constraints and pull-request closure | Parity (restored 2026-09-09), rendered at `###` because Haus nests it under Communication style; Raft renders it as `##` | Deliberate heading level only — ADR 0021 section ordering; the four seats and the closed gate set are asserted in `instructions.test.ts` and `managed-instructions.test.ts` |
| Formatting — Mentions & Channel Refs | Haus drops Raft's `#1` numeric channel form | Deliberate — Raft-only mechanism: Haus has no numeric channel refs to link (specs/mentions.md) |
| Formatting — URLs | Parity | — |
| Workspace & Memory | Parity **plus** "Re-read MEMORY.md and update your notes at natural boundaries" and the "**Apply remembered preferences**" bullet. The "session resets rarely" rationale stays; `managed-instructions.test.ts` asserts it. | Deliberate — ADR 0009; sessions rotate rarely in Haus, so startup-only reads are insufficient (specs/sessions.md) |
| What to memorize / How to organize | Parity | — |
| Compaction safety | Parity | — |
| Capabilities | Parity | — |
| Outputs | Haus-only section (fences, artifact cards, `haus://workspace/` links) | Deliberate — ADR 0003, ADR 0004, ADR 0010 |
| Visuals | Haus-only section | Deliberate — ADR 0012 (design guidance is skill-carried) |
| Web access | Haus-only section, rendered only when web access is granted | Deliberate — specs/tools.md |
| Message Notifications | Haus adds "It is not itself a request, so do not acknowledge the notice" and describes `haus message check` as reading locally cached bodies. Rendered only for runtimes that can steer a live turn, as Raft's `direct` variant; next-turn runtimes get no section, as in Raft's `poll` variant. Raft's `notice` variant (a mid-turn body with an example notice) is not ported | Deliberate — specs/inbox.md (notice is not a request; Computer-local pull cache); per-driver variants restored 2026-09-23 |
| Initial role | Parity | — |
| Runtime Profile Control | Raft-only section (daemon release notice injected as startup step 0) | Deliberate — Computer upgrades are operator-driven, ADR 0020 |
| Workspace seed (`starter-kit.ts`) | Parity with `buildInitialMemoryMd`'s non-Cindy branch | — |
| Cove seed (`cove-starter-kit.ts`) | Haus-only four-file onboarding seed; Raft's Cindy branch is a different document set | Deliberate — ADR 0021 |

## CLI output surfaces

Inline-reply amendment (ADR 0029): Haus guidance under Sending messages teaches `--reply-to`
for acknowledgments, progress, and answers before the preserved Raft examples. The Threads
section distinguishes sending to a child-thread target. Attention mechanics
live in the `replies` Manual topic. Task guidance names explicit status updates as completion
and refers to review conversation activity rather than only thread activity. Fable reviewed
the wording; existing Raft-verbatim guidance stays intact and the prompt budget is unchanged.
Coverage: thread-instructions, CLI inline sends, and inline-reply-followups live scenario.
The placement refinement followed a live trial where plain channel acknowledgments lost their
reply ancestry. Natural conversation trials now assert root ancestry, not just channel placement.
The final wording ties placement to where the incoming message arrived, after a fresh worker
still chose a task thread for a channel calculation. Passing reruns do not erase that observed drift.

The Agent CLI's own printed guidance is not part of Raft's prompt, but it teaches the same
behaviours and is diffed here when it mirrors a Raft helper.

| Surface | Difference | Status / owner |
| --- | --- | --- |
| `haus task claim` success receipt | Reports claim count, task numbers, and message IDs; omits follow-up routing advice | Deliberate — claiming establishes ownership. Canonical task location does not select the current conversation. Covered by agent-task-actions tests and natural routing evals |
| `haus task create` success hint | Prints the task thread address as a reference | Deliberate — conversation placement follows the human request rather than a generic thread instruction |
| Envelope work markers | A drained envelope compresses task, Ask, and mention facts inside its leading bracket (`task=#N:status:assignee`, `ask=<status>[:@handle]`, `mentioned=true`) where Raft appends `[task #N status=… assignee=…]`; Raft's envelope has no Ask or mention marker at all. Pulled and read envelopes keep Raft's trailing task suffix | Deliberate — specs/haus-cli.md §4 (one formatting owner, compressed drain grammar); ADR 0026 (task assignment is a `mentioned=true` item); specs/asks.md |
| Envelope attachment suffix | Parity: `[N attachments: name (id:…), … — use haus attachment view to download]` on drained, pulled, and read envelopes. Raft's hint spells out `--id <attachmentId> --output <path>`; Haus's `haus attachment view <id> [--output <path>]` takes the id positionally, so the hint names only the command. The drain envelope gained the suffix on 2026-09-23; before that only pulls printed it | Deliberate hint wording — specs/haus-cli.md §4; covered by `apps/computer/src/inbox-attachment-format.test.ts` |
| Inline reply context | Haus appends an `[Inline reply context]` block (`reply-to=` and, for a deeper chain, `root=` with author and quoted content) to drained, pulled, and read envelopes. Raft appends its reply-affordance guidance instead | Deliberate — ADR 0029 (inline replies preserve conversation); covered by `apps/computer/src/inline-reply-format.test.ts` |
| Thread context block | Parity with Raft's `thread_join_context` rendering: `[Haus thread context: you were mentioned in a thread without model-visible context.]`, `parent:`, `thread:`, `suggested next step: haus message read --target "<thread>"`, `Parent message:`, and `Recent thread context[ (truncated)]:` with `- [msg=… seq=… time=… type=…] @sender: …` lines or `- (no earlier thread replies)`. Differences: the bracket says `Haus` where Raft still says `Slock`; `time=` is the home-timezone wall clock, as on every Haus envelope; the block precedes the first mention of its Thread in the drain where Raft picks the last; the Server bounds it to ten replies and 4,000 quoted characters and budgets it inside the drain | Deliberate — product naming (specs/haus-rename.md), specs/messages.md (`time=`), specs/inbox.md §Delivery planning; covered by `apps/computer/src/thread-context-format.test.ts` and `apps/server/test/agent-thread-context.test.ts` |
| Inbox delivery trailer | Identifies `target` as the requesting conversation; removes the independent invitation to choose a new thread | Deliberate — natural conversation evals exposed conflicting routing advice after the system-prompt policy changed; covered by inbox-format tests and `conversation-natural-followups` |
| Unread-elsewhere digest | Raft-verbatim text restored as turn input: "You also have unread messages in other channels:", one `- <target>: N unread` line per chat, then "Use the inbox/read commands at a natural breakpoint if you choose to inspect those targets." Haus appends it to every wake — cold, warm, concrete and busy | Deliberate — ADR 0033, specs/inbox.md §Delivery planning. It is turn input, not composed prompt text, so the 40,200-character prompt budget is untouched; covered by `apps/computer/src/harness/turn-prompt.test.ts` |
| Cloud Agent manual and start receipt | Manual distinguishes implementation details from requester outcomes; receipt supplies the work-thread address as a reference | Deliberate — aligns required secondary guidance with the coordinating Agent policy; covered by manual/CLI tests and opt-in `cloud-conversation-handoff` |

## Open TODOs

None. The last three unowned rewrites — startup steps 1 and 5 and the closing paragraph of
Communication style — were restored to Raft's wording on 2026-09-09. Every remaining divergence is
*Deliberate* with a named owner: a Haus product decision, or a Raft-only mechanism that has no
Haus surface to point at.

## Turn input, not prompt text

The composed system prompt is unchanged by ADR 0033. These facts about what the model now
receives are recorded here because they change what the Agent reads during a turn:

- A wake may carry concrete envelopes **and** a content-free notice in the same prompt, and the
  drain always precedes the notice. Raft delivers the same hybrid, so startup step 3 keeps Raft's
  wording without a Haus carve-out.
- Busy notices flush at a tool boundary only once no tool call is in flight. Raft also holds them
  while compacting or reviewing; the harness exposes no in-progress compaction signal, so Haus
  cannot, and a notice may land in the turn just before an automatic compaction.
- A drained Thread mention may be preceded by the thread context block. Its text is Raft's
  thread-join block with `Haus` for `Slock` and `haus message read` for `raft message read`; see
  the row below.
- The unread-elsewhere digest closes every wake. It is the last block of the turn input, never part
  of the system prompt, so it neither consumes nor raises the prompt budget.

## Keeping this current

Re-diff whenever `managed-instructions.ts` or `starter-kit.ts` changes, and whenever a newer
`raft-computer` is installed. Regenerate the reference dump with:

```sh
strings -n 6 /Users/zknicker/.local/bin/raft-computer > raft-strings.txt
grep -n 'function build.*Section\|function buildPrompt\|function buildInitialMemoryMd' raft-strings.txt
```

Verification for a prompt edit is `bun run test:prompt-contract`, the Computer package gate, and
`bun run eval:prompt` (docs/operations/testing.md §Prompt Behavior Evals).
