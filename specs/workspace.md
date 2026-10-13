# Agent Workspace

Haus Computer owns one isolated local root for each assigned Agent:

```text
agents/<agent-id>/
  workspace/
  home/
  skills/
  runtime/
  workspace.sparsebundle
  workspace-volume.json
```

The Server owns the Agent's identity, desired configuration, membership, and
immutable Computer assignment. It never owns or synchronizes the Agent's local
workspace. The workspace is the Agent's durable working environment and the
default working directory for its execution harness. It is organization, not a
security boundary.

## Capacity

Haus Computer supports macOS. Newly provisioned workspaces use a finite,
case-sensitive APFS sparsebundle mounted at the existing `workspace/` path.
The default image capacity is 10 GiB. Writes encounter ordinary filesystem
`ENOSPC`; the Agent chooses what to remove or explicitly publish. Computer
does not upload or delete personal files automatically. The cap applies to
`workspace/`, not arbitrary host writes: the trusted shell remains unrestricted.

`home/`, `runtime/`, `skills/`, session state, and Computer recovery records stay
outside the image. A full workspace therefore does not prevent saving turn
state or invoking the Haus CLI to publish and recover. Shared-file caches are
Computer-owned, outside personal workspaces.

Computer reserves each image's full capacity plus filesystem overhead in a
persisted, cross-process-locked storage ledger. Admission checks both that fixed
budget and current host free space, retaining 10 GiB of host headroom and a
2 GiB shared-cache allowance. Sparse allocation does not justify overcommitting
workspace ceilings. These defaults are explicit Computer implementation options.

Mount identity is verified before execution. A missing image, foreign mount, or
unverified image blocks launch instead of creating an uncapped replacement.
Existing ordinary workspace directories remain explicitly legacy until the
operator invokes migration with the Computer stopped. Migration copies and
verifies file contents, modes, and symlinks, records recoverable stages, and
retains the original at `workspace.backup`. It never deletes that backup. Verification ignores
macOS-created `.fseventsd`, `.Spotlight-V100`, and `.Trashes` directories only at the new volume
root and only when absent from the source. Source entries with those names remain verified.

Offline compaction detaches normally, returns unused image blocks to the host,
and restores a previously mounted workspace. It requires the Computer stopped;
busy-volume failures are reported rather than forced. Session reset preserves
the volume. Full reset clears its contents without removing the mounted root;
retirement detaches before deleting the Agent partition and releases the
reservation only after deletion succeeds.

### Existing-workspace migration

Migrate after the shared-artifact rollout, one Agent at a time. First inventory
each workspace and confirm its files fit the 10 GiB ceiling and the Computer
can reserve the full image capacity while retaining the original backup.
Have the Agent consolidate or explicitly publish files before migration if needed.

Run `haus-computer stop`, then
`haus-computer workspace-migrate /server-slug <agent-id>`. Maintenance refuses a
running Computer or an open workspace. Restart Computer with its normal start
command, verify the Agent can read its existing files and run a turn, and retain
`workspace.backup` until the operator has verified recovery. Re-running migration
resumes its durable receipt; do not manually remove that receipt or image.

Use `haus-computer workspace-compact /server-slug <agent-id>` only while Computer
is stopped to reclaim deleted sparse-image blocks. Neither migration nor
compaction publishes personal files.

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
Manual topic `recipes/technique/memory-hygiene` carries the full guidance, including dreaming:
the Agent's own short, silent consolidation pass that folds recent lessons into MEMORY.md, rewrites
Active Context, moves detail into notes, and touches only what changed since the last pass.

### Dreaming

Dreaming runs overnight as its own private turn, never at the end of a conversation turn. Computer
checks each Agent on it once per Computer-local night: at the first ten-minute tick inside a fixed
quiet window, 03:00 to 05:00 in the machine's local time, while the machine is awake. A machine
that wakes at 04:20 checks then; one awake only after 05:00 skips that night. An Agent is due when
its memory (`MEMORY.md` plus every file under `notes/`) changed since its last dream, or
`MEMORY.md` exceeds a fixed 16 KiB (16,384 bytes, Raft v1.21's 4,000-token target), and it has not
dreamed in the last 20 hours. Change is a fingerprint of path, size, and mtime, with no content
reads. The first look only records a baseline, so a new Agent's first dream comes on a later night,
roughly 24 to 48 hours after it starts. Computer keeps the fingerprint, last dream time, and last
checked date in `runtime/memory-dream.json`, so a restart never checks the same night twice. A
due Agent's request that cannot be sent is retried on the next tick that night.

Each check logs one `nightly-dream.check` line and exports one `haus.dream.check` span
([observability](../docs/internals/observability.md#nightly-dream-checks)) with the Agent, the
local date, the outcome (`baselined`, `requested`, `not-due`, or `skipped` with a reason:
`retired`, `resetting`, or `not-configured`), and `MEMORY.md`'s size. Skips are not persisted.
Only Agent folders are checked; dot-directories such as `.harness-bridge-prewarm` are Computer
scratch, not Agents.

A due Agent gets one `agent-dream-request` frame, even while it is busy. Server queues a `dream`
inbox item (identity `dream:<agentId>:<Computer-local date>`, so one per night) for any
configured, running Agent on that Computer, whether it has an active run, waiting work, a wake
pause, or a backoff, then dispatches through the normal path. A stopped Agent is never queued a
dream.

From there a dream is an ordinary concrete inbox item: it takes its turn like a reminder or any
other concrete item, busy notices reach its run, and settlement, failure, backoff, Stop, and
requeue treat it like any other. Two rules are its own: the night's identity means it cannot
queue twice, and a dream still queued four hours after it was requested has missed its night, so
it is retired as `seen` instead of leading a run.

The dream run is the one chatless run ([sessions.md](sessions.md)). Its whole input is an
instruction Computer composes: Haus started the turn for the nightly dreaming pass per the Manual
topic, the Agent posts nothing in chat about the dream itself, and messages that arrive meanwhile
are handled normally. When the dream turn completes, Computer re-records the fingerprint, so the
Agent's own dreaming edits never make the next dream due. Check, request, and baseline failures
are logged as warnings and never stop the loop or fail a turn. There is no setting and no adjustable threshold.

Each dream leaves a record members can read on the Agent's profile. When a dream run launches,
Computer snapshots the text of `MEMORY.md` and every file under `notes/` (symlinks skipped; a
file over 1 MiB, or one that is not UTF-8 text, is compared only by size and mtime or by digest).
When the run settles, whatever its outcome, Computer diffs the two snapshots into per-file line
counts and one unified patch whose hunk headers name the enclosing `## ` section, and sends it as
an `agent-dream-record` frame just before the turn summary. A file's text leaves the patch past
64 KiB, and the patch stops growing at 256 KiB; such files, and binary ones, keep a marker and no
text. A dream that changed nothing still records, with no files. Server stores one row per dream
run in `agent_dreams`, keeps the newest 60 per Agent, and serves them through `agent.dreams` and
`agent.dream` ([Agents API](../docs/api/agents.md)). A record failure is logged and never fails
the turn. A dream relaunched after a Computer restart records only what changed after the relaunch.

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
