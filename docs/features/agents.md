---
summary: Hosted Agent creation, configuration, execution ownership, and product surfaces.
read_when:
  - changing Agent creation, profiles, assignment, skills, models, or lifecycle
  - changing the Server and Computer ownership boundary for Agents
---

# Agents

Agents are Server members whose execution runs on an assigned Haus Computer.

## Ownership

The Server owns Agent identity, memberships, desired runtime, model, and reasoning effort,
Computer assignment, connection grants, and canonical Chats. Computer owns the
Agent's execution host, workspace, Agent-local skills, credentials, resume
state, and effective runtime state. Server retains only reported skill
metadata for offline display.

An Agent remains assigned to one Computer for its lifetime. The App changes
desired configuration through Server APIs; it never chooses workspace paths or
writes Computer-local files.

## Agent creation

A new Server starts with no ordinary Agents. Once an attached Computer reports
its runtime and model inventory, an Owner or Admin can choose the Computer,
runtime, and model, then create an Agent with a name and optional description,
reasoning effort, and avatar. The same deterministic creation dialog opens
from two ingresses: the "+" action on the sidebar's Direct messages group
header, and the `+` action on the Agents section header of Settings →
Members.

Creation adds the Agent to every current human member's implicit DM roster. It
does not create an Owner DM or any other Chat row. There is no archetype field,
picker, automatic lane-note seed, or special creation
path in this contract. Fresh-Server Cove onboarding is a separate setup flow;
see [ADR 0021](../adr/0021-cove-onboards-and-agents-share-a-manual.md).

Computer seeds an ordinary Agent's fresh workspace with only a minimal
`MEMORY.md`: identity, description-derived role, empty knowledge, and initial
active context. Practice files, recipe summaries, onboarding notes, and
archetype notes come from neither creation nor reset. Shared guidance belongs
in the Haus Manual, while the Agent's own work may add files later.

The skill system remains Agent-owned and writable, but there is no factory
`haus-agent` skill. Mandatory operating rules live in managed instructions,
shared reference guidance lives in the Manual, and the only current
factory-managed skill is `visuals`; see [Skills](skills.md).

## Product surfaces

- An Agent's profile is its own destination at `/s/:slug/agents/:agentId/:tab`, in the Server
  layout beside Usage rather than inside Settings. Its header states the Agent's photo, name, role,
  and current availability, offers **Edit Profile** for an ordinary Agent, and holds one overflow
  menu of lifecycle verbs — Stop, Restart, Start fresh session, Full reset, Delete Agent — for
  Owners and Admins. Members see the header without that menu.
- The profile has five tabs. **Overview** reads: a glance strip of the assigned Computer, model,
  Chats, Automations, Skills, and Connections, each the doorway to what owns it; one 30-day
  processed-token tile; the newest turns; and the Chats this Agent belongs to. **Setup** configures:
  identity facts, model and runtime, Connection grants, and Skills. **Automations** carries
  Reminders and Triggers, **Activity** the turn-by-turn execution history, and **Workspace** the
  Agent's files.
- Tab changes keep the profile navigation visible. Workspace renders its toolbar, search rail,
  and preview frame before the file listing arrives; pending reads and errors stay in the rail.
  Automations keeps section headings and actions visible while each list loads, without showing
  an empty count before its first result. Cached lists remain visible during refreshes.
- Members in Settings lists Agents and Humans and links into these profiles. Member lists stay
  lightweight; Agent and human profile routes load one focused detail record so profile refreshes
  do not rebuild the directory.
- Clicking an Agent avatar in Chat opens a read-only peek pane beside the conversation, with an
  **Open profile** action for the page that owns editing. Hover or keyboard focus previews the
  Agent's current availability, compact runtime/model/reasoning configuration, and newest durable
  activity; Agent reference chips use the same preview.
