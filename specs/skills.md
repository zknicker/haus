# Skills

Skills are reusable instruction bundles. Tools are executable Agent actions. A
skill may include `SKILL.md`, scripts, references, assets, and templates; owning
a skill never grants a host tool or MCP connection.

## Ownership

Each Agent has one canonical writable skill library on its assigned Computer:

```text
agents/<agent-id>/skills/
```

The selected harness reads that exact library. Agents may view, create, patch,
extend, and delete their copies through `haus skill`. Another Agent's library
and the operator's host skill directories are never ambient inputs. Computer
enforces this by giving each executor an isolated `HOME` and by stopping
ancestor-directory discovery: Claude Code loads only its `user` settings source,
so `.claude/skills` above the workspace is never read. Instruction files follow
the same rule ([Context Management](../docs/features/context-management.md)).

The Server stores only the Computer's compact skill inventory. Skill bytes stay
on the Computer except while an Owner/Admin request carries one `SKILL.md`
through the authenticated live relay; those transient bytes are never stored.

## Host imports

A Computer discovers importable bundles in the operator's standard Agent,
Claude, and Codex skill roots. It:

- resolves each candidate to its canonical path before deriving its opaque id;
- deduplicates overlapping roots and symlinked aliases by canonical path;
- reports only the first bundle for each destination name, using configured
  root precedence;
- parses YAML frontmatter for description metadata;
- reports metadata only;
- skips symlinks inside a bundle; and
- rejects bundles that exceed the file-count, depth, per-file, or total-byte
  limits before copying.

An Owner or Admin explicitly imports one reported source from an Agent Profile.
The Computer first durably accepts the request, then waits for the Agent's
active turn to settle and atomically copies the complete binary-safe bundle.
The App distinguishes accepted, applied, and failed states from Computer
reports; it does not infer failure from elapsed time or poll for completion.

The copy is independent. The host source is unchanged, no later synchronization
occurs, and a same-name Agent copy blocks another import until it is explicitly
removed or renamed.

## Operator management

An Owner or Admin may open one reported Agent skill from the Agent Profile,
edit its `SKILL.md`, or explicitly confirm deletion of the whole independent
bundle. Each read and mutation goes directly through the Server's authenticated
Computer attachment. The Server authorizes current membership and Agent
assignment but never persists the returned content.

Edits and deletes carry the bundle hash observed by the operator. The Computer
rejects a stale hash rather than overwriting a change made by the Agent or
another operator. Mutations wait for an active turn to settle, use an atomic
file replacement for edits, and publish a new Computer inventory event.

## Managed skills

Haus ships a few release-owned skills (`factoryManagedSkillFiles` in `@haus/agent-workspace`,
presently `visuals`). The Server seeds them into each Agent's Drive area at
`agents/<handle>/skills/<skill-id>/` as Haus-authored revisions
([Drive](artifact-drive.md#revisions-and-attribution)). Owner: `apps/server/src/managed-skills/`.

Seeding runs after an Agent's creating commit, after a full reset, and at Server start and hourly
for every live Agent whose record misses a release skill or names an older release. Each skill
compares three fingerprints, each one digest over the folder's files by folded relative path and
content SHA-256:

| Drive holds | Step |
| --- | --- |
| no live file in the folder | write the release, no notice |
| exactly the release | nothing |
| what Haus last seeded, and the release differs | write the changed files, queue a notice |
| anything else | the Agent or a person edited it, so nothing |

`agent_managed_skills` keeps one row per Agent and skill: the release last applied, the folder as
Haus left it, and the release of an update not yet announced. Full reset deletes the rows with the
area, so the reseed after it writes fresh and queues nothing.

Seeding is idempotent. A file whose head already holds the release bytes gets no revision, so a
rerun, a restart, or a Computer pushing the same bytes changes nothing. A skill's writes land in
one transaction and only on the heads they were planned against. When a head moved in between,
someone edited the skill or another seeder landed first, so the writes are dropped and the next
run decides again. The Computer still seeds the same release bytes into its local `drive/skills/`
at launch until R4d removes Computer Agent paths. It keeps any copy that differs from its own
last-seeded release, so it never writes back over a newer Server seed.

## Tools

Skills teach; tools act. Harness-native tools, Computer host capabilities, and
Server-owned MCP connections use their own availability and grant contracts.
Discovering or importing a skill never expands executable authority.

## Non-goals

- Ambient execution of globally installed host skills.
- Automatic synchronization between host and Agent copies.
- A persistent Server-side skill-content store.
- Skill assignment records separate from the Agent-local library.
