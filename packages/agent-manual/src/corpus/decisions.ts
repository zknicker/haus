import { createManualRecipe } from '../recipe.ts';
import type { ManualRecipeTopic } from '../types.ts';

export const decisionRecipes: readonly ManualRecipeTopic[] = [
    createManualRecipe({
        body: `
# Agents overlap or collide — how to draw and redraw lanes

### When
The team shape is set (see one-or-many) but boundaries blur: overlaps, collisions, orphan work, or a lane needs to move between agents.

### The rules
1. **Lanes are ownership domains, not task types**: "owns outreach" not "writes emails". A lane includes its judgment calls, memory, and standing deliverables.
2. **Draw by domain or by data, never by pipeline step** — step boundaries are where context dies in handoff.
3. Every lane names: owner, standing deliverables + cadence, escalation point, and what is explicitly NOT in it (the not-list kills most collisions).
4. Orphan work goes to the nearest lane owner **by explicit assignment**, not by whoever noticed it.
5. **Lane transfer is a protocol, not an announcement**: package the working knowledge (docs, red lines, access), verify the receiver can operate (tools tested end to end), then cut over on **observed delivery** — the old owner backstops until the new owner's first real output, and never runs in parallel on rate-limited resources.

### Failure modes
- **Type-based lanes**: "A writes, B codes" → every real task spans both. Counter: domain ownership.
- **Announcement-only transfer**: "B owns this now" with no knowledge packaging → the lane silently degrades. Counter: the transfer protocol above.
- **Not-list missing**: two lanes both plausibly own a task → both or neither act. Counter: explicit exclusions per lane.

### Proof it works
A recurring daily deliverable moved between two agents on this team with zero missed runs and zero double-runs: knowledge packaged in three documents, receiver's tooling verified end to end before cutover, old owner's backstop cancelled per-shift only after observing the new owner's first clean delivery.`,
        class: 'decision',
        industries: ['universal'],
        prereqs: [],
        related: [
            'decision/one-or-many',
            'pattern/discuss-then-assign',
            'technique/task-claim-lock',
        ],
        slug: 'lane-design',
        summary:
            'Draw agent lanes around ownership domains and transfer them through observed delivery.',
        tier: 'query',
        title: 'Agents overlap or collide — how to draw and redraw lanes',
        triggers: [
            'owner has several agents doing overlapping things',
            'two lanes keep colliding or duplicating work',
            'handing a lane from one agent to another',
            'nobody is sure who owns this kind of work',
        ],
    }),
    createManualRecipe({
        body: `
# Adding an agent — what should the new agent own

### When
Your owner is shaping the team: adding an agent, or asking what the next one should own. Teams here grow by adding minds. The question is never whether more agents are allowed — it is what the next agent should own so the team gets stronger instead of slower.

### The five gains a new agent can bring (design its lane around at least one)
1. **Verification independence** — risky output (public, irreversible, money) gets a reviewer that is not its author. Authors cannot credibly certify their own work.
2. **Memory compounding** — a domain gets its own accumulating memory. An agent that owns one lane gets measurably better at it every week; two domains in one memory pollute each other.
3. **Parallel attention** — something is watched while other work happens (prod health, inboxes, channels). One agent cannot be in two places.
4. **Volume** — the work exceeds one context window or one agent's clock (a 2,000-item review backlog, a mass migration, a full-catalog rewrite). Split by data: each agent owns a slice.
5. **Blast-radius isolation** — a mistake in this lane must not contaminate others (credentials, experiments, customer-facing sends).

### How to advise the owner
> "A new agent here adds [gain N]: [one sentence applying it]. Give it [lane], let it keep its own memory, and it compounds — better at this every week."

Design lanes by **ownership** (who owns what domain) or by **data** (who owns which slice) — never by pipeline step. Every step boundary is a place where context dies in handoff.

### Failure modes
- **Boundary-less growth**: agents created for one-off tasks instead of ongoing lanes → idle agents with stale memory. Counter: lanes are ongoing; one-off tasks go to existing agents.
- **Step-splitting**: "A drafts, B formats, C posts" → three handoffs, no owner. Counter: one owner end to end; other agents join as gates, not steps.
- **Reviewer capture**: the reviewer starts fixing instead of reviewing → independence lost. Counter: reviewers report, never rewrite (see archetype/verify-gate).

### Proof it works
A 12-agent team runs on exactly these lane splits; a 2,000-item mass review (split by data) and a publish gate chain (independent reviewer) are documented runs.`,
        class: 'decision',
        industries: ['universal'],
        prereqs: [],
        related: ['decision/lane-design', 'pattern/discuss-then-assign', 'archetype/verify-gate'],
        slug: 'one-or-many',
        summary:
            'Choose the durable ownership, memory, attention, volume, or isolation gain for a new Agent.',
        tier: 'seeded',
        title: 'Adding an agent — what should the new agent own',
        triggers: [
            'owner asks whether to create another agent',
            'owner wants to add a second agent and asks what it should do',
            "owner wonders why one agent can't just do everything",
            'work is slow or agents collide and the team shape feels wrong',
        ],
    }),
    createManualRecipe({
        body: `
# How careful should this task's loop be — calibrating process to stakes

### When
You are deciding how heavy this task's loop should be: do-and-report, or staged with human sign-off. Use this before starting, not after something shipped.

### The rule
Stakes = **irreversibility × audience × money**. Three tiers:
1. **Low** (internal, cheaply reversible): do it, report after. Adding process here wastes the owner's leverage.
2. **Medium** (team-visible, reversible with effort): do it behind a draft or preview; owner approves before it takes effect.
3. **High** (external send, publish, changes to live systems, money): stage everything, keep send-count at zero until the owner approves the **exact final artifact**, then verify the exact bytes that shipped. Approval attaches to bytes, not to intentions.

### Steps
1. Classify the task's highest-stakes surface (not its average).
2. Say the tier out loud in the task thread ("this touches an external send, so I'll stage and hold").
3. For high stakes: build → stage → owner sees the final version → explicit yes → ship → verify the live artifact matches what was approved.

### Failure modes
- **Draft that auto-publishes**: treated as low-stakes because "it's a draft," but the surface ships on save. Counter: classify by where it CAN end up, not where it starts.
- **Approval version-skew**: owner said "looks good" to version N, version N+2 shipped. Counter: re-approve after any post-approval edit; approval names the version.
- **Verified preview, unverified prod**: checks ran on the staging copy only. Counter: post-ship byte check on the live surface.

### Proof it works
An outreach pipeline ran for weeks at send-count zero with human-gated batches and zero accidental sends; published articles pass independent pre-publish gates and a post-publish live-copy check.`,
        class: 'decision',
        industries: ['universal'],
        prereqs: [],
        related: ['technique/sent-zero', 'archetype/verify-gate', 'decision/when-to-ask-human'],
        slug: 'stake-strictness',
        summary: 'Calibrate process to irreversibility, audience, and money before acting.',
        tier: 'seeded',
        title: "How careful should this task's loop be — calibrating process to stakes",
        triggers: [
            'task touches money, production, or a public surface',
            "owner says just send it / just publish it and I'm not sure it's safe",
            'how much verification does this task need',
            'should this go out without review',
        ],
    }),
    createManualRecipe({
        body: `
# Proceed or check with the owner first — when to ask a human

### When
Mid-task, you hit a decision you could make yourself — or maybe shouldn't. Use this to decide in seconds instead of stalling.

### The rule
**Proceed** when the action is reversible AND in your lane AND derivable from standing instructions or precedent. **Ask** when it is irreversible, out of your lane, or preference-shaped with no precedent (naming, tone, money, scope changes). **Never block silently**: do the reversible parts now, stage the blocked part, and ask one specific question.

### How to ask (the shape matters)
1. One question, not five.
2. Carry a default: "I'll do X unless you say otherwise" — but only for reversible X. Irreversible decisions get a hard stop, no default.
3. Attach the staged artifact so the owner decides by looking, not by imagining.
4. If the owner is away: park it visibly (thread + task state), move to other work, don't sleep on the blocked item — schedule the follow-up.

### Failure modes
- **Permission for everything**: the owner becomes the bottleneck and the agent adds no leverage. Counter: reversible + in-lane + precedented = just do it, report after.
- **Silent guessing on preference calls**: rework and eroded trust. Counter: preference-shaped with no precedent = ask, with a staged default.
- **Question dumps**: five open questions, no defaults; the owner answers none. Counter: one question, one default, one artifact.
- **"Unless you object" on irreversible actions**: a timeout is not consent for sends/deletes/money. Counter: irreversible waits for an explicit yes.

### Proof it works
Daily practice across a 12-agent team: agents draft and stage without asking, and hard-stop on external sends; owners see one decision-shaped question with a staged artifact instead of open-ended pings.

### In Haus
Asking is an ordinary message that reaches the owner where the work lives — the task thread, or the conversation the request came from. An @mention of them or an inline reply to their message (\`haus message send --reply-to\`) both put it in their Inbox's Needs you; in a channel or thread any other message only shows as unread. A DM to them works the same way. There is no question record, option list, or approval card. That addressing keeps the conversation in their Needs you until they reply or mark it Done, and their reply there wakes you, so you do not poll for the answer. A task stays yours while you wait; humans never hold tasks. Launching a Cloud Agent that needs approval follows the irreversible rule: wait for an explicit yes.`,
        class: 'decision',
        industries: ['universal'],
        prereqs: [],
        related: ['decision/stake-strictness', 'technique/sent-zero'],
        slug: 'when-to-ask-human',
        summary:
            'Proceed on reversible, in-lane precedent; stage and ask one question for irreversible or preference-shaped choices.',
        tier: 'seeded',
        title: 'Proceed or check with the owner first — when to ask a human',
        triggers: [
            'should I proceed or ask the owner first',
            "owner is offline and I'm blocked on a judgment call",
            'not sure if I have permission for this',
            'how do I ask without becoming annoying',
        ],
    }),
];
