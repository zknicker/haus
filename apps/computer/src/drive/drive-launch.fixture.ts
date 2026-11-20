import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { HarnessTurnInput } from '../harness/executor.ts';
import { type RunAgentLaunchOptions, runAgentLaunch } from '../launch.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import type { DriveServer } from './drive-server.fixture.ts';

export async function driveLaunchFixture(drive: DriveServer, runtime: DaemonRuntime) {
    const credentials: string[] = [];
    let held: Promise<void> | null = null;
    let onHeld: () => void = () => undefined;
    const front = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: async (request) => {
            const url = new URL(request.url);
            if (url.pathname === '/computer/runner/mint') {
                credentials.push(`mint ${((await request.json()) as { runId: string }).runId}`);
                return Response.json({
                    runnerId: `arc_${credentials.filter((line) => line.startsWith('mint')).length}`,
                    runnerToken: 'agt_alpha',
                });
            }
            if (url.pathname === '/computer/runner/revoke') {
                credentials.push(
                    `revoke ${((await request.json()) as { runnerId: string }).runnerId}`
                );
                return Response.json({ revoked: true });
            }
            if (
                !(
                    url.pathname.startsWith('/api/agent/drive/') ||
                    url.pathname.startsWith('/api/agent/artifacts/') ||
                    url.pathname.startsWith('/blob/') ||
                    url.pathname.includes('/download')
                )
            ) {
                return Response.json({ code: 'NOT_FOUND' }, { status: 404 });
            }
            const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;
            if (held && url.pathname === '/api/agent/drive/push/put') {
                const gate = held;
                held = null;
                onHeld();
                await gate;
                if (request.signal.aborted) {
                    return Response.json({ code: 'ABANDONED' }, { status: 499 });
                }
            }
            return await fetch(new URL(`${url.pathname}${url.search}`, drive.origin), {
                body,
                headers: request.headers,
                method: request.method,
            });
        },
    });
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-drive-launch-'));
    const origin = `http://127.0.0.1:${front.port}`;
    const options = (runId: string) =>
        ({
            attachment: {
                computerId: 'cmp_drive',
                credential: 'computer-credential',
                serverId: 'srv_drive',
                serverOrigin: origin,
                slug: 'drive',
            },
            command: {
                agentId: 'agt_alpha',
                agentName: 'alpha',
                chatId: 'cht_drive',
                inbox: [],
                inboxDelivery: 'concrete',
                modelId: 'gpt-5.6-sol',
                runId,
                runtimeId: 'codex',
                sessionGeneration: 1,
                totalPending: 0,
                type: 'start',
            },
            dataRoot,
            runtime,
            sendFrame: () => undefined,
            serverOrigin: origin,
        }) satisfies RunAgentLaunchOptions;
    return {
        agentRoot: join(dataRoot, 'servers', 'srv_drive', 'agents', 'agt_alpha'),
        credentials,
        dataRoot,
        holdNextPut() {
            const gate = Promise.withResolvers<void>();
            const started = Promise.withResolvers<void>();
            held = gate.promise;
            onHeld = started.resolve;
            return { release: gate.resolve, started: started.promise };
        },
        async launch(during: (workspaceDir: string) => Promise<void>) {
            const driver = fakeRuntimeDriver<HarnessTurnInput>({
                async *turn({ input }) {
                    await during(input.workspaceDir);
                    yield* finishedTurn();
                },
            });
            return await runAgentLaunch({
                ...options('run_drive_turn'),
                runtimeDriverFactory: driver.factory,
            });
        },
        options,
        async stop() {
            front.stop(true);
            await rm(dataRoot, { force: true, recursive: true });
        },
    };
}
