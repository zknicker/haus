---
status: accepted
summary: A new Server starts empty, with its first Owner and the team room `#all` only. No Project, no Agent, no Computer, and no generalists; `#all` is the only channel that is not a Project. Cove, the onboarding Agent, and the whole fresh-Server setup flow are deleted. People connect a Device from Settings and create Captains with New Captain. The shared Haus Manual stays and every Agent reads it. An existing Cove becomes an ordinary Agent, and no history is deleted. Supersedes ADR 0021's Cove onboarding and amends ADR 0028 and ADR 0055 decisions 1 and 9. Accepted 2026-11-19, amended 2026-11-20.
read_when:
  - changing what a new Server starts with, or the first-run Home
  - changing Computer (Device) connection from Settings, or Agent (Captain) creation entry points
  - removing Cove, onboarding, factory workspaces, or the `cove-apply` protocol frames
  - changing the development seed
---

# ADR 0059: Haus Starts Empty, Without Cove

## Status

Accepted 2026-11-19. Amended 2026-11-20 after a council review: `#all` is the team room and not a
Project, a new Server creates no Project, and generalists go.
Supersedes the Cove onboarding parts of
[ADR 0021](0021-cove-onboards-and-agents-share-a-manual.md) ("Fresh Servers require Cove" and
"Only Cove receives onboarding workspace knowledge"). ADR 0021's shared Haus Manual stands.
Amends [ADR 0028](0028-agents-create-agents-directly.md) (Cove's protected identity, its `channel
add` exclusion, and its separate onboarding greeting) and
[ADR 0055](0055-projects-own-agents-and-tasks.md) decisions 1 and 9.

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

1. **A new Server starts empty.** Creating a Server makes its first Owner and the everyone channel
   `#all`, and nothing else: zero Agents, zero Projects, no Computer. The App opens straight into
   the Server. There is no setup gate, no setup phase, and no "the owner is still setting up"
   screen.

2. **The first-run Home says what to do next.** It points Owners and Admins to create a Project
   (New project), connect a Device (Settings → Devices) and create a Captain (New Captain), in that
   order, since a Captain needs a home Project. Members wait. Once model logins are required
   ([ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md), R6), it points to
   Settings → Models too.

3. **Connecting a Device lives in Settings.** Settings → Devices → Add device carries what setup
   did: the install and `haus-computer setup /<slug>` commands, live progress until the Device
   reports its runtimes, and plain repair copy when it reports no usable runtime or model,
   reports an invalid inventory that needs a Haus Computer upgrade, is incompatible, or
   disconnects. Device-code approval at `/computer/login` is unchanged.

4. **The first Captain is an ordinary Captain.** New Captain is the only way people create one,
   on every shell, for Owners and Admins. It asks for the Captain's home Project, and with no
   Project it points to New project first. While Agents run on Computers, the dialog lists the
   connected Devices' reported runtimes and models, and with no Device connected it links to
   Settings → Devices instead of a dead select. New task with zero Captains is hidden or points
   to New Captain, never an empty Captain select.

5. **`#all` is the team room.** `#all` is the team room and the only channel that is not a Project,
   by design. Every Agent hears `#all`; it is for talking to the whole team, and work lives in
   Projects. No Agent is homed there. A Project with no home Agent hears only @mentions. There are
   no generalists.

6. **The Manual stays.** Every Agent keeps `haus manual get` and `haus manual search`, every
   recipe card, and topic `app` for "where is X in the App" answers. Agent-created Agents
   ([ADR 0028](0028-agents-create-agents-directly.md)) keep their Manual prerequisites. Cove's
   product FAQ answers that are still true (what a Computer and its files give an Agent, privacy
   boundaries, an Agent that does not respond, the iPhone app) move into topic `app`, so every
   Agent can give them. Only Cove's private copies go. The Drive `haus/` area stays as the
   Server's shared team files; it is not a channel and needs no Project.

7. **Existing data is kept.** An existing Cove becomes an ordinary Agent with no special case:
   people can rename it, change its avatar, voice and style, move its home, and retire it like
   any Agent. Its Drive area, memory, notes, sessions and messages stay. An existing
   `#onboarding-owner` becomes an ordinary Project under ADR 0055, with its members and history
   unchanged. Haus has no private channels, so anyone on the Server can join it, and it can be
   archived or deleted like any other. An existing Server's Haus project becomes an ordinary
   `#general` Project with its key, Tasks and history; Agents homed there move to the Project they
   are most active in, else `#general`. `#all` keeps its messages and members.
   Past turns and inbox items caused by onboarding keep their `onboarding` cause: haus-api, the
   Server and the App still read and show it.

8. **The machinery goes.** The Server onboarding record and gate, `server.createCove`, the
   `cove-apply` and `cove-apply-result` Computer frames (with a protocol bump), the Agent
   factory kind and applied-at fields, every writer of a new `onboarding` wake or turn trigger,
   the identity locks, the reserved `cove` handle, Cove's factory workspace and its guidance
   refresh, the Cove avatar's product role, and every Cove-only test. Unsettled `onboarding`
   inbox items are retired by migration; seen ones and turn triggers stay. An existing Cove keeps
   `@cove`; the handle is simply no longer reserved.

9. **The development seed keeps its demo.** `/dev` still seeds Blippy, Tiny, `#all` and
   `#product`. Cove and `#onboarding-owner` leave the seed, and the inbox, showcase and
   automation seeds anchor on the demo Agents and the dev Computer's attachment instead. The
   seed creates `#all` as a chat and `#product` as a Project, the home of Blippy, Tiny and the demo
   Tasks.

Decisions 3 and 4 describe today's Agents, which run on Computers. After
[ADR 0057](0057-agents-run-on-the-server-and-machines-run-their-tools.md) R4 and R6, a Captain's
model comes from Settings → Models, and New Captain no longer depends on Device-reported models;
a Device is only where its tools run.

## Capabilities

Every capability Cove and onboarding offer today, and where it goes. Nothing in the "Removed"
column has a replacement, on purpose.

| Today | Goes to | Removed |
| --- | --- | --- |
| Setup gate on the Server route | nothing; the Server opens | yes |
| Connect the first Computer, with progress and repair copy (empty, invalid, incompatible, disconnected) | Settings → Devices → Add device (decision 3) | |
| Require a usable runtime and model before continuing | until R4: the Captain dialog lists only reported options and links to Devices when there are none; after R4 and R6: Settings → Models | |
| Create the first Agent (Meet Cove) | New Captain (decision 4) | |
| Model logins | never part of onboarding; Settings → Models (R6) | |
| Private `#onboarding-owner` and Cove's greeting there | a new Agent greets in `#all`, as today | the onboarding channel and wake |
| Guided onboarding conversation (playbook, objectives, seeded-recipe summaries) | the Manual, which every Agent reads | the proactive script |
| Cove's product FAQ (Computer and file access, privacy, an unresponsive Agent, mobile) | Manual topic `app` (decision 6) | |
| "Where is X in the App" | Manual topic `app` | |
| Chief-of-staff weekly review offer and its coordination note | any Agent on request, through reminders and the coordinator and patrol recipes | the unprompted offer |
| Agent creation guidance | Manual `agent` topic and `haus agent create` | Cove's copy |
| Factory guidance refresh and per-turn Cove notices | nothing | yes |
| Full Reset restoring Cove's factory workspace | already gone: Full Reset keeps Drive for every Agent ([ADR 0054](0054-drive-holds-what-agents-know-and-follow.md)) | |
| Cove's locked identity and the reserved `cove` handle | an ordinary editable Agent | yes |
| Past onboarding turns and inbox items | still read and shown with their `onboarding` cause | |
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
- [ADR 0028](0028-agents-create-agents-directly.md): `agent update`, `agent avatar` and `channel
  add` no longer refuse on Cove, and no Agent skips the creation greeting for an onboarding wake.
- [ADR 0055](0055-projects-own-agents-and-tasks.md) decision 1: `#all` stays the everyone
  channel and is not a Project. Decision 9 (generalists) is withdrawn for decision 5 here.

Follow-up docs, each updated in the slice that changes the behavior:

- Delete `docs/features/onboarding.md` and `docs/plans/cove-coordination.md`.
- Edit `specs/projects.md` (creation and migration lines with this amendment; Generalists
  and the Haus project in the slice that removes generalists in code), `specs/inbox.md` (the `onboarding` lane),
  `specs/runtime-drivers.md` (`cove-apply`), `specs/workspace.md`, `specs/haus-cli.md`,
  `specs/agent-profile.md`, `docs/features/agents.md`, `docs/api/agents.md`,
  `docs/operations/testing.md`, `docs/operations/development.md`, and the prompt divergence
  register rows that cite Cove.
- `docs/proposals/capy-product-model.md`, `docs/api/manual.md` and `specs/agent-activity.md` are
  updated with this ADR.
- The composed Agent system prompt has no Cove text, so its cap does not move.
