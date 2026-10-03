import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { createHarnessAgent } from './create-agent.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { stopSandboxProcesses } from './sandbox-process-owner.ts';

const liveTest = process.env.HAUS_RUN_LIVE_CLAUDE_MODELS_TEST === '1' ? test : test.skip;

for (const modelId of ['claude-opus-5-5', 'claude-sonnet-5-5']) {
    liveTest(
        `${modelId} answers and preserves context across turns through the Computer bridge`,
        async () => {
            await withClaudeAgent(modelId, {}, async (agent, session) => {
                const first = await agent.generate({
                    session,
                    prompt: 'Remember this code: HARBOR_7429. Reply only SAVED. Do not use tools.',
                    abortSignal: AbortSignal.timeout(60_000),
                });
                expect(first.text.trim()).toBe('SAVED');
                const next = await agent.generate({
                    session,
                    prompt: 'What code did I ask you to remember? Reply only with that code. Do not use tools.',
                    abortSignal: AbortSignal.timeout(60_000),
                });
                expect(next.text.trim()).toBe('HARBOR_7429');
            });
        },
        240_000
    );
}

liveTest(
    "Claude Code starts no MCP server from the Agent's own Claude Code config",
    async () => {
        const markers: string[] = [];
        await withClaudeAgent(
            'claude-sonnet-5-5',
            {
                prepare: async ({ homeDir, rootDir, workspaceDir }) => {
                    const server = (name: string) => {
                        const marker = join(rootDir, `${name}-started`);
                        markers.push(marker);
                        const command = `touch '${marker}'; sleep 5`;
                        return { [name]: { args: ['-c', command], command: '/bin/sh' } };
                    };
                    // What `claude mcp add --scope user` writes, plus an approved project server.
                    await mkdir(join(homeDir, '.claude'), { recursive: true });
                    await writeFile(
                        join(homeDir, '.claude.json'),
                        JSON.stringify({ mcpServers: server('agent_user') })
                    );
                    await writeFile(
                        join(homeDir, '.claude', 'settings.json'),
                        JSON.stringify({ enableAllProjectMcpServers: true })
                    );
                    await writeFile(
                        join(workspaceDir, '.mcp.json'),
                        JSON.stringify({ mcpServers: server('agent_project') })
                    );
                },
            },
            async (agent, session) => {
                const result = await agent.generate({
                    session,
                    prompt: 'Reply with exactly OK. Do not use tools.',
                    abortSignal: AbortSignal.timeout(60_000),
                });

                expect(result.text.trim()).toBe('OK');
                expect(markers.filter((marker) => existsSync(marker))).toEqual([]);
            }
        );
    },
    240_000
);

async function withClaudeAgent(
    modelId: string,
    options: {
        prepare?: (paths: {
            homeDir: string;
            rootDir: string;
            workspaceDir: string;
        }) => Promise<void>;
    },
    run: (
        agent: HarnessAgent,
        session: Awaited<ReturnType<HarnessAgent['createSession']>>
    ) => Promise<void>
) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-model-live-')));
    const runtime = makeDaemonRuntime();
    const homeDir = join(root, 'home');
    const workspaceDir = join(root, 'workspace');
    await mkdir(workspaceDir);
    await options.prepare?.({ homeDir, rootDir: root, workspaceDir });
    const agent = createHarnessAgent(
        {
            agentId: 'claude-model-live-test',
            env: {},
            homeDir,
            modelId,
            runtime,
            runtimeId: 'claude-code',
            tools: {},
            webAccess: null,
            workspaceDir,
        },
        {
            harness: createHarnessForRuntime(
                'claude-code',
                'medium',
                false,
                bridgeStoreDirForHost(),
                modelId
            ),
            instructions: 'Follow the user request exactly.',
        }
    );
    try {
        const session = await agent.createSession({ abortSignal: AbortSignal.timeout(120_000) });
        try {
            await run(agent, session);
        } finally {
            await session.destroy();
        }
    } finally {
        await stopSandboxProcesses(runtime);
        await runtime.dispose();
        await rm(root, { force: true, recursive: true });
    }
}
