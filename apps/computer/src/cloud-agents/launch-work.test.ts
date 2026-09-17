import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CloudAgentObservation, CloudAgentReconcileEntry } from '@haus/api';
import { createFakeCloudAgentProvider } from './fake-provider.ts';
import {
    CloudAgentLaunchFailedError,
    CloudAgentLaunchUnconfirmedError,
    startCloudAgentWork,
} from './launch-work.ts';
import { CloudAgentProviderUnavailableError } from './provider.ts';
import { setCloudAgentProvider } from './registry.ts';

const serverId = 'srv_cloud';
const serverOrigin = 'https://haus.test';
const workId = 'caw_1234567890abcdef';
const runId = 'car_1234567890abcdef';

const request = {
    content: 'Handing this to a cloud agent.',
    instructions: 'Reproduce the flake and open a pull request.',
    nonce: 'cloud-agent-nonce',
    repository: 'haus/haus',
    replyToMessageId: 'msg_request',
    startingRef: 'main',
    target: '#product',
    title: 'Fix the flaky delivery test',
};

const receipt = {
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

const restores: Array<() => void> = [];
let dataRoot: string;
let observations: CloudAgentObservation[];
let reconciled: CloudAgentReconcileEntry[];
const supervisor = {
    report(
        ref: { runId: string; workId: string },
        observation: Omit<CloudAgentObservation, 'runId' | 'workId'>
    ) {
        observations.push({ ...observation, runId: ref.runId, workId: ref.workId });
    },
    watch() {},
    reconcile(entries: CloudAgentReconcileEntry[]) {
        reconciled.push(...entries);
        return Promise.resolve();
    },
};
beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-cloud-launch-'));
    observations = [];
    reconciled = [];
});
afterEach(async () => {
    while (restores.length > 0) {
        restores.pop()?.();
    }
    await rm(dataRoot, { recursive: true, force: true });
});
function install(provider: ReturnType<typeof createFakeCloudAgentProvider>) {
    restores.push(setCloudAgentProvider(provider));
    return provider;
}
function collect() {
    return observations;
}
function stubServer(body: unknown = receipt, status = 200) {
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
}

test('an unavailable provider fails before the Server is asked for anything', async () => {
    install(
        createFakeCloudAgentProvider({
            readiness: { ready: false, reason: 'provider-unavailable' },
        })
    );
    const calls = stubServer();

    await expect(
        startCloudAgentWork({
            dataRoot,
            supervisor,
            request,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
        })
    ).rejects.toThrow(CloudAgentProviderUnavailableError);
    expect(calls).toHaveLength(0);
});

test('a launch records the work, keeps instructions local, and reports the provider ids', async () => {
    const provider = install(createFakeCloudAgentProvider());
    const calls = stubServer();
    const observations = collect();

    const result = await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });

    expect(result.work.id).toBe(workId);
    expect(calls[0]?.url).toBe('https://haus.test/api/agent/cloud-agents');
    expect(calls[0]?.body).toEqual({
        content: request.content,
        nonce: request.nonce,
        provider: 'cursor',
        repository: request.repository,
        replyToMessageId: request.replyToMessageId,
        startingRef: 'main',
        target: '#product',
        title: request.title,
    });
    // The provider prompt reaches the provider and nothing else.
    expect(provider.launches[0]).toMatchObject({
        idempotencyKey: runId,
        instructions: request.instructions,
        ref: 'main',
        repository: 'haus/haus',
    });
    expect(observations).toEqual([
        {
            observedAt: expect.any(String),
            providerAgentId: `bc_${runId}`,
            providerRunId: `run_${runId}`,
            providerUrl: `https://cursor.com/agents/bc_${runId}`,
            runId,
            status: 'running',
            workId,
        },
    ]);
});

test('a provider that refuses the launch settles the recorded work as failed', async () => {
    const provider = install(createFakeCloudAgentProvider());
    provider.failNextStart('Repository access is missing.');
    stubServer();
    const observations = collect();

    await expect(
        startCloudAgentWork({
            dataRoot,
            supervisor,
            request,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
        })
    ).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(observations[0]).toMatchObject({
        errorCode: 'provider-launch-rejected',
        runId,
        status: 'failed',
        summary: 'The provider rejected the launch.',
        workId,
    });
});

test('a Server refusal reaches the caller and reports nothing', async () => {
    install(createFakeCloudAgentProvider());
    stubServer({ code: 'TARGET_READ_ONLY', message: 'That channel is archived.' }, 409);
    const observations = collect();

    await expect(
        startCloudAgentWork({
            dataRoot,
            supervisor,
            request,
            runnerToken: 'grtr_x',
            serverId,
            serverOrigin,
        })
    ).rejects.toThrow(/archived/);
    expect(observations).toHaveLength(0);
});

test('a lost identity report replays the journal address without a second launch', async () => {
    const provider = install(createFakeCloudAgentProvider());
    stubServer();
    await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });
    observations.length = 0;
    stubServer({ ...receipt, idempotent: true });
    await startCloudAgentWork({
        dataRoot,
        supervisor,
        request,
        runnerToken: 'grtr_x',
        serverId,
        serverOrigin,
    });
    expect(provider.launches).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
        providerAgentId: `bc_${runId}`,
        providerRunId: `run_${runId}`,
        runId,
    });
});

test('an ambiguous start cannot launch twice when the same nonce is replayed', async () => {
    const provider = install(createFakeCloudAgentProvider());
    let attempts = 0;
    provider.start = () => {
        attempts += 1;
        return Promise.reject(new Error('network response lost'));
    };
    stubServer();
    const input = { dataRoot, supervisor, request, runnerToken: 'grtr_x', serverId, serverOrigin };
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchUnconfirmedError);
    stubServer({ ...receipt, idempotent: true });
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchUnconfirmedError);
    expect(attempts).toBe(1);
    expect(observations.map((entry) => entry.status)).toEqual(['queued']);
});

test('a replayed rejection settles the same work without another provider launch', async () => {
    const provider = install(createFakeCloudAgentProvider());
    provider.failNextStart('Denied');
    stubServer();
    const input = { dataRoot, supervisor, request, runnerToken: 'grtr_x', serverId, serverOrigin };
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    stubServer({ ...receipt, idempotent: true });
    await expect(startCloudAgentWork(input)).rejects.toThrow(CloudAgentLaunchFailedError);
    expect(provider.launches).toHaveLength(0);
    expect(observations.map((entry) => entry.status)).toEqual(['failed', 'failed']);
});
