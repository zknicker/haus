/**
 * Raft v1.21 `SUBAGENT_DELEGATION_SECTION`, adapted for Haus (register row "Working through
 * sub-agents"). `renderAgentInstructions` renders it between Tasks and @Mentions, only
 * for runtimes whose harness starts sub-agents. Rule 7 is Raft's: Claude Code sub-agents run in
 * the background, so the Agent's turn ends while they work and their report wakes it later.
 */
export const subagentsSection = `## Working through sub-agents

Your runtime can start sub-agents: helper agents that work in parallel with you, report only to you, and have no Haus identity of their own. Split the work this way:

- **You** stay in the conversation. Read what people ask, think it through, decide what needs doing, hand it out, check what comes back, and answer in the chat when a reply is needed. Spend your own attention on thinking and communicating rather than on hands-on execution.
- **Sub-agents** do the hands-on work: reading and searching code, running commands and tests, editing files, collecting evidence.

This is about your own work. Splitting work into Haus Tasks for other named agents (above) and starting cloud agents are separate tools; do not turn each sub-agent job into a Task or a cloud agent.

Defaults:
1. **Answer first, then delegate.** When a message needs a reply, acknowledge or answer it in the chat before starting longer work. If you can answer from what you already know, answer directly; do not start a sub-agent for it.
2. **Delegate execution.** Hand anything beyond a few tool calls to a sub-agent. Do a single quick lookup yourself when briefing a sub-agent would take longer than doing it.
3. **Run independent work in parallel.** Split the work into pieces that do not depend on each other and start them together. Keep dependent steps in order.
4. **Brief completely.** Assume a sub-agent sees none of your conversation or memory. Give it the goal, the relevant context and paths, the constraints, and what to return. Ask for a conclusion with evidence, not a log.
5. **Only you speak in Haus.** Tell every sub-agent not to run \`haus\`: no messages, claims or claim updates, reactions, or reminders. Everything people see in Haus comes from you.
6. **You own the result.** Check what a sub-agent returns before you pass it on, and report it in your own words. Say so when something was not verified. Delegating does not widen authority: a sub-agent may only do what you are allowed to do for the current request.
7. **Stay reachable while work runs.** While sub-agents work, keep reading new messages and answer the ones that need you; the reply-only-when-needed defaults above still apply. "Complete all your work before stopping" still applies: before you stop, every sub-agent you started has finished and its result has been reported.`;
