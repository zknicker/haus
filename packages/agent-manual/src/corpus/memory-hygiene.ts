import { createManualRecipe } from '../recipe.ts';

export const memoryHygieneRecipe = createManualRecipe({
    body: `
# Keep MEMORY.md hot and notes/ current

### Trigger
Use this when MEMORY.md or notes/ start to harm recovery: MEMORY.md runs long, Active Context reads like a diary, finished work still looks current, or one fact lives in several places. A Haus workspace notice that MEMORY.md is over its size limit means the same.

### Use When / Don't Use When
Use it after finishing work, before long tasks, and whenever you catch yourself appending. Do not use memory as a task queue or alarm clock; tasks and reminders own work and wakeups, and Haus chats own history.

### What goes where
- **MEMORY.md is hot memory plus an index.** Hot memory is what you need on every wake, in plain text: your role; how people want you to communicate; standing preferences and directives that hold until changed ("@dana wants a one-line summary before any detail", "never post in #all without asking"); and Active Context. Then a Key Knowledge index of notes.
- **notes/ holds deeper knowledge you are not using right now**: a project's architecture, a customer's history of requirements, how deploys work, what each channel is for. Each note is a topic file holding the current truth on one subject, named for it (\`notes/billing-api.md\`), never for a date or session.
- **History stays in Haus chats and tasks.** What was said, decided, and done is already there. For work state, keep durable handles (chat or message, task, file path, commit) and find the story with \`haus message search\`.

### Write rules, not records
Standing Preferences are rules you follow, not a log of feedback.
- One terse imperative line per rule, stating the resulting rule, not the delta: "High agency", not "Exercise more agency".
- Merge new feedback into the closest existing rule and rewrite it. Never append a near-duplicate.
- No sources, dates, or caveats. Chat holds the evidence; handles are for work state.
- Do not restate rules your system prompt already enforces.

Before: \`- Exercise more agency: carry authorized work through, choose routine next steps, and avoid unnecessary questions. @dana will redirect when needed. This does not authorize irreversible actions. Source: #ops msg 8f3k2a.\`
After: \`- High agency: own sequencing and routine calls; ask only for real decisions.\`

### Do This
1. **Keep hot memory short.** A fact earns a hot line only if you would act wrongly without it on a typical wake. A preference that matters for one project goes in that project's note.
2. **Rewrite Active Context, never append.** On every update, replace it with current state: what is in flight, who is waiting, the next step. A finished item leaves; its lasting lesson goes to a topic note, and its story stays in chat.
3. **Index lines are path + hook.** Each Key Knowledge line names a note and says in one line when to read it: \`- notes/deploys.md — how staging and prod ship; read before a release\`. No detail or history in the index.
4. **Update or delete before you add.** Find the note that owns the topic and edit it in place. Replace a superseded fact instead of stacking the new one below it; delete notes whose subject is gone, with their index line.
5. **Split when the topic splits.** When a note covers subjects you read separately, or outgrows one sitting, split it and give each part its own index line. When hot memory grows a topic's worth of detail, move the detail to a note and keep the one standing rule hot.
6. **Grow notes into a tree.** When one area passes a handful of files, give it its own index (\`notes/ads/README.md\`: one path + hook line per file) and point MEMORY.md's Key Knowledge at that sub-index instead of each file. Lookup stays MEMORY.md → sub-index → file → grep.
7. **Prune closed work.** Remove closed blockers, plans, and "currently working on" lines. Label facts likely to drift as verified or from memory.
8. Never store secrets or raw credentials. Redact credential-shaped strings.

### Verify
Cold-start self-check: reading only MEMORY.md, can future-you say who you are, how people want you to work, what is in flight now, and which note to open for any topic? Then: every index line is one line with a path; no area of more than a handful of notes is listed file by file in MEMORY.md; no note is a dated log; Active Context names nothing finished; no fact appears twice.

### If It Fails
- **Diary growth**: entries pile up and none are removed. Counter: rewrite in place; delete what closed.
- **Feedback log**: each correction becomes a new sourced preference line. Counter: merge it into the existing rule.
- **Everything hot**: project detail crowds MEMORY.md. Counter: move it to a topic note; keep the index line.
- **Work log**: a note retells chat. Counter: swap it for handles and search chat when you need the story.
- **Memory as proof**: a stale note overrides the current repo or chat. Counter: verify cheap current state before acting.
- **Secret leakage**: memory persists credentials. Counter: never write secrets; redact accidental output.

### Why
Agents whose MEMORY.md grew as an append-only diary carried stale "currently working on" lines and duplicated history into every wake, while the preferences they needed each time were buried in notes they did not open.`,
    class: 'technique',
    industries: ['universal'],
    prereqs: ['agent-owned workspace', 'memory file'],
    related: [
        'pattern/evidence-handoff',
        'technique/reminder-cron',
        'pattern/coordinator-synthesis',
    ],
    slug: 'memory-hygiene',
    summary:
        'Keep MEMORY.md to hot memory plus a notes index, notes/ as current topic files, and history in Haus chats and tasks.',
    tier: 'query',
    title: 'Keep MEMORY.md hot and notes/ current',
    triggers: [
        'my MEMORY.md is bloating or over its size limit',
        'where should this preference or fact live in memory',
        'someone gave me feedback to remember as a standing preference',
        'Active Context reads like a diary',
        'about to append a log entry or work log to notes',
        'closed work still looks active',
        'future me needs to recover after compaction',
        'I keep resuming from stale facts',
    ],
});
