/** Shared setup for the `startWorker` tests: a stubbed Server, provider, and supervisor. */
import { afterEach, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkerObservation, WorkerReconcileEntry } from '@haus/api';
import type { createFakeCloudAgentProvider } from './fake-provider.ts';
import { setCloudAgentProvider } from './registry.ts';

export const serverId = 'srv_cloud';
export const serverOrigin = 'https://haus.test';
export const workerId = 'caw_1234567890abcdef';
export const turnId = 'car_1234567890abcdef';
export const request = {
    content: 'Handing this to a Worker.',
    instructions: 'Reproduce the flake and open a pull request.',
    nonce: 'worker-nonce',
    repository: 'haus/haus',
    replyToMessageId: 'msg_request',
    startingRef: 'main',
    target: '#product',
    title: 'Fix the flaky delivery test',
};

export const receipt = {
    state: 'started' as const,
    chatId: 'cht_product',
    idempotent: false,
    messageId: 'msg_1a2b3c4d5e6f7890',
    turnId,
    sequence: 7,
    target: '#product',
    worker: {
        activity: null,
        agentId: 'agt_orbit',
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        chatId: 'cht_product',
        computerId: 'cmp_studio',
        createdAt: '2026-09-04T12:00:00.000Z',
        environmentId: null,
        environmentName: null,
        id: workerId,
        job: { followUp: null, startedAt: null, state: 'working' },
        messageId: 'msg_1a2b3c4d5e6f7890',
        provider: 'cursor',
        providerAgentId: null,
        providerUrl: null,
        pullRequest: null,
        repository: 'haus/haus',
        turns: [],
        startedAt: null,
        startingRef: 'main',
        status: 'queued',
        terminalAt: null,
        title: 'Fix the flaky delivery test',
        updatedAt: '2026-09-04T12:00:00.000Z',
    },
};

/** Registers per-test setup and returns the live fixture state for one test file. */
export function registerLaunchWorkFixture() {
    const restores: Array<() => void> = [];
    const state = {
        dataRoot: '',
        /** Launches the receipt returned before; `launched()` waits for them. */
        launches: [] as Promise<unknown>[],
        observations: [] as WorkerObservation[],
        reconciled: [] as WorkerReconcileEntry[],
        restores,
        supervisor: {
            report(
                ref: { turnId: string; workerId: string },
                observation: Omit<WorkerObservation, 'turnId' | 'workerId'>
            ) {
                state.observations.push({
                    ...observation,
                    turnId: ref.turnId,
                    workerId: ref.workerId,
                });
            },
            watch() {},
            runLaunch<Value>(operation: () => Promise<Value>) {
                const launch = operation();
                state.launches.push(launch);
                return launch;
            },
            reconcile(entries: WorkerReconcileEntry[]) {
                state.reconciled.push(...entries);
                return Promise.resolve();
            },
        },
        async launched() {
            await Promise.allSettled(state.launches);
        },
        install(provider: ReturnType<typeof createFakeCloudAgentProvider>) {
            restores.push(setCloudAgentProvider(provider));
            return provider;
        },
        stubServer(body: unknown = receipt, status = 200) {
            const calls: Array<{ body: unknown; url: string }> = [];
            const original = globalThis.fetch;
            globalThis.fetch = ((url: URL | string, init?: RequestInit) => {
                calls.push({ body: JSON.parse(String(init?.body ?? '{}')), url: String(url) });
                return Promise.resolve(Response.json(body, { status }));
            }) as typeof fetch;
            restores.push(() => {
                globalThis.fetch = original;
            });
            return calls;
        },
        /** The launch input every test passes, bound to this test's data root. */
        input() {
            return {
                dataRoot: state.dataRoot,
                request,
                runnerToken: 'grtr_x',
                serverId,
                serverOrigin,
                supervisor: state.supervisor,
            };
        },
    };
    beforeEach(async () => {
        state.dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-launch-'));
        state.launches = [];
        state.observations = [];
        state.reconciled = [];
    });
    afterEach(async () => {
        while (restores.length > 0) {
            restores.pop()?.();
        }
        await rm(state.dataRoot, { recursive: true, force: true });
    });
    return state;
}
