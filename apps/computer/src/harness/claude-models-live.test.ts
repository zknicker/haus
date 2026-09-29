import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
            const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-model-live-')));
            const runtime = makeDaemonRuntime();
            const workspaceDir = join(root, 'workspace');
            await mkdir(workspaceDir);
            const agent = createHarnessAgent(
                {
                    agentId: 'claude-model-live-test',
                    env: {},
                    homeDir: join(root, 'home'),
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
                const session = await agent.createSession({
                    abortSignal: AbortSignal.timeout(120_000),
                });
                try {
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
                } finally {
                    await session.destroy();
                }
            } finally {
                await stopSandboxProcesses(runtime);
                await runtime.dispose();
                await rm(root, { force: true, recursive: true });
            }
        },
        240_000
    );
}
