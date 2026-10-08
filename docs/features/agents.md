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
`MEMORY.md` — identity, description-derived role, empty knowledge, and initial
active context — and an empty `notes/` directory for the details it indexes. Practice files, recipe summaries, onboarding notes, and
archetype notes come from neither creation nor reset. Shared guidance belongs
in the Haus Manual, while the Agent's own work may add files later.

The skill system remains Agent-owned and writable, but there is no factory
`haus-agent` skill. Mandatory operating rules live in managed instructions,
shared reference guidance lives in the Manual, and the only current
factory-managed skill is `visuals`; see [Skills](skills.md).

## Product surfaces

- An Agent's profile is one hub page with drill-down sections
  ([ADR 0038](../adr/0038-destinations-open-as-tabs.md)). On web it is its own destination at
  `/s/:slug/agents/:agentId/:section`, in the Server layout beside Usage; `home` is the hub, and
  the retired tab names redirect (`overview` to `home`, `setup` to `runtime`). On desktop the same
  route renders in a tab ([ADR 0039](../adr/0039-desktop-tabs-are-equal-pages.md)). Nothing is
  injected into the window titlebar, and the view lays out from its container width, so it works in
  a 420px pane.
- The hub's header states the Agent's photo, name, role, and current availability, offers
  **Edit Profile** (name, description, the private conversation style, and the signature emoji) for an ordinary Agent, and holds one overflow menu of lifecycle verbs — Stop,
  Restart, Start fresh session, Full reset, Delete Agent — for Owners and Admins. Members see the
  header without that menu. A runtime sign-in issue leads under the header. When the Server has
  paused automatic wakes after repeated failed turns, the header status reads **Paused** and a
  warning Alert there names the failure streak, the last error as a plain sentence (from the
  failure code, never raw error text), and when Haus retries on its own; Owners and Admins also
  get **Restart**. A sign-in issue outranks the pause, so only one of the two shows.
