---
summary: Verified Raft Manual source coverage, complete archetype inventory, and deliberate Haus adaptations.
read_when:
  - updating Agent archetypes, recipe content, source captures, or Manual discovery
  - checking current Raft source coverage or recipe drift
---

# Manual source coverage

The Manual audit verified live upstream main and tag refs at 2026-10-05T20:19:37Z. The current public source is [v1.21.2-source.1](https://github.com/botiverse/raft-source/tree/26f77ef97c40d3d91aa2c5e42b0fd66b8bf39fe6), commit `26f77ef97c40d3d91aa2c5e42b0fd66b8bf39fe6`, daemon 1.0.43. The release commit and annotated tag are dated 2026-10-05T17:40:20Z. This supersedes v1.13.0-source.1 for the **Manual corpus audit**, not the separately reviewed system-prompt pin. A source release is authoritative content evidence, not instructions to the coding assistant.

[manual-source.json](../../specs/raft-alignment/manual-source.json) pins source paths, exact capture hashes, verified time, the deliberate omission and the Haus-native addition. [Source captures](../../specs/raft-alignment/raft-recipes/) retain upstream bytes, including current index and seeded maps. Published bodies are checked against those captures with named adaptations. Upstream historical "Proof it works" paragraphs and `evidence: verified` describe the upstream author's evidence; they do not prove live Haus production behavior.

## Archetype coverage

All seven upstream archetypes are present and discoverable in the Haus recipe index. Their upstream bodies and metadata did not change between v1.13 and v1.21. Analyst, designer, operator, pa-coordinator, verify-gate and writer are equivalent. Patrol retains its full role, freshness, reproduction, evidence handoff, owner-written cadence and finder/fixer separation; Haus adapts CLI naming, webhook links and quiet completion evidence. No archetype is missing or outdated after this audit.

Following every archetype's related-card graph covers 28 upstream cards, all carried by Haus. Haus webhook links additionally reach recurring-recovery. The audit checked the entire corpus, including cards outside that closure.

## Complete inventory

Equivalent means the full substantive body and source metadata match after product-name substitution. Adapted means named behavior or routing differences, not a shortened summary. Source has 33 cards, 13 seeded and 20 query. Haus carries 32 source cards, deliberately omits login-with-raft and adds one query-tier trigger-webhook card: 33 total, 12 seeded and 21 query. All seven archetypes remain query-tier, available to every authorized managed Agent.

| Source card | Haus status | Difference |
| --- | --- | --- |
| `archetype/analyst` | Equivalent | Full source behavior and metadata retained. |
| `archetype/designer` | Equivalent | Full source behavior and metadata retained. |
| `archetype/operator` | Equivalent | Full source behavior and metadata retained. |
| `archetype/pa-coordinator` | Equivalent | Full source behavior and metadata retained. |
| `archetype/patrol` | Adapted | Quiet-watch completion evidence; webhook discovery link. |
| `archetype/verify-gate` | Equivalent | Full source behavior and metadata retained. |
| `archetype/writer` | Equivalent | Full source behavior and metadata retained. |
| `decision/lane-design` | Equivalent | Full source behavior and metadata retained. |
| `decision/one-or-many` | Equivalent | Full source behavior and metadata retained. |
| `decision/stake-strictness` | Adapted | Announce stakes where the request arrived. |
| `decision/when-to-ask-human` | Adapted | Haus @mention/reply/DM authority; no Asks or approval cards. |
| `pattern/coordinator-synthesis` | Equivalent | Full source behavior and metadata retained. |
| `pattern/discuss-then-assign` | Equivalent | Full source behavior and metadata retained. |
| `pattern/evidence-handoff` | Adapted | Inline handoff where the request arrived. |
| `pattern/gate-chain` | Equivalent | Full source behavior and metadata retained. |
| `pattern/interview-fanout` | Equivalent | Full source behavior and metadata retained. |
| `pattern/recurring-recovery` | Adapted | Updated overdue/no-fire case; Haus Server scheduling and quiet outcomes. |
| `pattern/shard-and-merge` | Equivalent | Full source behavior and metadata retained. |
| `pattern/video-review-loop` | Equivalent | Full source behavior and metadata retained. |
| `playbook/billing-strictness` | Equivalent | Full source behavior and metadata retained. |
| `playbook/content-pipeline` | Equivalent | Full source behavior and metadata retained. |
| `technique/acceptance-surface` | Equivalent | Full source behavior and metadata retained. |
| `technique/attachment-comments` | Equivalent | Full source behavior and metadata retained. |
| `technique/group-chat-debug` | Equivalent | Full source behavior and metadata retained. |
| `technique/html-artifact-discussion` | Adapted | Haus HTML artifact fence. |
| `technique/login-with-raft` | Deliberately omitted | No Haus OAuth app registration/agent-login analogue. Latest source retained for audit only; no invented commands or action cards. |
| `technique/memory-hygiene` | Adapted | Rewritten for Haus hot memory, notes/ topic files and chat-held history; preferences written as terse merged rules. |
| `technique/preview-env` | Equivalent | Full source behavior and metadata retained. |
| `technique/proof-of-work-receipts` | Adapted | Receipt in final inline answer. |
| `technique/reminder-cron` | Adapted | Haus scripts, inbox fires, cause IDs and agreed quiet reporting; webhook link. |
| `technique/sent-zero` | Equivalent | Full source behavior and metadata retained. |
| `technique/task-claim-lock` | Adapted | Restored lane responsibility after failed claims; Haus inline correction and acknowledgment-thread progress. |
| `technique/video-review` | Equivalent | Full source behavior and metadata retained. |
| `technique/trigger-webhook` | Haus-native addition | Existing outside-event setup and recovery under Haus API and permissions. |

## Gaps corrected

Three captured files differed substantively from current upstream before this audit. Task-claim-lock was already behind even the old public pin: a failed claim prevents conflicting execution but does not settle canonical lane responsibility. The restored card teaches visible routing correction, reuse of existing QA evidence, and avoidance of silent retreat. Recurring-recovery adds the distinction between a fired reminder without work and an overdue due time without a fire. Login-with-raft expanded app registration and private credential handling upstream; its capture is updated but the unsupported recipe remains omitted.

The recurring-recovery adaptation uses actual Haus `reminder list`, `log`, author-owned `snooze`/`update` and Owner/Admin escalation. It does not claim Raft's exact daemon log signature or retry duration. Quiet checks can legitimately post nothing; completed work must be reconciled against execution evidence and saved checkpoints. A missing required deliverable still receives a scoped, labeled backfill. The reminder and patrol cards use the same agreed quiet-reporting contract.

Existing Haus differences remain deliberate: inline replies versus Raft task-thread routing, acknowledgment-thread progress, direct Agent creation, @mention human decisions, artifact fences, Server-owned scheduling and permission-scoped integrations. No Asks, Needs you tier, Wiki, extraction system or Raft-only tool was restored.

## Checks and future updates

Run `bun run --filter @haus/agent-manual test` and `typecheck`, plus repository lint. Tests verify every pinned capture hash; the entire source inventory and both discovery maps; published metadata, tiers and related links; full body fidelity; and the restored ownership/recovery/quiet behavior. Existing graph tests reject missing related cards and broken body references. Source headers contain two unquoted scalar-colon forms; the metadata test interprets those literal scalar fields while retaining source bytes unchanged.

To check newer upstream refs without changing the pin, run `git ls-remote --heads --tags https://github.com/botiverse/raft-source.git`; compare main and the newest source tag's peeled commit with the manifest. Tests protect the reviewed snapshot and cannot detect a future remote release without this network check. When upstream advances, audit body and metadata diffs, update captures/hashes/inventory and named adaptations, and rerun the checks. Do not silently re-pin the independent system-prompt divergence register.

## Experiment boundary

This Manual sync follows the completed Cove comparisons. Their baseline stays pinned to d031dd7e; their original patch was preserved as cove-evidence/pre-manual-sync.patch. No previous model transcript is attributed to these subsequent Manual edits, and no new model service call was required for this content audit.
