# Agent Workspace

Haus Computer owns one isolated local root for each assigned Agent:

```text
agents/<agent-id>/
  workspace/
  home/
  skills/
  runtime/
```

The Server owns the Agent's identity, desired configuration, membership, and
immutable Computer assignment. It never owns or synchronizes the Agent's local
workspace. The workspace is the Agent's durable working environment and the
default working directory for its execution harness. It is organization, not a
security boundary.

## Capacity

Agent workspaces are ordinary directories on the Computer's host filesystem on
all supported platforms. There is no per-Agent disk cap, advance reservation,
or admission budget. Creating an Agent does not promise space for future writes.
The host filesystem reports `ENOSPC` when actual storage is exhausted.

Computer reports actual available and total bytes at attachment and hourly.
Server keeps the latest sample with the live attachment, clears it on disconnect,
and exposes it to Owners and Admins through `computer.list`. Measurement failure
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
image they cannot mount. Full reset clears the active directory; session reset
preserves it. Existing recovery images remain outside the active workspace.

## Durable knowledge

The Agent controls the structure of its workspace. The ordinary factory seed provides:

- `MEMORY.md` in the prompt template's shape: identity, role, empty standing
  preferences, initial Active Context, and an empty Key Knowledge index.
- An empty `notes/` directory for the deeper knowledge `MEMORY.md` indexes
  (Raft's workspace initialization).

The seed establishes only that minimal starting point and never overwrites an
existing workspace. The Agent may add, rename, organize, and remove
task-specific files as its work requires.

Cove is the one distinct factory kind. Its fresh workspace inventory is exactly:

```text
MEMORY.md
notes/
  onboarding_knowledge_faq.md
  onboarding_objectives.md
  onboarding_playbook.md
```

Objectives contain 12 separately authored short summaries linked to the 12 seeded-tier Manual
topics. Haus does not create `notes/recipes/` or copy any full Manual card, query-tier summary,
archetype note, `save-as-a-skill`, or `haus-agent` skill. Computer records the four-file manifest
in the durable Cove application receipt and validates the complete directory inventory before
replaying success. Cove still gets the normal isolated skill library and release-owned `visuals`
skill.

After creation, `MEMORY.md` and `notes/onboarding_objectives.md` are Cove-owned state and are never
factory-refreshed. `notes/onboarding_playbook.md` and `notes/onboarding_knowledge_faq.md` are
versioned factory guidance: before a Cove turn, Computer may replace them only when their bytes
exactly match a known prior factory release. Missing or edited files are preserved as conflicts.
Both successful refreshes and conflicts appear in Agent Activity History. A successful refresh adds
a one-turn private notice that tells the existing model session to re-read the two files; it does
not rotate the session.

Factory guidance participates in the public Haus Agent version. A successful compatible refresh
may advance that version; a missing or edited Cove file blocks the receipt from advancing and leaves
the conflict visible as a failed update.

`MEMORY.md` is hot memory plus an index: in plain text, what the Agent needs on every wake (role,
communication style, standing preferences and directives, and Active Context, which is rewritten
rather than appended), then a Key Knowledge index whose lines are a `notes/` path plus a one-line
hook. `notes/` holds deeper knowledge not in use right now, as topic files that each hold the
current truth on one subject. History stays in Haus chats and tasks, referenced by handle. The
Manual topic `recipes/technique/memory-hygiene` carries the full guidance, including the nightly pass:
the Agent's own short, silent consolidation pass that folds recent lessons into MEMORY.md, rewrites
Active Context, moves detail into notes, and touches only what changed since the last pass.

### Dreaming

Dreaming is the nightly heartbeat: the Agent's own memory consolidation, run once per
Computer-local night in a fresh throwaway session, never at the end of a conversation turn.
[specs/heartbeat.md](heartbeat.md) is normative for its schedule, skip rules, turn input,
recipe, summary, and follow-ups. Two facts belong here:

- Only the nightly run writes `MEMORY.md` and `notes/` on the heartbeat's behalf. Daytime
  heartbeats leave memory alone and suggest changes in their report.
- Each nightly run leaves a dream record. Computer snapshots `MEMORY.md` and every file under
  `notes/` when the run launches, diffs the two when it settles, whatever the outcome, and sends
  the diff as an `agent-dream-record` frame just before the turn summary. Symlinks are skipped;
  a file over 1 MiB or not UTF-8 text is compared by size and mtime or by digest. Text leaves
  the patch past 64 KiB, and the patch stops growing at 256 KiB. A dream that changed nothing
  still records, with no files. Server stores one row per run in `agent_dreams`, keeps the
  newest 60 per Agent, and serves them through `agent.dreams` and `agent.dream`
  ([Agents API](../docs/api/agents.md)). Each row also carries the Agent's `haus heartbeat
  learned` summary and the follow-up reminders the run scheduled. A record failure is logged
  and never fails the turn.

The dream run is one of the chatless runs ([sessions.md](sessions.md)). It posts nothing in
chat, and messages that arrive meanwhile are handled normally.

There is no managed `NOTES.md`, `SOUL.md`, injected core-memory section,
automatic extraction pipeline, Computer-run memory rewrite, or separate Wiki primitive; dreaming is
the Agent's own pass.
The Server-owned description is the Agent's role line. How it talks comes from
the house `## Personality` every Agent shares, plus an optional Server-owned
conversation style rendered right after it as `## Conversation style`. Owners,
Admins, and the Agent itself (through `haus profile show` and `haus profile update`)
read and write the style and signature emoji; other Agents cannot read them. Durable
learned role and context live in the Agent-owned workspace.

## Skills and credentials

Installed skills live in the Agent's sibling `skills/` directory. That
directory is the assignment: the selected harness reads it directly, and
imports create independent copies there. Harness credentials and CLI state live
under the Agent-specific `home/`; Computer must not copy broad host
configuration into the Agent root or commit local state.

Owners and Admins may read, edit, or delete an Agent copy through the
authenticated Server-to-Computer relay. The Server never persists `SKILL.md`
bytes; edits and deletes are guarded by the Computer-reported bundle hash.

## Lifecycle

The local root survives ordinary idle periods, Computer restarts, model or
runtime changes, and session reset. Session reset creates fresh model context
without erasing the workspace or skills. Full reset restores the workspace for
the Agent's persisted factory kind: minimal `MEMORY.md` and empty `notes/` for an ordinary Agent,
or the exact four-file Cove onboarding seed under root `MEMORY.md` and `notes/`.
It deletes all existing skills and restores only current factory-managed skills,
presently `visuals`, without a skill update notice. A managed skill that changes between ordinary
seeds queues a one-turn update notice ([Skills](../docs/features/skills.md#factory-managed-skills)).
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
