# Agent Workspace

Haus Computer owns one isolated local root for each assigned Agent:

```text
agents/<agent-id>/
  workspace/
    drive/agents/<handle>/   the Agent's Drive area: AGENTS.md, WORKER.md, MEMORY.md, notes/, workbench/, skills/
    drive-refused/           files Drive refused, kept by their Drive path
  home/
  runtime/
```

The Server owns the Agent's identity, desired configuration, membership, and
immutable Computer assignment. What the Agent knows lives in Drive
([ADR 0054](../docs/adr/0054-drive-holds-what-agents-know-and-follow.md)): its area
`agents/<handle>/` is canonical on the Server, and the Computer keeps the Agent's plain copy in
`workspace/drive/` ([drive-folder.md](drive-folder.md)). The rest of the workspace is the Agent's
local scratch (scripts, checkouts, data) and the default working directory for its execution
harness. It is organization, not a security boundary.

## Capacity

Agent workspaces are ordinary directories on the Computer's host filesystem on
all supported platforms. There is no per-Agent disk cap, advance reservation,
or admission budget. Creating an Agent does not promise space for future writes.
The host filesystem reports `ENOSPC` when actual storage is exhausted.

Computer reports actual available and total bytes at attachment and hourly.
Server keeps the latest sample with the live attachment, clears it on disconnect,
and exposes it through `computer.list` to Owners and Admins, and to the member who attached that
Computer. Measurement failure
clears the sample and never blocks Agent execution. Disk is low only when both
less than 10% and less than 20 GiB remain. `computer.onUpdated` invalidates the
Computer query when the sample changes.

The App shows a Low disk chip in the Computers list and profile, plus a profile
warning with free bytes and percentage. The person who attached the Computer
also sees a dismissible Inbox warning linking to its profile. Dismissal stays
local to the App and survives reload; the notice returns only at a worse band
(below 10%, 5%, 2%, or 1%). Offline Computers and unknown measurements show no
current disk warning. These are warnings, not execution gates.

### Removing older workspace caps

Before executing an Agent with an older macOS sparsebundle, Computer converts
its verified, idle volume into an ordinary directory under the same workspace
path. It copies personal files, hidden files, symlinks, modes, and timestamps;
verifies content hashes and modes; detaches normally; then promotes the copy.
macOS volume metadata (`.fseventsd`, `.Spotlight-V100`, `.Trashes`) is excluded.
A busy, foreign, missing, or unverified image fails without replacing its files.
An on-disk `workspace-directory.json` receipt resumes interrupted conversion.
The original image and manifest remain as `workspace.backup.sparsebundle` and
`workspace-volume.backup.json` for operator recovery. No backup is automatically
deleted. Conversion releases the old ledger allocation; new workspaces never
allocate one. Older unfinished migrations remain recovery artifacts and must
be resolved before conversion.

