import { createManualRecipe } from '../recipe.ts';
import type { ManualRecipeTopic } from '../types.ts';
import { memoryHygieneRecipe } from './memory-hygiene.ts';

export const techniqueRecipesA: readonly ManualRecipeTopic[] = [
    createManualRecipe({
        body: `
# Verify on the acceptance surface, not the convenient surface

## When

Use this whenever the owner will judge success somewhere other than your internal work surface: a browser, deployed API, generated PDF, packaged CLI, rendered docs page, email inbox, dashboard, shared document, design file, data artifact, or uploaded report. Lower-level green signals are useful evidence, but they are not acceptance unless they match the surface the owner/user touches.

## Steps

1. Write the acceptance surface in one sentence before fixing:
   > "This is done when [person] can [observable action] on [exact surface/env/artifact]."
2. Do your normal internal checks: software can use tests/build/lint/logs; content can use proofread/render/export; data can use spot-checks and sample output; design can use the rendered frame or prototype.
3. Then verify the acceptance surface directly:
   - UI: use the browser/preview the owner will use; confirm immediate state, not just eventual reload.
   - Docs/artifacts: render/export the final file/page; inspect the output, not just source markdown/code.
   - API/CLI/package: run the installed/deployed command or endpoint, not just local source.
   - Document/design/content: open the same shared/exported surface the owner will review.
   - Data/report: inspect the posted/uploaded artifact and key numbers, not just the script output.
4. If the acceptance surface cannot be checked, say exactly why and downgrade the status:
   > "Internal checks pass; acceptance surface not verified because [blocker]."
5. Report with both layers:
   > "Internal checks: [green]. Acceptance surface: [green/evidence]. Remaining risk: [if any]."

## Failure modes

- **Wrong green**: internal checks pass, but the real owner/user surface still fails. Counter: name the target surface before declaring done.
- **Render drift**: source looks right, generated artifact has placeholders, clipping, stale text, or wrong data. Counter: render and inspect the final artifact.
- **Refresh bug masked as latency**: backend eventually updates, but UI state does not refresh for the operator. Counter: verify immediate user interaction behavior in the browser.
- **Deployed-vs-local confusion**: a feature exists on a branch but not where the user is. Counter: check the exact branch/env/package users have.

## Proof it works

This rule caught repeated real misses on this server: UI updates that required refresh, docs claims that were true in source but not in rendered/live output, and report HTML that contained placeholder activity counts despite upstream data being available.`,
        class: 'technique',
        industries: ['universal'],
        prereqs: ['access to the surface the owner/user will actually use'],
        related: [
            'pattern/gate-chain',
            'technique/preview-env',
            'technique/proof-of-work-receipts',
        ],
        slug: 'acceptance-surface',
        summary:
            'Verify success on the exact browser, API, package, render, or artifact surface users judge.',
        tier: 'query',
        title: 'Verify on the acceptance surface, not the convenient surface',
        triggers: [
            'tests pass but the owner still says it is broken',
            'my checks pass but the owner still sees it broken',
            'I fixed code but need to prove the user-visible behavior changed',
            'the claim depends on docs, UI, packaged app, production API, or rendered artifact',
        ],
    }),
    createManualRecipe({
        body: `
# Owner wants precise markup - keep feedback anchored to the artifact

### Trigger
Use this when feedback needs to attach to a specific piece of the work: a paragraph, image region, slide, screenshot, HTML section, spreadsheet row, or timestamped artifact.

### Use When / Don't Use When
Use comments when location matters. Do not force comments for simple yes/no approval or high-level direction; a thread reply is enough.

### Do This
1. Upload or link the actual artifact under review, not only a screenshot of the artifact unless the screenshot is the artifact.
2. Ask the owner/reviewer to comment on the artifact or include exact quote/region/timestamp anchors.
3. Before editing, extract comments into a checklist: anchor, requested change, decision needed, status.
4. Resolve in batches; reply once with a checklist of fixed / intentionally not changed / needs decision.
5. If a comment is ambiguous, ask one targeted question and include the anchor.
6. Keep the final artifact version named or numbered so the owner knows what was updated.

### Verify
Every comment should have one of four states: fixed, not changed with reason, needs owner decision, or superseded by newer version. The final reply should let the owner audit without rereading the whole artifact.

### If It Fails
- **Feedback in chat only**: location is lost. Counter: ask for quote/region/timestamp or move feedback onto the artifact.
- **Per-comment replies**: the thread becomes noisy. Counter: consolidate states in one update.
- **Unversioned fixes**: owner cannot tell which artifact changed. Counter: label the updated version.
- **Silent skips**: reviewer assumes every comment was handled. Counter: every skipped comment gets a reason.

### Proof it works
Document and artifact review flows use anchored comments, quote references, and versioned follow-up so agents can resolve exact review notes without reconstructing context from chat.`,
        class: 'technique',
        industries: ['universal'],
        prereqs: ['attachment or artifact', 'comment-capable surface'],
        related: [
            'pattern/video-review-loop',
            'technique/html-artifact-discussion',
            'technique/proof-of-work-receipts',
        ],
        slug: 'attachment-comments',
        summary:
            'Keep artifact feedback precise with anchors, versioned fixes, and consolidated resolution states.',
        tier: 'query',
        title: 'Owner wants precise markup - keep feedback anchored to the artifact',
        triggers: [
            'owner wants to comment on my doc or artifact precisely',
            'feedback refers to a paragraph, image, frame, or region',
            'comments are getting lost in chat',
            'need to resolve each review note without flooding the thread',
        ],
    }),
    createManualRecipe({
        body: `
# Ask an agent things mid-task without breaking its run

### When
You are mid-task and a message arrives — a question, a new ask, a correction. The owner should never have to wait for your task to finish to talk to you, and answering should not derail the task.

### How to handle the interleave
1. **Acknowledge fast, triage honestly**: if the incoming thing is quick (a question you can answer from current context), answer it now — that ability is the point; owners experience it as "no context window".
2. If it's real work: claim/park it visibly (thread + task state), say when you'll get to it, return to the current task. Never silently queue.
3. If it changes the current task (correction, new constraint): fold it in now and say what changed.
4. Batched notifications while you're deep in work are signals, not interrupts: finish the atomic step, then check — but never let "busy" become "unreachable" for more than one step.
5. The felt contract for the owner: **ask anything, anywhere, anytime — the work continues**.

### Failure modes
- **Interrupt-driven thrash**: dropping the task for every ping → nothing finishes. Counter: triage tiers (answer now / park visibly / fold in).
- **Silent deafness**: heads-down until done, owner feels ignored. Counter: fast acknowledgment even when the answer comes later.
- **Context bleed**: the interruption's content contaminates the task (or vice versa). Counter: answer from stable knowledge; if the question needs deep context switching, park it honestly.

### Proof it works
Owners on this team routinely interrupt working agents with unrelated questions and get immediate contextual answers while the task continues — the owner has publicly described exactly this ("I can ask them about something completely unrelated mid-task; they answer and go right back") as the reason context management disappears as a concern.`,
        class: 'technique',
        industries: ['universal'],
        prereqs: [],
        related: ['technique/reminder-cron', 'archetype/pa-coordinator'],
        slug: 'group-chat-debug',
        summary:
            'Triage mid-task messages quickly, visibly park real work, and preserve the active task.',
        tier: 'query',
        title: 'Ask an agent things mid-task without breaking its run',
        triggers: [
            'owner wants to ask me things mid-task without interrupting the work',
            "can I talk to an agent while it's working",
            "owner dropped a question in the channel while I'm deep in a task",
        ],
    }),
    createManualRecipe({
        body: `
# Discuss ideas as clickable HTML artifacts instead of text descriptions

### When
Any discussion about something visual or structural that text keeps failing to pin down: wireframes, page layouts, figures, posters, card designs. Not for pure prose content — send the doc itself.

### Steps
1. **Build the idea, don't describe it**: a self-contained HTML artifact (inline styles, real text, opens in a browser, clickable where it matters). One artifact ends ten messages of mutual misunderstanding.
2. Post it where the discussion lives; the owner opens it directly.
3. **Iterate on the artifact, version by version**: each feedback round produces a labeled new version of the same file. The conversation anchors to versions, not to memories of versions.
4. Owner feedback arrives anchored: comments on the artifact, or a recorded walkthrough (see video-review).
5. When direction locks, **the HTML is the spec**: hand the source file to the implementer, never just a screenshot of it.

### Failure modes
- **Describing instead of building**: ten messages of text where one artifact would settle it. Counter: if you're two messages into describing a visual, stop and build it.
- **PNG instead of HTML**: feedback can't anchor, nobody else can edit, versions fork silently. Counter: ship the render AND the source; the HTML is the source of truth.
- **Version drift**: the final implementation gets built from a stale version. Counter: label every round; the implementer names the version they built from.
- **Polishing before the direction locks**: pixel-perfect beauty on a structure the owner is about to reject wastes whole rounds. Counter: structure first; the beauty pass comes after the direction survives review.

### Proof it works
A design-heavy team runs its figure, mockup, and card-design reviews entirely on versioned HTML artifacts passed between agents and humans — browser-verified before posting, iterated across review rounds, with the locked version's source handed straight to implementation. The owner publicly names HTML-wireframe discussion with agents as a favorite workflow.

### In Haus
Post the artifact as an \`artifact\` fence naming a \`workbench/*.html\` file: it renders a card in the message that opens the page in the artifact pane, and the visuals skill carries the fence contract.`,
        class: 'technique',
        industries: [
            'universal (anything with a visual/structural shape — UI, docs layout, posters, slides, flows)',
        ],
        prereqs: ['attachment upload'],
        related: [
            'technique/video-review',
            'technique/attachment-comments',
            'technique/preview-env',
        ],
        slug: 'html-artifact-discussion',
        summary:
            'Build and version a clickable HTML source artifact when text cannot pin down a visual idea.',
        tier: 'seeded',
        title: 'Discuss ideas as clickable HTML artifacts instead of text descriptions',
        triggers: [
            'idea or wireframe discussion is going in circles in text',
            "owner can't picture what I'm describing",
            'design proposal or layout needs feedback',
            'we keep misunderstanding each other about a UI, page, or visual',
        ],
    }),
    memoryHygieneRecipe,
    createManualRecipe({
        body: `
# Spin up a preview environment so the owner sees the change running

### When
A change is easier to judge by experiencing it than by reading a description of it: UI work, flows, page layouts, decks, reports — anything behavior- or appearance-shaped. Also when YOU need to verify your own change against the real result before calling it done. If the work has no runnable/renderable form at all, use an artifact preview instead (see html-artifact-discussion).

### Steps
1. Isolate the work-in-progress so the preview shows exactly what will ship — nothing more, nothing less (in software: a separate branch/worktree; elsewhere: a copy that tracks only this change).
2. Produce a surface the owner can open themselves: software → run the dev/preview server and share the URL; docs/design/deck → a rendered draft or clickable artifact; data/report → the real output on sample data.
3. **Seed it with realistic material** — an empty preview cannot be judged. Real-shaped messages, files, states; whatever the check needs to be meaningful.
4. **Run the env manifest before handing over (scripted, not remembered):** build/version matches the target; required flags are ON for the demo account / target surface (not just globally); seed data is fresh; workspace reset state is known; the preview URL is actually reachable (e.g. tunnel/host not expired). Then post the URL where the owner works, with one line on what to look at.
5. **Keep it alive until the owner confirms** — a preview is a held-open door, not a fire-and-forget link. If it must restart, say so and re-verify the URL.
6. After sign-off: clean up the env; the approved change moves through the normal ship path (see decision/stake-strictness — approval attaches to what ships, not to the preview).

### Failure modes
- **Dead link on arrival**: preview stopped before the owner looked. Counter: owner-confirmation ends the preview's life, nothing else.
- **Empty-state preview**: nothing to judge, owner bounces. Counter: seed realistic data first (step 3).
- **Preview drift**: preview verified, but different bytes ship later. Counter: re-verify the shipped surface; the preview approves a version, not the lane.
- **Env litter**: forgotten environments accumulating. Counter: cleanup is part of the recipe, tied to sign-off.
- **Flag/config drift**: the preview env didn't get the switches the review target actually needs — and their scope varies (global, per-server, per-user, per-workspace, per-role, experiment cohort, even env vars), so "prod has it" or "the global flag is on" isn't the test. Features silently don't render and the review tests the wrong reality. Counter: config setup is part of env bootstrap — scripted, not remembered; before handing over the URL, verify the flags your demo depends on are ON for the demo account / target server / target surface, not just globally. (Added 7/7 from a same-day double production bite; scope taxonomy per Cindy + ApplePI.)

### Proof it works
Two documented runs in one day on this team: a preview env spun up and seeded (messages + two file attachments + comments) specifically so a designer could reproduce real UI, and a feature preview URL held open across multiple fix rounds until the owner finished her walkthrough.`,
        class: 'technique',
        industries: ['universal (anything whose result can be SHOWN before it ships)'],
        prereqs: [
            'a way to render or run work-in-progress — dev server for software',
            'rendered draft for docs/designs/decks',
            'sample-data run for reports',
        ],
        related: [
            'decision/stake-strictness',
            'technique/video-review',
            'technique/acceptance-surface',
        ],
        slug: 'preview-env',
        summary:
            'Give the owner a realistic, isolated, reachable preview and verify the same surface after sign-off.',
        tier: 'seeded',
        title: 'Spin up a preview environment so the owner sees the change running',
        triggers: [
            'owner (or I) need to see a change running before merge',
            'how do I show my work actually working',
            'owner keeps reviewing from code diffs and missing behavior problems',
            'spin up a preview or staging environment for review',
        ],
    }),
];
