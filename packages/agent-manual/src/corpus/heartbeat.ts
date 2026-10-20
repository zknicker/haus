import { createManualRecipe } from '../recipe.ts';

export const heartbeatRecipe = createManualRecipe({
    body: `
# Run a heartbeat: catch up, notice, follow leads, report or stay quiet

### Trigger
Haus starts a heartbeat turn in a fresh session: a daytime run every two hours, and a nightly run once a night. The turn input names the run kind, a digest of the conversations you took part in since your last run, your latest checkpoint, and your open reminders and leads.

### Use When / Don't Use When
Use it for the heartbeat turn only. The main session decides what anyone hears; a heartbeat never talks to people. A direct message or mention that arrives during a daytime run stops it; the main session takes that message.

### Do This (every run)
1. **Catch up.** Read the latest checkpoint first, then each digest conversation: \`haus message read --target <t> --after <seq>\`. The digest has no bodies.
2. **Notice.** Start from your role, your memory, what people asked you about recently, and the connections and tools you have. Spend more time on what your work depends on. Look for what is new: in your connections, the repo, the web, other Agents' state.
3. **Follow leads.** A question nobody answered, something you said you would check, a gap in an area you own, a hunch. Run \`haus lead list\`, then \`haus lead claim --topic "..." [--message-id <id>]\` before researching; if it is refused, another Agent holds it, so leave it. Record the result with \`haus lead done --id <id> --finding "..."\`. Leave leads in another Agent's area to that Agent.
4. **Decide what matters.** Report what is urgent, changes a plan, involves money or a deadline, answers something someone asked, or is a real change from normal. Stay quiet about unchanged values and routine movement. Never repeat a finding the checkpoint says you reported unless it changed.
5. **Report or stay quiet.** At most one \`haus heartbeat report --text "..."\`, findings first, each with what you learned, why it matters, how sure you are, and a suggested next step. Daytime runs never edit MEMORY.md; put memory suggestions in the report.
6. **Checkpoint.** Write \`heartbeat/checkpoints/<YYYY-MM-DD>/<HH-mm>.md\` in your workspace: the exact report sent or "quiet" and why, what you checked, what you could not check, open leads, where to pick up.

Post nothing in any chat. One report or silence.

### Once per night (nightly run only)
The nightly run also writes \`heartbeat/daily/<YYYY-MM-DD>.md\` as its checkpoint, covers everything since the last nightly run, and adds:
7. **Reflect on the day.** Per conversation: where you were corrected, and by whom; what was declined or ignored; what worked well enough to repeat; which handoffs to other Agents dropped; which threads you left hanging. Check the other Agent's actual state before calling a handoff dropped. One remark is one data point, not a rule.
8. **Consolidate memory** per \`recipes/technique/memory-hygiene\`: fold lessons into Standing Preferences as terse rules, apply the day's report suggestions you agree with, rewrite Active Context, prune. Keep every standing rule unless you merge it or something newer contradicts it.
9. **Follow up dropped promises.** For each promise you dropped, schedule \`haus reminder schedule --title "..." --description "..." --fire-at <iso> --message-id <id>\` anchored to the original message, around 09:00 in the requester's timezone. Look the timezone up; do not infer it. The description says what was promised, because the fire does not show the anchor message. Post nothing now.
10. **Write the summary** with \`haus heartbeat learned --text "..."\`: a few lines in your own voice of what you learned, naming who taught you each lesson, and noting any correction you acknowledged but did not save.

### Verify
Chats show no new message from this run. At most one report was sent. The checkpoint exists at the path above and says what was reported. Nightly: every promise you dropped has a reminder anchored to its message, and the summary names who taught each lesson.

### If It Fails
- **Chatty run**: you posted or reported twice. Counter: one report or silence; the main session decides what anyone hears.
- **Repeat report**: the same finding goes out every run. Counter: read the checkpoint; report only what changed.
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
