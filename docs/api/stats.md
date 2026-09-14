---
summary: Usage API for token summaries, plan capacity, spend estimates, provider activity, and runtime health.
read_when:
  - changing usage, spend, runtime health, or operational stats APIs
  - changing how clients read provider activity or cost signals
---

# Usage API

The `stats` tRPC router serves usage, spend, runtime health, and operational signals.

Usage values are derived from durable records and provider/runtime activity. They do
not require clients to parse logs or runtime internals.

## Contract

* Usage records keep stable timestamps, provider/model identity, and source
  attribution.
* Cost signals are explicit about provider, currency, and estimate status.
* Runtime health is a freshness signal, not a gate for reading durable app data.
* Aggregates point back to source records when useful.
* Realtime events can refresh usage, but reads are the source of truth.
* Hosted plan usage is stored as the latest source-attributed snapshot per Computer.
  Computer cards compare the all-model weekly allowance from Codex, Claude Code, and Grok Build;
  an enforced 5-hour window may appear as secondary capacity. Computer refreshes and caches these
  snapshots before reporting them, and members read the Server copy rather than triggering provider
  calls. Claude Code snapshots are captured from a managed SDK turn under a durable 15-minute
  Computer lease; its direct OAuth request is bootstrap-only and durably backed off after failure.
  Members can also read those snapshots while a Computer is offline. A provider snapshot reported
  as `ok` may carry an optional `stale` stamp — the failure `code` and the time `at` which the
  Computer kept the previous snapshot instead of a new one — which the Server stores and returns
  verbatim.
* Claude Code and Grok Build also expose 30-day Computer-local transcript totals by model.
  These snapshots follow ccusage accounting and contain only normalized counts, not transcripts.
* Token usage comes from normalized Computer turn reports. The Server maintains
  a transactionally corrected daily cube keyed by Agent, runtime, and model;
  reads join current Agent presentation without scanning raw turns. Cache reads
  and writes are subsets of input accounting and are not added again to
  processed-token totals.

## Surface

The API covers:

* read Codex, Claude Code, and Grok Build plan-usage summaries
* read 30-day Claude Code and Grok Build local token summaries
* read 90 days of range-ready Agent/runtime/model daily breakdowns
* read provider and model activity
* read spend estimates
* read runtime health
* read slow, failed, or expensive work signals

## Runtime Boundary

Computers and providers produce raw activity. The hosted Server persists
sanitized per-Computer snapshots and turns them into app-visible usage, spend,
freshness, and health views.

## Related Docs

* [Usage feature](../features/usage.md)
* [API overview](overview.md)
* [Data model](../internals/data-model.md)
