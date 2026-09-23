import { expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createACP } from '@ai-sdk/harness-acp';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { readTokenUsage } from './token-usage.ts';

test('a Codex turn reports every model request, not only the last one', async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-usage-')));
    const runtime = makeDaemonRuntime();
    const binDir = join(rootDir, 'bin');
    const homeDir = join(rootDir, 'home');
    await mkdir(binDir);
    await mkdir(homeDir);
    await mkdir(join(rootDir, 'workspace'));
    const executable = join(binDir, 'codex-acp');
    await writeFile(executable, fakeCodexAcp);
    await chmod(executable, 0o755);
    const agent = new HarnessAgent({
        harness: createACP({
            executable: 'codex-acp',
            harnessId: 'codex',
            modelMapping: { path: 'model', type: 'session-config-option' },
            source: { type: 'local' },
        }),
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider({
            env: { HOME: homeDir, PATH: `${binDir}:${process.env.PATH}` },
            homeDir,
            rootDir,
            runtime,
        }),
        sandboxConfig: { workDir: 'workspace' },
    });
    const session = await agent.createSession();
    try {
        const usages: ReturnType<typeof readTokenUsage>[] = [];
        for (const prompt of ['three requests', 'resent total then two requests', 'unpatched']) {
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
        // Input includes cached input, as Claude Code reports it, so the total counts it.
        expect(usages).toEqual([
            // The thread already held 5,000 tokens; the baseline is total minus the first request.
            {
                cacheReadTokens: 47_616,
                cacheWriteTokens: 0,
                inputTokens: 73_943,
                outputTokens: 657,
                totalTokens: 74_600,
            },
            // The re-sent total from the previous turn is not a request.
            {
                cacheReadTokens: 48_640,
                cacheWriteTokens: 0,
                inputTokens: 51_072,
                outputTokens: 312,
                totalTokens: 51_384,
            },
            // Without the codex-acp patch the prompt response's last request stands.
            {
                cacheReadTokens: 2,
                cacheWriteTokens: 0,
                inputTokens: 12,
                outputTokens: 5,
                totalTokens: 17,
            },
        ]);
    } finally {
        await session.destroy();
        await runtime.dispose();
        await rm(rootDir, { force: true, recursive: true });
    }
}, 60_000);

// Requests from a live Codex rollout: input (cached included), cached input, output, reasoning.
const fakeCodexAcp = `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
const requests = [
    [23917, 0, 201, 77], [24854, 23296, 277, 104], [25172, 24320, 179, 16],
    [25417, 24320, 214, 38], [25655, 24320, 98, 92],
];
// codex-acp's TokenCount: input excludes cached input.
const count = ([input, cached, output, reasoning]) => ({ totalTokens: input + output,
    inputTokens: input - cached, cachedInputTokens: cached, outputTokens: output,
    reasoningOutputTokens: reasoning });
let total = { totalTokens: 5000, inputTokens: 1000, cachedInputTokens: 3900, outputTokens: 100,
    reasoningOutputTokens: 10 };
let last;
const usageUpdate = (sessionId, meta) => send({ method: 'session/update', params: { sessionId,
    update: { sessionUpdate: 'usage_update', used: last.totalTokens, size: 272000,
        ...(meta ? { _meta: { 'haus/threadTokenUsage': { last, total } } } : {}) } } });
const request = (sessionId, index) => {
    last = count(requests[index]);
    total = Object.fromEntries(Object.entries(total).map(([key, value]) => [key, value + last[key]]));
    usageUpdate(sessionId, true);
};
let turn = 0;
createInterface({ input: process.stdin }).on('line', (line) => {
    const message = JSON.parse(line);
    let result = {};
    if (message.method === 'initialize') {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
    } else if (message.method === 'session/new') {
        result = { sessionId: 'codex-thread' };
    } else if (message.method === 'session/prompt') {
        const sessionId = message.params.sessionId;
        turn++;
        if (turn === 1) [0, 1, 2].forEach((index) => request(sessionId, index));
        if (turn === 2) {
            usageUpdate(sessionId, true);
            [3, 4].forEach((index) => request(sessionId, index));
        }
        if (turn === 3) {
            last = { totalTokens: 15, inputTokens: 10, cachedInputTokens: 2, outputTokens: 5,
                reasoningOutputTokens: 0 };
            usageUpdate(sessionId, false);
        }
        result = { stopReason: 'end_turn', usage: { totalTokens: last.totalTokens,
            inputTokens: last.inputTokens, cachedReadTokens: last.cachedInputTokens,
            outputTokens: last.outputTokens, thoughtTokens: last.reasoningOutputTokens } };
    }
    if (message.id !== undefined) send({ id: message.id, result });
});
`;
