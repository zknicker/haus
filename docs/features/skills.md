---
summary: Agent-local skills and explicit imports from a Computer.
read_when:
  - changing Agent skill discovery, import, authoring, or execution
  - changing the Skills settings surface
---

# Skills

A skill is an instruction bundle in one Agent's library on its assigned Computer.
Each Agent has one canonical, writable library. The harness and native skill
paths read that exact directory, so an Agent never executes the operator's
global skills or another Agent's library by accident.

Every runtime reaches the library through its own native skill directory, which
Computer links to the library when it prepares the Agent home. Computer never
asks the harness to materialize a second copy: the harness only overwrites skill
directories it owns, and the canonical library is not one of them. The turn
prompt still names the library's skills so an Agent knows what it can activate.

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
