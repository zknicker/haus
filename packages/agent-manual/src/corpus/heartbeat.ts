import { createManualRecipe } from '../recipe.ts';

export const heartbeatRecipe = createManualRecipe({
    body: `
# Run a heartbeat: catch up, notice, follow leads, report or stay quiet

### Trigger
Haus starts a heartbeat turn in a fresh session: a daytime run every three hours, and a nightly run once a night. The turn input names the run kind, a digest of the conversations you took part in since your last run, your latest checkpoint's text, your open reminders and leads, your connection names, and a compact copy of the every-run steps. A daytime run needs this recipe only for detail; a nightly run reads all of it.

### Use When / Don't Use When
Use it for the heartbeat turn only. The main session decides what anyone hears; a heartbeat never talks to people. A direct message or mention that arrives during a daytime run stops it; the main session takes that message.

### Do This (every run)
1. **Catch up.** The latest checkpoint is in the turn input; do not fetch it again. Read each digest conversation: \`haus message read --target <t> --after <seq>\`. The digest has no bodies.
2. **Notice.** Start from your role, your memory, what people asked you about recently, and the connections and tools you have. Your connection names are in the turn input; do not search for them. Every run, check the sources your work depends on for what changed since your checkpoint, even when the chats were quiet: call the connections your role or memory relies on with the \`execute\` tool (\`tools.search\` only to find a tool inside one). Then look wider: the repo, the web, other Agents' state.
3. **Follow leads.** A question nobody answered, something you said you would check, a gap in an area you own, a hunch. The open leads and your open reminders are in the turn input; do not run \`haus lead list\` or \`haus reminder list\` unless the list is cut off. An unanswered question is a lead even if step 2 already found its answer. Before you research or report any lead, even one you expect to answer in a minute, run \`haus lead claim --topic "..." [--message-id <id>]\` (pass the message id when the lead is a message; not \`haus task claim\`); if it is refused, another Agent claimed or finished it, so leave it out of your report. Record the result with \`haus lead done --id <id> --finding "..."\`. Leave leads in another Agent's area to that Agent.
4. **Decide what matters.** Report what is urgent, changes a plan, involves money or a deadline, answers something someone asked, or is a real change from normal. Stay quiet about unchanged values and routine movement. Never repeat a finding the checkpoint says you reported unless it changed.
5. **Report or stay quiet.** At most one \`haus heartbeat report <<'HAUSMSG'\` … \`HAUSMSG\` (body on stdin, like \`haus message send\`), findings first, each with what you learned, why it matters, how sure you are, and a suggested next step. Daytime runs never edit MEMORY.md; put memory suggestions in the report.
6. **Checkpoint.** Write \`heartbeat/checkpoints/<YYYY-MM-DD>/<HH-mm>.md\` in your workspace: the exact report sent or "quiet" and why, what you checked, what you could not check, open leads, where to pick up.

Post nothing in any chat. One report or silence.

### Once per night (nightly run only)
The nightly run also writes \`heartbeat/daily/<YYYY-MM-DD>.md\` as its checkpoint, covers everything since the last nightly run, and adds:
7. **Reflect on the day.** Per conversation: where you were corrected, and by whom; what was declined or ignored; what worked well enough to repeat; which handoffs to other Agents dropped; which threads you left hanging. Check the other Agent's actual state before calling a handoff dropped. One remark is one data point, not a rule.
8. **Consolidate memory** per \`recipes/technique/memory-hygiene\`: fold lessons into Standing Preferences as terse rules, apply the day's report suggestions you agree with, rewrite Active Context, prune. Keep every standing rule unless you merge it or something newer contradicts it.
9. **Follow up dropped promises.** For each promise you dropped, schedule \`haus reminder schedule --title "..." --description "..." --fire-at <iso> --message-id <id>\` anchored to the original message, around 09:00 in the requester's timezone. Look the timezone up; do not infer it. The description says what was promised, because the fire does not show the anchor message. Post nothing now.
10. **Write the summary only when there are real lessons.** With \`haus heartbeat learned <<'HAUSMSG'\` … \`HAUSMSG\`: 1–4 lines starting \`- \`, one lesson each, first person, each naming who taught it. On a quiet night with nothing learned, skip \`haus heartbeat learned\` entirely; never invent a lesson to fill the summary. Compare the day's corrections with what MEMORY.md held when the run started; a correction you acknowledged in chat (such as "got it") that was not already saved says so on its line: acknowledged but not saved until now.

### Verify
Chats show no new message from this run. At most one report was sent. The checkpoint you wrote says what was reported; the write command already confirms it, so do not read it back. Nightly: every promise you dropped has a reminder anchored to its message, and any summary names who taught each lesson (a quiet night has none).

### If It Fails
- **Chatty run**: you posted or reported twice. Counter: one report or silence; the main session decides what anyone hears.
- **Repeat report**: the same finding goes out every run. Counter: read the checkpoint; report only what changed.
- **Read-back**: you re-read a file you just wrote. Counter: a successful write is the proof; re-reading it wastes the run.
- **Duplicate research**: two Agents chase one lead. Counter: claim before researching.
- **False dropped handoff**: you blame another Agent from memory. Counter: check its actual state first.
- **One-off rule**: a single remark becomes a standing rule. Counter: treat it as one data point until it repeats.
- **Daytime memory edit**: you changed MEMORY.md mid-day. Counter: suggest it in the report; the nightly run applies it.

### Why
Most of what an Agent should learn and notice happens in chats while it is busy elsewhere. A bounded, fresh run that reads the digest, reports once or stays quiet, and consolidates at night keeps the Agent current without waking its long main session.`,
    class: 'technique',
    industries: ['universal'],
    prereqs: ['heartbeat turn', 'agent-owned workspace'],
    related: ['technique/memory-hygiene', 'technique/reminder-cron'],
    slug: 'heartbeat',
    summary:
        'Heartbeat run: catch up on your chats, follow claimed leads, send one report or stay quiet, and nightly reflect, consolidate memory, schedule follow-ups, and summarize.',
    tier: 'query',
    title: 'Run a heartbeat: catch up, notice, follow leads, report or stay quiet',
    triggers: [
        'a heartbeat turn started with a digest and checkpoint',
        'a nightly heartbeat asks me to reflect and consolidate',
        'should I report this finding or stay quiet',
        'how do I claim a lead or follow up a dropped promise',
        'what do I write in a heartbeat checkpoint',
    ],
});
