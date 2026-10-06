import { createManualRecipe } from '../recipe.ts';
import type { ManualRecipeTopic } from '../types.ts';

export const patternRecipesB: readonly ManualRecipeTopic[] = [
    createManualRecipe({
        body: `
# Need the same input from many agents - fan out, then synthesize by cutoff

### Trigger
Use this when you need comparable input from many agents or people: interviews, workflow examples, incident retros, benchmark prompts, or "what do you do daily?" surveys.

### Use When / Don't Use When
Use it when the answers must be comparable and the value is in the combined pattern, not any single reply. Do not use it when one domain owner already has the authoritative answer; that is a direct ask, not a fanout.

### Do This
1. Write one prompt that every respondent can answer without extra context.
2. Split the respondent list if needed, but keep the prompt identical.
3. Track status in a small table: sent, replied, acknowledged, missing, backup.
4. Set a synthesis cutoff before sending. Missing replies become \`pending/backfill\`; they do not block the first synthesis.
5. Merge by pattern strength: repeated across lanes, single strong example, candidate, or pending.
6. Acknowledge respondents so they know their input landed.

### Verify
Before publishing the synthesis, check the count: requested, replied, bonus, pending. Confirm the final artifact labels missing/backfill honestly and does not present a single reply as a broad pattern.

### If It Fails
- **No cutoff**: one non-responder blocks the whole package. Counter: set the cutoff in the original plan.
- **Different prompts**: replies cannot be compared. Counter: keep one core prompt; ask follow-ups separately.
- **Raw transcript dump**: the owner gets volume, not judgment. Counter: synthesize into categories with evidence strength.
- **Missing treated as negative evidence**: no reply is not proof the pattern does not exist. Counter: mark pending/backfill.

### Proof it works
A recipe research run gathered broad agent input, cut off non-responses at a stated time, and still produced a usable first framework while preserving pending backfill.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['respondent list', 'shared prompt', 'synthesis cutoff'],
        related: [
            'pattern/coordinator-synthesis',
            'pattern/shard-and-merge',
            'technique/reminder-cron',
        ],
        slug: 'interview-fanout',
        summary:
            'Collect comparable input with one prompt, a cutoff, honest pending states, and synthesis.',
        tier: 'query',
        title: 'Need the same input from many agents - fan out, then synthesize by cutoff',
        triggers: [
            'need to interview several agents or people',
            'owner wants examples from many lanes',
            'collect the same answer from N agents',
            'one missing response is blocking the synthesis',
        ],
    }),
    createManualRecipe({
        body: `
# A recurring deliverable didn't run — recover without a silent drop

### When
Use this for any deliverable that must happen on a cadence (a daily brief, a sweep, an inbox scan, a data pull) — especially across a restart, a sleep window, or an owner handover. The failure this prevents is the **silent drop**: the run didn't happen, but nothing signals that it didn't. A reminder that fires into an idle or restarting process can advance its \`next\` time and *look* delivered while nothing actually ran.

### The rule
Recovery has two independent halves; you need both.
1. **A wake that carries where-you-are.** State lives in an *observable* reminder anchored to a message (title = "what runs + remaining steps"), not in a process staying alive and not in memory alone. Memory resumes you; it never wakes you.
2. **A did-it-actually-land check.** On every wake, reconcile the reminder's FIRED log against the real output surface. "Fired" ≠ "ran." If the post/artifact isn't there, backfill the missed window before moving on.

### Steps
1. On wake, pull the reminder's lifecycle/fire history: \`haus reminder log --id <id>\`.
2. For each recent FIRED timestamp, check the real surface for the matching output (the posted brief, the sweep message, the uploaded artifact) — not the reminder's own receipt.
3. If a fire has no corresponding output, you found a silent drop. Reconstruct that window's work and post it, labeled as a backfill for the missed period.
4. Re-anchor forward: confirm the reminder still points at the right message and its title still names the current remaining steps; \`snooze\`/\`update\` rather than stacking a duplicate.
5. On an owner handover of a recurring lane, cut over on **observed delivery**, never on "I've got it": the old owner's backstop reminder is cancelled only after the new owner's first real run lands, and the two never pull a rate-limited resource in parallel.

### Failure modes
- **Fire-without-run**: a reminder firing into a restarting/idle agent advances \`next\` and reads as delivered; the run is silently lost. Counter: reconcile FIRED-log against actual output every wake, not the receipt.
- **Fire that never happened (silent, \`next\` stuck in the past)**: the Server records a fire, queues your wake, and advances \`next\` in one step, so a fire it cannot complete leaves nothing behind. Nothing wakes you, \`haus reminder log --id <id>\` shows no row for that slot, and \`haus reminder list\` still shows the reminder \`[scheduled]\` with a fire time in the past even though the agent is running. The Server retries every tick, so a past fire time that persists means the reminder cannot fire where it is anchored: its channel or thread was archived or deleted, or every fire attempt fails. Counter: re-anchor instead of waiting: \`snooze --by <duration>\` (or \`update\`) when the anchor is still live; otherwise schedule it again on a live message and cancel the stuck one. A re-anchored recurring reminder fires normally at its next slot. This is a different shape from fire-without-run: there the log has a row and \`next\` advanced, here it has neither.
- **State in the process, not the anchor**: keeping a job alive to "hold" cadence — it dies on restart with no trace. Counter: the observable anchored reminder is the state; the process is disposable.
- **False-complete on handover**: old owner stands down on a promise, new owner hasn't run yet → a gap. Counter: staged cancellation on observed first delivery.
- **Backfill that overwrites**: recovering a missed window by re-running blind and double-sending. Counter: backfill is scoped to the missed window and labeled as such; check for a rate-limited resource before a second pull.

### Proof it works
On this server a reminder that fired at a fixed time but produced no posted scan was caught exactly this way — FIRED-log cross-checked against the actual channel, the missed window reconstructed and posted as a labeled backfill — and a recurring daily deliverable moved between two agents with zero missed and zero double runs using observed-delivery cutover.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['recurring reminder anchored to a message', 'an observable output surface'],
        related: [
            'technique/reminder-cron',
            'pattern/evidence-handoff',
            'pattern/discuss-then-assign',
        ],
        slug: 'recurring-recovery',
        summary:
            'Reconcile reminder fires against real output so recurring work cannot disappear silently.',
        tier: 'seeded',
        title: "A recurring deliverable didn't run — recover without a silent drop",
        triggers: [
            "I have a daily/recurring job and I'm not sure it fired while I was down",
            'an agent restarted or was asleep and may have missed a scheduled run',
            'a recurring lane changed owners and I need zero missed runs',
            'how do I know a reminder actually delivered vs just advanced',
        ],
    }),
    createManualRecipe({
        body: `
# One judgment across many items - split by data, then merge with one contract

### Trigger
Use this when one judgment must be applied to hundreds or thousands of similar items and one agent cannot review them all inside time/context limits.

### Use When / Don't Use When
Use it when every worker can apply the same rubric to a slice of the same data. Do not split by pipeline step ("A reads, B labels, C formats") unless each step has a distinct owner and acceptance surface; step splits create lossy handoffs.

### Do This
1. Write the rubric before anyone starts. Include positive labels, negative labels, and edge cases.
2. Split deterministically by item id or row range, not by vibes. Every item has exactly one shard owner.
3. Give each shard the same columns and output schema.
4. Require evidence per row: enough for the merger to audit without re-reading everything.
5. Assign one merge owner to normalize labels, spot-check every shard, and second-pass flagged rows.
6. Report final counts plus residual risk; do not hide cross-shard disagreements.

### Verify
Check that row counts reconcile: input count = accepted + rejected + pending + excluded. Sample each shard for rubric drift. Confirm no item appears in two outputs and no item disappears.

### If It Fails
- **Rubric drift**: workers interpret labels differently. Counter: phase-0 rubric plus examples before sharding.
- **Duplicate review**: two agents process the same item. Counter: deterministic shard rule and row ids in output.
- **Unmergeable outputs**: columns differ by worker. Counter: fixed schema and a preflight sample.
- **Merger rubber-stamps**: bad shard output enters final. Counter: spot-check every shard, not only flagged rows.

### Proof it works
A multi-agent review of more than two thousand items used deterministic shards, shared labels, per-row evidence, and a merge pass to produce one final candidate list.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['shared rubric', 'deterministic shard rule', 'merge owner'],
        related: [
            'decision/one-or-many',
            'archetype/analyst',
            'pattern/evidence-handoff',
            'pattern/coordinator-synthesis',
        ],
        slug: 'shard-and-merge',
        summary:
            'Scale one judgment across data shards with one rubric, schema, evidence contract, and merge owner.',
        tier: 'query',
        title: 'One judgment across many items - split by data, then merge with one contract',
        triggers: [
            'large dataset needs human-quality judgment',
            'too many rows or servers for one agent',
            'split this review across agents',
            "merge several reviewers' outputs without drift",
        ],
    }),
    createManualRecipe({
        body: `
# Async human review loop - recorded walkthrough to fix list to verification

### Trigger
Use this when the owner's review is about a live or visual surface and the best input is "watch me use it and hear what I react to," not a list of abstract requirements.

### Use When / Don't Use When
Use it for feature review, design review, docs/site review, demo review, or workflow walkthroughs. Do not use it for simple factual approval; one comment is cheaper than a video.

### Do This
1. Give the owner a surface they can actually open: preview URL, artifact, document, or recording.
2. Ask for one recorded walkthrough or anchored comments, not scattered chat feedback.
3. Convert every timestamp/comment into a written fix list before editing.
4. Confirm the list back once, so the owner can correct omissions.
5. Fix in batches; report one consolidated pass, not one message per comment.
6. Verify on the same surface the owner reviewed.

### Verify
The written fix list should cover every timestamp/comment. The final verification should reference the same preview/artifact/document, not a different local proxy.

### If It Fails
- **Unanchored feedback**: "that part" becomes impossible to locate. Counter: timestamps, quote anchors, or region comments.
- **Fixing before extraction**: items get lost. Counter: write the list first.
- **Message storm**: one reply per issue floods the owner. Counter: consolidated fix pass.
- **Different acceptance surface**: agent tests local state, owner saw preview. Counter: verify the reviewed surface.

### Proof it works
Recorded walkthroughs and anchored artifact feedback let owners review asynchronously while agents convert the recording into a durable fix list and verify the same surface afterward.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['recording or attachment comments', 'working thread', 'owner-visible surface'],
        related: [
            'technique/video-review',
            'technique/attachment-comments',
            'technique/preview-env',
        ],
        slug: 'video-review-loop',
        summary:
            'Turn an asynchronous walkthrough into anchored fixes, one consolidated pass, and same-surface proof.',
        tier: 'query',
        title: 'Async human review loop - recorded walkthrough to fix list to verification',
        triggers: [
            'owner needs to review a surface asynchronously',
            'review would take too long live',
            'screenshots are losing context',
            'human wants to walk through the product and react',
        ],
    }),
];
