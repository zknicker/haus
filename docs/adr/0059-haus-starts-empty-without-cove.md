---
status: accepted
summary: A new Server starts with the Haus project, zero Agents and zero other Projects. Cove, the onboarding Agent, and the whole fresh-Server setup flow are deleted. People connect a Device from Settings and create Captains with New Captain. The shared Haus Manual stays and every Agent reads it. An existing Cove becomes an ordinary Agent, and no data is deleted. Supersedes ADR 0021's Cove onboarding and amends ADR 0055 decision 9. Accepted 2026-11-19, not yet implemented.
read_when:
  - changing what a new Server starts with, or the first-run Home
  - changing Computer (Device) connection from Settings, or Agent (Captain) creation entry points
  - removing Cove, onboarding, factory workspaces, or the `cove-apply` protocol frames
  - changing the development seed
---

# ADR 0059: Haus Starts Empty, Without Cove

## Status

Accepted 2026-11-19. Not yet implemented. Supersedes the Cove onboarding parts of
[ADR 0021](0021-cove-onboards-and-agents-share-a-manual.md) ("Fresh Servers require Cove" and
"Only Cove receives onboarding workspace knowledge"). ADR 0021's shared Haus Manual stands.
Amends [ADR 0055](0055-projects-own-agents-and-tasks.md) decision 9.

## Context

Every new Server today runs a mandatory setup flow: the App stays locked until the Owner connects
a Computer and creates Cove, an onboarding Agent with a fixed identity, a factory workspace of
onboarding notes, and a private `#onboarding-owner` channel where it greets the Owner. Cove then
stays on as a chief of staff and offers a weekly review. Supporting that one Agent takes a Server
onboarding record and gate, a dedicated creation procedure, two Computer protocol frames, a
factory kind on every Agent, guidance refresh, identity locks, and a reserved handle.

Capy starts a workspace empty: no Captains, no projects, and a Home that tells you what to do
first. Haus is moving to Capy's model (ADRs 0054 to 0058), and every capability Cove offered is
either already in the App or available to every Agent through the Manual.

## Decision

1. **A new Server starts empty.** Creating a Server makes its first Owner and the Haus project
   (`#haus`, the home of generalists, [ADR 0055](0055-projects-own-agents-and-tasks.md)) and
   nothing else: zero Agents, zero other Projects, no Computer, no onboarding channel. The App
   opens straight into the Server. There is no setup gate, no setup phase, and no "the owner is
   still setting up" screen.

2. **The first-run Home says what to do next.** With no Captains it points the Owner and Admins
   to connect a Device (Settings → Devices) and create a Captain (New Captain), and members to
   wait for one. Once model logins are required ([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md),
   R6), it points to Settings → Models too.

3. **Connecting a Device lives in Settings.** Settings → Devices → Add device carries what setup
   did: the install and `haus-computer setup /<slug>` commands, live progress until the Device
   reports its runtimes, and plain repair copy when it reports no usable runtime or model, is
   incompatible, or disconnects. Device-code approval at `/computer/login` is unchanged.

4. **The first Captain is an ordinary Captain.** New Captain is the only way people create one,
   on every shell, for Owners and Admins. With no Device connected, the dialog links to
   Settings → Devices instead of a dead select.

5. **Nobody receives what no Agent hears.** A message no Agent hears under ADR 0055's rules
   reaches nobody, the same as in Capy. There is no guaranteed generalist.

6. **The Manual stays.** Every Agent keeps `haus manual get` and `haus manual search`, every
   recipe card, and topic `app` for "where is X in the App" answers. Agent-created Agents
   ([ADR 0028](0028-agents-create-agents-directly.md)) keep their Manual prerequisites. Only
   Cove's private copies go.

7. **Existing data is kept.** An existing Cove becomes an ordinary Agent with no special case:
   people can rename it, change its avatar, voice and style, move its home, and retire it like
   any Agent. Its Drive area, memory, notes, sessions and messages stay. An existing
   `#onboarding-owner` stays an ordinary channel with the same members and history, and can be
   archived or deleted like any other. Past turns caused by onboarding keep their cause in
   Activity; none are written again.

