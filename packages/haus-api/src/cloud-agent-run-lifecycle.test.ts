import { describe, expect, test } from 'bun:test';
import {
    advanceCloudAgentRun,
    type CloudAgentRunSnapshot,
    type CloudAgentRunStep,
    projectCloudAgentWork,
} from './cloud-agent-run-lifecycle.ts';
import {
    type CloudAgentStatus,
    cloudAgentStatuses,
    cloudAgentTerminalStatuses,
} from './cloud-agent-shared.ts';

const earlier = new Date('2026-11-05T10:00:00.000Z');
const later = new Date('2026-11-05T10:01:00.000Z');
const settledStatuses: readonly CloudAgentStatus[] = cloudAgentTerminalStatuses;

const code = 'followup-auto-interrupt-failed' as const;

function snapshot(overrides: Partial<CloudAgentRunSnapshot> = {}): CloudAgentRunSnapshot {
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
function expectedStep(from: CloudAgentStatus, reading: CloudAgentStatus): CloudAgentRunStep {
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

describe('advanceCloudAgentRun', () => {
    for (const from of cloudAgentStatuses) {
        for (const reading of cloudAgentStatuses) {
            test(`${from} reading ${reading}`, () => {
                expect(
                    advanceCloudAgentRun(snapshot({ status: from }), {
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
                advanceCloudAgentRun(snapshot({ observedAt: later }), {
                    observedAt,
                    stallCode: null,
                    status: 'completed',
                })
            ).toEqual({ kind: 'ignored' });
        }
    });

    test('records the first reading of a Run', () => {
        expect(
            advanceCloudAgentRun(snapshot({ observedAt: null, status: 'queued' }), {
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
            advanceCloudAgentRun(snapshot({ status: 'queued' }), {
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
            advanceCloudAgentRun(snapshot({ stall }), {
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
            advanceCloudAgentRun(snapshot({ stall: { code, since: earlier } }), {
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
                advanceCloudAgentRun(run, { observedAt: later, stallCode: code, status: 'running' })
            ).toMatchObject({ notice: null, stall: { code, since: later } });
        }
    });

    test('settling outranks and clears a stall', () => {
        expect(
            advanceCloudAgentRun(snapshot({ stall: { code, since: earlier } }), {
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

describe('projectCloudAgentWork', () => {
    test('reads only the lifecycle fields of the newest Run', () => {
        const lifecycle = { startedAt: earlier, status: 'completed', terminalAt: later } as const;
        expect(projectCloudAgentWork({ ...lifecycle, ...{ summary: 'done' } })).toEqual(lifecycle);
    });
});
