---
summary: The Cloud Agent work card headlines Cursor's own status for the newest Run Cursor has received, never a Haus-invented state or "Queued"; the card is a quiet, height-stable reference while the delegating Agent's messages carry outcomes and failures; Thread previews list one row per job; follow-up delivery is bounded.
read_when:
  - changing the Cloud Agent work card, its job-state chip, status line, or layout
  - changing `deriveCloudAgentJob`, the `job` field, or how follow-up Runs affect job state
  - changing Thread-preview Cloud Agent rows or the Inbox's Happening now work rows
  - changing Computer follow-up delivery, retries, or how undeliverable Runs settle
  - proposing a Haus-level status ("Stopped", "Needs review") or card-level error UI for Cloud Agents
  - changing the "Open in Cursor" link or explaining where launched agents appear in Cursor
---

# ADR 0041: Cloud Agent Cards Mirror Cursor

## Status

Accepted 2026-10-09.

## Context

Haus Agents launch Cursor Cloud Agents through the Cursor SDK, and each launch renders a work card
in the Chat. Users saw cards stuck on "Queued" for over an hour. Two causes:

- The card headlined the **newest** Run's status, and sending a follow-up marked the work queued
  before Cursor was contacted. A finished first pass and its pull request disappeared behind
  "Queued", and so did Runs that had already errored in Cursor.
- The Computer retried an undeliverable follow-up forever and only logged locally. Neither the
  human nor the delegating Agent learned of it.

Users also could not find the runs in Cursor. Cursor's agent sidebar hides SDK- and API-launched
agents by default (Source filter → enable "SDK"); they are listed on cursor.com/agents under the
launching account.

Prior art shaped the decision. Cursor's own API separates agent lifecycle from Run state. Grok Bot,
which drives Cursor Cloud Agents, shows agents as inline chips, lets the agent narrate outcomes in
plain messages, wakes the launching agent on finish instead of polling, and treats a queued
follow-up as a detail. Linear's agent "stale" state and Devin's and Copilot's result-first handoffs
pointed the same way.

## Decision

1. **The headline mirrors Cursor.** The job-state chip shows Cursor's status for the newest Run
   Cursor has actually received (the Run has a `providerRunId`), in Cursor's vocabulary: Working,
   Done (FINISHED; pull request merge state lives on the PR row), Failed, Cancelled, Expired. Server
   derives it as `job` (`deriveCloudAgentJob` in `packages/haus-api/src/cloud-agent-job.ts`). Haus
   layers no business status on top, and "Queued" never headlines: a first Run not yet received
   reads Working. A follow-up still in Haus's local queue is not a Cursor Run and appears only as a
   secondary note (`<Agent> asked for changes · waiting/running <d>`).
2. **The card is a quiet reference; the Agent tells the story.** Every settling Run creates inbox
   attention for the delegating Agent, which explains outcomes, delivery failures, and crashes in
   ordinary Messages. The card adds no error UI for them.
3. **The card's height is stable.** Header, an optional PR row, exactly one always-present
   single-line status slot, and actions. Only the PR row's first appearance changes the height. The
   status slot shows the most urgent fact: failure reason, then the `No update in <d>` liveness
   warning, then the follow-up note, then activity or last update. One type size inside the card;
   weight and color carry hierarchy. Working uses an indeterminate spinner, because a part-filled
   disc implied progress Haus does not have.
4. **Thread previews list jobs.** One row per job, named by its title, problems first.
5. **Follow-up delivery is bounded.** A non-retryable Cursor rejection fails the Run immediately
   with Cursor's reason. Busy or transient errors retry until a deadline, then fail. Orphaned Runs
   settle. Each of these settles a Run and so reaches the Agent through decision 2.

`specs/cloud-agents.md` carries the full card, row, and delivery contract.

## Considered and rejected

- **A Haus "Stopped" catch-all status.** It hides which of Cursor's terminal states happened and
  invents vocabulary users cannot match against Cursor.
- **A "Needs review" chip.** Haus has no pull request review data yet to back it.
- **A per-provider summary row** ("9 agents · 7 running"). Briefly shipped; it says nothing about
  which job needs attention. Replaced by per-job rows.
- **A card-level "couldn't send" line.** Tried and rejected: it states a failure with no
  explanation or recourse. The Agent, woken by the settled Run, can explain and act.

## Consequences

- Server and Computer ship together: the work `job` and each Run's `createdAt` are required fields
  in strict schemas.
- iOS renders the same card and per-job Thread rows from `job` (`CloudAgentCard.swift`,
  `ThreadCloudAgentRow.swift`).
- "Needs review" waits for pull request review data.
- Open question: "Open in Cursor" uses `https://cursor.com/agents?id=<agentId>` on the web and an
  unverified `cursor://anysphere.cursor-deeplink/background-agent?bcId=<id>` desktop deeplink.
  Whether to switch to Cursor's documented `cursor.com/agents/<id>` path is unresolved.