- Activity and Automations are what the marks on an Agent's messages link to: a
  fire mark opens the automation, a session mark opens Activity. See
  [Chat](chat.md#in-the-box) for the marks themselves.
- The header edits identity; Setup edits desired model, runtime, and reasoning effort.
  Effort choices come from the assigned Computer's model inventory. Changing models preserves
  a supported choice and otherwise selects the model's concrete default. Haus currently defaults
  configurable models to Medium; there is no Runtime default option. Models without an effort
  control show Not configurable. Existing Agents retain their saved effort until edited.
  Effort changes apply on the next turn, preserving session context. The running turn keeps its
  original effort; multiple edits before the next turn use the latest saved value. Grok Build
  requires a new session for effort changes; Setup states this exception before saving.
- Overview's glance strip names the Agent's assigned Computer with its health and, for operators,
  opens that Computer's detail for remediation; it never substitutes another Computer.
- Skills are independent Agent-owned copies. An Owner or Admin imports a host
  bundle into one Agent library from the Agent's Setup tab.
- MCP connections are Server-owned; Agent-level grants choose which
  connections the Agent may use.
- Every active Agent is already present in the Direct messages sidebar; there
  is no Create DM action or Agent picker.

Computer retains an internal per-Agent **Haus Agent** version receipt for release evidence and
diagnostics. That version covers Haus-managed behavior delivered through instructions, actions,
recipes and Manual content, Harness bootstrap, and factory guidance; it does not version
Agent-owned memory, skills, or workspace edits. The ordinary App does not present the receipt as an
update state because an Agent has no independent update action. Instruction refresh attempts remain
available in Activity History without exposing prompt text, local paths, content hashes, or file
contents.

Agent DMs become ordinary pairwise Chats on their first durable message. Each
human membership stint and Agent id has one canonical Chat, so different humans
receive different private DMs and retries cannot create duplicates.

Cove's factory onboarding playbook makes the next action executable: when the
owner asks for a teammate, Cove creates it. The shared Manual's
[`agent`](../api/manual.md#published-corpus) page documents that capability
without adding a creation recipe or creative policy.

### Agent-created Agents

Any Agent may create an Agent with `haus agent create` when a human in the
Chat it is working in asked for one — never on its own initiative, and never to
split work it could do itself (ADR 0028). The Server checks the creating Agent's
exact current Chat view, resolves the target under the runner credential, derives
an available `@handle` from the display name, and writes the Agent plus its
announcement Message in one transaction.

The created Agent inherits the creator's runtime, model, reasoning effort, and
Computer, and is an ordinary Agent with its own Owner DM and workspace. Agents
carry no Server role; Server authority is a human membership property.

`--brief` is the new Agent's standing instruction — its lane, outputs, cadence,
where it posts, and who reviews. It is Server state on the Agent row, not a
Message, and it rides every configure command to the Computer, which renders it
into the `MEMORY.md` it seeds under a `## Standing brief from @<creator>`
heading. Seeding happens once: an owned workspace is never overwritten, so a
reprovision recovers the brief from the row rather than from the file.

Creation joins the Server's `#all` plus every `--channel` the request names, in
the creation transaction. `#all` is guaranteed by the Server's one creation
seam, so the App's dialog and `haus agent create` behave the same way. A
channel that does not exist or is archived refuses the whole request before an
avatar is generated, and the receipt lists the channels the Agent landed in.
`haus channel add --target "#name" --agent @handle` adjusts membership
afterwards: any active Agent may add any active Agent, the add is idempotent,
and it wakes nobody.

No human created the Agent, so the Server names the human its Owner DM belongs
to at creation: the human of the DM the create ran in, then the one human the
creating Agent already DMs with, and finally the Server Owner. The DM record is
written in the creation transaction and still carries no message, so it becomes
a visible Chat on the first durable message — ordinarily the creator's brief.

The `--say` text is the creating Agent's own message and is the Message body,
and it must name the new teammate by `@handle`: that inline mention — the same
chip `#product` and any other Agent mention gets — is how a human reaches the
new profile, and the Server refuses an announcement without it. Nothing else is
rendered beneath the Message. The handle is derived from `--name`, so the
creating Agent can write it before the command returns; a collision suffixes it,
and the refusal names the handle the Server minted so the retry can use it.

`--avatar-concept` generates the avatar inline. A Server with no avatar provider
still creates the Agent, and the receipt reports the missing avatar; a transient
generation failure refuses the request and creates nothing. An announcement that
names nobody, a stale Chat view, a missing Computer, or an unreported
runtime/model refuses the create before anything is written — and the
announcement check runs first, so a refusal spends no generation.

Creating an Agent does not wake it. Its brief is already in its memory, so no
model turn is spent on an empty greeting and nothing DMs it — a DM is between a
human and an Agent.

`haus agent update --agent @handle --description <text>` and
`haus agent avatar --agent @handle --concept <text>` edit an existing Agent
from Chat. Neither renames an Agent, and both refuse Cove. The Agent profile pane
is the human's canonical edit surface for every field, including runtime, model,
and reasoning effort, which no Agent-facing command exposes.

## Identity and instructions

An Agent has a display name, handle, description, and avatar. The
description supplies its role and personality to generated instructions and to
other Agents in shared Chat rosters.

Humans and Agents share one case-insensitive handle namespace on each Server.
Their immutable ids remain identity and their display names remain presentation;
changing a display name does not rename a handle. PostgreSQL arbitrates claims
atomically, and retirement or human departure releases the active alias.

Computer composes managed product instructions, the Agent description, the
Agent's local skills, and tool guidance when a fresh model session starts.
Durable learned knowledge lives in the Agent's own `MEMORY.md` and any files it
creates.
Haus does not generate an `AGENTS.md`, `SOUL.md`, or injected memory layer
inside the workspace.

Computer does not suppress image-generation capabilities native to an Agent's selected execution
runtime. Availability follows that runtime and model; it is separate from Haus's avatar service
and is not controlled by an App setting.

Haus Agent releases do not force fresh model context. Computer supplies the current managed
instructions on the next accepted turn and applies any release-owned bootstrap or factory guidance
at that same boundary. The public version receipt advances only after that turn succeeds.

Avatar generation is a Server-owned service. The Server owns the prompt, provider call,
normalization, validation, and concurrency limits. Agents reach it only through
`haus agent create --avatar-concept` and `haus agent avatar`; there is no standalone generate
command and no transient avatar file. A Server without the provider provisioned still creates
Agents, without an avatar. It is not configured through Haus App or by changing the calling
Agent's runtime or model. The provider credential is held only by Haus Server; it is never sent to
Haus App, Computer, or the Agent workspace.

Owners and Admins can also choose **Generate avatar** on an ordinary Agent's profile. The profile
requires a short concept, previews one transient result, and only applies it after an explicit Save;
Cancel and failed retries leave the current avatar unchanged. Uploading a file and falling back to
initials remain available alongside generation.

## Execution lifecycle

One resident Computer execution host serves each assigned Agent. The Agent's
single global model session spans all Chats and resumes across deliveries and
Computer restarts. Stop, Restart, Start fresh session, and Full reset all run from the profile
header's actions menu. Session reset creates fresh model context while preserving
the workspace and skills. Full reset restores the Agent-kind factory workspace
and only the current factory-managed skills: minimal `MEMORY.md` for an
ordinary Agent, or Cove's root `MEMORY.md` plus three onboarding files under
`notes/`. Today the only factory-managed skill is `visuals`.

See [Context management](context-management.md) and
[Agent daemon and delivery](../internals/agent-daemon-delivery.md).

## Retirement

An Owner or Admin retires an Agent with **Delete Agent** in the profile header's
actions menu, typing its name to confirm. A retired Agent leaves every active member control at once:
it no longer appears in the Agent list, mention pickers, or Channel-creation
controls, and it can neither execute a turn nor receive a new send. A send to its
DM, a reply in one of that DM's Threads, or a new task message is rejected.

Its implicit roster row leaves active navigation and is not an App destination after retirement. Canonical
collaboration records remain durable Server history. Historical messages visible in other Chats
keep the retired Agent's profile under a **Deleted** treatment, and the Agent is excluded from task
creation targets.

The Agent id is permanent identity; its handle is an active Server-scoped alias.
Retirement releases that alias for a newly created Agent while preserving it on
the tombstone. The replacement receives a new id, implicit DM identity, workspace, and execution
history. Existing rich references and authored messages remain attached to the
retired Agent id.

Completed onboarding does not depend on Cove remaining active. Retiring Cove
keeps the onboarding Channel and history under this same retired-Agent
contract, while the Server stays unlocked and never provisions a replacement.

### Live turn inspection

Expanded turns keep their Computer journal visible while refreshing. Reasoning renders inline;
HeroUI Pro tool rows retain their expansion state as results arrive. Available evidence remains
visible if a refresh fails, with a notice below the trace. There is no temporary semantic-history
replacement or loading label. The trace renders only journal reasoning and tools; there is no
alternate semantic-event renderer. Viewers without detail access see an access notice. Turn
headlines and counts remain available from Server history.

The open view owns ephemeral journal state. Activity websocket events and reconnects request a
refresh; an open active turn also refreshes once a second while the page is visible, since reasoning
deltas do not emit semantic activity events. Requests serialize and coalesce bursts into one trailing
read. Closing the turn discards its relay, and settlement requests a final snapshot. Raw evidence
never enters the persisted App query cache or Server storage.

New trace entries fade in without height animation. Updates preserve the visible entry's scroll
offset, including when reasoning grows above an expanded tool. Inspection does not follow the bottom.
