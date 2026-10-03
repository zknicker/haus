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

## Tools

Skills teach; tools act. Harness-native tools, Computer host capabilities, and
Server-owned MCP connections use their own availability and grant contracts.
Discovering or importing a skill never expands executable authority.

## Non-goals

- Ambient execution of globally installed host skills.
- Automatic synchronization between host and Agent copies.
- A persistent Server-side skill-content store.
- Skill assignment records separate from the Agent-local library.
