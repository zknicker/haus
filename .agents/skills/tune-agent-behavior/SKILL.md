---
name: tune-agent-behavior
description: Change how Haus Agents behave and prove the change with a baseline eval. Use when editing the managed agent prompt, Manual topics, CLI help or receipts, or inbox and event text; when "the agent keeps doing X"; when evaluating a behavior change; or when writing a behavior report.
---

# Tune Agent behavior

This skill is the development loop for Haus Agent behavior: decide what a good teammate would do,
find the text that taught the Agent otherwise, change that text, and prove the change against a
baseline with a written report. It is for coding agents working in this repository. For a
delivery, session, or runtime bug, where the Agent never saw the right input, use
`.agents/skills/debug-haus-ai/SKILL.md` first; this skill starts once the input is correct and the
choice is wrong.

Run `bun run docs:list` and read the docs whose `read_when` matches. Always read:

- AGENTS.md, "Agent System Prompt Changes" (the guarded prompt contract and cap ratchet).
- `specs/raft-alignment/prompt-divergences.md` (the divergence register).
- `docs/features/agent-conversation-behavior.md` (the current behavior contract).
- The eval sections of `docs/operations/testing.md` ("Agent Tests", "Evals").

Work the seven phases in order. Each phase ends on its artifact; a phase is done when the artifact
exists in writing, not when it feels understood.

## 1. Expected behavior first

Before reading any code, write one paragraph per situation: how a good human teammate would act,
where the reply goes, how long it is, when it stops, and what would count as wrong. Grade every
observed transcript against that paragraph, never against what the prompt happens to say.

Artifact: a spec paragraph per situation. It lives in the scenario's grader profile
(`scripts/eval/profiles.mjs`) and in the behavior doc or spec that
owns the situation.

## 2. Trace the teaching chain

List every place the Agent is told what to do for this situation, and quote each sentence verbatim:

1. Managed prompt sections: `apps/computer/src/harness/managed-instructions.ts` and its siblings.
2. Manual topics: `packages/agent-manual/src/` (topics, corpus, task-thread routing).
3. CLI help and post-command receipts: `apps/computer/src/agent-cli/`.
4. Inbox and event text: `apps/computer/src/inbox-format.ts`.
5. Seeded skills the Agent loads.

Mark the sentences that would lead a literal reader to the observed behavior. A receipt the Agent
reads right after acting often outweighs a prompt paragraph it read an hour earlier.

Artifact: the chain, in the order the Agent meets it, with the culprit sentences marked.

## 3. Hypothesis and disproof

State why the text produces the behavior, and what observation would disprove it. A good
hypothesis names sentences, not vibes. The worked example: rules labelled by message category
gave the Agent no picture of what the human sees, and a send receipt nudged it toward its own
thread. Disproof would be the behavior persisting with both removed.

Artifact: the hypothesis and its disproof condition, written before any edit.

## 4. Change the text

Prompt edits follow AGENTS.md "Agent System Prompt Changes" exactly: Raft-verbatim text stays
untouched, every Haus-only sentence earns a register row, the cap moves to the measured render in
the same change, and docs move with it. Then apply these rules:

- **Recipe beside consequence.** A description of what the human experiences needs a
  command-shaped mechanics line next to it. Codex follows recipes: the description alone lost
  `--done` and `--reply-to`.
- **Receipts state facts.** A receipt says where the message landed, who was notified, and the
  message's own thread target. It never suggests where to post next.
- **Every-turn mechanics stay in the prompt.** Anything the Agent needs on most turns lives in the
  managed prompt; the Manual holds what it looks up occasionally.
- **Edit only with the stack down.** Saving any file under `apps/computer` while a dev stack runs
  restarts the Computer and tears the stack down. Finish Computer edits, then boot.

Proof for this phase:

```sh
bun test apps/computer/src/harness
bun run test:prompt-contract
```

Then review the change adversarially with both an Opus reviewer and Codex
(`codex exec -m gpt-5.6-sol`, read-only) before measuring anything. Reviews on the first run of
this process found 16 real defects across four changes; measuring an unreviewed change wastes the
eval budget.

Artifact: the diff, its register rows, and the review findings resolved.

## 5. Scenarios and grader

Reuse an existing scenario under `scripts/agent-tests/scenarios/` when it matches the situation;
add one only for a situation no scenario covers. Keep each to one or two live turns.

Split the oracle in two:

- **Scenario asserts structure.** Placement labels, post counts, markers, and which execution
  journal send carried `--done` and `--reply-to`.
- **Grader scores quality.** Brevity caps, tail phrases, question counts, and the judge live in the
  grader (`scripts/eval/grade.mjs`, driven by the profiles), read from saved reports.

Journals sync asynchronously. Any assertion read from the execution journal uses a bounded retry
and asserts that at least one send was found; otherwise the gate passes vacuously on an empty
journal.

Artifact: scenario files and grader profiles that pass on the change and record the baseline.

## 6. Baseline vs change

```sh
bun run eval <name> --baseline <sha> --passes 3
```

Same model on both sides, stacks run serially, n of at least 3: session variance swamps a single
run. One stack per build and one scenario process per stack; two processes against one stack
corrupt each other's evidence. Report rates, not gates.

If the eval model is not the runtime the real Agent uses, say so in the report. When the claim
matters, run once more on that runtime with `--model`.

The registered evals, their options, and the report layout are in `docs/operations/testing.md`
("Evals").

Artifact: per-scenario pass rates and grader scores for baseline and change.

## 7. Report

The eval runner writes the HTML report: headline tiles, pass bars, the grader table, side-by-side
transcripts, and caveats. Publish it or link it, then write the plain-language framing for a reader
who has never seen the prompt. Follow [references/report-outline.md](references/report-outline.md)
section by section.

Artifact: the published report and its framing, ending on one recommendation.

## Operator pitfalls

- The `committer` helper unstages the current directory's index first. To commit in another
  repository, set `GIT_DIR` and `GIT_WORK_TREE`, or run it with that repository as the cwd.
- `agent-varlock` maps the operator token into the schema's token slot. A 1Password prompt during a
  run means the slot name is wrong; the vault is fine.
