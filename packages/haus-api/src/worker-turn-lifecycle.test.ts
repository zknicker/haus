import { describe, expect, test } from 'bun:test';
import {
    type WorkerTurnStatus,
    workerTurnStatuses,
    workerTurnTerminalStatuses,
} from './worker-shared.ts';
import {
    advanceWorkerTurn,
    type WorkerTurnSnapshot,
    type WorkerTurnStep,
    projectWorker,
} from './worker-turn-lifecycle.ts';

const earlier = new Date('2026-11-05T10:00:00.000Z');
const later = new Date('2026-11-05T10:01:00.000Z');
const settledStatuses: readonly WorkerTurnStatus[] = workerTurnTerminalStatuses;

const code = 'followup-auto-interrupt-failed' as const;

function snapshot(overrides: Partial<WorkerTurnSnapshot> = {}): WorkerTurnSnapshot {
    return {
        cancelRequested: false,
        observedAt: earlier,
        stall: null,
        status: 'running',
        workStatus: 'running',
        ...overrides,
    };
}

/** The spec's table, stated by hand so a change to either side fails here. */
function expectedStep(from: WorkerTurnStatus, reading: WorkerTurnStatus): WorkerTurnStep {
    if (settledStatuses.includes(from)) {
        return { kind: 'ignored' };
    }
    if (settledStatuses.includes(reading)) {
        return {
            kind: 'recorded',
            notice: { kind: 'settled' },
            settled: true,
            stall: null,
            status: reading,
        };
    }
    const status = from === 'running' || reading === 'running' ? 'running' : 'queued';
    return { kind: 'recorded', notice: null, settled: false, stall: null, status };
}

describe('advanceWorkerTurn', () => {
    for (const from of workerTurnStatuses) {
        for (const reading of workerTurnStatuses) {
            test(`${from} reading ${reading}`, () => {
                expect(
                    advanceWorkerTurn(snapshot({ status: from }), {
                        observedAt: later,
                        stallCode: null,
                        status: reading,
                    })
                ).toEqual(expectedStep(from, reading));
            });
        }
    }

    test('ignores a reading that is not newer', () => {
        for (const observedAt of [earlier, later]) {
            expect(
                advanceWorkerTurn(snapshot({ observedAt: later }), {
                    observedAt,
                    stallCode: null,
                    status: 'completed',
                })
            ).toEqual({ kind: 'ignored' });
        }
    });

    test('records the first reading of a Run', () => {
        expect(
            advanceWorkerTurn(snapshot({ observedAt: null, status: 'queued' }), {
                observedAt: earlier,
                stallCode: null,
                status: 'running',
            })
        ).toEqual({
            kind: 'recorded',
            notice: null,
            settled: false,
            stall: null,
            status: 'running',
        });
    });

    test('a first stall dates itself and earns its first notice without settling', () => {
        expect(
            advanceWorkerTurn(snapshot({ status: 'queued' }), {
                observedAt: later,
                stallCode: code,
                status: 'queued',
            })
        ).toEqual({
            kind: 'recorded',
            notice: { kind: 'stall', window: 0 },
            settled: false,
            stall: { code, since: later },
            status: 'queued',
        });
    });

    test('a continuing stall keeps its date and counts reminder windows from it', () => {
        const stall = { code, since: earlier };
        const step = (observedAt: Date) =>
            advanceWorkerTurn(snapshot({ stall }), {
                observedAt,
                stallCode: code,
                status: 'running',
            });
        expect(step(new Date(earlier.getTime() + 119 * 60_000))).toMatchObject({
            notice: { kind: 'stall', window: 0 },
            stall,
        });
        expect(step(new Date(earlier.getTime() + 121 * 60_000))).toMatchObject({
            notice: { kind: 'stall', window: 1 },
            stall,
        });
    });

    test('a reading without a code clears the stall', () => {
        expect(
            advanceWorkerTurn(snapshot({ stall: { code, since: earlier } }), {
                observedAt: later,
                stallCode: null,
                status: 'running',
            })
        ).toMatchObject({ notice: null, stall: null });
    });

    test('a stall on settled work or a cancelling Run stays quiet', () => {
        for (const run of [
            snapshot({ workStatus: 'cancelled' }),
            snapshot({ cancelRequested: true }),
        ]) {
            expect(
                advanceWorkerTurn(run, { observedAt: later, stallCode: code, status: 'running' })
            ).toMatchObject({ notice: null, stall: { code, since: later } });
        }
    });

    test('settling outranks and clears a stall', () => {
        expect(
            advanceWorkerTurn(snapshot({ stall: { code, since: earlier } }), {
                observedAt: later,
                stallCode: code,
                status: 'failed',
            })
        ).toEqual({
            kind: 'recorded',
            notice: { kind: 'settled' },
            settled: true,
            stall: null,
            status: 'failed',
        });
    });
});

describe('projectWorker', () => {
    test('reads only the lifecycle fields of the newest Run', () => {
        const lifecycle = { startedAt: earlier, status: 'completed', terminalAt: later } as const;
        expect(projectWorker({ ...lifecycle, ...{ summary: 'done' } })).toEqual(lifecycle);
    });
});
