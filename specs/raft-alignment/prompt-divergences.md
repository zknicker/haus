# Agent system prompt — Haus vs Raft divergence register

Field-by-field diff of Haus's composed Agent system prompt
(`apps/computer/src/harness/managed-instructions.ts`) against the current Raft prompt, read from
source.

**Pinned Raft source:** <https://github.com/botiverse/raft-source> at commit
`26f77ef97c40d3d91aa2c5e42b0fd66b8bf39fe6` (release `v1.21.2-source.1`, daemon 1.0.43).
The reference render is `packages/daemon/src/drivers/__snapshots__/systemPrompt/common.md`
(28,599 characters); the builder is `packages/daemon/src/drivers/systemPrompt.ts`, its CLI guide
sections are `packages/shared/src/raftCliGuide.ts`, and event input is
`packages/daemon/src/agentRuntimeInput.ts`. See [raft-system-prompt.md](raft-system-prompt.md)
and the re-pin record [repin-v1.21.2.md](repin-v1.21.2.md). Diffed 2026-10-06.

**How to read this.** *Parity* means the text matches the pinned Raft render apart from the
product-noun substitution. *Deliberate* means an owning spec, ADR, or test requires the
difference. *TODO* means the difference exists without an owner and should either be justified
or removed. Haus substitutes `haus` for `raft`, `Haus` for `Raft (former Slock)` in prose, and
`HAUSMSG` for the `RAFTMSG` heredoc delimiter; that substitution is assumed everywhere. Haus also
writes Raft's prose em dashes as commas, colons, semicolons, periods, or parentheses (see
[Writing style](#writing-style-em-dash-scrub-2026-10-06)); that punctuation substitution is
assumed everywhere too, so a *Parity* row means parity modulo punctuation.

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

`managed-instructions.test.ts` caps the composed prompt at **37,035** characters, measured with
every conditional section rendered. The cap is a
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
`--description` sentence (2026-10-05), then lowered to 32,496 when Workspace & Memory gained the
hot-memory-plus-index rules (operator decision, 2026-10-05), then raised to 32,579 when Agents came
to set their own finished tasks `done` (operator decision, 2026-10-05), then raised by 934 to 33,513
on the v1.21.2 re-pin: 631 for Raft's suspect-the-CLI-first paragraph (verbatim) and 303 for
Discovering's paged-listing sentences (2026-10-06), then lowered by exactly 457 to 33,056 when
Raft's three private-channel clauses were omitted because Haus has no private channels
(2026-10-06), then raised by exactly 332 to 33,388 when the Inbox family entry adopted Raft's
`inbox check` description verbatim at the pinned commit (2026-10-06), then raised by 522 to 33,910
for quiet agreements, one confirmation, and reaction-only acknowledgments (2026-10-06), then
raised by 1,201 to 35,111 for the personality eval series' changes (operator decision,
2026-10-06), measured on the 32,579 base before landing on 33,910 as these steps: the house
`## Personality` (+566), the layered `## Conversation style` framing (+176, measured with a
one-word style), the pickup bullet replacing Raft's acknowledge/progress bullets (+254), and the
Profiles family clause (+63), net of the em-dash scrub (−58), then +60 when the
`## Conversation style` framing became voice-only (never rules, permissions, or how the work is
done) (+43) and the Profiles clause limited self-edits to an Owner or Admin's ask (+17), so
another Agent or a member cannot steer an Agent into writing policy into its own style
(review finding), then +120 after eval round 9 and the live gate (operator decision): the pickup
bullet gained a quick-answer versus real-work threshold and a no-plan note (+24), the progress
bullet came to thread progress on that note as steps land (+33), and the house humor sentence
ruled out a message where a reaction would do (+63), then +32 when the pickup bullet was scoped
to requests addressed to the Agent after the live gate saw unaddressed thread anchors answered
with "Acknowledged.", then −45 when a baseline-versus-change live gate showed the bullets pulling
task-Thread progress into a thread on the note and an ack into a text reply: the pickup bullet now
applies when someone asks the Agent to do something, and progress placement is left to the
existing Sending rule, then +33 when the same gate showed quick explicit tasks answered without
the claim, so the quick-answer clause keeps the claim first. Landing on 33,910 also wrote the
Inbox family entry's separator em dash as a colon, like every other family entry. Then raised
by 2,198 to 37,309 when Claude Code Agents gained the adapted `## Working through sub-agents`
section (operator decision, 2026-10-06; the cap test renders it on), then raised by exactly 29 to
37,338 when the Standing Preferences placeholder asked for terse merged rules (2026-10-08), then
lowered by 303 to 37,035 when the Haus-only `## Web access` section was deleted (2026-10-08): the
Server never granted web access, so the section never rendered, and Agents now get their runtime's
native web tools with no gate and no prompt text, as in Raft. Measured line-by-line
against the pinned render, about 19,500 characters of the Haus prompt are Raft-verbatim.

