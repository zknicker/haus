---
summary: Usage surfaces for Agent token volume, Computer plan capacity, spend signals, and runtime health.
read_when:
  - changing Agent usage, plan capacity, spend, provider activity, or runtime health views
  - changing where operational usage appears in the App
---

# Usage

Usage turns Agent, runtime, and provider activity into contextual product views. Operational usage
appears beside the Agent or Computer that owns its meaning, and the Server-wide dashboard is the
**Usage** section of Settings at `/s/:slug/settings/usage`, so the settings sidebar stays in place
while you read it.

## Product surfaces

* **Agents Overview.** `/s/:slug/settings/usage` shows 7-, 30-, or 90-day processed-token volume across all
  Haus Agents. An Agent scope picker narrows the chart and configuration grid, and that scope is
  URL-backed under `agent` alongside the Computer and runtime filters, so a contextual drill-down
  stays visible, shareable, and removable. Four totals lead the page, each a distinct fact:
  **Processed** (input plus output), **Fresh input** (input not served from cache), **Output**,
  and **Cache hit rate** (cache reads over input). The daily chart stacks one series per Agent in
  the categorical chart colors. The four Agents with the most processed volume in the range are
  named and the rest fold into a neutral **Other** series, but volume never picks a color: each
  Agent's color follows its roster position (the Server's Agent list, oldest first, then Agents seen
  only in usage, by id). The first four roster Agents own slots 1–4, so with four or fewer Agents a
  color is the same in every range, scope, and single-Agent view. Past four, a named Agent without
  a home slot takes the lowest slot no other named Agent holds, so colors stay unique and never
  cycle but may shift when the named set changes. The tooltip names the day like the axis and lists
  segments top-down. The configuration grid's runtime chip is a plain label; the chart legend owns
  the Agent-to-color mapping.
* **Agent Overview.** An Agent profile carries one compact tile instead of a second dashboard: its
  processed-token total for the last 30 days and a sparkline of daily volume, with **See in Usage**
  opening Agents Overview already scoped to that Agent. Ranges, per-configuration breakdown, and
  cross-Agent comparison belong to Agents Overview.
* **Computer detail.** Owners and Admins see equal-size capacity cards for detected Codex, Claude
  Code, and Grok Build runtimes. Supported runtimes that are absent sit in compact,
  low-contrast **Not Detected** Chips in the section header instead of occupying card-sized space.
  Computer-local token ledgers are not shown on this surface.
