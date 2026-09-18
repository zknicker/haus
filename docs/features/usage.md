---
summary: Usage surfaces for Agent token volume, Computer plan capacity, spend signals, and runtime health.
read_when:
  - changing Agent usage, plan capacity, spend, provider activity, or runtime health views
  - changing where operational usage appears in the App
---

# Usage

Usage turns Agent, runtime, and provider activity into contextual product views. It is not a
Settings destination: configuration stays in Settings, while operational usage appears beside the
Agent or Computer that owns its meaning. Settings navigation carries a **Usage** entry that links
out to `/s/:slug/usage`; the dashboard stays its own page rather than becoming a settings section.

## Product surfaces

* **Agents Overview.** `/s/:slug/usage` shows 7-, 30-, or 90-day processed-token volume across all
  Haus Agents. An Agent scope picker narrows the chart and configuration grid, and that scope is
  URL-backed under `agent` alongside the Computer and runtime filters, so a contextual drill-down
  stays visible, shareable, and removable.
* **Agent Overview.** An Agent profile carries one compact tile instead of a second dashboard: its
  processed-token total for the last 30 days and a sparkline of daily volume, with **See in Usage**
  opening Agents Overview already scoped to that Agent. Ranges, per-configuration breakdown, and
  cross-Agent comparison belong to Agents Overview.
* **Computer detail.** Owners and Admins see equal-size capacity cards for detected Codex, Claude
  Code, Grok Build, and Pi runtimes. Supported runtimes that are absent sit in compact,
  low-contrast **Not Detected** Chips in the section header instead of occupying card-sized space.
  Pi is shown as the provider-agnostic, API-backed runtime rather than as an OpenRouter account; its
  **View usage** action opens Agents Overview scoped to that Computer and Pi. Computer-local token
  ledgers are not shown on this surface.

* **Cloud Agents.** Beside the runtime capacity cards, the same Computer page carries one **Cursor
  Cloud Agents** row: Not connected, Connecting, Expired, Ready, or Unavailable, with **Connect** on
  the row and **Disconnect** behind its overflow menu once connected. Connecting runs Cursor's own
  browser sign-in on that Computer; Haus never opens it during an Agent turn, and no provider
  credential reaches Server. Cloud Agent access is separate from the Cursor runtime because the
  Cursor CLI and the Cursor SDK use different credential stores even for one account.

The atomic Haus token reporting unit is Agent × runtime × model, with input, output, cache-read,
and cache-write counts. Computer-local Claude Code and Grok Build ledgers are runtime × model
because those runtime transcripts do not carry a Haus Agent id.

## Hosted data flow

Computer settings includes **Refresh** beside Runtimes. Owners and Admins can ask an online
Computer to rescan installed runtimes and their models without restarting it. The scan replaces
only runtime inventory, preserving the Computer name, skills, and Cloud Agent readiness. Server
events update runtime rows, Agent runtime/model choices, and usage views together; the App does
not poll for installed software. Background discovery also runs when Computer connects and after
Agent configuration or execution changes. Grok discovery includes its native `~/.grok/bin` install.

Manual refresh also requests a new usage snapshot, bypassing the aggregate cache described below.
It makes one Claude plan attempt past that provider's guarded fallback backoff; a failed attempt
records the failure and re-arms the backoff. Fresh managed-SDK evidence and provider authentication
still apply. Inventory completion does not wait for provider usage, so newly detected runtimes
become selectable even when usage is unavailable.
An offline Computer cannot refresh. If an older Computer does not answer the refresh request,
the action times out with instructions to update Haus Computer and retry.

Each compatible Computer refreshes provider usage in the background at most once every 15 minutes
and stores the sanitized snapshot atomically in its data root. Reconnects and restarts therefore
reuse fresh data without calling provider APIs. Refreshes are coalesced, retry schedules survive
Computer restarts, and transient request or authentication failures retain the affected provider's
last successful snapshot, stamped with the failure that kept it. That aggregate cache is the only
layer that retains: a provider read either reports what it just learned or fails. The Computer
reports only sources it can actually read. The Server stores the latest timestamped snapshot for
each Computer. Disconnecting a Computer changes freshness and health; it does not erase its last
report.

Each runtime row uses its provider snapshot's capture time, independently of the Computer's report
time. After 30 minutes, or once a displayed allowance window has reset, the row labels its retained
numbers **Usage out of date** and shows **Last updated** instead of an upcoming reset date. A
snapshot the Computer has already reported as retained is labelled immediately rather than waiting
for that 30-minute mark, since it is known to be out of date rather than guessed to be.