## Re-baseline on Raft 1.0.25, 2026-09-28

Operator-approved. Render 40,270 → 32,359 characters.

| Change | Where it went |
| --- | --- |
| Startup step 3 notice essay, the post-startup "process stays alive" note, and `## Message Notifications` | Into the inbox notice itself: `composeInboxNotice` (`apps/computer/src/inbox-format.ts`) closes every notice with withheld-not-absent, not-a-request, pull commands, and honest-deferral guidance, modelled on Raft's `formatInboxUpdateRuntimeInput`. The prompt adopts Raft's step 3 ("Handle the input supplied for this turn. If there is no pending work, stop."), step 5, and its "collaborate asynchronously" Messaging paragraph |
| Task mechanics (message task suffix, status flow, assignee independence, claim flags, `task create` semantics, `--assignee`, receipts, duplicate avoidance) | The `tasks` Manual topic (`packages/agent-manual/src/product-topics.ts`). The prompt keeps Raft's current `### Tasks` plus Haus's conversation rule, done-by-default finishing, `closed`, the stale window, and a pointer |
| Cut — Raft deleted them | "put to sleep when idle"; the stderr `Error:`/`Code:`/`Next action:` block and error-prefix taxonomy; the second credential paragraph; the third copy of the claim rule in CRITICAL RULES (now Raft's "Prefer running one … per tool call"); the etiquette claim bullet; the pull-request closed-gate-set paragraph (replaced by Raft's "Do not infer approval…" paragraph); `Formatting — URLs in non-English text`; the workspace "code checkouts" and "first choose the project directory" tail; the "Keep MEMORY.md current" bullet; `## Capabilities`; "coding conventions" in What to memorize |
| Cut — Haus-only, no owner | The heredoc delimiter rationale sentence |
| Trimmed | Capability and execution-surface selection, by about 500 characters, keeping every tested sentence |
| Adopted from Raft | The `**Visibility**` block in Channel awareness; the draft no-op bullet; `### Reading history & references` as one section; Raft's current wording for the credential paragraph, Runtime Context preamble, thread unfollow, etiquette "report on it", Live constraints reception ("a task description"), Formatting refs, the MEMORY.md paragraph, and compaction safety ("recovery point"); `## Live constraints` and `## Formatting — Mentions & Channel Refs` at Raft's heading level |

## Writing style: em-dash scrub, 2026-10-06

Operator-approved. Principle: **the system prompt's own writing style directly shapes how Agents
write.** Models mirror the prompt's punctuation and register, so the prompt is written the way
Agents should write. In the personality eval series (rounds 4 to 8, 2026-10-05/06, Claude Opus
and Codex at medium effort, blind-judged), scrubbing the prompt's em dashes cut Codex's em dashes
in sent chat from about 1.0 per 100 words to 0 to 0.2, and Claude's from about 1.7 to 1.9 down
to about 0.4 to 0.5. An arm that dropped the house personality's "no em dashes" clause roughly
doubled them again.

The scrub rewrote 64 rendered em dashes across Raft-verbatim and Haus-only text with commas,
colons, semicolons, periods, or parentheses, keeping each sentence's meaning. It kept 6: the five
`[target=…]` header examples and the `@sender — <description>:` format in the header spec,
because they reproduce the real envelope an Agent receives. Raft-verbatim clauses keep their
words and order; only punctuation changed. `managed-instructions.test.ts` asserts no other em
dash renders.

Event input follows the same rule for prose. `turn-prompt.ts` writes its fresh-session notice with
a semicolon. The em dashes left in `inbox-format.ts` are formats, not prose: the
`@sender — <description>:` envelope sender, the cloud agent attention title line
(`title — repository (provider)`), and the envelope attachment suffix row below, which the CLI
history shares.

## Section-by-section register

Sections are in Haus's render order.

