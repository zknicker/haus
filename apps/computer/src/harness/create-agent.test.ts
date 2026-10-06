import { afterAll, expect, test } from 'bun:test';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createHarnessAgent, sandboxOptions } from './create-agent.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

for (const webAccess of [null, 'search', 'fetch-only', 'search-only'] as const) {
    test(`constructs the real Claude Agent with web access ${webAccess}`, () => {
        expect(() =>
            createHarnessAgent(
                {
                    agentId: 'agt_constructor',
                    env: {},
                    homeDir: '/tmp/haus-constructor/home',
                    modelId: 'claude-fable-5-1',
                    runtime,
                    runtimeId: 'claude-code',
                    tools: {},
                    webAccess,
                    workspaceDir: '/tmp/haus-constructor/workspace',
                },
                { harness: createClaudeCode(), instructions: 'Test.' }
            )
        ).not.toThrow();
    });
}

const grokInput = {
    agentId: 'agt_grok',
    env: { EXISTING: 'kept' },
    homeDir: '/tmp/haus-constructor/home',
    modelId: 'grok-code-fast-1',
    runtime,
    runtimeId: 'grok-build',
    tools: {},
    webAccess: null,
    workspaceDir: '/tmp/haus-constructor/workspace',
} as const;

test('Grok Build inlines MCP output, spawns no sub-agents, and loads no foreign MCP or instruction config', () => {
    expect(sandboxOptions(grokInput).env).toEqual({
        EXISTING: 'kept',
        GROK_CLAUDE_AGENTS_ENABLED: 'false',
        GROK_CLAUDE_RULES_ENABLED: 'false',
        GROK_CURSOR_AGENTS_ENABLED: 'false',
        GROK_CURSOR_RULES_ENABLED: 'false',
        GROK_CLAUDE_MCPS_ENABLED: 'false',
        GROK_CODEX_MCPS_ENABLED: 'false',
        GROK_CURSOR_MCPS_ENABLED: 'false',
        GROK_MANAGED_MCPS_ENABLED: 'false',
        GROK_HOME: '/tmp/haus-constructor/home/.grok',
        GROK_MAX_MCP_OUTPUT_BYTES: '102400',
        GROK_SUBAGENTS: '0',
        HOME: '/tmp/haus-constructor/home',
    });
});

test('other runtimes carry no Grok MCP output cap', () => {
    expect(sandboxOptions({ ...grokInput, runtimeId: 'claude-code' }).env).toEqual({
        EXISTING: 'kept',
        HOME: '/tmp/haus-constructor/home',
    });
    expect(sandboxOptions({ ...grokInput, runtimeId: 'codex' }).env).toEqual({
        CODEX_HOME: '/tmp/haus-constructor/home/.codex',
        EXISTING: 'kept',
        HOME: '/tmp/haus-constructor/home',
    });
});

// Pi runs in the Computer process and reads the Computer's own `~/.pi/agent/auth.json`,
// so an Agent HOME link would point at a path Pi never reads.
test('Pi references no host login from the Agent HOME', () => {
    expect(sandboxOptions({ ...grokInput, runtimeId: 'pi' })).not.toHaveProperty('authProfiles');
});
