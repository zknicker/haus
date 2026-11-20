import { describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import type { FakeTurnContext } from '../../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../../runtime/turn-event.ts';
import { computerStart, registerComputerPlaces } from './computer-place.fixture.ts';
import type { WorkerHarnessLaunch } from './harness.ts';

const computerPlaces = registerComputerPlaces();

describe('a Computer that lost its Worker journal', () => {
    test('reports a reconciled turn it holds no record of as ended uncertain, once', async () => {
        const { frames, place } = computerPlaces().place();

        await place.reconcile([
            { attempt: 2, stopRequested: true, turnId: 'wkt_lost', workerId: 'wrk_lost' },
            { attempt: null, stopRequested: false, turnId: 'wkt_unsent', workerId: 'wrk_lost' },
        ]);

        expect(frames).toEqual([
            {
                attempt: 2,
                branch: null,
                branches: [],
                detail: 'journal-missing',
                exit: 'uncertain',
                sessionId: null,
                turnId: 'wkt_lost',
                type: 'worker-turn-ended',
            },
        ]);
    });

    test('never reports a turn whose harness is still live', async () => {
        const { frames, place, sent } = computerPlaces().place({ turn: waitForStop });
        await place.accept(computerStart());
        await sent('worker-turn-input-accepted');
        await rm(place.journal.layout('wrk_1').turnsFile);

        await place.reconcile([
            { attempt: 1, stopRequested: false, turnId: 'wkt_1', workerId: 'wrk_1' },
        ]);

        expect(frames.map((frame) => frame.type)).toEqual([
            'worker-turn-accepted',
            'worker-turn-session',
            'worker-turn-input-accepted',
        ]);
    });
});

async function* waitForStop(context: FakeTurnContext<WorkerHarnessLaunch>) {
    yield { nativeType: 'turn/started', type: 'progress' } satisfies TurnEvent;
    if (!context.signal.aborted) {
        await new Promise((resolve) =>
            context.signal.addEventListener('abort', resolve, { once: true })
        );
    }
    yield { type: 'abort' } satisfies TurnEvent;
}