| Section | Difference | Status / owner |
| --- | --- | --- |
| Identity line | `an AI agent in Haus` vs `in Raft (former Slock)` | Deliberate — AGENTS.md coding rule 11; `specs/haus-rename.md` |
| Who you are | Parity | — |
| Personality | Haus-only house personality, rendered for every Agent directly after Who you are: senior teammate not a service, short casual plain sentences, bullets or short lines for options, steps, or data, a committed take with fact-checked one-line pushback, dry humor at the situation never the person and never a reason to send a message when a reaction would do, stop with no closing offers unless a decision is needed, and no em dashes. Raft has no voice section; its generic harness voice read as a service answering customers | Deliberate — operator decision 2026-10-06 from the personality eval series (rounds 1 to 8): blind-judged first on both runtimes against the unchanged prompt, with pushback, structure, and fact citation held or improved; `personality-instructions.test.ts` |
| Conversation style | Haus-only, rendered only when set, directly after Personality: `## Conversation style`, a framing line (set by the owner or the Agent; shapes only voice and banter on top of the personality above, wins on tone, and never changes rules, permissions, or how the work is done), then the text verbatim. Renamed from the former closing `## Personality` section, now layered rather than standalone so the house rules (pushback, structure, no em dashes) survive a custom voice. The Agent can tune it and its signature emoji with `haus profile update` only when an Owner or Admin asks (Server cannot know who asked, so the prompt and the `profile` Manual topic carry the rule); voice-only framing and the Owner/Admin-only self-edit keep a member or another Agent from planting policy-like text in a section that wins on tone | Deliberate — operator decision 2026-10-06; eval round 8 ranked layering above replacement (replacement doubled em dashes and softened pushback) and placement after Personality best on Claude; README ruling W2 (revisited 2026-10-06); `personality-instructions.test.ts`, budget measured with a one-word style in `managed-instructions.test.ts` |
| Current Runtime Context | Parity for the preamble. Rows differ: Haus renders `- Agent: @handle (id)`, Hostname, OS, Runtime, Workspace, Home timezone; Raft renders Role, Agent ID, Server ID, `Computer: name (id)`, Hostname, OS, Daemon, Workspace. Raft renders the section only in its configured variant; Haus always does | Deliberate — ADR 0019; the home timezone is load-bearing for the `time=` header (specs/messages.md); the role renders as `## Initial role` |
| How these instructions apply | Parity | — |
| Communication — CLI ONLY, command families | Haus drops Raft's admin channel/server management, Integrations (including v1.21's official-apps hint and installed-apps directory), Action cards, `raft version`, sender-side mention actions, `user info`, built-in apps, `auth whoami` (whose v1.21 server-confirmed-identity wording Haus therefore does not carry), and task `amend/history/convert/delete` (task `assign/unassign` restored verbatim when Haus gained the verbs). Raft deleted its Wiki bridge entry at v1.21, so it is no longer a difference. Haus adds Triggers, Skills, Agents, Cloud agents, `channel info`, and `message follow/unfollow`. The Profiles entry adds "(also your conversation style and signature emoji, when an Owner or Admin asks)". Haus keeps its own family numbering (Inbox is 4; Raft's is 13) | Deliberate — specs/haus-cli.md is the CLI contract; ADRs 0017/0021/0027/0028, specs/cloud-agents.md, specs/skills.md |
| Communication — Inbox family entry | Parity with the pinned commit: Raft's `inbox check` family entry (`raftCliGuide.ts`), with `haus` for `raft`, a colon for the family separator em dash (see Writing style), and "your Inbox" for "your Activity panel": the human surface Raft calls the Activity panel is the Haus App's Inbox, so the agent command is named for the surface it mirrors. Replaces the bare `` `haus inbox check`. `` entry (+332 characters) | Parity — operator decision 2026-10-06 (match Raft); specs/inbox.md §Unread conversations and read position; `managed-instructions.test.ts`, `managed-instructions-inbox.test.ts` |
| Communication — suspect the CLI first | Parity with Raft v1.21's paragraph after `--help`, with "the Manual" for "this Manual" (the Haus prompt is not itself the Manual) and "a Computer does not upgrade itself" for "a daemon" | Deliberate — ADR 0020 and specs/raft-alignment/computer-release-and-update.md (no automatic Computer updates; the Server serves the Manual); `discovery-instructions.test.ts` |
| Agent creation guidance in Manual and Cove factory notes | Haus creates directly on the human's request, then hints an ordinary introduction using the confirmed handle. Raft retains human-committed action cards; its agentic greeting is a private instruction to the new Agent. Haus creation posts no Message and has no `--say` | Deliberate — ADR 0028; agent creation, CLI, Manual, and Cove factory tests |
| Credential handling, CRITICAL RULES | Parity | — |
| Startup steps 1, 2, 3, 5 | Parity. Step 1 ("send it early with `haus message send`") stays verbatim beside the pickup bullet: step 1 governs timing (signal before deep context gathering), the pickup bullet narrows the form (a reaction, plus a one-line note for multi-step work). Eval runs with both texts signalled pickup 22 to 24 of 24 times | — |
| Startup step 4 | Parity **plus** "Haus exception: react to a human's thanks, ack, or sign-off to you with one emoji fitting its tone, no send (`haus message react --message-id <id> --emoji <emoji>`); an explicit FYI gets nothing." No literal emoji, which would become every Agent's default | Deliberate — specs/inbox.md silence semantics; emoji choice per the `replies` Manual topic; the Agent API accepts exactly one emoji; gated by `fyi-silence-channel` / `fyi-silence-dm` / `ack-reaction-thanks` / `ack-reaction-with-request` / `ack-reaction-variety` in `bun run eval:prompt` |
| Messaging — async paragraph | Parity | — |
| Messaging — header spec and examples | Haus adds `type=trigger` (Raft has `third_party_app`), the `@sender — <description>:` suffix, home-timezone wall-clock `time=` with a staleness sentence, and `msg=` "(first 8 chars)" without "of UUID". Haus's `type=system` paragraph drops Raft's task-event examples and adds the assignee-receipt sentences | Deliberate — ADR 0027 (triggers), specs/agent-profile.md (description rides the envelope), specs/messages.md (local wall clock), ADR 0015 + ADR 0026 (no task-event receipts; assignment receipt) |
| Sending messages | Parity, including the draft paths and no-op bullet, **plus** the Haus placement paragraph: acknowledgment, questions for the human, and the final answer go as inline replies where the request arrived; step-by-step progress of solo work goes in a thread on the acknowledgment (its send receipt names the target), never in a thread on the request; `--reply-to`, thread targets, `--done`, `replies` Manual pointer | Deliberate — ADR 0029 and its 2026-10-02 amendment (inline replies, progress threads), ADR 0035 (`--done`); covered by `thread-instructions.test.ts`, `managed-instructions.test.ts`, and `test:agents solo-progress-threads-on-ack` |
| Sending messages — `~agent` / `~human` DM suffix | Raft-only. Raft v1.21 adds a paragraph for a human and an agent sharing a name (`dm:@name~agent` / `dm:@name~human`). Not adopted | Deliberate — human and Agent handles share one case-insensitive namespace (specs/identity.md), and a DM is human ↔ Agent, so `dm:@<agent-handle>` never resolves (specs/haus-cli.md) |
| Reminders | Haus replaces Raft's "the receipt/fire system message is visible in that surface" with "Anchoring … does not transfer wake ownership"; adds the `--title` short-label / `--description` sentence after the Raft lines, script reminders, the `recipes/technique/reminder-cron` pointer, and fire placement with `--cause`; preserves the full placement/provenance sentence and adds an explicit quiet-agreement exception | Deliberate — ADR 0026 (a fire writes nothing to chat), ADR 0016, specs/automation-provenance.md; the Server's reminder title limit (`instructions.test.ts`) |
| Triggers | Haus-only section, including its own fire-arrival and `--cause` placement sentences (the same original placement text as Reminders; trigger answers remain required) | Deliberate — ADR 0027, specs/triggers.md |
| Cloud agents | Haus-only section, ending at bringing back a concise outcome with a link. Revision mechanics (`cloud-agent send --work`), the work thread's role (review rounds and progress there; one requester line per real state change), and following the requester into the work thread live in the `cloud-agents` Manual topic the family entry requires reading first | Deliberate — specs/cloud-agents.md; cloud-agent instruction tests, `product-topics.test.ts` |
| Threads | Haus intro keeps a request and its answer where it arrived and follows the human into threads; target construction replaces Raft's "Start a new thread" example and its "Reply where the conversation is" preference bullet. Read-before-reply, own-message threads (the progress-thread mechanism), history, unfollow, and no-nesting are parity | Deliberate — operator-approved conversation policy (ADR 0029, amended 2026-10-02); covered by routing evals `conversation-natural-followups`, `task-conversation-routing` (no thread for one-step work), and `solo-progress-threads-on-ack` |
| Discovering people and channels | Raft v1.21 says `server info` prints only a summary (visible and joined channel counts, agent and human counts, narrow queries) and that `--channels` pages with `Showing 1-50 of N` plus an `--offset` command. Haus's default prints the channel, agent, and human counts and then the first page of each list; each listing pages by `--offset`/`--limit` and prints a `Next:` command while rows remain. Haus states its own behavior, keeps Raft's sentence "So one page is one page; a claim about every channel needs the pages you actually read, not the first window." verbatim. Haus omits two Raft-verbatim clauses: "Private channels require a human with access to add you." and the paragraph opening "Private channels are membership-gated. If `raft server info --channels` shows a channel as private, …" through "… unless a human explicitly asks within an authorized context." Its closing role-label sentence ("In `haus channel members`, human role labels …") is kept verbatim on its own line. The rest is parity | Deliberate — `apps/server/src/agent-api/directory.ts`, `apps/computer/src/agent-cli/agent-render.ts` (`renderServerInfo`); `discovery-instructions.test.ts`. Private-channel omission: operator decision 2026-10-06 — Haus channels are open by design and content may move across them (joining stays deliberate). No schema flag, the Agent directory never marks one, CONTEXT.md lists "Private channel" under _Avoid_. Cove's FAQ says the same |
| Channel awareness | Parity, including Visibility, except Haus omits Raft's Raft-verbatim bullet "A **private channel** is visible only to its members, plus any explicitly added member." | Deliberate — operator decision 2026-10-06: Haus channels are open by design (see Discovering); `discovery-instructions.test.ts` asserts no private-channel text |
| Capability and execution-surface selection | Haus-only. Raft 1.0.25 has no such section; its Integrations family bullet carries a short surface-choice rule tied to Agent Login, which Haus lacks. Haus keeps a trimmed section: surfaces, inventory scope, and the MCP `execute` discovery path | Deliberate — ADR 0017, specs/mcp.md; gated by `mcp-granted-lookup` / `mcp-revoked-honest-failure` and `managed-instructions.test.ts` |
| Reading history & references | Parity | — |
| Tasks | Parity for the claim rule, top-level-only, and failed-claim routing. Haus replaces Raft's review-then-done sentence (set `in_review` for human validation, `done` after approval) and the same-turn `done` exception it needed: Agents set their own finished work `done`, and use `in_review` only when the requester asked to sign off or a human decision is pending, saying in the conversation what to check. Haus adds **Keep the conversation together** (acknowledge and answer where asked; one confirmed result acknowledges a short schedule change, with explicit unattended quiet-reporting agreements), reversible `closed`, the `TASK_IN_REVIEW_STALE_DAYS` stale close, and points to the `tasks` Manual topic where Raft points to "the Raft Manual" | Deliberate — operator-approved conversation policy; done-by-default finishing operator-approved 2026-10-05 (the conversation is the review; tasks are Agent-side tracking a human should not have to close); ADR 0015 (`closed`), `apps/server/src/tasks/close-stale-tasks.ts`; covered by `instructions.test.ts` and `product-topics.test.ts` |
| Splitting tasks | Parity | — |
| Working through sub-agents | Adopted with Haus adaptations from Raft v1.21's conditional `SUBAGENT_DELEGATION_SECTION` (`systemPrompt.ts`; Raft gates it on the Server's `subagentDelegation` flag plus runtime support, so it is absent from the snapshot render), at Raft's position between Splitting tasks and @Mentions. Rendered only when the runtime's harness supports sub-agents: Claude Code only (`supportsSubagents` in `runtime-harness.ts`, applied from the turn's runtime in `composeAgentInstructions`; text in `subagent-instructions.ts`; Codex and Grok Build sub-agents are switched off at their harness, Pi has none); other runtimes render the prompt byte-identical to before. Adaptations: Raft → Haus and "the chat"; the separate-tools sentence names Haus tasks and cloud agents; rule 4 says "Assume" a sub-agent sees nothing; rule 5 tells sub-agents not to run `haus`; rule 7 becomes "Finish within your turn" and drops "stay reachable", because Claude Code sub-agents run in the foreground only and end with the turn. Cap +2,198 (35,111 → 37,309) | Deliberate — operator decision 2026-10-06; foreground-only sub-agents (`CLAUDE_FOREGROUND_SUBAGENTS_ENV`); `subagent-instructions.test.ts`, `managed-instructions.test.ts` (cap measured with the section on) |
| @Mentions | Parity **plus** one Haus-only bullet: to need a human's decision or action, @mention them where the work lives, with one question, a default only if reversible, and what you prepared; their reply wakes you; irreversible acts wait for an explicit yes. Raft keeps this in its `recipes/decision/when-to-ask-human` recipe; Haus lifts it into the prompt because deleting `haus ask` removed the only prompt-taught way to need a human. Haus renders one name, so the display-name bullet interpolates the same value twice | Deliberate — ADR 0037 (replaces the retired Asks family entry, net −6 characters; a later mention-the-asker clause was cut again once an inline reply to a human's message came to address them like a mention, 32,393 → 32,281), specs/identity.md; `managed-instructions.test.ts`, `human-ask-reply-wakes` |
| Communication style | Parity **except** the first two bullets. Raft's "When you receive a task, acknowledge it and briefly outline your plan before starting." and "For multi-step work, send short progress updates (e.g. "Working on step 2/3…")." are replaced by the pickup rule, which applies when someone asks the Agent to do something: answer directly (claiming first if it is a task) with no reaction when the answer needs at most one quick look-up; react with the signature emoji (the Agent's own, default 👀) before changing files, running commands, or digging in; for several steps also send a one-line note with no plan (ADR 0029's acknowledgment; progress placement stays with the Sending rule); and "For multi-step work, send short progress updates as meaningful steps land; skip updates that change nothing." The signature emoji is the prompt's only literal emoji, scoped to pickup so it does not become the step 4 thanks reaction | Deliberate — operator decision 2026-10-06 from the personality eval series: Raft's plan-outline acknowledgments and step counters read as noise, while a pickup reaction signalled non-instant work 100% of the time (round 5) with a median first signal of 5 to 7 seconds and never fired on social turns; ADR 0029 (progress threads on the acknowledgment); `managed-instructions.test.ts` |
| Conversation etiquette | Parity **plus** "Silence is deliberate" (step 4 holds in a DM: an explicit FYI gets nothing, a thanks or ack one reaction), "DM knowledge is not room knowledge", and "Welcome new teammates" | Deliberate — specs/inbox.md (silence), specs/sessions.md §"Knowledge and discretion", ADR 0028 (welcome fires on a message, so it cannot live in a Manual topic) |
| Live constraints | Parity | — |
| Formatting — Mentions & Channel Refs | Haus drops Raft's `#1` numeric channel form and adds "Haus renders your message as Markdown, GFM tables included," extended with a chat-register rule: plain sentences, no bold for emphasis or as labels, lists/headings/tables only for genuinely structured content | Deliberate — specs/mentions.md (no numeric refs); Haus App renders GFM (docs/internals/widgets.md); chat register is an operator decision 2026-10-01 (agents overused bold in chat), covered by managed-instructions.test.ts |
| Workspace & Memory | Parity **plus** the MEMORY.md re-read sentence ("at natural boundaries … including after context compression"; "Your session resets rarely…") and the "Apply remembered preferences" bullet | Deliberate — ADR 0009, ADR 0011 (one long-lived session, so startup-only reads are insufficient); asserted in `managed-instructions.test.ts` and `instructions.test.ts` |
| Workspace & Memory — memory shape | Haus rewrites Raft's memory-shape text: MEMORY.md is "hot memory you need on every wake, then an index of `notes/`" (replaces "Structure it as an index that points to everything you know"); the template adds `## Standing Preferences` ("communication style and standing directives: terse imperative rules; merge, don't append"), puts Active Context before Key Knowledge as one placeholder, "current work only: rewrite, don't append; drop finished items" (replaces "Currently working on" / "Last interaction"), and writes Key Knowledge lines as `path — hook` without `notes/user-preferences.md`; the `notes/` bullet says notes hold deeper knowledge not needed every wake as topic files of current truth, update or delete before adding, no dated logs, and points to Manual topic `recipes/technique/memory-hygiene` (replaces the four-file example list, dropping `notes/work-log.md`) | Deliberate — operator decision 2026-10-05: standing preferences and directives are needed on every wake, so they are hot memory rather than a note; Haus chat and task history is canonical Server state searchable with `haus message search`, so a work log duplicates it; live Agents' MEMORY.md files grew as append-only diaries (stale "currently working on" lines, prepended entries never removed). Net −33 characters with the What to memorize item 4 row. The placeholder's "terse imperative rules; merge, don't append" (+29) came 2026-10-08: live Agents (Forge) wrote verbose, sourced, appended preferences. `managed-instructions.test.ts`, `instructions.test.ts`; the ordinary seed (`packages/agent-workspace/src/starter-kit.ts`) follows the same section order |
| Workspace & Memory — MEMORY.md size target | Raft-only. Raft v1.21 adds "Target **16 KB or less**: MEMORY.md is injected into the first input of every fresh session …" only when its startup memory block is on (`constructedWakeContext`); not in the snapshot render. Not adopted: Haus does not inject MEMORY.md into turn input, and its 16 KiB guidance rides the memory-size notice | **Pending operator decision** — tied to the wake briefing panel / startup memory block and session recycling, decided separately |
| What to memorize, compaction safety | Parity except item 4: Haus keeps "Work history" to decisions and approaches and adds that the history itself lives in Haus chats and tasks — record handles (chat/message, task, file, commit), find it with `haus message search` | Deliberate — same operator decision as the memory-shape row; `managed-instructions.test.ts` |
| Outputs | Haus-only | Deliberate — ADR 0003, ADR 0004, ADR 0010 |
| Visuals | Haus-only | Deliberate — ADR 0012, ADR 0031 |
| Web access | Parity: no section. Like Raft, Haus gives Agents their runtime's native web tools with no gate and no prompt text (the Haus-only gated section was deleted 2026-10-08) | — specs/tools.md |
| Initial role | Parity | — |
| Runtime Profile Control | Raft-only (configured variant's daemon release notice) | Deliberate — Computer upgrades are operator-driven, ADR 0020 |
| Workspace seed (`packages/agent-workspace/src/starter-kit.ts`) | Not re-diffed at 1.0.25; last matched 1.0.16's `buildInitialMemoryMd` | Re-check on the next pin |

## Event input

These are not system-prompt text, but they carry guidance Raft keeps in event input.

| Surface | Difference | Status / owner |
| --- | --- | --- |
| Inbox notice (`composeInboxNotice`) | Bracket says `Haus inbox notice` where Raft says `Raft`. The first guidance line is Raft's closing line at the pinned commit, verbatim ("These messages have not been read. Choose when to read them: `haus message read --target <target> --unread` reads one conversation's unread messages; `haus message check` reads all of them. Deferring them does not establish that there is no work."). A second, Haus-only line keeps withheld-not-absent, not-a-request, pivot-or-continue, and honest deferral — the guarantees the prompt used to carry. The old `(locally cached bodies)` and pending-targets `haus inbox check` clauses are gone | Deliberate — specs/inbox.md §Notices owns the Haus-only line; covered by `inbox-format.test.ts` |
| Envelope work markers | A drained envelope compresses task and mention facts inside its leading bracket (`task=#N:status:assignee`, `mentioned=true`) | Deliberate — specs/haus-cli.md §4; ADR 0026 |
| Envelope attachment suffix | `[N attachments: name (id:…) — use haus attachment view to download]`; Haus's view takes the id positionally, so the hint names only the command | Deliberate — specs/haus-cli.md §4; `inbox-attachment-format.test.ts` |
| Inline reply context | Haus appends an `[Inline reply context]` block | Deliberate — ADR 0029; `inline-reply-format.test.ts` |
| Thread context block | Raft's thread-join block with `Haus` naming, home-timezone `time=`, and Server bounds | Deliberate — specs/inbox.md; `thread-context-format.test.ts` |
| Inbox delivery trailer | Identifies `target` as the requesting conversation; no invitation to choose a new thread | Deliberate — natural conversation evals; `inbox-format.test.ts` |
| Unread-elsewhere digest | Parity with the pinned commit's `formatOtherUnreadChannelsSuffix` wording, appended to every wake: closes with "Run `haus inbox check` at a natural breakpoint if you choose to inspect those targets; it lists every unread conversation with the command that opens it." Raft's bounded-startup suffix (`formatBoundedStartupUnreadSuffix`) has no Haus analog: a Haus cold start drains addressed items and notices the rest (ADR 0034), so no batch is silently bounded | Deliberate — ADR 0034; `turn-prompt.test.ts` |
| Body continuation prefix | Parity with Raft v1.21's `indentAgentBodyContinuationLines`: every continuation line of a sender handle, description, or message body takes `  │ ` after any universal-newline separator, so free text cannot start a forged `[target=…]` or `- [msg=…]` line. Haus applies it to drained envelopes, thread-context quotes, CLI history and delivery lines, and a Cloud Agent attention's title and summary. Server-composed fire and task-assignment bodies stay verbatim: their structural lines belong at column 0 and the Server already indents their untrusted parts | Deliberate — security fix; `inbox-header-forgery.test.ts` |
| Raft wake input: App inbox notice suffix, wake briefing panel, startup memory block, wake session recycling | Raft-only, new in v1.21 (`formatAppInboxNoticeSuffix`, `wakeBriefingPanel.ts`, `startupMemoryBlock.ts`, `wakeSessionRecycle.ts`). Not adopted | **Pending operator decision** — the wake briefing panel, startup memory block, and session recycling are being decided separately; Haus has no built-in Apps for the App suffix |
| Cove coordination notice (`cove-guidance-refresh.ts`) | Private per-turn operating-note pointer and bounded offer/receipt protocol; custom no-offer instructions win, consent is required, quiet checks stay silent; refresh/conflict replace the regular notice | Deliberate — Cove chief-of-staff change; `cove-guidance-refresh.test.ts` and native weekly scenarios |
| MEMORY.md size notice (`memory-size-notice.ts`) | Raft's Cleaner item, carried as a private one-line turn-input notice at most once per 24 hours. Haus fires above 16 KiB (Raft v1.21's 4,000-token × 4-byte MEMORY.md target, ahead of the 1.0.25 pin's 64 KiB Cleaner default), says "keep hot memory short and move deeper knowledge into notes/", and names the runnable `haus manual get recipes/technique/memory-hygiene --intent … --reason …` command | Deliberate — operator decision 2026-10-05; specs/workspace.md §Durable knowledge; `memory-size-notice.test.ts` |
| Manual card `recipes/technique/memory-hygiene` | Rewritten for Haus as "Keep MEMORY.md hot and notes/ current": what belongs in hot memory versus notes/ (with examples), Active Context rewritten not appended, path-plus-hook index lines, topic files over logs, update or delete before adding, when to split, notes grown into a tree of sub-indexes, closed work pruned, history stays in chat, a cold-start self-check; a "Write rules, not records" section (2026-10-08: one terse imperative rule per preference, merge feedback into the existing rule, no sources/dates/caveats, no restated system-prompt rules, a before/after example) and durable handles scoped to work state, after live Agents (Forge) wrote verbose, sourced, appended preferences. The captured source card stays in `raft-recipes/` as the record | Deliberate — same operator decision; `packages/agent-manual/src/index.test.ts` (`hausRewrittenIds`) |
| Manual card `recipes/pattern/recurring-recovery` | Raft v1.21's "Fire-request exhausted" failure mode, adapted: Haus fires a Reminder on the Server in one transaction (fire row, wake, next fire time together), so there is no daemon retry budget or log line; the Haus mode names the shared symptom (no `reminder log` row, `[scheduled]` with a past fire time), the Haus causes (archived or deleted anchor, persistently failing fire), and re-anchoring by `snooze`/`update` or rescheduling on a live message. Raft's proof sentence for this shape is dropped: Haus has not observed it. Fire-without-run wording accounts for durable wakes held during stops, offline periods and failure pauses: reconcile stacked wakes once, backfill only required deliverables, and keep quiet checks silent | Deliberate — `apps/server/src/reminders/scheduler.ts`; `packages/agent-manual/src/reminder-semantics.ts` and the fidelity test in `index.test.ts` |
| Manual card `recipes/technique/task-claim-lock` | Re-captured at the pin (Raft's card is unchanged since `v1.13.0-source.1`) and published verbatim apart from the existing `taskThreadRouting` rows (progress in a thread on your own acknowledgment; done-by-default finishing; the Silent sign-off failure mode). Raft's "a failed claim is a lock, not a ruling on who owns the lane" text, the misroute-correction step, and the Treating-metadata-as-ownership-truth and Silent-retreat failure modes need no adaptation: Haus's claim conflict already names the lock holder, blocks only conflicting execution, and says to correct the routing in the original thread | Parity — `apps/server/src/tasks/claim-conflict.ts`, `apps/computer/src/agent-cli/agent-claim-conflict.ts`, `TASK_CLAIM_CONFLICT_ROUTING_NOTE` in `packages/haus-api/src/task-shared.ts`; fidelity test in `packages/agent-manual/src/index.test.ts` |
| `haus task claim` / `task create` receipts; Cloud Agent receipt | Report ownership and thread addresses as references, without routing advice | Deliberate — conversation placement follows the human request; agent-task-actions and manual/CLI tests |

## Open TODOs

- Re-diff the workspace seed against the pinned source.

## Keeping this current

Re-diff whenever `managed-instructions.ts`, `inbox-format.ts`, or `starter-kit.ts` changes, and
when re-pinning to a newer Raft source commit. Verification for a prompt edit is
`bun run test:prompt-contract`, the Computer package gate, and `bun run eval:prompt`
(docs/operations/testing.md §Prompt Behavior Evals).

## Cove coordination release review

This review set the rendered prompt budget to 33,910 characters (previously 33,388 after the v1.21.2 re-pin and inbox updates). The 522-character
increase explicitly preserves default reminder answers except for agreed quiet reporting,
and lets a short human schedule confirmation/correction/opt-out use one confirmed reply as
its acknowledgment. Longer work still needs its initial acknowledgment. Trigger provenance,
Raft text, done-by-default tasks and hot-memory guidance remain intact. Private Cove notices
are capped independently at 2,300 characters (including explicit recurrence-timezone and single-confirmation guards) and carry consent/silence guards on every path.

The final prompt eval exposed an emoji-only acknowledgment sent as a message. The startup rule now explicitly distinguishes reaction-only thanks or celebrations from emoji-only replies; no other prompt text is removed. `managed-reactions.test.ts` and `ack-reaction-variety` validate this addition.
