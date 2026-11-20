import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseStartCommand } from './agent-command-frames.ts';
import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { createDriveRoutes } from './drive-migration/testing/drive-server.ts';
import type { HarnessTurnInput } from './harness/executor.ts';
import type { HostToolSet } from './host-tools/host-tool.ts';
import { type AgentStartCommand, type Attachment, runAgentLaunch } from './launch.ts';
import { fakeRuntimeDriver, finishedTurn } from './runtime/testing/fake-runtime-driver.ts';

type FakeServer = ReturnType<typeof Bun.serve>;

const runnerToken = `grtr_${'a'.repeat(43)}`;

interface FakeServerState {
    authHeaders: string[];
    mintCount: number;
    revokedRunnerId: string | null;
    sends: { content: string; nonce: string; target: string }[];
    server: FakeServer;
}

let state: FakeServerState;
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

test('rejects a typed attention whose envelope identity does not match it', () => {
    expect(
        parseStartCommand({
            agentId: 'agt_launchtest',
            agentName: 'launch',
            chatId: 'cht_origin',
            inbox: [
                {
                    chatId: 'cht_origin',
                    worker: {
                        branches: [],
                        errorCode: null,
                        provider: 'cursor',
                        providerUrl: null,
                        repository: 'haus/haus',
                        turnId: 'car_1234567890abcdef',
                        status: 'completed',
                        summary: 'Opened a pull request.',
                        title: 'Fix the flaky delivery test',
                        workerId: 'caw_1234567890abcdef',
                    },
                    content: '',
                    createdAt: '2026-08-26T12:00:00.000Z',
                    id: 'msg_wrong_identity',
                    senderHandle: 'haus',
                    senderType: 'system',
                    sequence: 0,
                    target: '#product',
                },
            ],
            inboxDelivery: 'concrete',
            modelId: 'gpt-5',
            runId: 'run_launchtest',
            runtimeId: 'codex',
            sessionGeneration: 1,
            totalPending: 0,
            type: 'start',
        })
    ).toBeNull();
});

