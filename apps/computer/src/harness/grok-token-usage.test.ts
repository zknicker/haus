import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createGrokBuild } from '@ai-sdk/harness-grok-build';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { readTokenUsage } from './token-usage.ts';

test('Grok completion usage reaches Haus without leaking into the next turn', async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-usage-')));
    const runtime = makeDaemonRuntime();
    const binDir = join(rootDir, 'bin');
    await mkdir(binDir);
    await mkdir(join(rootDir, 'workspace'));
    const executable = join(binDir, 'grok');
    await writeFile(executable, fakeGrok);
    await chmod(executable, 0o755);
    const agent = new HarnessAgent({
        harness: createGrokBuild({ model: 'grok-4.6' }),
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider({
            env: { PATH: `${binDir}:${process.env.PATH}` },
            rootDir,
            runtime,
        }),
        sandboxConfig: { workDir: 'workspace' },
    });
    const session = await agent.createSession();
    try {
        const usages: ReturnType<typeof readTokenUsage>[] = [];
        for (const prompt of ['first', 'second', 'missing', 'malformed', 'standard']) {
            const result = await agent.stream({
                abortSignal: AbortSignal.timeout(15_000),
                prompt,
                session,
            });
            for await (const part of result.fullStream) {
                if (part.type === 'finish') {
                    usages.push(readTokenUsage(part.totalUsage));
                }
            }
        }
        expect(usages).toEqual([
            {
                cacheReadTokens: 173_184,
                cacheWriteTokens: 0,
                inputTokens: 206_543,
                outputTokens: 3746,
                totalTokens: 210_289,
            },
            {
                cacheReadTokens: 380_544,
                cacheWriteTokens: 0,
                inputTokens: 400_651,
                outputTokens: 7526,
                totalTokens: 408_177,
            },
            null,
            null,
            {
                cacheReadTokens: 2,
                cacheWriteTokens: 3,
                inputTokens: 10,
                outputTokens: 5,
                totalTokens: 15,
            },
        ]);
    } finally {
        await session.destroy();
        await runtime.dispose();
        await rm(rootDir, { force: true, recursive: true });
    }
}, 60_000);

const fakeGrok = `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
let turn = 0;
createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line);
    let result = {};
    if (request.method === 'initialize') {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
    } else if (request.method === 'session/new') {
        result = { sessionId: 'grok-session' };
    } else if (request.method === 'session/prompt') {
        turn++;
        // Sibling token fields can repeat the last model call, even on a no-usage turn.
        result = { stopReason: 'end_turn', _meta: {
            inputTokens: 999, outputTokens: 999, totalTokens: 1998
        }};
        if (turn <= 2) {
            result._meta.usage = turn === 1
                ? { inputTokens: 206543, outputTokens: 3746, totalTokens: 210289,
                    cachedReadTokens: 173184, cacheCreationTokens: 0, reasoningTokens: 2201 }
                : { inputTokens: 400651, outputTokens: 7526, totalTokens: 408177,
                    cachedReadTokens: 380544, cacheCreationTokens: 0, reasoningTokens: 5801 };
        }
        if (turn === 4 || turn === 5) {
            result._meta.usage = { inputTokens: turn === 4 ? -1 : 100,
                outputTokens: 20, totalTokens: 120 };
        }
        if (turn === 5) result.usage = {
            inputTokens: 10, outputTokens: 5, totalTokens: 15,
            cachedReadTokens: 2, cachedWriteTokens: 3
        };
    }
    if (request.id !== undefined) send({ id: request.id, result });
});
`;
