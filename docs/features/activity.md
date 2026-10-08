---
summary: The Server Activity page — every Agent's turns in one event log, filterable by Agent, and the per-Agent Activity tab as its filtered view.
read_when:
  - changing the Server Activity page, its sidebar entry, or its Agent filter
  - changing how the Agent Activity tab and the Server Activity page share the event log
---

# Activity

Activity shows what the Server's Agents did, as one event log. The Activity page, opened from
the sidebar's top menu (Inbox, Search, Tasks, Activity) or the command menu, lists every Agent's
turns interleaved, newest first, under day rows, with a pinned day bar and overview strip. Each
turn header names its Agent. An Agent's own profile has an Activity tab that is the same log
filtered to that Agent.

Every day from today through the oldest loaded turn has a heading, including the first day.
Days without turns for the selected Agents show `No activity`. Loading older activity extends
this calendar range; an entirely empty log still shows today's heading.

The Agent menu at the end of the day bar narrows the page to chosen Agents. The choice lives in
the page address (`?agents=…`), so a narrowed view survives reload and can be shared. Older turns
load a page at a time with `Load older activity`.

Every member sees turn summaries; a turn's title stays private when its request came from a Chat
the viewer cannot see. Step-level detail (the execution journal and outlines) is for Server Owners
and Admins. The contract lives in [Agent Activity](../../specs/agent-activity.md#server-activity-page)
and [`agent.serverTurns`](../api/agents.md#turn-and-delivery-observability).
