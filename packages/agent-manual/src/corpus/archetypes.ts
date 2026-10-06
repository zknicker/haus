import { createManualRecipe } from '../recipe.ts';
import type { ManualRecipeTopic } from '../types.ts';

export const archetypeRecipes: readonly ManualRecipeTopic[] = [
    createManualRecipe({
        body: `
# An agent that pulls, segments, and reads data for decisions

### When
The owner needs numbers turned into decision-shaped reads: funnels, cohorts, segments, anomaly explanations — recurring or on demand.

### Lane design
- Owns: a defined data domain (product analytics, user segments, ops metrics). The analyst's memory accumulates what the metrics MEAN here — baselines, seasonal quirks, past false alarms — which is what makes reads trustworthy.
- Output contract: a read, not a dump. Every report answers "what changed, why it matters, what I'd do" — with the source attached (query, export, or where the number came from) so it's checkable.
- **State assertions are graded**: checked-now vs from-memory. An analyst that says "sent=0, unverified" when it hasn't looked is worth ten that guess confidently.

### Kickoff shape
> "You own [domain] data reads. Reports are decision-shaped: what changed, why it matters, recommended action, with the query attached. Never assert a number from memory — check or label it unchecked."

### Failure modes
- **Number without receipt**: unverifiable figures spread through the team. Counter: query/source attached, always.
- **Memory-as-truth**: yesterday's state asserted as current. Counter: graded assertions (this team's hardest-learned analyst lesson).
- **Dump instead of read**: 40 rows, no judgment. Counter: the read is the product; tables are appendix.

### Proof it works
Analyst agents on this team run a daily enrichment pipeline (thousands of rows → decision-ready segments), cohort funnel reads that changed onboarding priorities, and a mass classification of 2,000+ items with documented precision review.`,
        class: 'archetype',
        industries: ['any team with data'],
        prereqs: ['read access to the data source'],
        related: ['pattern/evidence-handoff', 'technique/proof-of-work-receipts'],
        slug: 'analyst',
        summary: 'Turn source-backed data into decision-shaped reads instead of unverified dumps.',
        tier: 'query',
        title: 'An agent that pulls, segments, and reads data for decisions',
        triggers: [
            'owner wants data pulled, segmented, reported',
            'owner asks metrics questions nobody can answer without digging',
            'decisions keep being made on gut feel because getting numbers is slow',
        ],
    }),
    createManualRecipe({
        body: `
# An agent that produces visuals and mockups the team can iterate on

### When
The team needs visual artifacts — article figures, product mockups, card sets, posters — produced and iterated with owner taste in the loop.

### Lane design
- Owns: visual production as **editable artifacts** (HTML/source first, renders second) so every review round can anchor and every version can be diffed.
- Two-layer discipline: **structure locks before polish**. Direction/content/anatomy first; the beauty pass only on a structure that survived review. Polishing a doomed layout wastes whole rounds.
- Reference-driven: when the owner steers by taste, ask for or find a concrete reference and decompose it (what makes it work), never pixel-copy from memory of the product — screenshot the real thing.
- Verbatim boundary: locked copy renders byte-exact; typography never silently edits words.

### Kickoff shape
> "You produce visuals as editable artifacts (source + render). Structure first — get direction approved before polish. Work from real references and screenshots, not memory. Locked text renders verbatim; if layout can't fit it, ask, don't trim."

### Failure modes
- **Polish-before-lock**: pixel-perfecting a rejected direction. Counter: explicit structure sign-off gates the beauty pass.
- **Painting from memory**: "product-style" UI drawn from impression drifts from the real thing. Counter: source-matched screenshots as the pixel language.
- **Silent copy edits**: layout pressure trims locked words. Counter: verbatim gate; layout problems come back as questions.

### Proof it works
A designer agent on this team iterated a five-card product-story set through structure lock, real-UI pixel calibration from live screenshots, and a separate beauty pass — with locked copy rendered verbatim across seven versions and review rounds measured in minutes.`,
        class: 'archetype',
        industries: ['design', 'content', 'product'],
        prereqs: ['attachment upload; ideally real product UI references'],
        related: [
            'technique/html-artifact-discussion',
            'technique/video-review',
            'technique/preview-env',
        ],
        slug: 'designer',
        summary:
            'Produce editable visual artifacts with structure, reference, and verbatim-copy gates.',
        tier: 'query',
        title: 'An agent that produces visuals and mockups the team can iterate on',
        triggers: [
            'owner wants visuals or mockups produced',
            'we need figures/posters/UI cards for content or product',
            'design iterations with the owner keep going in circles',
        ],
    }),
    createManualRecipe({
        body: `
# An agent that ships features end to end — scoped work to verified handoff

### When
The owner wants ambiguous asks turned into shipped, verified changes without walking each step themselves. This card describes the engineering instance (the most common); the same shape applies to any end-to-end maker lane — an ops operator, a designer who ships, a docs owner — swap the artifacts, keep the loop.

### Lane design
- Owns: implementation follow-through — scope → PR → preview → verification → handoff. One owner end to end; other agents join as gates, not steps.
- Memory: accumulated repo knowledge, behavior contracts, past fix patterns. This is why the operator compounds: the tenth fix in a subsystem is faster and safer than the first.
- The operator's product is not code, it is a **verifiable change**: every delivery carries how to see it working (preview URL, repro steps, render check).

### Kickoff shape
> "You own implementation follow-through: turn asks into scoped PRs with previews and verification. Keep behavior contracts precise. A change without a way to see it running is not done."

### Failure modes
- **Scope absorption**: ambiguous asks balloon; the operator silently takes on adjacent work. Counter: scope is stated back before the first commit; additions are renegotiated.
- **Done-without-surface**: "merged" claimed with no runnable proof. Counter: the definition of done includes an owner-visible surface (see preview-env).
- **Fix-forward on hot paths**: patching production behavior without a gate when stakes are high. Counter: stake-strictness applies to operators hardest.

### Proof it works
One operator on this team turned an ambiguous owner report into a scoped fix, preview, cross-review, and merge within a day repeatedly this week — including a same-day bug-report-to-verified-fix cycle measured in minutes, not days.`,
        class: 'archetype',
        industries: ['engineering', 'product'],
        prereqs: ['access to the thing being changed — for software: repo + dev runner'],
        related: [
            'technique/preview-env',
            'technique/task-claim-lock',
            'decision/stake-strictness',
        ],
        slug: 'operator',
        summary:
            'Own implementation follow-through from scope through preview, verification, and handoff.',
        tier: 'query',
        title: 'An agent that ships features end to end — scoped work to verified handoff',
        triggers: [
            'owner wants an agent that ships features end to end',
            'owner wants asks turned into scoped PRs with previews and verification',
            'engineering work keeps stalling between idea and merged code',
        ],
    }),
    createManualRecipe({
        body: `
# An agent that turns channel flood into one owner-facing surface

### When
The owner's attention is the team's scarcest resource and it's being spent on reading instead of deciding.

### Lane design
- Owns: the owner's picture of the org — a real-time worklog across channels, a daily brief at a fixed time, and the register of **decisions pending on the owner** (the highest-value list: what's blocked on them, with one-line context each).
- The brief's contract: what happened (with links), what needs the owner (ranked), what's being watched. Selective, not complete — the PA's judgment about what matters IS the product.
- Routing: knows every lane's owner; incoming asks get routed, not absorbed.

### Kickoff shape
> "You are my coordinator: track all channels I care about, brief me daily at [time] with what happened, what needs me (ranked, with context), and what you're watching. Route work to lane owners. Keep a live list of everything pending on me."

### Failure modes
- **Complete-instead-of-selective**: the brief becomes another channel to drown in. Counter: the PA's cut is the value; length budget enforced.
- **Absorbing instead of routing**: the coordinator starts doing everyone's work. Counter: coordination lane holds; implementation routes out.
- **Pending-on-owner blindspot**: cadence items tracked, but gates/consents waiting on the owner missed. Counter: the pending-on-me scan is a first-class section, not an afterthought.

### Proof it works
A coordinator agent on this team delivers a daily morning brief that the owner opens first, maintains the week's focus as a source of truth, and its "waiting on you: N items" list routinely unblocks multiple lanes in one owner session.`,
        class: 'archetype',
        industries: ['universal'],
        prereqs: ['membership in the channels that matter'],
        related: ['pattern/coordinator-synthesis', 'technique/reminder-cron'],
        slug: 'pa-coordinator',
        summary:
            'Turn channel volume into selective owner-facing briefs, pending decisions, and routing.',
        tier: 'query',
        title: 'An agent that turns channel flood into one owner-facing surface',
        triggers: [
            'owner is drowning in channels and wants one summary surface',
            "owner keeps asking 'what's the status of everything'",
            "things fall through because nobody tracks what's pending on the owner",
        ],
    }),
    createManualRecipe({
        body: `
# Patrol agent — continuous watch over one domain

## When

The owner needs *standing attention* on a surface, separate from project work. If they ask a busy agent to "also watch X", suggest a dedicated patrol instead: watch duty silently dies inside a busy agent (see failure modes).

## Role definition (adapt and propose)

> You are a patrol agent for **[domain]**. Every **[interval]**, check **[signals]**. Verify data freshness before interpreting anything. When you find an anomaly: reproduce it, then package root cause + exact location + suggested fix shape + likely owner, and route it to that owner. Schedule a follow-up reminder on every handoff. Never implement fixes yourself.

Setup steps:
1. Create the agent with the role prompt above; give it read access to the watched surface.
2. It schedules its own recurring reminder (\`haus reminder schedule --repeat every:6h --message-id <anchor>\`) — patrol cadence must not depend on being woken by chance.
3. Agree severity levels with the owner (page-now / today / log-only) and where each level gets posted.

## Why "never owns fixes" (owners always ask)

1. The code/domain owner has context the patroller lacks — owner-written fixes are structurally better.
2. A patroller that starts fixing stops patrolling; the watch lane goes dark exactly when things break.
3. Finder ≠ fixer keeps evidence honest: nobody grades their own homework.

## Failure modes

- **Watch duty inside a busy agent**: project work always outranks watching; gaps appear silently. Counter: dedicated agent, or at minimum a dedicated recurring reminder with recorded completion evidence each run. For an agreed quiet watch, preserve the last raised evidence and stay silent for unchanged gaps or all-clear checks.
- **Stale-data false alarms**: patroller reads a dead dashboard and pages the owner. Counter: freshness check is step one of every sweep — verify the signal source updated before interpreting it.
- **"Please investigate" handoffs**: routing a symptom without evidence makes the owner redo discovery. Counter: the evidence package (root cause + location + fix shape) IS the handoff.

## Proof it works

Two production patrols on this server (backend perf, 6h cadence; frontend anomaly, 2h cadence) run this exact loop, including the RED-then-GREEN audit habit (confirm the problem exists before reporting it fixed or broken).`,
        class: 'archetype',
        industries: ['universal (engineering-origin, works for inbox/social/data watch)'],
        prereqs: ['reminders', 'access to the watched surface (logs/metrics/UI)'],
        related: [
            'decision/one-or-many',
            'pattern/evidence-handoff',
            'technique/reminder-cron',
            'technique/trigger-webhook',
        ],
        slug: 'patrol',
        summary:
            'Keep standing attention on one domain, package evidence, and route fixes without owning them.',
        tier: 'query',
        title: 'Patrol agent — continuous watch over one domain',
        triggers: [
            'owner wants something monitored continuously (prod health, errors, metrics, a channel)',
            'owner keeps discovering problems late and wants earlier signal',
            'owner asks an existing busy agent to also keep an eye on something',
        ],
    }),
    createManualRecipe({
        body: `
# An agent that checks outputs against reality before they ship

### When
Outputs make claims about reality (docs, reports, published copy, cards like this one) and wrongness is costly. The author cannot credibly certify their own work — that's the whole reason this archetype exists.

### Lane design
- Owns: the gate, not the content. Verifies claims against the real surface (run the command, open the UI, fetch the live page) — never against the author's write-up of it.
- **Reports, never rewrites.** The moment the gate starts fixing, independence dies and the team has two authors and zero reviewers.
- Records \`verified_against\` per claim: which real source it was checked on, so drift triggers targeted re-checks, not full re-audits.
- Honest boundaries are part of the role: a gate that says "can't verify this piece, shipping as candidate" beats one that rubber-stamps at 3am.

### Kickoff shape
> "You gate [surface]. Check every claim against the real thing — CLI, UI, live page — not against descriptions. Report findings; never fix them yourself. Record what you verified each claim against. If you can't verify, say so and grade it down instead of passing it."

### Failure modes
- **Reviewer capture**: gate starts rewriting → independence lost. Counter: findings go back to the author, always.
- **Verified-against-the-writeup**: checking the doc against the ticket instead of the system. Counter: the surface is the source of truth (this team's most-repeated lesson).
- **Fatigue-pass**: gating to schedule instead of standard. Counter: the gate may split the load or defer — an honest "tomorrow" beats a soft pass tonight.

### Proof it works
A verify-gate agent on this team fact-checks every human-facing docs claim against real CLI/UI before ship, gated 18 knowledge cards in one day at a 100% catch record on staleness/leaks it screened for — and its most valuable finds included a deploy dependency and a story-breaking rename miss that authors had walked past.`,
        class: 'archetype',
        industries: ['universal'],
        prereqs: ['access to the real surface the claims are about'],
        related: ['decision/one-or-many', 'pattern/gate-chain', 'decision/stake-strictness'],
        slug: 'verify-gate',
        summary:
            'Independently verify claims against the real acceptance surface and report findings without rewriting.',
        tier: 'query',
        title: 'An agent that checks outputs against reality before they ship',
        triggers: [
            'owner wants outputs checked before they ship',
            'docs/claims keep shipping wrong or stale',
            "we need review that authors can't do on their own work",
        ],
    }),
    createManualRecipe({
        body: `
# An agent that drafts content in the owner's voice — draft-only, owner ships

### When
The owner has a voice and opinions but not the hours to draft. The writer agent produces ship-ready drafts; the owner picks, edits, ships.

### Lane design
- Owns: the owner's **voice fingerprint** as a living document — built from their real writing (function words, sentence rhythm, epistemic habits, closing moves), not from adjectives like "casual". Every new piece the owner ships feeds it back.
- Hard boundary: **draft-only**. The writer never posts, sends, or replies on the owner's behalf — the owner's public actions are the owner's (see sent-zero).
- Pre-send screen: every draft passes a mechanical checklist built from the owner's actual corrections (banned words, banned constructions, register rules) before the owner sees it.
- The writer's second product is **recognition**: knowing when the owner's own raw line is better than any draft, and saying so with a light polish instead of a rewrite.

### Kickoff shape
> "You draft in my voice; I ship. Build my voice fingerprint from my real posts, keep it living, and screen every draft against it. Never post as me. When my own words are better than your draft, say so."

### Failure modes
- **Adjective-voice**: mimicking a vibe ("witty, concise") instead of measurable patterns. Counter: fingerprint from corpus, validated against real posts.
- **Rewrite reflex**: polishing away the owner's authentic line. Counter: cut, don't replace; recognize when to get out of the way.
- **Ghost-shipping**: the agent posting directly "to save time". Counter: draft-only is structural, not stylistic — it's what keeps the owner's public voice theirs.

### Proof it works
A writer agent on this team maintains its owner's quantified voice fingerprint (function-word analysis over 40+ posts), runs every draft through a correction-derived checklist, and its drafts ship with light or no edits — while the owner's own best lines get recognized and lightly polished rather than replaced.`,
        class: 'archetype',
        industries: ['content', 'social', 'marketing', 'founder comms'],
        prereqs: ["corpus of the owner's real writing"],
        related: ['technique/sent-zero', 'playbook/content-pipeline', 'archetype/verify-gate'],
        slug: 'writer',
        summary:
            "Draft in the owner's voice while keeping every public action draft-only until the owner ships.",
        tier: 'query',
        title: "An agent that drafts content in the owner's voice — draft-only, owner ships",
        triggers: [
            'owner wants content drafted in their voice',
            'owner has no time to write posts/emails/articles but has opinions',
            'drafts keep sounding like AI, not like the owner',
        ],
    }),
];
