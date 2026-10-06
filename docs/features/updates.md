---
summary: App-wide update opportunity and offline Computer attention behavior.
read_when:
  - changing the sidebar updater, version breakdown, or update sequencing
  - changing how offline Computers appear outside Computer settings
  - changing App or Computer version presentation
---

# Updates and Computer attention

The sidebar updater is a one-click control for release work Haus knows is needed and can act on
now. It is not a compliance report for every attached machine. The desktop App contributes its
native updater state; each connected Computer contributes its own installed version and update
state. An offline Computer creates no new update opportunity from its last reported version,
which may no longer describe the installed software. An update already in progress may remain
visible while Haus waits for reconnection.

When the App opens and whenever it regains focus, the updater asks Server to verify which
Computers answer right now (`computer.checkPresence`) and replaces its Computer list with the
result. Until the first check of the session settles, the updater shows nothing at all, not even
App or website updates, so it never flashes a Computer update that the check would retract. If the
check fails, the updater offers no Computer updates but still shows App and website updates.

The anchored update tooltip lists only surfaces that still need attention. A current App or
Computer stays out of the tooltip. Every Computer row includes its user-facing name, such as
**Computer · Home**, so simultaneous updates remain unambiguous. Haus Agent receipts are internal
diagnostics, not update targets. Version drift, live progress, and failures remain attached to
their own rows. A failure includes the safe reported detail and one concrete recovery suggestion.
The compact button represents the next useful action: download, live progress, App restart, or
retry. During an update it stays visually solid but ignores presses. Its donut is one circle for
the one update running now, filled with that update's reported progress; while that update reports
no progress, such as verifying, installing, or restarting, the arc spins instead (static under
reduced motion). Its label names the update and its place in the run, such as **Updating Computer ·
Home (2 of 3)**, and the tooltip marks later updates as waiting.

One click runs one update at a time. The App goes first: it downloads, then restarts on its own,
before any Computer starts. Before restarting it remembers, in App-local storage, which reachable
Computers the click still owes; the relaunched App resumes them without another click once it has
verified which Computers answer. That intent is consumed exactly once and expires after thirty
minutes. Without an App update, or in the web App, Computers start right away. Computers then
update one after another in tooltip order. A Computer already current is skipped, one already
updating is observed rather than started again, and one that is offline is left for later. One
Computer failure never stops the next Computer. An App download or restart failure stops the run
before any Computer starts. A Computer that reconnects during a run never joins it. While a run is
active or owed after a relaunch, the per-Computer Update button in Settings is disabled so the two
never race. A fresh updater press replaces any owed Computers with its own plan.

Computer connectivity is separate product attention. Owners and Admins see a yellow sidebar
button after a ten-second offline delay. Its tooltip lists each offline Computer and its last
connected time, including **Never**. Clicking opens the first listed Computer in Settings. Expected
disconnects during an update restart are suppressed; a Computer that does not reconnect within
two minutes of its last progress report becomes ordinary offline attention. An active update that
loses its Computer connection remains visible until that timeout. Afterward, both the sidebar updater
and Computer Settings say the outcome is unconfirmed and direct the operator to reconnect the
Computer. The sidebar does not offer a retry while it is offline, and other reachable updates may
continue. Reconnection replaces the last reported phase with the Computer's installed version and
actual update result. Server requires a live Computer attachment before checking or starting an
update, so a retained old version alone never starts one. A requested update or check that the
Computer has not advanced within two minutes is reported as failed, so the updater never shows an
update in progress indefinitely. The App, in both the sidebar and Computer Settings, applies the same bound to any update phase on
a connected Computer that has not reached its target version: two minutes without a progress
report turns it into a failure with a retry. A Computer
that keeps reporting an unchanged phase, such as waiting for a long Agent turn, is never failed
while it reports. Server stamps each progress report with its own receive time, so a Computer
clock running behind never makes a live update read as stalled. A reconnect that repeats the stored
update snapshot keeps the earlier time, so a Computer reconnecting in a loop still reaches the
bound. The App
update is offered only when the native updater reports one; a newer release alone is not enough.

The hosted website contributes a reload opportunity to the same updater. Its build marker ships
with the website files; the App checks it every minute while visible and when returning to Haus.
Website-only updates show a reload icon with **Update available. Reload Haus.** Computer updates
finish first, then reload becomes the next action. A ready desktop restart takes precedence and
also picks up the website. Failed Computer updates remain visible without blocking website reload.
Website reload is available to every member and never happens automatically. Pending chat drafts,
editor drafts, or saves must be finished before reloading because they are held in memory.
