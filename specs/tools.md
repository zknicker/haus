# Tools

Tools are actions available to an Agent through its selected execution runtime or through
Server-owned MCP connections. Tool calls are Computer-local execution evidence. Server may retain a
bounded set of tool names in a turn summary, but not arguments, command contents, model reasoning,
or arbitrary results.

Durable product effects use typed Server APIs such as Messages, Tasks, Reminders, skills, and MCP
invocation. Renderable output becomes a Message visual or Computer-local artifact reference through
an explicit product contract; raw tool protocol fragments do not become Chat rows.

Web reach is the model provider's own, with no per-Agent gate and no prompt section. On a
Computer each runtime brings its own tools (Claude Code `WebSearch` and `WebFetch`, Codex
`web_search = "live"`, Grok Build's builtins). On the runner, Claude Agents keep the SDK's native
`WebSearch` and `WebFetch`, and Pi Agents get a runner `web_fetch` plus their provider's search:
hosted in the request for the ChatGPT plan, xAI, and OpenRouter (its `openrouter:web_search`
server tool), and a `web_search` tool over Gemini's Google Search grounding. Search goes through
the model's own connection, never a separate search key, and is on for every connection by
default ([Web reach](runtime-drivers.md#web-reach)).

Native builtins that would bypass Haus or wait on a host answer stay off
(`CLAUDE_DISALLOWED_TOOLS` in `apps/runner/src/claude/claude-launch.ts`, and
the runner's Pi harness): Claude Code runs without plan mode, `ScheduleWakeup`,
and the `Cron*` tools (Raft's disallowed set; Haus Reminders own scheduling), without
`RemoteTrigger` and `PushNotification` (the same bypass through Claude's cloud), without
`AskUserQuestion`, and without `Monitor` (it streams output into the conversation, a wake source
Haus does not surface; background sub-agents and shells stay on, see
[Runtime drivers](runtime-drivers.md#background-work)); Grok Build runs without
`ask_user_question`. Agents ask humans in a Haus message.
