import { expect, test } from 'bun:test';
import { agentCommandSchema } from './agent-runner.ts';
import {
    type WorkerCloseCommand,
    type WorkerHeldFrame,
    type WorkerTurnActivityFrame,
    type WorkerTurnEndedFrame,
    type WorkerTurnInputAcceptedFrame,
    type WorkerTurnSessionFrame,
    workerHeldFrameSchema,
    workerTurnActivityFrameSchema,
    workerTurnEndedFrameSchema,
    workerTurnExits,
    workerTurnInputAcceptedFrameSchema,
    workerTurnSessionFrameSchema,
} from './worker-computer-frames.ts';
import {
    type WorkerTurnAcceptedFrame,
    type WorkerTurnStartFrame,
    workerTurnAcceptedFrameSchema,
    workerTurnStartFrameSchema,
} from './worker-turn-frames.ts';

const computerStart: WorkerTurnStartFrame = {
    agentId: 'agt_1',
    attempt: 2,
    checkout: {
        branch: 'haus/sec-12-wkr_1234567890abcdef',
        checkoutPath: '/Users/zach/src/haus',
        repository: 'haus/haus',
        startingRef: null,
    },
    input: 'Fix the flaky delivery test.',
    model: { droppedParams: [], fallbackFrom: null, id: 'gpt-5.5', params: [] },
    place: { computerId: 'cmp_abcdefghijklmnop', kind: 'computer' },
    predecessorTurnIds: ['wkt_aaaaaaaaaaaaaaaa'],
    providerAgentId: null,
    repository: 'haus/haus',
    resumeSessionId: 'sess_01',
    runtime: 'codex',
    startingRef: null,
    title: 'Fix the flaky delivery test',
    turnId: 'wkt_1234567890abcdef',
    type: 'worker-turn-start',
    workerId: 'wkr_1234567890abcdef',
    workerMdRevisionId: 'rev_1234567890abcdef',
};

test('a Computer-place start carries its attempt, runtime, checkout, and resume session', () => {
    expect(workerTurnStartFrameSchema.parse(computerStart)).toEqual(computerStart);
    expect(agentCommandSchema.parse(computerStart)).toEqual(computerStart);
    expect(workerTurnStartFrameSchema.safeParse({ ...computerStart, attempt: 0 }).success).toBe(
        false
    );
    expect(workerTurnStartFrameSchema.safeParse({ ...computerStart, runtime: 'pi' }).success).toBe(
        false
    );
});

test('accepting a turn names the attempt it journaled', () => {
    const accepted: WorkerTurnAcceptedFrame = {
        attempt: 2,
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-accepted',
    };
    expect(workerTurnAcceptedFrameSchema.parse(accepted)).toEqual(accepted);
    expect(
        workerTurnAcceptedFrameSchema.safeParse({ turnId: accepted.turnId, type: accepted.type })
            .success
    ).toBe(false);
});

test('the harness acknowledgement, session, and activity frames are bounded', () => {
    const inputAccepted: WorkerTurnInputAcceptedFrame = {
        attempt: 2,
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-input-accepted',
        workerMdRevisionId: null,
    };
    expect(workerTurnInputAcceptedFrameSchema.parse(inputAccepted)).toEqual(inputAccepted);
    const session: WorkerTurnSessionFrame = {
        sessionId: 'sess_01',
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-session',
    };
    expect(workerTurnSessionFrameSchema.parse(session)).toEqual(session);
    const activity: WorkerTurnActivityFrame = {
        at: '2026-11-19T12:00:05.000Z',
        summary: 'Running the delivery tests',
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-activity',
    };
    expect(workerTurnActivityFrameSchema.parse(activity)).toEqual(activity);
    expect(
        workerTurnActivityFrameSchema.safeParse({ ...activity, summary: 'x'.repeat(121) }).success
    ).toBe(false);
});

test('a turn ends with one exit from the settlement table', () => {
    expect(workerTurnExits).toEqual([
        'exited',
        'crashed-before-launch',
        'uncertain',
        'refused',
        'stopped',
    ]);
    const ended: WorkerTurnEndedFrame = {
        attempt: 2,
        branch: 'haus/sec-12-wkr_1234567890abcdef',
        branches: [
            {
                branch: 'haus/sec-12-wkr_1234567890abcdef',
                pullRequest: {
                    additions: 12,
                    changedFiles: 2,
                    deletions: 3,
                    number: 41,
                    observedAt: '2026-11-19T12:10:00.000Z',
                    state: 'open',
                },
                pullRequestUrl: 'https://github.com/haus/haus/pull/41',
                repository: 'haus/haus',
            },
        ],
        detail: null,
        exit: 'exited',
        sessionId: 'sess_01',
        turnId: 'wkt_1234567890abcdef',
        type: 'worker-turn-ended',
    };
    expect(workerTurnEndedFrameSchema.parse(ended)).toEqual(ended);
    expect(workerTurnEndedFrameSchema.safeParse({ ...ended, exit: 'crashed' }).success).toBe(false);
});

test('a Computer reports what it holds, and the Server closes a held Worker', () => {
    const held: WorkerHeldFrame = { type: 'worker-held', workerIds: [] };
    expect(workerHeldFrameSchema.parse(held)).toEqual(held);
    const close: WorkerCloseCommand = { type: 'worker-close', workerId: 'wkr_1234567890abcdef' };
    expect(agentCommandSchema.parse(close)).toEqual(close);
    expect(agentCommandSchema.safeParse({ ...close, workerId: '' }).success).toBe(false);
});
