/** Shared setup for the `startCloudAgentWork` tests: a stubbed Server, provider, and supervisor. */
import { afterEach, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentObservation, CloudAgentReconcileEntry } from '@haus/api';
import type { createFakeCloudAgentProvider } from './fake-provider.ts';
import { setCloudAgentProvider } from './registry.ts';

export const serverId = 'srv_cloud';
export const serverOrigin = 'https://haus.test';
export const workId = 'caw_1234567890abcdef';
export const runId = 'car_1234567890abcdef';
export const request = {
    content: 'Handing this to a cloud agent.',
    instructions: 'Reproduce the flake and open a pull request.',
    nonce: 'cloud-agent-nonce',
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
    runId,
    sequence: 7,
    target: '#product',
    work: {
        activity: null,
        agentId: 'agt_orbit',
        cancelRequestedAt: null,
        cancelRequestedBy: null,
        chatId: 'cht_product',
        computerId: 'cmp_studio',
        createdAt: '2026-09-04T12:00:00.000Z',
        id: workId,
        job: { followUp: null, startedAt: null, state: 'working' },
        messageId: 'msg_1a2b3c4d5e6f7890',
        provider: 'cursor',
        providerAgentId: null,
        providerUrl: null,
        repository: 'haus/haus',
        runs: [],
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
        observations: [] as CloudAgentObservation[],
        reconciled: [] as CloudAgentReconcileEntry[],
        restores,
        supervisor: {
            report(
                ref: { runId: string; workId: string },
                observation: Omit<CloudAgentObservation, 'runId' | 'workId'>
            ) {
                state.observations.push({ ...observation, runId: ref.runId, workId: ref.workId });
            },
            watch() {},
            reconcile(entries: CloudAgentReconcileEntry[]) {
                state.reconciled.push(...entries);
                return Promise.resolve();
            },
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
