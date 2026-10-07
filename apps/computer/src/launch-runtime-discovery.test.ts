import { expect, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { detectInventory } from './inventory.ts';
import { runAgentLaunch } from './launch.ts';

test('launch accepts every runtime advertised by executable discovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-launch-discovery-'));
    const previousPath = process.env.PATH;
    const runtime = makeDaemonRuntime();
    const server = Bun.serve({
        port: 0,
        fetch: () =>
            Response.json({ error: 'Discovery passed; stop before execution.' }, { status: 503 }),
    });
    try {
        for (const command of ['codex', 'claude', 'grok', 'pi']) {
            const path = join(root, command);
            await writeFile(path, '#!/bin/sh\necho "test-runtime 1.0.0"\n');
            await chmod(path, 0o755);
        }
        process.env.PATH = root;
        const inventory = detectInventory({ searchPath: root });
        expect(inventory.runtimes).toHaveLength(4);
        for (const detected of inventory.runtimes) {
            const turn = await runAgentLaunch({
                attachment: {
                    computerId: 'cmp_discovery',
                    credential: 'test-credential',
                    serverId: 'srv_discovery',
                    serverOrigin: server.url.origin,
                    slug: 'test',
                },
                command: {
                    agentId: 'agt_discovery',
                    chatId: 'cht_discovery',
                    inbox: [],
                    inboxDelivery: 'notice',
                    modelId: 'test-model',
                    runId: `run_${detected.id}`,
                    runtimeId: detected.id,
                    sessionGeneration: 1,
                    totalPending: 0,
                    type: 'start',
                },
                dataRoot: root,
                runtime,
                sendFrame: () => undefined,
                serverOrigin: server.url.origin,
            });
            // Reaching the runner mint proves the runtime cleared the installed check.
            expect(turn.failureCode).toBe('runner-credential-failed');
        }
    } finally {
        process.env.PATH = previousPath;
        server.stop(true);
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});
