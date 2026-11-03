/**
 * Whether the runtime's driver lets the Agent start sub-agents, which turns on the prompt's
 * `## Working through sub-agents` section. Only Claude Code: Codex and Grok Build sub-agents are
 * switched off at their launch (`agents.enabled = false`, `GROK_SUBAGENTS=0`).
 */
export function supportsSubagents(runtimeId: string): boolean {
    return runtimeId === 'claude-code';
}
