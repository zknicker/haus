import { afterAll, expect, test } from 'bun:test';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createHarnessAgent } from './create-agent.ts';

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