* **Model connections.** Settings → Models lists plan accounts in one table with what is left of
  each 5-hour and weekly window and the soonest reset. A ChatGPT plan connection shows its windows
  as the runner last read them; a Claude plan connection shows them as its last Captain turn
  reported them. Nothing shows until a reading lands, or once the last one is six hours old.
  SuperGrok and API-key connections show none. See
  [Model connections](../../specs/model-connections.md#plan-capacity).

The atomic Haus token reporting unit is Agent × runtime × model, with input, output, cache-read,
and cache-write counts. Computer-local Claude Code and Grok Build ledgers are runtime × model
because those runtime transcripts do not carry a Haus Agent id.

For a Haus Agent turn, input includes cached input: cache-read and cache-write
break input down and are not added again. Processed tokens (a turn's total) are input plus output.
Claude Code reports input this way. Codex reports input without its cached part, so the Codex
driver adds the cached count back; a Codex turn's processed tokens then
equal the growth in Codex's own thread total. Codex usage recorded before that fix undercounts
input and is not corrected: daily rows mix turns from before and after it, and earlier rows also
counted only a turn's last model request, so no reliable correction exists.

## Hosted data flow

Computer settings includes **Refresh** beside Plan usage in Diagnostics. Owners and Admins can ask an online
Computer to rescan installed runtimes and their models without restarting it. The scan replaces
only runtime inventory, preserving the Computer name and skills. Server
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

Codex usage uses the Computer's native Codex session. Claude Code plan usage comes primarily from
the structured usage data exposed by an already-running managed Claude Code SDK session. Computer
leases that collection once per 15-minute interval and persists the result; the App never polls
Anthropic. When no fresh snapshot is available, Computer may make one guarded OAuth usage request,
including before the first managed Claude turn. Failures trigger durable exponential backoff.
Fresh SDK evidence suppresses that fallback; a retained old snapshot never suppresses future retries.
On macOS, that fallback prefers Claude Code's current Keychain session and rejects expired credential-file tokens. Grok Build plan usage uses its
local login and the same credits billing request as the official Grok Build client. No App surface shows
these runtime snapshots since the Device page lost its Workers section (ADR 0062 step 7); the
Server still stores them. Malformed Claude credential documents are authentication failures, distinct from malformed usage
responses. The usage reader checks the credential file before macOS Keychain, matching the execution
adapter's discovery order; a valid file does not require interactive Keychain access.
Authentication and raw provider responses remain Computer-local.

Computer reads plan limits only from the providers' own usage responses. It never scans runtime
transcripts such as `~/.claude/projects/**/*.jsonl` or `~/.grok/sessions/**/updates.jsonl`: a
30-day scan of those logs once read gigabytes per report and exhausted the machine's memory, and
the totals it produced were never shown. Agent token volume comes from the turn ledger below.

Computer also records normalized token counts from each completed Haus Agent turn. The compact
turn summary carries the Agent, runtime, model, input, output, and cache counts to Server; prompts,
transcripts, and raw provider events remain Computer-local. A Codex turn reports every model
request it made: the app-server's `thread/tokenUsage/updated` carries each request (`last`) and
the thread's running total, and the Codex driver (`runtime/codex/turn-usage.ts`) sums a turn's
requests. An update that only re-sends the previous total, as a turn opens, is not a request.
Grok Build reports full turn totals in the prompt response's `_meta.usage` object. The Grok driver
(`runtime/grok/grok-usage.ts`) maps those counts into the turn's usage, including cache counts,
without adding reasoning tokens a second time. Sibling token fields describe only the last model
call and are not a fallback for missing turn usage. Turns without reported usage remain unknown.
An idle compaction (specs/runtime-drivers.md "Idle compaction") is recorded as the Agent's own
completed turn: its tokens are the difference in Claude Code's cumulative `modelUsage` across the
compaction, the only place its spend appears.

Server maintains a daily UTC rollup keyed by Server, date, Agent, runtime, and model. PostgreSQL
updates that cube transactionally when a compact turn summary is inserted, corrected, or deleted.
Usage reads therefore scan a bounded set of active configurations instead of every historical
turn. The per-turn summaries remain the audit and recovery source; Agent names and avatars stay
normalized and are joined when usage is read.

## Upstream methodology

Claude allowance comes from Claude Code's structured SDK usage response, with the OAuth usage
endpoint retained only as a guarded bootstrap fallback. Asking the provider rather than
reconstructing usage from transcripts matches [t3code](https://github.com/pingdotgg/t3code), which
reads Claude limits through the CLI's usage request with its transcript scan skipped and Codex limits
through `account/rateLimits/read`. Grok allowance follows the [official Grok Build billing
implementation](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-shell/src/extensions/billing.rs).

## Runtime sign-in issues

A native execution authentication failure becomes a Computer-owned issue scoped to that runtime.
Computer persists the issue and reports its kind and observation time in its existing inventory;
Server shares that sanitized status with the App. Raw provider errors and credentials stay local.
Agent hover cards, and profile pages show the issue for their assigned Computer and
runtime, with a link to Computer settings. The Computer page owns native sign-in instructions.
Other runtimes on the same Computer remain unaffected.

The runtime drivers resolve execution authentication from the host's own login. The Claude Code
and Grok Build drivers discover the host subscription, refresh an expiring token, and write the
rotated credential back owner-only (`claude-credentials.ts`, `grok-auth.ts`); a failed refresh
fails the session open instead of launching with a dead token. Codex links the host's
`auth.json` into the Agent's `CODEX_HOME`. An explicit API key in the Computer's environment wins
over a login. Agent workspaces remain isolated while authentication is resolved on the host, and
a credential rides only the live process environment, never a Haus-written launch record.

The warning describes the last Haus authentication failure, not the runtime's current login state.
If the runtime already works on the Computer, retry the Agent request. Sign in there only if the
runtime also asks for a login.

For Claude Code, reconnecting Computer or selecting **Refresh** beside Runtimes rechecks the native
CLI's `auth status`. A successful command reporting `loggedIn: true` clears the saved authentication
warning and publishes the new inventory. This checks the current login without running an Agent
or spending model tokens. Missing, failed, timed-out, and malformed checks retain the warning.
Ordinary reports after Agent turns do not perform this check, so a new execution failure remains
visible even if the CLI still reports a local login. A later execution authentication failure
restores the warning.

A successful Agent turn also clears its runtime's issue. Usage refresh alone and interrupted turns
do not clear it. A check or turn that started before a newer observation cannot overwrite it.
Historical failures remain in activity history; refreshing authentication does not replay failed work.
