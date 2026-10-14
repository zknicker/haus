import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudAgentWorkSchema } from '@haus/api';
import type { ClaudeController, ClaudeControllerEvent } from './controller.ts';

const work = {
    activity: { at: '2026-09-04T12:01:00.000Z', summary: 'Reading the failing test.' },
    agentId: 'agt_orbit',
    cancelRequestedAt: null,
    cancelRequestedBy: null,
    chatId: 'cht_product',
    computerId: 'cmp_studio',
    createdAt: '2026-09-04T12:00:00.000Z',
    id: 'caw_1234567890abcdef',
    job: { followUp: null, startedAt: '2026-09-04T12:00:30.000Z', state: 'working' },
    messageId: 'msg_1234567890abcdef',
    provider: 'cursor',
    providerAgentId: 'bc_abc',
    providerUrl: 'https://cursor.com/agents/bc_abc',
    repository: 'haus/haus',
    runs: [
        {
            branches: [],
            createdAt: '2026-09-04T12:00:00.000Z',
            errorCode: null,
            model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
            providerRunId: 'run_abc',
            rawStatus: 'RUNNING',
            runId: 'car_1234567890abcdef',
            startedAt: '2026-09-04T12:00:30.000Z',
            status: 'running',
            summary: null,
            terminalAt: null,
            usage: null,
        },
    ],
    startedAt: '2026-09-04T12:00:30.000Z',
    startingRef: 'main',
    status: 'running',
    terminalAt: null,
    title: 'Fix the flaky delivery test',
    updatedAt: '2026-09-04T12:01:00.000Z',
};

export async function interruptFixture() {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-native-stop-'));
    const stamp = '2026-10-13T14:00:00.000Z';
    const current = cloudAgentWorkSchema.parse({
        ...work,
        provider: 'claude',
        cancelRequestedAt: stamp,
        cancelRequestedBy: { kind: 'agent', id: 'agt_orbit' },
        providerAgentId: 'session_fixture',
        providerUrl: null,
    });
    const run = current.runs[0];
    if (!run) {
        throw new Error('Missing fixture Run');
    }
    const snapshot = {
        cancellation: { runIds: [run.runId], activeRunId: run.runId as string | null },
        work: current,
        run,
        requests: [],
        continuations: [],
        stopEvidence: null as {
            promptId: string;
            backgroundTasks: number;
            sessionCrons: number | null;
            observedAt: string;
        } | null,
        prompts: [
            {
                promptId: 'prompt_resume',
                sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                requestId: null,
            },
        ],
    };
    const snapshots = new Map<string, typeof snapshot>();
    const server = Bun.serve({
        port: 0,
        async fetch(request) {
            const body = (await request.json()) as { runId: string };
            return Response.json(snapshots.get(body.runId) ?? snapshot);
        },
    });
    const computer = {
        dataRoot,
        serverId: 'srv_test',
        credentialHash: 'fixture',
        serverOrigin: server.url.origin,
    };
    const ref = {
        provider: 'claude' as const,
        workId: current.id,
        runId: run.runId,
        providerAgentId: current.providerAgentId,
        providerRunId: run.providerRunId,
    };
    const events: ClaudeControllerEvent[] = [
        { sequence: '10', uuid: 'prompt_resume', promptId: 'prompt_resume' },
        { sequence: '9', uuid: 'task_active', task: { id: 'active', terminal: true } },
        { sequence: '8', uuid: 'task_completed', task: { id: 'historical', terminal: true } },
        { sequence: '7', uuid: 'task_old', task: { id: 'historical', terminal: false } },
    ];
    const posts: Array<{ requestId: string; eventUuid: string }> = [];
    let stillQueued = 0;
    let response = true;
    let ambiguous = false;
    let taskAmbiguous = false;
    const taskPosts: Array<{ taskId: string; requestId: string; eventUuid: string }> = [];
    const controller: ClaudeController = {
        stopTask: (_id, input) => {
            taskPosts.push(input);
            events.unshift({
                sequence: '14',
                uuid: 'task-stop-response',
                requestId: input.requestId,
                success: true,
            });
            events.unshift({
                sequence: '13',
                uuid: 'task-stopped',
                task: { id: input.taskId, terminal: true },
            });
            return taskAmbiguous
                ? Promise.reject(new Error('Task stop HTTP response lost'))
                : Promise.resolve();
        },
        session: () => Promise.resolve({ id: 'cse_fixture', status: 'idle' }),
        events: () => Promise.resolve([...events]),
        interrupt: (_id, input) => {
            posts.push(input);
            events.unshift({
                sequence: '11',
                uuid: 'task_stop',
                task: { id: 'active', terminal: true },
            });
            if (response) {
                events.unshift({
                    sequence: '12',
                    uuid: 'receipt',
                    requestId: input.requestId,
                    success: true,
                    stillQueued,
                });
            }
            return ambiguous ? Promise.reject(new Error('HTTP response lost')) : Promise.resolve();
        },
    };
    return {
        computer,
        ref,
        snapshot,
        snapshots,
        events,
        posts,
        taskPosts,
        taskAmbiguous: () => {
            taskAmbiguous = true;
        },
        controller,
        stamp,
        queued: (count: number) => {
            stillQueued = count;
        },
        noResponse: () => {
            response = false;
        },
        ambiguous: () => {
            ambiguous = true;
        },
        close: async () => {
            await server.stop(true);
            await rm(dataRoot, { recursive: true, force: true });
        },
    };
}