Codex usage uses the Computer's native Codex session. Claude Code plan usage comes primarily from
the structured usage data exposed by an already-running managed Claude Code SDK session. Computer
leases that collection once per 15-minute interval and persists the result; the App never polls
Anthropic. When no fresh snapshot is available, Computer may make one guarded OAuth usage request,
including before the first managed Claude turn. Failures trigger durable exponential backoff.
Fresh SDK evidence suppresses that fallback; a retained old snapshot never suppresses future retries.
On macOS, that fallback prefers Claude Code's current Keychain session and rejects expired credential-file tokens. Grok Build plan usage uses its
local login and the same credits billing request as the official Grok Build client. Computer cards
use the provider's all-model weekly allowance as their shared primary metric. A compact header
indicator conditionally shows an enforced 5-hour window; model-specific windows stay out of this
comparative surface. A runtime whose snapshot carries no weekly window shows no weekly meter: a
5-hour allowance stays in the 5-hour column rather than standing in for a weekly one, and a session
window too long to be a 5-hour allowance is reported as unavailable rather than mislabelled. A
runtime that has never reported usage and has no login reads **Signed out on this Computer** in
place of its meters. A runtime whose login later expires keeps its last known meters and labels
them **Signed out on this Computer** rather than with the generic out-of-date note. Either clears
when the owner signs in to that runtime on the Computer and the next snapshot arrives.
Authentication and raw provider responses remain Computer-local.

Cloud Agent usage is per-Run rather than per-window. Each terminal Run observation carries the
input and output tokens Cursor reports plus its optional cost, which is eventually consistent and
can lag a settled Run. Haus makes no claim about a Cursor plan's capacity, remaining allowance, or
reset time: Cursor exposes no supported public personal-account surface for them, so the Cloud
Agents row shows readiness only and never a meter.

Claude Code and Grok Build token totals follow ccusage's source rules: Claude assistant usage rows
under `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/**/*.jsonl`, including subagents and replay
deduplication; and completed Grok turns under `${GROK_HOME:-~/.grok}/sessions/**/updates.jsonl`,
expanded by model without counting reasoning twice. Computer scans only files modified inside the
30-day window, caches parsed rows by path, size, and modification time, and reuses the aggregate
while the file fingerprint and UTC day are unchanged. The one-minute report therefore checks file
metadata without repeatedly parsing or aggregating an unchanged ledger. Raw logs never leave the
Computer.

Computer also records normalized token counts from each completed Haus Agent turn. The compact
turn summary carries the Agent, runtime, model, input, output, and cache counts to Server; prompts,
transcripts, and raw provider events remain Computer-local. Codex exposes session-cumulative
counters, so Computer stores a per-session baseline and reports only each turn's delta.
Grok Build reports full turn totals in the prompt response's `_meta.usage` object. The ACP adapter
patch maps those counts into standard finish usage, including cache counts, without adding
reasoning tokens a second time. Sibling token fields describe only the last model call and are
not a fallback for missing turn usage. Remove this part of the patch once the upstream adapter
consumes Grok's prompt usage. Turns without reported usage remain unknown.

Server maintains a daily UTC rollup keyed by Server, date, Agent, runtime, and model. PostgreSQL
updates that cube transactionally when a compact turn summary is inserted, corrected, or deleted.
Usage reads therefore scan a bounded set of active configurations instead of every historical
turn. The per-turn summaries remain the audit and recovery source; Agent names and avatars stay
normalized and are joined when usage is read.

## Upstream methodology

The local-ledger adapters track [ccusage](https://github.com/ccusage/ccusage), specifically its
Claude transcript and Grok `turn_completed` accounting rules. Those reconstructed ledgers own token
volume, not authoritative subscription allowance. Claude allowance comes from Claude Code's
structured SDK usage response, with the OAuth usage endpoint retained only as a guarded bootstrap
fallback. Grok allowance follows the [official Grok Build billing
implementation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/src/extensions/billing.rs).

## Runtime sign-in issues

A native execution authentication failure becomes a Computer-owned issue scoped to that runtime.
Computer persists the issue and reports its kind and observation time in its existing inventory;
Server shares that sanitized status with the App. Raw provider errors and credentials stay local.
Agent hover cards, profile pages, and profile panes show the issue for their assigned Computer and
runtime, with a link to Computer settings. The Computer page owns native sign-in instructions.
Other runtimes on the same Computer remain unaffected.

An expired sign-in reads differently from a missing one, and the message says which. Claude Code's
access token lasts about eight hours and only the `claude` CLI can trade its refresh token for a
new one: an Agent's isolated home reaches no login of its own, so Haus cannot do it on the
operator's behalf. That failure therefore asks for `claude` to be run once on the named Computer,
while a Computer that was never signed in asks for a sign-in.

After signing in — or refreshing — on the named Computer, retry the Agent request. A successful
turn using that runtime clears the issue. Inventory discovery, an interrupted turn, and a usage
refresh do not prove execution authentication succeeded and cannot clear it. An older in-flight turn cannot
overwrite a newer observation. Historical failures remain in activity history.
