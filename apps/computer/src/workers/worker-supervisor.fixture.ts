import { afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isCloudWorkerPlace, type WorkerTurnStartFrame } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import type { CloudAgentProvider } from './provider.ts';
import { WorkerTurnJournal } from './turn-journal.ts';
import type { WorkerComputerFrame } from './turn-monitor.ts';
import { WorkerSupervisor } from './work-runner.ts';

export const serverId = 'srv_cloud';
export const workerId = 'wkr_1234567890abcdef';
export const computerServer = {
    credential: 'computer-credential',
    serverOrigin: 'http://127.0.0.1:9',
};

export function turnStartFrame(overrides: Partial<WorkerTurnStartFrame> = {}) {
    return {
        agentId: 'agt_1234567890abcdef',
        attempt: 1,
        checkout: null,
        input: 'Fix the flaky delivery test.',
        model: { droppedParams: [], fallbackFrom: null, id: null, params: [] },
        place: { kind: 'cursor' },
        predecessorTurnIds: [],
        providerAgentId: null,
        repository: 'haus/haus',
        resumeSessionId: null,
        runtime: null,
        startingRef: 'main',
        title: 'Fix the flaky delivery test',
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-start',
        workerId,
        workerMdRevisionId: null,
        ...overrides,
    } satisfies WorkerTurnStartFrame;
}

export function reconcileEntry(frame: WorkerTurnStartFrame, stopRequested = false) {
    return {
        attempt: null,
        place: frame.place,
        providerAgentId: frame.providerAgentId,
        providerRunId: null,
        status: 'queued' as const,
        stopRequested,
        turnId: frame.turnId,
        workerId: frame.workerId,
    };
}

export function turnRef(frame: WorkerTurnStartFrame) {
    if (!isCloudWorkerPlace(frame.place)) {
        throw new Error('The supervisor fixture builds cloud turns only.');
    }
    return {
        provider: frame.place.kind,
        providerAgentId: frame.providerAgentId,
        providerRunId: null,
        turnId: frame.turnId,
        workerId: frame.workerId,
    };
}

export function registerSupervisorFixture() {
    const cleanup: Array<() => Promise<void>> = [];
    afterEach(async () => {
        for (const close of cleanup.splice(0).reverse()) {
            await close();
        }
    });
    return async <Provider extends CloudAgentProvider>(provider: Provider) => {
        const dataRoot = await mkdtemp(join(tmpdir(), 'haus-worker-turns-'));
        const runtime = makeTestRuntime();
        cleanup.push(async () => {
            await runtime.dispose();
            await rm(dataRoot, { recursive: true, force: true });
        });
        const start = () => {
            const work = new WorkerSupervisor(runtime, {
                server: computerServer,
                dataRoot,
                enrich: async (observation) => observation,
                provider: () => provider,
                serverId,
            });
            const frames: WorkerComputerFrame[] = [];
            const waiting: Array<{
                match: (frame: WorkerComputerFrame) => boolean;
                resolve: () => void;
            }> = [];
            work.attach((frame) => {
                frames.push(frame);
                for (const waiter of waiting.filter((candidate) => candidate.match(frame))) {
                    waiter.resolve();
                }
            });
            cleanup.push(() => work.close());
            const observations = () =>
                frames.flatMap((frame) =>
                    frame.type === 'worker-observation' ? [frame.observation] : []
                );
            const sent = (match: (frame: WorkerComputerFrame) => boolean) =>
                frames.some(match)
                    ? Promise.resolve()
                    : new Promise<void>((resolve) => waiting.push({ match, resolve }));
            return { frames, observations, sent, work };
        };
        return { dataRoot, journal: new WorkerTurnJournal(dataRoot), provider, runtime, start };
    };
}
