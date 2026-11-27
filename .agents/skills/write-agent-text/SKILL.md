---
name: write-agent-text
description: The house style for every sentence a Haus Agent reads (managed prompt, Task prompt, Manual topics, CLI help and receipts, inbox and event text, seeded skills). Use when adding a capability Agents will use, when writing or reviewing any of that text, and when briefing a subagent to do either. Drift happens at feature time, so load this before the feature's text is written, not after.
---

# Write agent text the way Claude Code's prompt is written

Haus Agents are capable models. Describe their world and the people in it, and they work out what to do. Claude Code's own system prompt is the reference: it says what the tools are, what each one costs, and what the user sees, and it keeps hard rules for safety.

## Describe the world, not the routing

Write what a thing **is**, what it **does**, and what **people see**. Leave out who wakes when, which turn posts what, and the order of steps. Those are consequences the model works out, or facts the event input already carries.

> 19.0.0: "A Task is how people follow work that takes longer than a reply. While it is open it sits in their sidebar … It has its own page."
>
> Drift: "End each turn your Captain directed with a report; a turn a person drove needs one only when it failed or needs your Captain."

The first sentence lets the model handle cases nobody listed. The second invites the next rule. More pairs from our own history are in `examples.md`.

## Put each fact where it is true

| Where | Holds | Example |
|---|---|---|
| Managed or Task prompt | The standing world: what things are, what people see, why. Every-turn mechanics, once each. | What a Captain chat is and who reads it |
| Manual topic | Mechanics looked up occasionally: flags, recipes, edge behaviour | `haus issue update` flags |
| CLI help and receipts | Facts at the moment of action: what just happened, who was notified | "Posted in GEN-12; Ada notified" |
| Inbox or event text | Why the agent is awake now, and what changed | "Ada assigned you GEN-12" |
| Code | Anything that must not happen | The tool refuses it |

Most drift comes from routing facts written into the prompt when they belong in the event, or from rules written in prose when they belong in code.

## Habits

- **Give the reason, not the rule.** "People see the Task under the message that started it" does the work that "don't repeat the result in the channel" tries to do.
- **Defaults over ladders.** Two "when … then" clauses in one paragraph is a ladder; rewrite it as a description plus a reason.
- **One recipe beside the concept**, when exact mechanics matter: the command shape, once.
- **Normal voice.** Say what good looks like. Save NEVER, MUST and IMPORTANT for safety and irreversible actions, with the reason.
- **Shrink over time.** A new capability should mostly be new description. If the text grows rule by rule, it's turning into a ladder (the bitter lesson).
- **All agent text is in scope, including passages that came from Raft.** Raft got Haus here, but Haus behaviour has diverged; Claude Code's prompt is the reference now.

## Before you commit

1. **Cold read.** Give a fresh subagent only the rendered text plus one situation the text doesn't mention, and ask what it would do. If it can't say, the description is missing something. Add the missing fact; don't add a rule.
2. **Eval.** Prove the behaviour with `.agents/skills/tune-agent-behavior`. The **grader** holds the outcome you want; the **text** only describes the world.
3. **Contract.** Follow the prompt contract in AGENTS.md: register rows, the cap, and `bun run test:prompt-contract`.

Sources:
- Anthropic, "Effective context engineering for AI agents": the right altitude, and against "hardcoding complex, brittle logic".
- Anthropic, "How we built our multi-agent research system": "good heuristics rather than rigid rules"; "think like your agents".
- Claude prompting best practices: "Claude can generalize from the explanation".
