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

On macOS, newly provisioned workspaces use a finite, case-sensitive APFS
sparsebundle mounted at the existing `workspace/` path. Other hosts, such as Linux
development and cloud sessions, provision `workspace/` as an ordinary uncapped
directory with no image, manifest, or reservation, and refuse to replace a
capped workspace they cannot mount.
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
the volume. Full reset clears its contents without removing the mounted root.

A volume is mounted only while its Computer attachment runs. Retirement stops the
Agent's runtime session, waits for the processes still holding the volume (a
stopped runtime's process tree can outlive the stop call by a moment), then
retries a plain detach with backoff. Only a retired Agent's volume is forced as a
last resort, with a warning naming its holders. Holder waits and detach retries
run outside the storage lock, which guards only ledger writes. Retirement also
detaches any mount left in the Agent partition without a manifest, deletes the
partition only once nothing in it is mounted, and releases the reservation only
after deletion succeeds; a replay whose partition is already gone still releases a
reservation an earlier attempt leaked. A volume that still will not detach keeps
both, the failure is logged against the Agent, and the Server's retirement
tombstone replays the purge on the next connection.

Server deletion stops the attachment's sessions and sandbox processes the way
shutdown does, then writes a `pending-purge` marker holding its pid into the
Server partition, force-detaches every mount under the partition (manifest or
not), deletes the partition with the marker last, and releases the reservations
it held. A purge that fails or is killed midway keeps its marker; every
attachment start replays the purge of a marked partition whose purging process
is no longer running. Attachment shutdown detaches the Server's volumes after its
sessions stop, never forcing, within a 10-second deadline; a volume still busy or
unfinished at the deadline stays mounted and is reused on the next start, and a
detach failure is logged without changing the daemon's exit. At start the
Computer detaches any mounted workspace whose Agent partition has no volume
manifest and releases reservations whose partition holds no image, manifest, or
migration receipt, logging each reclaim.

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
