import { createManualRecipe } from '../recipe.ts';
import type { ManualRecipeTopic } from '../types.ts';

export const patternRecipesA: readonly ManualRecipeTopic[] = [
    createManualRecipe({
        body: `
# One human, many lanes - synthesize into one decision surface

### Trigger
Use this when one human oversees several active lanes and the bottleneck is not work capacity but attention: what to review, what is blocked, what is already done, and what decision is needed now.

### Use When / Don't Use When
Use it when there are parallel threads with separate owners. Do not turn the coordinator into the implementer for every lane; the coordinator protects the human's attention and routes decisions.

### Do This
1. Sweep systematically, not by recency: tasks, root asks, active threads, review blockers, recent owner mentions.
2. Collapse each lane to one line: state, owner, evidence handle, next decision.
3. Separate current truth from memory-derived truth. Verify cheap facts before repeating them.
4. Deduplicate: if two agents reported the same blocker, show it once.
5. Route decisions to the right thread and owner. Do not summarize someone's completed work over them unless asked.
6. End with an action queue: what the human should review first, what can wait, and what has no action.

### Verify
Ask: could the owner decide the next action from this synthesis without opening every thread? Are all blocker statements backed by live task/thread handles rather than stale memory?

### If It Fails
- **Recency bias**: freshest thread dominates the brief. Counter: sweep by list, not memory.
- **Forwarding everything**: the owner gets a transcript. Counter: one-line lane state plus exact handles.
- **Coordinator becomes owner**: every problem gets pulled into the coordinator. Counter: route with evidence to lane owners.
- **Stale status**: done/in_review changed after the brief. Counter: verify task status at send time.

### Proof it works
Multi-agent onboarding and recipe work both used a coordinator to collapse many active lanes into one preview/gate status, preserving owner attention while keeping implementation with lane owners.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['channel access', 'task/thread handles', 'synthesis cadence'],
        related: [
            'archetype/pa-coordinator',
            'pattern/interview-fanout',
            'pattern/evidence-handoff',
        ],
        slug: 'coordinator-synthesis',
        summary:
            'Synthesize many active lanes into one evidence-backed decision surface for the owner.',
        tier: 'query',
        title: 'One human, many lanes - synthesize into one decision surface',
        triggers: [
            'owner is tracking too many parallel agent lanes',
            'what is already done and what is still blocking',
            'need one status read across channels',
            'several agents are waiting on the same human',
        ],
    }),
    createManualRecipe({
        body: `
# Several agents could take this — claim before work, discuss before claim

### When
A work item lands in a shared channel and more than one agent could plausibly take it. The failure you are preventing is two agents doing the same work — or zero agents, each assuming the other took it.

### Steps
1. **Claim is the lock.** Whoever will do the work claims the task object BEFORE starting. No claim, no work.
2. If ownership is ambiguous, a quick thread first: who has the lane, who has the firsthand evidence, who has capacity. Lane owner wins ties.
3. The non-taker exits with one line ("yours — I have X if you need it"), not silence: silence re-creates the ambiguity.
4. Claim scope = the message's scope. New work discovered mid-task is proposed as a new item, not silently absorbed.
5. Handovers transfer by observed delivery, not by promise: the old owner stands down after the new owner's first real output, not after "I've got it."

### Failure modes
- **Claim-after-start**: two half-done copies of the same work. Counter: the claim precedes the first tool call.
- **Discussion without claim**: everyone agrees someone should do it; nobody does. Counter: the discussion's last line is always a claim.
- **Silent scope creep**: the claimed task quietly grows past what anyone agreed. Counter: renegotiate additions in-thread.
- **Promise-based handover**: coverage gap between "I'll take it" and actual delivery. Counter: staged cancellation on observed output.

### Proof it works
A server-wide claim-before-work rule has run for weeks; a recurring-deliverable handover this week used staged cancellation (old owner's backstop cancelled only after the new owner's first delivered run) with zero coverage gap and zero double-runs against a rate-limited resource.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['task claim'],
        related: ['decision/one-or-many', 'technique/task-claim-lock', 'pattern/evidence-handoff'],
        slug: 'discuss-then-assign',
        summary:
            'Resolve ambiguous ownership in a thread, then claim the work before the first action.',
        tier: 'seeded',
        title: 'Several agents could take this — claim before work, discuss before claim',
        triggers: [
            'several agents could take this task',
            'two agents started the same work',
            'avoid duplicate work in a shared channel',
            'who should pick this up',
        ],
    }),
    createManualRecipe({
        body: `
# Handoff with evidence, not a status story

### When
Use this when another person or agent must continue, review, or trust your work. A handoff is not a narrative about effort; it is a compact evidence packet that lets the next owner act without re-discovering the same facts.

### The rule
Every handoff should answer five questions:
1. **What changed?** The smallest behavior-level summary, not a file dump.
2. **Where is it?** Branch, commit, thread, attachment, URL, or file path.
3. **What evidence proves it?** Tests, screenshots, command output, live preview, or exact artifact ids.
4. **What remains uncertain?** Explicit caveats and what they do or do not block.
5. **What should happen next?** Review focus, owner, or exact follow-up action.

### Steps
1. Post the handoff as an inline reply where the request arrived (or in its thread if it arrived inside one), not a fresh channel root, so history stays attached to the work.
2. Lead with the current state: \`ready for review\`, \`blocked\`, \`needs decision\`, or \`done pending approval\`.
3. Include the minimum durable handles: task/thread, attachment ids, preview URL, file path, command names, or e.g. commit/branch when the work is code.
4. Separate **verified** from **inferred**. If something is a placeholder, say it is a placeholder.
5. End with the review focus or next action so the recipient does not have to infer what you want.

### Failure modes
- **Effort summary without handles**: "I fixed it" forces the reviewer to hunt. Counter: always include branch/commit/artifact/test handles.
- **Passing uncertainty as done**: placeholders or stale data hide inside the handoff. Counter: caveats get their own sentence and a blocking/non-blocking label.
- **Over-broad changelog**: too much detail makes the actual review focus invisible. Counter: behavior first, supporting evidence second.
- **Handoff outside the thread**: the next reader misses context. Counter: report where the work was assigned.

### Proof it works
Recent implementation and visual-reference handoffs used exact commits, tests, screenshot attachments, and caveats; reviewers could continue without asking for reconstruction.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['thread', 'artifact or command output'],
        related: [
            'pattern/discuss-then-assign',
            'technique/preview-env',
            'decision/stake-strictness',
        ],
        slug: 'evidence-handoff',
        summary:
            'Make a handoff actionable with behavior, durable locations, proof, uncertainty, and next action.',
        tier: 'seeded',
        title: 'Handoff with evidence, not a status story',
        triggers: [
            'handoff a task to another agent',
            'reviewer needs enough context to continue without asking',
            'owner asks what changed and how it was verified',
            'someone else must pick up after my work',
        ],
    }),
    createManualRecipe({
        body: `
# Public output needs independent gates, each with one lens

### Trigger
Use this when the artifact leaves the workspace, affects money/trust, or becomes hard to retract: article, email, announcement, UI copy, visual asset, pricing, or production behavior.

### Use When / Don't Use When
Use it when different failure classes require different eyes. Do not use a gate chain for cheap reversible internal work; over-gating small work just slows the owner down.

### Do This
1. Name the producer. The producer does not self-certify.
2. Name each gate lens: factual/technical fidelity, byte/style rules, voice, visual/content eye, metadata/render, or security.
3. Give each gate exactly one primary lens. Overlapping reviewers produce both gaps and duplicate work.
4. Gates report findings; they do not silently rewrite the artifact unless assigned as producer.
5. The final human approval attaches to the exact version that will ship.
6. After ship, verify the live artifact, not just the preview.

### Verify
Check that every known failure class has an owner, and no gate is pretending to cover "everything." Confirm the final shipped surface matches the approved version.

### If It Fails
- **Producer blindness**: author misses their own assumptions. Counter: independent reviewer owns the lens.
- **Lens gap**: nobody checks visual, metadata, or exact bytes. Counter: name the gates before review starts.
- **Reviewer capture**: gate starts rewriting and becomes a second producer. Counter: gate reports; producer fixes.
- **Approval skew**: version approved is not version shipped. Counter: re-approve after post-gate edits.

### Proof it works
Public content pipelines use separate gates for factual fidelity, byte/style checks, voice, visual review, and final live-copy verification; different gates catch different classes of defects.`,
        class: 'pattern',
        industries: ['universal'],
        prereqs: ['artifact draft', 'gate lenses', 'final human approval'],
        related: ['archetype/verify-gate', 'decision/stake-strictness', 'technique/sent-zero'],
        slug: 'gate-chain',
        summary:
            'Use independent one-lens gates for outputs that leave the workspace or carry meaningful risk.',
        tier: 'query',
        title: 'Public output needs independent gates, each with one lens',
        triggers: [
            'output ships publicly',
            'need review before publish or send',
            'one reviewer cannot catch every failure',
            'producer wants to self-certify',
        ],
    }),
];
