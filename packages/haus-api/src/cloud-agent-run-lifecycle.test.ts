import { describe, expect, test } from 'bun:test';
import {
    advanceCloudAgentRun,
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

/** The spec's table, stated by hand so a change to either side fails here. */
function expectedStep(from: CloudAgentStatus, reading: CloudAgentStatus): CloudAgentRunStep {
    if (settledStatuses.includes(from)) {
        return { kind: 'ignored' };
    }
    if (settledStatuses.includes(reading)) {
        return { kind: 'recorded', notice: 'settled', settled: true, status: reading };
    }
    const status = from === 'running' || reading === 'running' ? 'running' : 'queued';
    return { kind: 'recorded', notice: null, settled: false, status };
}

describe('advanceCloudAgentRun', () => {
    for (const from of cloudAgentStatuses) {
        for (const reading of cloudAgentStatuses) {
            test(`${from} reading ${reading}`, () => {
                expect(
                    advanceCloudAgentRun(
                        { observedAt: earlier, status: from, workStatus: 'running' },
                        { observedAt: later, stalled: false, status: reading }
                    )
                ).toEqual(expectedStep(from, reading));
            });
        }
    }

    test('ignores a reading that is not newer', () => {
        for (const observedAt of [earlier, later]) {
            expect(
                advanceCloudAgentRun(
                    { observedAt: later, status: 'running', workStatus: 'running' },
                    { observedAt, stalled: false, status: 'completed' }
                )
            ).toEqual({ kind: 'ignored' });
        }
    });

    test('records the first reading of a Run', () => {
        expect(
            advanceCloudAgentRun(
                { observedAt: null, status: 'queued', workStatus: 'queued' },
                { observedAt: earlier, stalled: false, status: 'running' }
            )
        ).toEqual({ kind: 'recorded', notice: null, settled: false, status: 'running' });
    });

    test('a stalled reading on live work earns a stall notice without settling', () => {
        expect(
            advanceCloudAgentRun(
                { observedAt: earlier, status: 'queued', workStatus: 'running' },
                { observedAt: later, stalled: true, status: 'queued' }
            )
        ).toEqual({ kind: 'recorded', notice: 'stall', settled: false, status: 'queued' });
    });

    test('a stalled reading on settled work records quietly', () => {
        expect(
            advanceCloudAgentRun(
                { observedAt: earlier, status: 'running', workStatus: 'cancelled' },
                { observedAt: later, stalled: true, status: 'running' }
            )
        ).toEqual({ kind: 'recorded', notice: null, settled: false, status: 'running' });
    });

    test('settling outranks a stall', () => {
        expect(
            advanceCloudAgentRun(
                { observedAt: earlier, status: 'running', workStatus: 'running' },
                { observedAt: later, stalled: true, status: 'failed' }
            )
        ).toEqual({ kind: 'recorded', notice: 'settled', settled: true, status: 'failed' });
    });
});

describe('projectCloudAgentWork', () => {
    test('reads only the lifecycle fields of the newest Run', () => {
        const lifecycle = { startedAt: earlier, status: 'completed', terminalAt: later } as const;
        expect(projectCloudAgentWork({ ...lifecycle, ...{ summary: 'done' } })).toEqual(lifecycle);
    });
});