For explicit offline conversion, stop Computer and run
`haus-computer workspace-migrate /server-slug <agent-id>`. This command now
removes an older cap; it never creates a capped image. `workspace-compact` is
only for older unconverted images. Other platforms refuse to replace a macOS
image they cannot mount. Full reset clears the active directory except what
[Lifecycle](#lifecycle) keeps; session reset preserves it. Existing recovery images remain outside the active workspace.

## Durable knowledge

An Agent's durable knowledge is its Drive area `agents/<handle>/`
([artifact-drive.md](artifact-drive.md#areas)). The handle is the start frame's `agentName`, which
the Server fills from the Agent's handle on every start. The Computer reads the area from the
Agent's plain folder `workspace/drive/agents/<handle>/` and records the handle in
`runtime/drive-area.json` for work that runs outside a turn (the skill relay and host skill
import):

```text
drive/agents/<handle>/
  AGENTS.md       the Agent's own rules
  WORKER.md       rules every Worker of this Agent reads
  MEMORY.md       capped memory, delivered in the turn input
  notes/          the deeper knowledge MEMORY.md indexes
  workbench/      pages the Agent cards in chat
  skills/         the skill library
```

A page is written under `drive/agents/<handle>/workbench/`, and its `page` fence names that
cwd-relative path, which the App opens from Drive by path
([pages.md](../docs/internals/pages.md#card-and-pane-flow)). A card written before Drive names
`workbench/<file>`, which the App reads as `agents/<handle>/workbench/<file>`. Page cards no longer
reach the workspace read; the Computer's fallback for `workbench/` paths
(`apps/computer/src/legacy-workbench-path.ts`) now serves only `haus://workspace` links and goes
with the workspace frames in R4.

Everyone on the team can read the area, and Drive keeps every revision. The Agent's working
directory stays `workspace/`; everything there outside `drive/` is local scratch, not Drive. The
Agent may add, rename, organize, and remove files in its area as its work requires.

### The seed at creation

The Server seeds a new Agent's area when the Agent is created, from either create path (the App's
New Captain and an Agent's `haus agent create`), before its first configure and greeting. It writes
each file to Drive as a Haus revision, created by the Agent, and only when the path holds no live
file, so a seed never overwrites (`apps/server/src/starter-files/`). Every Agent gets the same
factory seed:

- `MEMORY.md` in the prompt template's shape: identity, role (the Agent's description), empty
  standing preferences, initial Active Context, and an empty Key Knowledge index. An Agent made by
  another Agent also gets a `## Standing brief from @<creator>` section with the brief its creator
  wrote, so the brief is a memory fact the new Agent owns from there.
- `AGENTS.md`, the Agent's own rules: a `# <Name> rules` heading and nothing else.
- `WORKER.md`, the rules its Workers read: a `# Rules for <Name>'s Workers` heading.
- The release-owned `visuals` skill under `skills/`.

`notes/` holds the deeper knowledge `MEMORY.md` indexes. Drive holds no empty folders, so it
exists once the Agent writes a note.

Creating a Server writes `haus/AGENTS.md` the same way: a `# Haus rules` heading and one line
saying the rules apply to every Captain and Worker on the Server. It is created by the Server's
creator. People own it.

Agents and Servers that existed before these seeds get the rule files from a Server backfill
(`startRuleFileBackfill`), a boot sweep that runs at start and hourly. It writes `haus/AGENTS.md`
for each live Server, and `AGENTS.md` and `WORKER.md` for each live Agent, only where Drive has
never held a file at that path, live or deleted, so a rule file someone deleted stays deleted. It
never writes `MEMORY.md`.

A former Cove (ADR 0059) is seeded, launches, and resets as an ordinary Agent. Its existing Drive
area, including any `notes/onboarding_*.md` files, is ordinary Drive content: no factory refresh
touches it, and a Full reset treats it as it treats any Agent's area. A `configuration.json` written before Computer protocol 42 may still
carry `seed.factoryKind`; the Computer ignores the key. Leftover `cove-application.json` and
`runtime/cove-guidance-refresh.json` files are never read and never deleted.

### Migration

R4d-4 retired this launch-time migration: nothing calls `prepareAgentDrive` now, and the Server
seeds new Agents. It is kept here as the record of what D3 did.

Agents created before Drive kept `MEMORY.md`, `notes/`, `pages/` and `workbench/` at the workspace
root and their skills in a sibling `agents/<agent-id>/skills/`. On the first launch after D3, before
the seed is considered, the Computer moved them into the area:

1. It walks the legacy regular files, skipping symlinks, `.git`, `node_modules`, `__pycache__`,
   `.DS_Store`, and the retired `.ai-sdk-harness-skills.json`.
2. It writes each one to Drive as the Agent, with no base and no Task. The `request_id` hashes the
   Agent, the start frame's run id, the Drive path and the content hash. A relaunch of the same run
   replays its own answers, and the next run makes a fresh attempt, so an upload that failed or
   whose revision was since deleted never blocks a later launch. A fresh attempt over equal bytes
   answers a conflict whose head matches, so an answer lost in an earlier run converges with no
   second revision.
3. It settles each file by Drive's answer:

   | Answer | Seed file | Legacy file |
   | --- | --- | --- |
   | Stored, or the path holds equal bytes | Placed in the folder | Placed in the folder, legacy copy removed |
   | The path holds other bytes | Skipped; Drive's copy stands | Kept both: uploaded to `<stem>.conflict-<handle>.<ext>` beside it (then `-2`, `-3`, as in [Pushes](artifact-drive.md#pushes)), the copy placed, the legacy file removed, nothing placed at the original path |
   | Refused for good (`INVALID_PATH`, `FORBIDDEN`, `SIZE_LIMIT`, `STORAGE_LIMIT`, `CONTENT_TYPE`, `IDEMPOTENCY_KEY_REUSED`, any other 4xx) | Skipped | Moved to `workspace/drive-refused/<Drive path>`, as a refused push |
   | Transient (no answer, 5xx, `STORAGE_UNAVAILABLE`, `AUTH_UNAVAILABLE`, `UPLOAD_CONFLICT`, `DELETED`, 401, 404, 408, 429) | Fails the launch | Fails the launch |

   A transient answer for any file fails the turn before the runtime starts, revokes the runner,
   and changes nothing locally. The next run retries every file with fresh request ids. 401 and 404
   are transient so a revoked runner or an older Server cannot move a whole workspace into
   `drive-refused/`.
4. It walks the legacy sources again. Only when none remain does it remove the empty legacy
   directories and the legacy skill library, and write `runtime/drive-seed.json` with the
   `MEMORY.md` digest before the move, its Drive revision, the folder digest after, every
   conflict copy, and every refused file. A file that appeared during the run stays where it is,
   the receipt waits, and the next launch moves it.

The turn trace logs the three `MEMORY.md` digests, each conflict copy, each refused file, and any
file left for the next launch. Every step converges when rerun.

### Memory

`MEMORY.md` in the area is the Agent's memory
([ADR 0052](../docs/adr/0052-memory-is-one-capped-file-and-heartbeats-retire.md)): in plain text,
what the Agent needs on every wake (role, communication style, standing preferences and
directives, and Active Context, which is rewritten rather than appended). Everything else in the
area, `notes/` included, is the Agent's to organize however it likes. History stays in Haus
chats and tasks, referenced by handle.

The Computer delivers the file from `workspace/drive/agents/<handle>/MEMORY.md`; the Agent does not
have to remember to read it:

- At turn start the Computer reads `MEMORY.md` and puts it in the turn input when its content
  differs from what this session last received. An unchanged file adds nothing to the turn, so
  the conversation and prompt cache never grow a copy per turn. A missing file delivers nothing.
- Delivery is capped at 8,000 characters. A longer file is cut at a line boundary under the cap,
  with a notice in the same block naming the file's size and the cap and asking the Agent to
  tighten it. The cap is what keeps memory small; nothing tidies it in bulk.
- A memory receipt (a content digest) works like the instruction receipt
  ([sessions.md](sessions.md#instruction-updates)): it advances only after a turn that carried the
  file or whose own edits produced the current content, and it resets on a fresh session or a
  compacted turn, so the next turn carries the file again.

There is no managed `NOTES.md`, `SOUL.md`, injected core-memory section, automatic extraction
pipeline, Computer-run memory rewrite, nightly dream, or separate Wiki primitive.

The Server-owned description is the Agent's role line. How it talks comes from
the house `## Personality` every Agent shares, plus an optional Server-owned
conversation style rendered right after it as `## Conversation style`. Owners,
Admins, and the Agent itself (through `haus profile show` and `haus profile update`)
read and write the style and signature emoji; other Agents cannot read them. Durable
learned role and context live in the Agent's Drive area.

## Skills and credentials

Installed skills live in the area's `skills/` directory. That directory is the assignment: the
runtime-native homes `home/.agents/skills` and `home/.claude/skills` link to it (a link left over
from the legacy library is repointed), the selected harness reads it directly, and imports create
independent copies there. The release-owned `visuals` skill is seeded at launch only when the
release changed it since the Agent's last seed, so an edit made in Drive stands until the next
release. Harness credentials and CLI state live under the Agent-specific `home/`; Computer must
not copy broad host configuration into the Agent root or commit local state.

Owners and Admins may read, edit, or delete an Agent copy through the
authenticated Server-to-Computer relay. The Server never persists `SKILL.md`
bytes; edits and deletes are guarded by the Computer-reported bundle hash. An Agent that has never
launched has no recorded area and no skills to relay. Skill writes made outside a turn (the relay
and host import) land in the folder, and the turn-end push publishes them.

## Lifecycle

The local root survives ordinary idle periods, Computer restarts, model or
runtime changes, and session reset. Session reset creates fresh model context
without erasing the workspace or the area. Full reset starts on the Server: `agent.reset` deletes
every live file under `agents/<handle>/` and increments `agents.reset_generation` in the same transaction
that revokes the active run's credentials and rotates the session, so a reset that fails leaves
all of it as it was. The files stay restorable from Recently deleted for
`driveDeletedRetentionDays`. The Computer then discards the push of any turn the reset interrupted,
aborts a push already in flight and waits for it to settle, so a stale folder never revives a
deleted file, and clears `workspace/drive/` with the rest of the workspace. The Server refuses any
straggler with `AGENT_RESET`. It keeps `workspace/drive-refused/`. An Agent without `runtime/drive-seed.json` has not
finished its migration, so full reset also keeps the legacy `workspace/MEMORY.md`, `notes/`,
`pages/`, `workbench/` and `agents/<agent-id>/skills/`, and the next launch moves them; a reset
never deletes a file that has not reached Drive. Full reset clears everything else: `home/`,
`runtime/` (with its seed receipt, folder bookkeeping and the managed-skill record), `.agent-runs`,
and `session.json`. Right after the reset the Server reseeds the factory files as new files, the
way it seeds a new Agent: the starter `MEMORY.md`, `AGENTS.md` and `WORKER.md`, each only where no
live file sits, and the factory-managed skills. The next launch pulls every area again. Restoring a
deleted file whose path the seed took fails with `PATH_TAKEN` until the seeded file moves.

History: D3 made full reset keep the Drive folder and reseed nothing. D7c restored the factory
reset, with Recently deleted as the way back.

Managed skills are seeded by comparing the bytes the Agent holds with the release, because the
record does not survive a full reset. Each skill's held hash covers its regular files the way the
release hash does (sorted relative paths, `path\0content\0`). A missing skill is written with no
notice. A held copy equal to the release is left alone. A held copy equal to the release this
Agent was last seeded with is updated and queues a one-turn update notice
([Skills](../docs/features/skills.md#factory-managed-skills)). Anything else, a Drive edit or bytes
that differ with no record, is left alone and queues nothing.
Retirement removes the local execution host after Server retirement has
completed.

Canonical chat history remains on the Server. Agents recover older
conversation context through the Haus CLI rather than treating the workspace
as a transcript mirror.


## Browsing

The App browses the real workspace through the owning Computer. Hidden files
are excluded by default and appear only while the user enables the hidden-files
toggle. Sensitive files and credential directories, symlinks, and skipped
heavy directories remain unavailable regardless of that toggle.
