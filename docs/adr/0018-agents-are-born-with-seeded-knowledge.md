---
summary: Superseded decision to seed every Agent with practice notes, use archetype-driven creation, and make Cove optional.
read_when:
  - changing the workspace starter kit, seeded practice notes, or archetype lane notes
  - changing the agent-creation flow, its proposals, or default skill grants
  - changing the onboarding experience or the onboarding guide agent
---

# ADR 0018: Agents Are Born with Seeded Knowledge

## Status

Superseded by ADR 0021. The universal starter kit, archetype-driven creation,
optional Cove flow, and deferred Manual were mistakes. ADR 0021 retains
Agent-owned memory while replacing those decisions with Cove-only onboarding
knowledge and a shared Agent Manual.

## Decision

**Starter kit at creation.** When the runtime creates an agent it seeds the
fresh workspace with a starter `MEMORY.md` (name, role from the description,
a hooked index of the seeded notes, an empty Active Context) and
`notes/practices/` — the highest-frequency judgment calls for working on a
human-agent team, adapted near-verbatim from Raft's seeded recipe tier
(claim-before-work, stake calibration, sent=0 staging, evidence handoffs,
reminder discipline, recurring-run recovery, preview/artifact/video review,
team-shape advice) plus `save-as-a-skill.md`, which absorbs the skill-capture
habit dropped from the composed prompt at the flip (W2). Seeding never
touches a workspace that already has a `MEMORY.md`. A **full reset** wipes
back to this factory starter kit, not to an empty directory.

**Archetype-driven creation proposals.** The Members-page create menu offers
Raft's seven archetypes (operator, analyst, designer, writer, coordinator,
patrol, verify gate) plus the onboarding guide. A proposal supplies a
suggested handle, a one-line description (the role line, which rides every
envelope; voice now comes from the house personality and conversation style), and a workspace lane note with the archetype's lane design
and failure modes. Runtime-created Agents use the archetype only while creating
their workspace. Hosted Agents retain it as Server-owned configuration so a
Computer can apply the same seed when it first configures the Agent or
reconnects before configuration completes. Everything in the seeded workspace
remains editable.

**Onboarding is an agent, and Cove is the recommended first Agent.** The
Haus onboarding experience ships as the `guide` archetype — an Agent
modeled on Raft's Cindy, seeded with an adapted playbook (open practical,
route by intent, one next step per turn), a durable objectives file (status
contract with persistent refusal-memory and a consent-gated local setup-scan
toolbox), and an FAQ of reference patterns. There is no scripted onboarding
wizard. After the first Computer reports its installed Agent runtimes, the
setup flow offers **Cove** — the guide archetype with the blob avatar — and
requires the Owner to choose its Computer, Agent runtime, and model before
explicitly creating it through the normal Agent creation path. The Owner may
skip Cove and create another Agent. Haus never creates or recreates Cove
merely because a Server has zero Agents. Creating Cove also creates the normal
Owner-to-Cove DM, where onboarding begins; Haus does not seed Raft's special
private `#onboarding-owner` Channel.

**No Agent is bootstrapped outside the create path.** The lazy `agt_primary`
bootstrap is retired. Every agent — app-created, Cove, dev demo agents
(Otto/Wren), and the e2e fixture — is created through the one runtime create
path (`haus/agent-create.ts`) with generated prod-shape ids and the seeded
starter kit. Demo seeding resolves Otto/Wren by name on reseed; the blob
avatar is reserved for Cove, and dev demo agents get pinned non-blob
characters (Otto → robot, Wren → bird).

## Consequences

- App-created agents now receive the runtime's default seeded skills
  (previously the app passed an empty grant list). The pre-flip `tasks`
  skill left those defaults: its content teaches the retired `tasks_*` tool
  surface. Existing grants are untouched; full retirement of that skill is a
  separate cleanup.
- Seeded notes carry the full adapted cards, not summaries: Raft pairs
  seeded summaries with an on-demand `manual get` tier, which Haus defers
  (D7), so the notes must stand alone.
- Divergences from the Raft seed set: `login-with-raft` is excluded (no
  Haus service registry or agent-login until the WS6 era), and the cards'
  "Proof it works" sections are dropped — they cite another team's history,
  and seeding them would fabricate the agent's own memory.
- Sources live in `packages/agent-workspace/src/` (`starter-kit.ts`,
  `practice-notes.ts`, `archetype-notes.ts`, `guide-notes.ts`); the recipe
  corpus of record is `specs/raft-alignment/raft-recipes/`. Runtime and
  Computer both call this package; they do not maintain separate seed copies.
