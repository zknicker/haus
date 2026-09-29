---
summary: Decision to require Cove during fresh-Server setup, seed onboarding knowledge only for Cove, and give every Agent a shared read-only Haus Manual.
read_when:
  - changing fresh-Server onboarding, Computer connection, or Cove creation
  - changing Agent workspace seeding, archetypes, or factory-managed skills
  - changing the Agent Manual, recipe corpus, or agent operating guidance
---

# ADR 0021: Cove Onboards; Agents Share a Manual

## Status

Accepted 2026-08-07 and amended 2026-08-29 to match Raft's current Cindy
factory layout. Supersedes ADR 0018 and the conflicting first-Agent and
onboarding-chat statements in ADR 0019. Existing Servers are not migrated.

Amended 2026-09-29 by [ADR 0037](0037-humans-are-addressed-by-mention.md): the `asks` Manual topic
is retired; asking a human is the @mention recipe.

## Context

Haus previously treated Raft's onboarding recipe summaries as a universal
workspace starter kit, promoted Raft's archetype reference cards into an Agent
creation field, deferred the shared Manual, and made Cove optional. That
deliberately shipped every Agent with practice files and a Haus-only
`save-as-a-skill` rule. It no longer matches the intended product or Raft's
current behavior.

Raft separates proactive onboarding from shared reference knowledge. Its
onboarding Agent receives private onboarding notes and concise summaries of
the highest-frequency recipes. The full recipe cards live in a server-hosted
Manual that every authenticated Agent can query. Ordinary Agents begin with an
otherwise empty workspace. Raft's archetype cards are Manual advice about
durable lanes, not Agent configuration.

## Decision

### Fresh Servers require Cove

A fresh Server enters a mandatory onboarding flow built with Haus's HeroUI
Pro design system and generated as a development-time starting point with
HeroUI Pro's AI UI tooling. The general App remains unavailable during setup.

The owner connects a Computer first. The first successful connection advances
to a **Meet Cove** step where the owner selects the runtime, model, and other
required execution settings. Submitting that step creates and configures Cove;
the Computer connection alone does not create an unconfigured Agent.

Cove is created exactly once with these factory profile values:

- name `Cove`
- handle `@cove`
- description `Onboarding Assistant`

Setup is not skippable. Completed steps persist, failures identify the exact
step that needs repair, and restart or reconnection resumes from that point.
Retries cannot create a second Cove or second onboarding Chat.

The Server may create the private onboarding Chat before Cove exists, but the
owner remains in the setup experience until Cove is durably created, seeded,
and startable. At that point the App unlocks into the onboarding Chat and a
Server-authored onboarding event wakes Cove. Cove produces the first greeting
as a real Agent turn; the Server does not post messages under Cove's identity.
A failed greeting exposes normal Agent retry and runtime repair without
returning the owner to earlier setup steps.

After setup, onboarding objectives are soft and persistent. Cove guides the
owner toward real work, a useful team, workstream Chats, and effective
collaboration without gating the App, forcing a checklist, or repeating an
explicitly declined suggestion.

### Only Cove receives onboarding workspace knowledge

Cove's factory workspace contains a root `MEMORY.md` plus a `notes/` directory
with:

- `onboarding_playbook.md`;
- `onboarding_knowledge_faq.md`; and
- `onboarding_objectives.md`, including concise summaries of the applicable
  seeded-tier recipes.

This matches Raft's onboarding Agent factory layout. The workspace remains
Agent-owned after creation; Haus does not create a `notes/recipes/` directory.

Raft's seeded tier has thirteen recipes. Haus seeds twelve summaries because
`login-with-raft` has no honest Haus analogue. Each summary is a short
bootstrap version that points Cove to its full Manual card; the full cards are
not copied into Cove's workspace.

An ordinary Agent receives only a minimal `MEMORY.md` containing its identity,
description-derived role, empty knowledge, and initial active context. It does
not receive practice files, recipe summaries, onboarding notes, or archetype
lane notes.

Cove becomes an ordinary deletable Agent after onboarding. Deleting Cove is
permanent and never triggers automatic recreation. A Cove full reset restores
the Cove factory workspace; an ordinary Agent full reset restores only its
minimal `MEMORY.md`.

### Every Agent can query the Haus Manual

Haus adds one release-owned, server-hosted, read-only **Haus Manual for
Agents**. Every authenticated Agent can use:

- `haus manual get <topic>`; and
- `haus manual search <keywords> [--scope recipes]`.

Both operations require short natural-language `intent` and `reason` values,
which the Server logs for observability. Agent guidance forbids credentials,
private URLs, raw prompts, message payloads, or other secrets in either field.
The Manual is an Agent API and CLI surface; this decision adds no human-facing
Manual browser.

The initial Manual contains:

- `index`;
- `haus-cli-overview`;
- `agent`, `asks`, and `cloud-agents` product reference topics;
- `recipes/index`;
- `recipes/seeded`; and
- thirty-two full recipe cards.

The cards comprise all thirty-three captured Raft Manual recipes except
`technique/login-with-raft`. They retain their classes, topic ids, delivery
tiers, substantive guidance, and valid cross-links. Raft nouns and commands
become Haus nouns and commands only where Haus has an analogous
capability. Unsupported claims are removed rather than approximated. The
twenty query-tier cards include all seven archetype cards; those remain
reference guidance available to every Agent.

The product pages are references, not additional recipe cards. They carry
Haus's own capability contracts — since ADR 0028, the `agent` page carries the
direct `haus agent create` path and its consent norm — without adding a
Haus-only decision policy to the captured Raft recipe corpus.

`haus-cli-overview` is the expandable operating guide. The universal Agent
prompt retains only mandatory operating rules and points Agents to this Manual
topic when deeper guidance is needed.

### Archetypes and the factory Haus skill are retired

Agent creation has no archetype field, picker, or automatic lane-note seed.
Agents are created from a name, description, Computer, runtime, model, and
other real execution settings. Team lanes emerge through work and guidance;
the Manual's archetype recipes may inform that conversation without becoming
stored Agent types.

The release-owned `haus-agent` skill is removed. Raft has no equivalent
skill: mandatory behavior belongs in the prompt, expandable product guidance
belongs in the Manual, and situational judgment belongs in recipe cards. The
Haus-only `save-as-a-skill` recipe is also removed; its proactive capture
policy is not part of the Raft-derived corpus.

This does not remove Haus's skill system. Each Agent keeps its isolated,
writable skill library and the `haus skill` create, view, patch, write-file,
and delete operations. Agent-authored skills persist, and specialized
release-owned skills such as `visuals` remain skills.

## Consequences

- Onboarding and ordinary Agent creation are intentionally different paths.
- Recipe content has one shared source of truth instead of workspace copies.
- Ordinary Agents start clean while retaining on-demand access to the complete
  operating corpus.
- Cove's private seed supplies proactive judgment and refusal-memory without
  making onboarding policy universal.
- Removing archetypes requires deleting the old creation field, UI, and lane
  seed path rather than retaining a compatibility branch.
- Fresh-Server setup, Cove creation, workspace seeding, and the first wake must
  be idempotent across disconnects, retries, and process restarts.
