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

test('Grok Build inlines MCP output up to the Claude-sized cap', () => {
    expect(sandboxOptions(grokInput).env).toEqual({
        EXISTING: 'kept',
        GROK_HOME: '/tmp/haus-constructor/home/.grok',
        GROK_MAX_MCP_OUTPUT_BYTES: '102400',
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
