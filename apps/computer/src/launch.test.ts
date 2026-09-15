import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { applyAgentConfiguration, parseAgentConfigureCommand } from './agent-configuration.ts';
import { disposeServerLaunchHosts } from './agent-launch-host.ts';
import { applyCoveConfiguration } from './cove-configuration.ts';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import type { HarnessAgentFactory } from './harness/executor.ts';
import {
    type AgentStartCommand,
    type Attachment,
    parseResetCommand,
    parseStartCommand,
    resetAgentState,
    runAgentLaunch,
} from './launch.ts';

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
            chatId: 'cht_origin',
            inbox: [
                {
                    chatId: 'cht_origin',
                    cloudAgentWork: {
                        branches: [],
                        errorCode: null,
                        provider: 'cursor',
                        providerUrl: null,
                        repository: 'haus/haus',
                        runId: 'car_1234567890abcdef',
                        status: 'completed',
                        summary: 'Opened a pull request.',
                        title: 'Fix the flaky delivery test',
                        workId: 'caw_1234567890abcdef',
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
    const server = Bun.serve({
        fetch: async (request) => {
            const url = new URL(request.url);
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
    expect(state.mintCount).toBe(1);
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
    for (const dir of ['home', 'skills', 'workspace', 'runtime']) {
        expect((await stat(join(agentRoot, dir))).isDirectory()).toBe(true);
    }
    const canonicalSkills = await realpath(join(agentRoot, 'skills'));
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

test('the launch injects Server-owned MCP tools into the real Harness boundary', async () => {
    const attachment: Attachment = {
        computerId: 'cmp_launchtest0000000',
        credential: 'launch-test-credential',
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
        serverId: 'srv_launchtest',
        slug: 'launch-test',
    };
    const base: AgentStartCommand = {
        agentId: 'agt_launchtest',
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
    let tools: ToolSet = {};
    let invocationResult: unknown;
    const harnessAgentFactory: HarnessAgentFactory = (input) => {
        tools = input.tools;
        return {
            createSession: (async () => ({
                detach: async () => ({ data: {}, harnessId: 'fake', type: 'resume-session' }),
                destroy: async () => undefined,
                isResume: false,
                sessionId: 'mcp-session',
            })) as unknown as HarnessAgent['createSession'],
            stream: (async () => {
                invocationResult = await input.tools.execute?.execute?.(
                    {
                        code: 'return await tools.call({name:"mcp__server__echo",args:{value:"granted"}});',
                    },
                    {
                        abortSignal: new AbortController().signal,
                        context: undefined,
                        messages: [],
                        toolCallId: 'tool-call',
                    }
                );
                return {
                    fullStream: (async function* () {
                        yield {
                            type: 'finish-step',
                            usage: {
                                inputTokenDetails: {
                                    cacheReadTokens: 0,
                                    cacheWriteTokens: 0,
                                    noCacheTokens: 1,
                                },
                                inputTokens: 1,
                                outputTokens: 1,
                                totalTokens: 2,
                            },
                        };
                    })(),
                };
            }) as unknown as HarnessAgent['stream'],
        };
    };
    const turn = await runAgentLaunch({
        attachment,
        command: base,
        dataRoot,
        harnessAgentFactory,
        runtime,
        sendFrame: () => undefined,
        serverOrigin: `http://127.0.0.1:${state.server.port}`,
    });
    expect(turn.status).toBe('completed');
    expect(Object.keys(tools)).toEqual(['execute']);
    expect(invocationResult).toMatchObject({ result: 'server:granted' });
});

test('session reset rotates harness context while preserving Agent-owned state', async () => {
    const { agentRoot, configuration, configurationJson } = await seedResetFixture();

    expect(
        parseResetCommand({
            agentId: 'agt_reset',
            kind: 'session',
            sessionGeneration: 2,
            type: 'agent-reset',
        })
    ).toEqual({
        agentId: 'agt_reset',
        kind: 'session',
        sessionGeneration: 2,
        type: 'agent-reset',
    });
    expect(
        parseResetCommand({
            agentId: 'agt_reset',
            kind: 'unknown',
            sessionGeneration: 2,
            type: 'agent-reset',
        })
    ).toBe(null);

    await resetAgentState({
        agentId: configuration.agentId,
        dataRoot,
        kind: 'session',
        serverId: 'srv_reset',
    });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'inbox'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'pending-notice.json'))).rejects.toThrow();
    expect(await readFile(join(agentRoot, 'workspace', 'MEMORY.md'), 'utf8')).toBe(
        '# Durable memory\n\nBluebird remains active.\n'
    );
    expect(await readFile(join(agentRoot, 'workspace', 'kept.txt'), 'utf8')).toBe('kept');
    expect(await readFile(join(agentRoot, 'skills', 'custom-skill', 'SKILL.md'), 'utf8')).toBe(
        'name: custom-skill\n'
    );
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);
});

test('full reset independently clears harness context and restores the ordinary factory state', async () => {
    const { agentRoot, configuration, configurationJson } = await seedResetFixture();

    await resetAgentState({
        agentId: configuration.agentId,
        dataRoot,
        kind: 'full',
        serverId: 'srv_reset',
    });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'workspace', 'kept.txt'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'skills', 'custom-skill'))).rejects.toThrow();
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);
    expect(await readFile(join(agentRoot, 'workspace', 'MEMORY.md'), 'utf8')).toContain(
        'Onboarding guide'
    );
    await expect(stat(join(agentRoot, 'workspace', 'notes'))).rejects.toThrow();
    await expect(
        readFile(join(agentRoot, 'skills', 'haus-agent', 'SKILL.md'), 'utf8')
    ).rejects.toThrow();
    await expect(
        readFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: visuals');
});