8. **The machinery goes.** The Server onboarding record and gate, `server.createCove`, the
   `cove-apply` and `cove-apply-result` Computer frames (with a protocol bump), the Agent
   factory kind and applied-at fields, the `onboarding` inbox source and turn cause, the identity
   locks, the reserved `cove` handle, Cove's factory workspace and its guidance refresh, the
   Cove avatar's product role, and every Cove-only test. An existing Cove keeps `@cove`; the
   handle is simply no longer reserved.

9. **The development seed keeps its demo.** `/dev` still seeds Blippy, Tiny, `#haus` and
   `#product`. Cove and `#onboarding-owner` leave the seed, and the inbox, showcase and
   automation seeds anchor on the demo Agents and the dev Computer's attachment instead.

## Capabilities

Every capability Cove and onboarding offer today, and where it goes. Nothing in the "Removed"
column has a replacement, on purpose.

| Today | Goes to | Removed |
| --- | --- | --- |
| Setup gate on the Server route | nothing; the Server opens | yes |
| Connect the first Computer, with progress and repair copy | Settings → Devices → Add device (decision 3) | |
| Require a usable runtime and model before continuing | the Captain dialog lists only reported options; links to Devices when there are none | |
| Create the first Agent (Meet Cove) | New Captain (decision 4) | |
| Model logins | never part of onboarding; Settings → Models (R6) | |
| Private `#onboarding-owner` and Cove's greeting there | a new Agent greets in the Haus project, as today | the onboarding channel and wake |
| Guided onboarding conversation (playbook, FAQ, objectives, seeded-recipe summaries) | the Manual, which every Agent reads | the proactive script |
| "Where is X in the App" | Manual topic `app` | |
| Chief-of-staff weekly review offer and its coordination note | any Agent on request, through reminders and the coordinator and patrol recipes | the unprompted offer |
| Agent creation guidance | Manual `agent` topic and `haus agent create` | Cove's copy |
| Factory guidance refresh and per-turn Cove notices | nothing | yes |
| Full Reset restoring Cove's factory workspace | already gone: Full Reset keeps Drive for every Agent ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)) | |
| Cove's locked identity and the reserved `cove` handle | an ordinary editable Agent | yes |
| Seeded skills | unchanged; `visuals` goes to every Agent | |

## Considered and rejected

- **Keep Cove but make it optional.** ADR 0018 tried that. An optional built-in Agent still needs
  every piece of the machinery, and Capy shows the empty start works.
- **Seed one ordinary starter Agent.** It would still be the Server choosing a model, a Device and
  a role for the Owner before they have one, and it hides that Captain creation is the product.
- **Delete existing Coves and onboarding channels.** They hold people's history and work.

## Consequences

Amended:

- [ADR 0021](0021-cove-onboards-and-agents-share-a-manual.md): "Fresh Servers require Cove" and
  "Only Cove receives onboarding workspace knowledge" are superseded. Ordinary Agents' minimal
  workspace, the Manual, and the retired archetypes and `haus-agent` skill stand.
- [ADR 0055](0055-projects-own-agents-and-tasks.md) decision 9: "Cove lives here" goes. The Haus
  project holds the generalists people put there, and may hold none.

Follow-up docs, each updated in the slice that changes the behavior:

- Delete `docs/features/onboarding.md` and `docs/plans/cove-coordination.md`.
- Edit `specs/projects.md` (Generalists, migration), `specs/inbox.md` (the `onboarding` lane),
  `specs/runtime-drivers.md` (`cove-apply`), `specs/workspace.md`, `specs/haus-cli.md`,
  `specs/agent-profile.md`, `docs/features/agents.md`, `docs/api/agents.md`,
  `docs/operations/testing.md`, `docs/operations/development.md`, and the prompt divergence
  register rows that cite Cove.
- The composed Agent system prompt has no Cove text, so its cap does not move.
