import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { WorkerQuestions } from '@haus/api';
import { finishedTurn } from '../../runtime/testing/fake-runtime-driver.ts';
import { computerStart, registerComputerPlaces, turnToken } from './computer-place.fixture.ts';
import { sharedOf } from './turn-finish.ts';
import { ComputerTurnJournal } from './turn-journal.ts';

const computerPlaces = registerComputerPlaces();
const questions: WorkerQuestions = [
    {
        header: 'Database',
        multiSelect: false,
        options: [{ description: null, label: 'Postgres' }],
        question: 'Which database?',
    },
];

describe('a Worker question on a Computer', () => {
    test('is journaled, sent when asked, and resent just before the turn ends', async () => {
        const computer = computerPlaces();
        const { frames, place, sent } = computer.place({
            async *turn(context) {
                await context.onQuestion?.(questions);
                yield* finishedTurn();
            },
        });
        await place.accept(computerStart());
        await sent('worker-turn-ended');

        const types = frames.map((frame) => frame.type);
        expect(types.indexOf('worker-turn-question')).toBeLessThan(
            types.indexOf('worker-turn-ended')
        );
        const asked = {
            attempt: 1,
            questions,
            turnId: 'wkt_1',
            type: 'worker-turn-question' as const,
        };
        expect(frames.filter((frame) => frame.type === 'worker-turn-question')).toEqual([
            asked,
            asked,
        ]);
        const journal = new ComputerTurnJournal(join(computer.root, 'data'), 'srv_1');
        expect((await journal.turn({ turnId: 'wkt_1', workerId: 'wrk_1' }))?.questions).toEqual(
            questions
        );
    });

    test('a restart that lost the harness resends the journaled question before the end', async () => {
        const computer = computerPlaces();
        const journal = new ComputerTurnJournal(join(computer.root, 'data'), 'srv_1');
        const frame = computerStart();
        const ref = { turnId: frame.turnId, workerId: frame.workerId };
        await journal.accept(frame);
        for (const phase of ['credentialed', 'running'] as const) {
            await journal.advance(ref, (turn) => ({
                ...sharedOf(turn),
                frame,
                phase,
                questions,
                token: turnToken,
            }));
        }
        const { frames, place, sent } = computer.place();
        await place.connected();
        await sent('worker-turn-ended');

        expect(
            frames
                .filter((sentFrame) => sentFrame.type.startsWith('worker-turn-'))
                .map((sentFrame) => sentFrame.type)
        ).toEqual(['worker-turn-question', 'worker-turn-ended']);
    });
});
