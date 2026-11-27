# Examples: description versus drift (from Haus history)

The "good" passages come from Haus 19.0.0 (`f547eee2c`). The "drift" passages were added during the ADR 0062 work. The rewrites show the direction; they are not final copy.

## A Task
- **Good:** "A Task is how people follow work that takes longer than a reply. While it is open it sits in their sidebar with its state. It has its own page … When it is done, it leaves."
- **Drift:** "When to start one. When your reply will not finish the work and someone else can do it from a brief. When your reply is the whole of the work, just reply."
- **Direction:** describe what a Task gives the person: its own chat and a place in their sidebar, and a fresh agent working from a brief. Choosing to start one is the model's judgment.

## Crew reports
- **Drift:** "End each turn your Captain directed … with a report; a turn a person drove needs one only when it failed or needs your Captain."
- **Direction:** "Your Captain hears when each of your turns ends and reads your chat." Who reads what is the description; the report command went away with the rule (ADR 0062, amended 2026-11-28).

## Wake conditions
- **Drift:** "You are woken … when someone else assigns you an Issue, moves one of yours out of `backlog`, comments on it, changes its state, or closes its last open sub-issue. Assigning in `backlog` wakes nobody…"
- **Direction:** the prompt says what the queue is ("Issues assigned to you, in priority order"). The `issue_event` input says why this turn started.

## Messaging a Task
- **Drift:** "A Task is messaged with `haus task send <shortId>`, never `message send`."
- **Direction:** the recipe once, beside the concept ("A Task's chat takes messages through `haus task send <shortId>`"), and the CLI refuses the wrong path. No "never".

## Where the person looks
- **Good:** "So the person waiting on you gets what they asked for where they are looking … and nothing they did not ask for."
- This one sentence covers acknowledgements, results, and not narrating, with no posting rules.
