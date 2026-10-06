# Raft system prompt — source reference

Haus no longer keeps a reconstructed copy of Raft's prompt. Raft's source is published, so the
authoritative text is read from it at the commit pinned in
[prompt-divergences.md](prompt-divergences.md):

- Repository: <https://github.com/botiverse/raft-source>
- Pinned commit: `26f77ef97c40d3d91aa2c5e42b0fd66b8bf39fe6` (release `v1.21.2-source.1`,
  daemon 1.0.43)
- Rendered prompt: `packages/daemon/src/drivers/__snapshots__/systemPrompt/common.md`
  (28,599 characters for the example agent "Alice", no initial role). The per-driver
  `*.patch` snapshots beside it are empty diffs except the Windows variants (PowerShell
  here-strings) and `configured`, which adds the `## Current Runtime Context` block, runtime
  critical rules, the `## Runtime Profile Control` release notice, and `## Initial role`.
- Prompt builder and writing rules: `packages/daemon/src/drivers/systemPrompt.ts`; the CLI guide
  sections it assembles live in `packages/shared/src/raftCliGuide.ts`. Three parts render only
  under Server flags and so are absent from the snapshot: `## Working through sub-agents`
  (`subagentDelegation` plus a runtime that can start sub-agents), the MEMORY.md 16 KB target
  (`constructedWakeContext`), and an installed-apps directory in the Integrations entry. The builder's header
  comment is the pruning rule Haus follows: keep durable collaboration principles in the standing
  prompt; put event formats, delivery mechanics, and event-specific actions in the event input.
- Event input (inbox notice, concrete delivery, thread-join context):
  `packages/daemon/src/agentRuntimeInput.ts`, notably `formatInboxUpdateRuntimeInput`, whose
  trailing guidance Haus's `composeInboxNotice` follows.

To read it locally:

```sh
git clone https://github.com/botiverse/raft-source && cd raft-source
git checkout 26f77ef97c40d3d91aa2c5e42b0fd66b8bf39fe6
cat packages/daemon/src/drivers/__snapshots__/systemPrompt/common.md
```

## Facts that matter for Haus parity work

- The injected CLI on `PATH` is the Agent's only actuation and output channel; one CLI command per
  tool call is a prompt preference, not a hard rule.
- Raft no longer varies the prompt by driver notification capability: every driver renders the
  same startup sequence and there is no `## Message Notifications` section. How to handle a
  mid-turn or wake notice rides the notice itself.
- The Raft Manual carries task mechanics (status flow, `task create`, amend); the prompt keeps the
  claim rule, failed-claim routing, and the review-then-done path.

Earlier versions of this file held a v1.0.0 render and 1.0.16 template deltas recovered with
`strings` from the `raft-computer` binary. They are in git history and are not current policy.
