# Tools

Tools are actions available to an Agent through its selected execution runtime or through
Server-owned MCP connections. Tool calls are Computer-local execution evidence. Server may retain a
bounded set of tool names in a turn summary, but not arguments, command contents, model reasoning,
or arbitrary results.

Durable product effects use typed Server APIs such as Messages, Tasks, Reminders, skills, and MCP
invocation. Renderable output becomes a Message visual or Computer-local artifact reference through
an explicit product contract; raw tool protocol fragments do not become Chat rows.

Web reach is runtime-native, as in Raft: every Agent gets its runtime's own web search and fetch
tools with no per-Agent gate and no prompt section (Claude Code `WebSearch` and `WebFetch`, Codex
`web_search = "live"`, Grok Build's builtins). Haus has no web host tool.