- Below the header, six cards each state a fact and open a section: **Runs on** (Computer and
  model, with the Computer's health), **Profile** (who created the Agent and when, else its handle), **Automations**
  (standing reminders and triggers), **Skills** and **Connections** (the first display names, `+N` for the
  rest), and **Workspace**. Then the Chats this Agent belongs to, recent activity — each turn one line: its time, the request that woke it
  (or, muted, what it did in words when no request is visible), and its duration, and consecutive identical failures folded into one
  row (`Failed 5×`) — and **See all** into Activity, the full-width event log of every turn and its steps under a pinned day overview, and a compact 30-day processed-token tile linking to Usage.
- The profile's trail rides in the page's top band, in Settings' band shape: the Agent's face,
  then `Haus / Juniper / Connections`, the Agent crumb leading back to the hub. On the hub the trail
  ends at the Agent and titles the web band; a desktop tab already names the Agent, so there the
  hub's band collapses. A drill-down section's band also holds the lifecycle menu at its end for
  Owners and Admins; it is the section's only header (Workspace folds both into one bar). **Runs on**
  holds the assigned Computer and the model/runtime/effort editor; **Profile** the identity
  facts (name, handle, description, created by); **Automations** Reminders and Triggers;
  **Skills** and **Connections** their editors; **Activity** the turn-by-turn execution history;
  **Workspace** the Agent's files as a full-height browser. Workspace has no separate breadcrumb
  header: its band starts with the trail (`Haus / Juniper / Workspace / MEMORY.md`, the open file
  last), then the file's Copy and Raw controls, then one "…" menu holding Show hidden files, Copy
  link, Copy path, and — for Owners and Admins — the lifecycle verbs. In a desktop tab that bar
  sits over the content column only, with the band's height and gutter, and the file rail runs the
  tab's full height with its search on the bar's midline; the shell band, left empty, collapses.
  The bar stays while the Computer is offline. Workspace renders this bar, the search rail, and the
  preview frame before the file listing arrives; pending reads and errors stay in the rail. Automations keeps section headings and actions visible while each list loads, without
  showing an empty count before its first result. Cached lists remain visible during refreshes.
- Members in Settings lists Agents and Humans and links into these profiles. Member lists stay
  lightweight; Agent and human profile routes load one focused detail record so profile refreshes
  do not rebuild the directory.
- Clicking an Agent avatar in Chat opens its profile. Hover or keyboard focus previews the
  Agent's current availability, compact runtime/model/reasoning configuration, and activity: what
  it is doing now with running sub-agents and the run's latest steps, or, while idle, its last two
  turns; Agent reference chips use the same preview.
  The preview shows the Computer-confirmed configuration. When a saved model or runtime differs,
  it also names the pending choice and when it applies, or notes that it needs attention.
  A paused Agent's preview reads **Paused** and opens with a red edge-to-edge banner,
  "Paused after repeated failures", saying when Haus retries ("Retrying in …. Send a message to
  retry now.", or "Retrying now…" while the probe runs). The profile names the last error;
  the preview does not. A sign-in issue outranks the banner, as on the profile.
- Automations is where the cause line on an Agent's message leads: pressing it
  opens the owning Agent's Automations tab. See [Chat](chat.md#in-the-box) for the
  line itself.
- The header edits identity; **Runs on** edits desired model, runtime, and reasoning effort.
  The editor explains that model and runtime changes apply on the next turn with a fresh session,
  preserving workspace, memory, and Chat history. A running turn finishes with its original model.
  Effort choices come from the assigned Computer's model inventory. Changing models preserves
  a supported choice and otherwise selects the model's concrete default. Haus currently defaults
  configurable models to Medium; there is no Runtime default option. Models without an effort
  control show Not configurable. Existing Agents retain their saved effort until edited.
  Effort changes apply on the next turn, preserving session context. The running turn keeps its
  original effort; multiple edits before the next turn use the latest saved value. Grok Build
  requires a new session for effort changes; the editor states this exception before saving.
- **Runs on** names the Agent's assigned Computer with its health and, for operators, opens that
  Computer's detail for remediation; it never substitutes another Computer.
- Skills are independent Agent-owned copies. An Owner or Admin imports a host
  bundle into one Agent library from the Agent's Skills section.
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
an available `@handle` from the display name, and writes the Agent and its
memberships in one transaction. Creation posts no Message.

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
a visible Chat on the first durable message from the human or the new Agent.

The receipt returns the confirmed handle, including a suffix if the name was taken.
The CLI hints that the creating Agent should introduce the new teammate in `#all`
through ordinary `haus message send`, unless the human asked for a private introduction.
The introduction is the creator's conversational action; no Server mechanism posts or
requires it. It receives the same session stamp and delivery behavior as any other send.

`--avatar-concept` generates the avatar inline. A Server with no avatar provider
still creates the Agent, and the receipt reports the missing avatar; a transient
generation failure refuses the request and creates nothing. A stale Chat view,
a missing Computer, or an unreported runtime/model refuses the create before anything
is written. Retries use the creation nonce stored on the Agent, independently of any
later introduction.

Creating an Agent does not wake it. Its brief is already in its memory, so no
model turn is spent on an empty greeting and nothing DMs it — a DM is between a
human and an Agent.

`haus agent update --agent @handle --description <text>` and
`haus agent avatar --agent @handle --concept <text>` edit an existing Agent
from Chat. Neither renames an Agent, and both refuse Cove. The Agent profile
is the human's canonical edit surface for every field, including runtime, model,
and reasoning effort, which no Agent-facing command exposes.

## Identity and instructions

An Agent has a display name, handle, description, avatar, an optional
conversation style, and a signature emoji. The description is its role line: one or two sentences, at most
280 characters, ending its own instructions as `## Initial role` and riding every
message it sends (`@name — <description>:`) and every roster, so longer lane
context belongs in the standing brief.

Every Agent shares a built-in house personality: a senior teammate, short plain
sentences, a committed take, no closing offers, no em dashes. The conversation
style layers a voice on top of it (up to 2000 characters) and wins on tone; it
shapes only voice and banter, never rules, permissions, or how the Agent works. The signature emoji is the reaction an Agent leaves when it picks
up a request that needs real work (default 👀). It can be picked at creation, in
the App's Create Agent dialog or with `haus agent create --emoji`, and is null when omitted.
Owners and Admins set both in Edit
Profile, and an Agent tunes its own with `haus profile update` only when an Owner
or Admin asks, never at another Agent's or a member's request.
Both are private to the Agent and its Owners and Admins: they never appear in
envelopes, rosters, channel info, or another Agent's view. Changes apply from the
Agent's next turn.
[Agent conversation behavior](agent-conversation-behavior.md) ties the personality to reply placement, reactions, and formatting, with their regression guards.

Humans and Agents share one case-insensitive handle namespace on each Server.
Their immutable ids remain identity and their display names remain presentation;
changing a display name does not rename a handle. PostgreSQL arbitrates claims
atomically, and retirement or human departure releases the active alias.

Computer composes managed product instructions (including the house personality), the Agent description and
conversation style, the Agent's local skills, and tool guidance for every turn; a changed description or conversation style applies from the next turn without a session reset.
Durable learned knowledge lives in the Agent's own `MEMORY.md` and any files it
creates.
Haus does not generate an `AGENTS.md`, `SOUL.md`, or injected memory layer
inside the workspace, and no runtime auto-loads `AGENTS.md` or `CLAUDE.md` from
the workspace, its ancestors, or the operator's home (Grok Build still reads
generic names in the workspace; see
[Context Management](context-management.md)).

Haus has no general image generator. Computer does not suppress image-generation capabilities
native to an Agent's selected execution runtime: Codex (on ChatGPT plans that include image
generation) and Grok Build generate images natively; Claude Code and Pi do not. Availability
follows that runtime and model; it is separate from Haus's avatar service and is not controlled by
an App setting. A generated image reaches a chat only as an attachment: the Agent uploads the saved
file with `haus attachment upload` and sends it with `--attachment-id`. Native tools save inside
the Agent's isolated home, outside its workspace (Codex under `$CODEX_HOME/generated_images/`, Grok
Build under its session's `images/` folder), so when a generation or edit finishes Computer moves
the file into the workspace at `generated-images/<UTC yyyymmdd-hhmmss>-<original name>` and leaves
a symlink at the runtime's path so the runtime's own references keep working. The execution
journal records that workspace path as the call's `path` (with the runtime's original as
`savedPath`). A move that fails is logged, the image stays at the runtime's path, and the journal
keeps that path. The `images`
Manual topic teaches this flow and tells Agents without the capability to say so plainly or draw
an SVG or inline visual instead.

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
and only the current factory-managed skills: minimal `MEMORY.md` and empty
`notes/` for an ordinary Agent, or Cove's root `MEMORY.md` plus three onboarding files under
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

New trace entries reveal with a height spring and fade. Updates preserve the visible entry's scroll
offset through both the React commit and subsequent animated growth, including when reasoning grows
above an expanded tool. Human scrolling or interaction releases that retained offset. Inspection
does not follow the bottom.