let dataRoot: string;
beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-launch-'));
    const drive = createDriveRoutes({ agentId: 'agt_launchtest', runnerToken });
    const server = Bun.serve({
        fetch: async (request) => {
            const url = new URL(request.url);
            const driveResponse = await drive.handle(request);
            if (driveResponse) {
                return driveResponse;
            }
            if (url.pathname === '/computer/runner/mint') {
                state.mintCount += 1;
                return Response.json({ runnerId: 'arc_launchtest000000', runnerToken });
            }
            if (url.pathname === '/computer/runner/revoke') {
                state.revokedRunnerId = ((await request.json()) as { runnerId: string }).runnerId;
                return Response.json({ revoked: true });
            }
            if (url.pathname === '/api/agent/messages/send') {
                state.authHeaders.push(request.headers.get('authorization') ?? '');
                state.sends.push(
                    (await request.json()) as { content: string; nonce: string; target: string }
                );
                return Response.json({
                    message: {
                        attachments: [],
                        author: {
                            id: 'agt_launchtest',
                            kind: 'agent',
                            label: 'Launch',
                            metadata: {},
                        },
                        body_kind: 'text',
                        chat_id: 'cht_test',
                        content: state.sends.at(-1)?.content ?? '',
                        created_at: new Date().toISOString(),
                        deleted_at: null,
                        delivery_id: null,
                        id: 'msg_test',
                        metadata: {},
                        nonce: state.sends.at(-1)?.nonce ?? 'nonce',
                        role: 'assistant',
                        sender: {
                            description: null,
                            handle: 'launch',
                            type: 'agent',
                        },
                        sequence: 1,
                    },
                    recentUnread: [],
                    state: 'sent',
                });
            }
            if (url.pathname === '/api/agent/mcp/tools') {
                return Response.json({
                    tools: [
                        {
                            description: 'Echo through Server',
                            inputSchema: {
                                additionalProperties: false,
                                properties: { value: { type: 'string' } },
                                required: ['value'],
                                type: 'object',
                            },
                            name: 'mcp__server__echo',
                            title: 'Echo',
                        },
                    ],
                });
            }
            if (url.pathname === '/api/agent/mcp/invoke') {
                const body = (await request.json()) as { args: { value: string } };
                return Response.json({ result: `server:${body.args.value}` });
            }
            return new Response('not found', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    state = { authHeaders: [], mintCount: 0, revokedRunnerId: null, sends: [], server };
});

afterEach(async () => {
    disposeServerLaunchHosts('srv_launchtest');
    state.server.stop(true);
    await rm(dataRoot, { force: true, recursive: true });
});

test('runs a deterministic Agent launch that lands a durable Server message', async () => {
    const attachment: Attachment = {
        computerId: 'cmp_launchtest0000000',
        credential: 'launch-test-credential',
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
        serverId: 'srv_launchtest',
        slug: 'launch-test',
    };
    const command: AgentStartCommand = {
        agentId: 'agt_launchtest',
        agentName: 'launch',
        chatId: 'cht_test',
        inbox: [
            {
                chatId: 'cht_test',
                content: 'ping the operator',
                createdAt: '2026-07-27T00:00:00.000Z',
                id: 'msg_launchtest',
                senderHandle: 'operator',
                senderType: 'human',
                sequence: 1,
                target: 'dm:@operator',
            },
        ],
        inboxDelivery: 'concrete',
        modelId: 'fake-model',
        runId: 'run_launchtest',
        runtimeId: 'fake',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    const turnFrames: Record<string, unknown>[] = [];

    await runAgentLaunch({
        attachment,
        command,
        dataRoot,
        runtime,
        sendFrame: (frame) => turnFrames.push(frame as Record<string, unknown>),
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
    });

    // The real managed CLI produced exactly one durable send with the
    // deterministic reply, targeting the collaboration channel.
    expect(state.sends).toHaveLength(1);
    expect(state.sends[0]).toMatchObject({
        content: 'Acknowledged: ping the operator',
        target: 'dm:@operator',
    });
    expect(state.sends[0]?.nonce).toBeTruthy();

    // The Agent reached the Server only through the loopback proxy, which
    // swapped the local proxy token for the scoped runner credential.
    expect(state.authHeaders).toEqual([`Bearer ${runnerToken}`]);
    expect(state.mintCount).toBe(2);
    expect(state.revokedRunnerId).toBe('arc_launchtest000000');

    expect(turnFrames).toHaveLength(1);
    expect(turnFrames[0]).toMatchObject({
        agentId: 'agt_launchtest',
        messageCount: 1,
        runId: 'run_launchtest',
        status: 'completed',
        type: 'turn',
    });
    expect(JSON.stringify(turnFrames[0])).not.toContain(runnerToken);

    const agentRoot = join(dataRoot, 'servers', attachment.serverId, 'agents', command.agentId);
    for (const dir of ['home', 'workspace', 'runtime']) {
        expect((await stat(join(agentRoot, dir))).isDirectory()).toBe(true);
    }
    const canonicalSkills = await realpath(
        join(agentRoot, 'workspace', 'drive', 'agents', 'launch', 'skills')
    );
    expect(await readdir(canonicalSkills)).toEqual(['visuals']);
    expect(
        await readFile(
            join(agentRoot, 'workspace', 'drive', 'agents', 'launch', 'MEMORY.md'),
            'utf8'
        )
    ).toContain('# launch');
    for (const nativeRoot of ['.agents', '.claude']) {
        expect(await realpath(join(agentRoot, 'home', nativeRoot, 'skills'))).toBe(canonicalSkills);
    }

    // The stable local proxy token survives between turns; the scoped Server
    // runner credential does not. Raw traces carry neither secret.
    expect((await stat(join(agentRoot, 'runtime', 'proxy-token'))).isFile()).toBe(true);
    const trace = await readFile(join(agentRoot, 'runtime', `turn-${command.runId}.log`), 'utf8');
    expect(trace).not.toContain(runnerToken);
});

test('reports a failed turn when the runtime is not installed', async () => {
    const turnFrames: Record<string, unknown>[] = [];
    await runAgentLaunch({
        attachment: {
            computerId: 'cmp_launchtest0000000',
            credential: 'launch-test-credential',
            serverOrigin: `http://127.0.0.1:${state.server.port}`,
            serverId: 'srv_launchtest',
            slug: 'launch-test',
        },
        command: {
            agentId: 'agt_launchtest',
            agentName: 'launch',
            chatId: 'cht_test',
            inbox: [],
            inboxDelivery: 'notice',
            modelId: 'gpt',
            runId: 'run_missing',
            runtimeId: 'unsupported-runtime',
            sessionGeneration: 1,
            totalPending: 0,
            type: 'start',
        },
        dataRoot,
        runtime,
        sendFrame: (frame) => turnFrames.push(frame as Record<string, unknown>),
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
    });

    expect(state.mintCount).toBe(0);
    expect(turnFrames[0]).toMatchObject({ messageCount: 0, status: 'failed' });
});

test('the launch injects Server MCP and Computer Browser tools into the real Harness boundary', async () => {
    const attachment: Attachment = {
        computerId: 'cmp_launchtest0000000',
        credential: 'launch-test-credential',
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
        serverId: 'srv_launchtest',
        slug: 'launch-test',
    };
    const base: AgentStartCommand = {
        agentId: 'agt_launchtest',
        agentName: 'launch',
        chatId: 'cht_test',
        inbox: [
            {
                chatId: 'cht_test',
                content: 'Use the granted tool.',
                createdAt: '2026-07-27T00:00:00.000Z',
                id: 'msg_mcp',
                senderHandle: 'operator',
                senderType: 'human',
                sequence: 1,
                target: 'dm:@operator',
            },
        ],
        inboxDelivery: 'concrete',
        modelId: 'gpt-5.6-sol',
        runId: 'run_mcp_granted',
        runtimeId: 'codex',
        sessionGeneration: 1,
        totalPending: 0,
        type: 'start',
    };
    let tools: HostToolSet = [];
    let invocationResult: unknown;
    const driver = fakeRuntimeDriver<HarnessTurnInput>({
        async *turn({ input }) {
            tools = input.tools;
            invocationResult = await input.tools
                .find((tool) => tool.name === 'execute')
                ?.execute(
                    {
                        code: 'return await tools.call({name:"mcp__server__echo",args:{value:"granted"}});',
                    },
                    { signal: new AbortController().signal, toolCallId: 'tool-call' }
                );
            yield* finishedTurn();
        },
    });
    const turn = await runAgentLaunch({
        attachment,
        command: base,
        dataRoot,
        runtimeDriverFactory: driver.factory,
        runtime,
        sendFrame: () => undefined,
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
    });
    expect(turn.status).toBe('completed');
    expect(tools.map((tool) => tool.name)).toEqual(['execute', 'browser']);
    expect(invocationResult).toMatchObject({ value: { result: 'server:granted' } });
});
