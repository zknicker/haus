---
summary: The `advent.calendar` query behind "Your year in Haus", the Christmas advent calendar — its door gates, the fact each door counts, and its privacy rules.
read_when:
  - changing `advent.calendar`, the advent seam in `packages/haus-api/src/advent.ts`, or `apps/server/src/advent/`
  - changing how an advent fact is counted, worded, or gated by date
  - adding a durable record an advent fact should count (channel creators, task close stamps, human-attributed Agent turns)
---

# Advent calendar API

`advent.calendar` serves "Your year in Haus": one door a day from Dec 1 to Dec 24, each revealing
one fact about the member's year in one Server, with the Dec 24 door opening the recap. The Server
counts and writes the copy; the App paints the doors. The procedure lives in
`apps/server/src/haus-api/advent/`, the product logic in `apps/server/src/advent/`, and the wire
types in `packages/haus-api/src/advent.ts`.

## Contract

Input: `{ serverId, year, throughDay, timeZone }`. Any Server member may call it for themselves;
there is no way to read another member's calendar.

* `timeZone` must be a named IANA zone (`America/New_York`, `Etc/GMT+5`, `UTC`). Bare offsets
  such as `+05:00` are refused with `BAD_REQUEST`: PostgreSQL reads POSIX offsets with the sign
  inverted, so the buckets would land on the wrong side of the day.
* `throughDay` is the member's local day of December (25 opens every door). The Server refuses,
  with `FORBIDDEN`, a day no place on Earth has reached: the limit is the date at UTC+14. Before
  Dec 1 of `year` reaches UTC+14 no door is open; once Dec 25 reaches UTC+14, or for any past
  year, every door is. A Server running with development auth (`HAUS_DEV_STACK=1`) skips this
  gate so the App's `haus.debug-today` can preview doors out of season; production never does.
* The result is `{ year, entries }` with entries for days 1 through `min(throughDay, 24)`, in day
  order. Only the requested doors are read.

Each `fact` entry carries the door's fixed `title` and one `line` of runs. Numbers and names are
`strong` runs; every other run is hand-written text. Dec 24 is the `recap` entry: up to eight
`stats` tiles (Messages, Chats, Threads, Agents, Tasks closed, Tokens, Busiest hour, Most thanked),
each omitted when it has no data, and a `closing` line naming the loudest channel. A year with
nothing counted still shows one true tile, `Messages: 0`.

## Copy

The copy is hand-written innkeeper templates in `apps/server/src/advent/copy/`, never runtime AI.
Each fact has two or three variants, picked by a hash of member id, year, and day, so a reload
never rewrites a door. An empty fact (a zero count, or no candidate such as no DMs) shows a
fallback line with no strong runs and no invented value.

## What each door counts

Everything is scoped to the requesting member in this Server, within `year` as bounded by
`timeZone`, and limited to live Chats the member can read: any channel, a DM they are a side of,
and Threads under those. A Thread under a soft-deleted channel or DM is gone with it, though its
own row is not. Thread messages count toward their parent channel or DM.

| Day | Fact | Counts |
| --- | --- | --- |
| 1 | `messages-sent` | Messages the member sent. |
| 2 | `loudest-channel` | The channel with most of their messages. |
| 3 | `busiest-hour` | The local hour with most of their messages. |
| 4 | `full-house` | Of channels they wrote in, the one with the largest current roster of people and Agents (at least two). |
| 5 | `early-bird` | The median of each morning's first send, mornings being 4am to noon local. |
| 6 | `agents-at-table` | Distinct Agents they addressed: an Agent DM (or Thread under it) or an `agent://` mention. |
| 7 | `most-thanked-agent` | The Agent most often addressed by a message matching a short thank-you word list. |
| 8 | `files-shared` | Ready attachments they sent on a message. |
| 9 | `night-owl` | Messages sent from midnight to 5am local. |
| 10 | `closest-dm` | The DM, human or Agent, with most of their messages, named by the other side. |
| 11 | `longest-thread` | Of Threads they wrote in, the one with the most messages. |
| 12 | `tokens-used` | Tokens on the daily usage cube for the member's Agents, by UTC usage date. |
| 13 | `quickest-reply` | Their fastest message after someone else's in the same Chat, ignoring gaps under a second. |
| 14 | `busiest-day` | The local date with most of their messages. |
| 15 | `tasks-closed` | Tasks they created that reached `done` or `closed`, by `updated_at`. |
| 16 | `new-channels` | Channels they created. |
| 17 | `quiet-month` | The finished month, between their first and last active months, with fewest messages. |
| 18 | `threads-resolved` | Threads whose first message was theirs and that someone else answered. |
| 19 | `favorite-reaction` | The emoji they reacted with most. |
| 20 | `hardest-worker` | The member's Agent with the most turns on the usage cube. |
| 21 | `in-demand` | Messages by others that mention them. |
| 22 | `longest-streak` | The longest run of consecutive local days with at least one message; ties go to the earliest run. |
| 23 | `weekends-off` | The share of their messages sent on a local Saturday or Sunday. |
| 24 | `recap` | The year in up to eight tiles. |

Approximations, each because Haus keeps no more precise record:

* "The member's Agents" are Agents they created plus Agents they keep a DM with. Agents are
  Server-wide and turns are not attributed to a human, so `tokens-used` and `hardest-worker` read
  the usage cube for that set.
* `new-channels` has no creator column to read. Channel creation enrolls the creator in the same
  transaction, so the creator is the participant whose row shares the Chat's `created_at`.
* `tasks-closed` uses `updated_at` as the close time, and only the creator side: Tasks are Agent
  work, so no human is ever an assignee.
* `full-house` reads a channel's current roster, not who was there during the year.

## Privacy

The response carries counts, `#channel` names, and display names only. Message content is read
inside PostgreSQL for two facts, the thank-you match and `agent://` mentions, and is never
selected out. Thanks are counted, never returned. `in-demand` counts only mentions in Chats the
member can read, so a mention inside another pair's DM never reaches them.

## Performance

Only the requested doors are read, plus the doors the recap summarizes when Dec 24 is open. Every
fact drawn from the member's messages shares one query (`stats/fact-readers.ts`): it builds the
member's messages once as a materialized CTE, then each fact is one JSON column over it. The
other facts (files, reactions, mentions, tasks, new channels, tokens, turns) are one query each.
Queries run one after another, never fanned out across the Bun pool.

The member's messages are read through one probe per readable Chat of the existing
`chat_messages_author_user_idx`, fenced with `offset 0` so the planner cannot flatten it into a
scan of every message in the Server. Probes grow with the Server's channels and their Threads,
not with other people's DMs. Mentions use the `mentioned_user_ids` GIN index and usage reads the
cube's primary key. No migration was needed. If Thread counts grow large enough to matter, an
index on `(server_id, author_user_id, created_at)` would make the read independent of Chat count.

## Related Docs

* [Usage API](stats.md)
* [Data model](../internals/data-model.md)
