---
summary: Agent-local skills and explicit imports from a Computer.
read_when:
  - changing Agent skill discovery, import, authoring, or execution
  - changing factory-managed skill seeding or the skill update notice
  - changing the Skills settings surface
---

# Skills

A skill is an instruction bundle in one Agent's library on its assigned Computer.
Each Agent has one canonical, writable library. Every runtime's native skill
path reads that exact directory, so an Agent never executes the operator's
global skills or another Agent's library by accident.

Every runtime reaches the library through its own native skill directory, which
Computer links to the library when it prepares the Agent home. The library is
`skills/` in the Agent's Drive area (`workspace/drive/agents/<handle>/skills/`).
Computer never materializes a second copy.
The turn prompt names the library's current skills so an Agent knows what it
can activate.

## Importing

An attached Computer reports compact metadata for skill bundles installed in
the operator's standard skill directories. The Server stores the latest report
so Settings -> Skills remains useful while the Computer is offline. Skill
contents never persist on the Server.

Settings -> Skills is the Server's browse-only view of these reported sources:
a grid of skill cards (mark, name, one-line description, a quiet check for
installed) in one "Installed" section, or one section per Computer when several
report skills. Long sections collapse to their first six cards behind a "See A,
B, and N more" control. Opening a card shows a compact dialog: the skill's mark,
name, and description, then a rendered `SKILL.md` preview in one panel that
scrolls inside itself, read live from the Computer for Server Owners and Admins;
Members, or anyone while that Computer is offline, see one quiet line instead.
The source path and Computer sit behind a collapsed "Details" disclosure, and
the footer names the Agents whose library carries a skill of that name ("Used
by Blippy and Tiny") beside Done. Every skill shares one illustrated cube mark;
the factory-managed skills Haus ships draw their own illustration instead
(`features/skills/built-in-skill-icons.tsx`), on Settings and the Agent Profile
alike.

An Owner or Admin adds one from the searchable Skills picker on an Agent's
Profile while that Computer is online. The Computer durably records acceptance
before the App stops showing the request as pending, then copies the complete
bundle into the Agent's library. The source is unchanged, the Agent copy is
independent, and no later sync occurs. A same-name copy must be removed or
renamed explicitly before it can be imported again.

Computer inventory changes arrive through the Server update subscription. The
App does not poll for skill or import changes. The Agent Profile shows accepted,
applied, and failed outcomes reported by the Computer; elapsed time is never
treated as success or failure.

Imports wait for an active turn to finish. The next turn receives the updated
library; a running turn is never mutated.

## Operator editing

Owners and Admins can open an installed skill from the Agent Profile, edit its
`SKILL.md`, or explicitly confirm deletion of that Agent's whole independent
copy. Content travels only through the authenticated live Computer connection.
The Server authorizes the request but does not store the bytes.

Save and delete use the hash from the opened copy. If the Agent or another
operator changed the bundle, Haus asks the operator to reload instead of
overwriting it. Successful changes refresh from a Computer event, not a timer.

## Factory-managed skills

Haus ships a small set of release-owned skills, presently `visuals`. The Server seeds them into
each Agent's Drive area, `agents/<handle>/skills/<skill-id>/`, as revisions authored by Haus: when
the Agent is created, after a full reset, and when a Server start finds an Agent still on an older
release. Drive's history names Haus as the writer. Seeding compares what the Agent's folder holds
with the release, so an edit made in Drive always stands. Agent-authored and imported skills are
never touched.

The Server records, per Agent and skill, the release last applied and the folder as Haus left it.
A missing skill is written with no notice. A folder equal to the release is left alone. A folder
equal to what Haus last left is updated and queued as changed. Anything else, an edit in Drive, is
left alone and queues nothing. Several changes before the Agent's next turn coalesce into one
pending entry per skill. Seeding twice writes nothing the second time. The Computer still seeds the
same bytes into its local folder at launch until Computer Agent paths are removed, which leaves
Drive unchanged ([Skills spec](../../specs/skills.md#managed-skills)).

The next turn carries one private notice in its event input, never a Chat message and never the
standing system prompt:

> [Haus skill update: these Haus skills were updated: visuals.] Re-read each before you next use
> it, and rebuild any scripts, notes, memory, or recipes you derived from it. If that changed
> something you rely on, post one short note in #all saying what you updated; otherwise do not
> post.

The text comes from `@haus/agent-prompt`, so the runner and the Computer send the same words.
The notice clears only after a completed turn included it, so a turn that fails or is interrupted
retries it. A skill that changes again after the notice was composed stays pending. Session reset
keeps a pending notice; full reset deletes the library from Drive with the rest of the Agent's
area and discards the record, and the Server then seeds the factory skills fresh and queues
nothing. The visuals skill also tells Agents to mark anything they derive from it and rebuild it
when the skill changes. Owners: `apps/server/src/managed-skills/` (seeding and pending notices),
`apps/runner/src/turn/managed-skill-notice.ts` (delivery on the runner), and
`apps/computer/src/managed-skill-changes.ts` (Computer-run Agents until R4d).

## Agent authoring

Agents manage their own library through `haus skill`:

- `list` and `view`
- `create` and `patch`
- `write-file`
- `delete`

These commands resolve only inside the calling Agent's library. Symlink escapes
and cross-Agent paths are rejected. Deleting an imported skill deletes only the
Agent's independent copy, never its host source.

## Tools are separate

Skills teach; tools act. Executable capabilities come from the selected harness
and Server-owned MCP connection grants. Discovering a new MCP tool never grants
it automatically.

## Missing on purpose

- Ambient execution of globally installed host skills.
- Automatic skill sync or a compatibility layer between libraries.
- A persistent Server-side skill-content store.
- A generic toolset or skill marketplace.
- The retired factory `haus-agent` skill. Mandatory product rules live in
  managed instructions and expandable operating guidance lives in the shared
  Haus Manual; Agent-authored and imported skills remain fully supported.