test('Cove full reset restores its exact factory workspace and only visuals', async () => {
    const agentId = 'agt_coveresetxxxxxxx';
    const serverId = 'srv_cove_reset';
    const command = {
        agentDescription: 'Onboarding Assistant' as const,
        agentId,
        agentName: 'Cove' as const,
        applicationId: 'cap_coveresetxxxxxx',
        factoryKind: 'cove' as const,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        sessionGeneration: 1,
        type: 'cove-apply' as const,
    };
    await applyCoveConfiguration({
        command,
        dataRoot,
        inventory: {
            runtimes: [
                {
                    id: 'codex',
                    label: 'Codex',
                    models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                },
            ],
        },
        serverId,
    });
    const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
    await Promise.all([
        writeFile(join(agentRoot, 'workspace', 'MEMORY.md'), '# Changed\n'),
        writeFile(join(agentRoot, 'workspace', 'extra.md'), 'remove me\n'),
        mkdir(join(agentRoot, 'skills', 'custom-skill'), { recursive: true }).then(() =>
            writeFile(join(agentRoot, 'skills', 'custom-skill', 'SKILL.md'), 'name: custom-skill\n')
        ),
    ]);

    await resetAgentState({ agentId, dataRoot, kind: 'full', serverId });

    expect((await readdir(join(agentRoot, 'workspace'))).sort()).toEqual(['MEMORY.md', 'notes']);
    expect((await readdir(join(agentRoot, 'workspace', 'notes'))).sort()).toEqual([
        'onboarding_knowledge_faq.md',
        'onboarding_objectives.md',
        'onboarding_playbook.md',
    ]);
    const objectives = await readFile(
        join(agentRoot, 'workspace', 'notes', 'onboarding_objectives.md'),
        'utf8'
    );
    expect(objectives.match(/^### recipes\//gmu)).toHaveLength(12);
    expect(objectives).not.toMatch(/save-as-a-skill|haus-agent|recipes\/archetype\//u);
    expect(await readdir(join(agentRoot, 'skills'))).toEqual(['visuals']);
    await expect(
        readFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: visuals');
});

async function seedResetFixture() {
    const agentId = 'agt_resetxxxxxxxxxxx';
    const agentRoot = join(dataRoot, 'servers', 'srv_reset', 'agents', agentId);
    const configuration = parseAgentConfigureCommand({
        agentDescription: 'Onboarding guide',
        agentId,
        agentName: 'Scout',
        factoryKind: 'ordinary',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        sessionGeneration: 1,
        sessionResetKind: 'full',
        type: 'agent-configure',
    });
    if (!configuration) {
        throw new Error('Reset configuration fixture did not parse.');
    }
    await applyAgentConfiguration({
        command: configuration,
        dataRoot,
        inventory: {
            runtimes: [
                {
                    id: 'codex',
                    label: 'Codex',
                    models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                },
            ],
        },
        serverId: 'srv_reset',
    });
    const configurationJson = await readFile(join(agentRoot, 'configuration.json'), 'utf8');
    await Promise.all(
        [
            'home',
            'skills',
            'skills/custom-skill',
            'workspace',
            'runtime',
            'runtime/inbox',
            '.agent-runs',
        ].map((dir) => mkdir(join(agentRoot, dir), { recursive: true }))
    );
    await Promise.all([
        writeFile(
            join(agentRoot, 'session.json'),
            JSON.stringify({
                effectiveModel: { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
                generation: 1,
                resumeState: {
                    data: { nativeSessionId: 'native-reset-session' },
                    harnessId: 'codex',
                    type: 'resume-session',
                },
                runtimeSessionId: 'harness-reset-session',
            })
        ),
        writeFile(join(agentRoot, '.agent-runs', 'old-run'), 'state'),
        writeFile(join(agentRoot, 'runtime', 'inbox', 'pending.json'), '[]'),
        writeFile(join(agentRoot, 'runtime', 'pending-notice.json'), '{"notice":"pending"}'),
        writeFile(
            join(agentRoot, 'workspace', 'MEMORY.md'),
            '# Durable memory\n\nBluebird remains active.\n'
        ),
        writeFile(join(agentRoot, 'workspace', 'kept.txt'), 'kept'),
        writeFile(join(agentRoot, 'skills', 'custom-skill', 'SKILL.md'), 'name: custom-skill\n'),
    ]);
    return { agentRoot, configuration, configurationJson };
}
