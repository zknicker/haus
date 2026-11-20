import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import {
    capacityFrames,
    capacityRunner,
    claudePath,
    claudePlan,
    claudeUsage,
    keys,
    minute,
    reads,
} from './connection-capacity-test-host.ts';

afterEach(drainCleanups);

describe('plan capacity schedule', () => {
    test('a plan is read at most every 15 minutes, again after an access failure, and after a new credential', async () => {
        const { clock, reader, runner, server } = await capacityRunner([claudePlan, ...keys]);

        await reader.sweep();
        clock.at += 14 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath]);

        await reader.afterAccessFailure('mc_claude');
        expect(reads(server)).toEqual([claudePath, claudePath]);

        clock.at += 14 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath, claudePath]);
        clock.at += minute;
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath, claudePath, claudePath]);

        await runner.book.replace([{ ...claudePlan, credentialVersion: 2 }, ...keys]);
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath, claudePath, claudePath, claudePath]);
        expect((await capacityFrames(server)).map((frame) => frame.readAt)).toEqual([
            '2026-11-19T12:00:00.000Z',
            '2026-11-19T12:14:00.000Z',
            '2026-11-19T12:29:00.000Z',
            '2026-11-19T12:29:00.000Z',
        ]);
    });

    test('a read in flight absorbs every later trigger, and access failures wait a minute after it', async () => {
        const gate = Promise.withResolvers<void>();
        const arrived = Promise.withResolvers<void>();
        const { clock, reader, server } = await capacityRunner([claudePlan], {
            [claudePath]: async () => {
                arrived.resolve();
                await gate.promise;
                return Response.json(claudeUsage);
            },
        });

        const first = reader.sweep();
        await arrived.promise;
        clock.at += 15 * minute;
        const later = [
            reader.afterAccessFailure('mc_claude'),
            reader.afterAccessFailure('mc_claude'),
            reader.sweep(),
        ];
        gate.resolve();
        await Promise.all([first, ...later]);
        expect(reads(server)).toEqual([claudePath]);

        clock.at += minute - 1;
        await reader.afterAccessFailure('mc_claude');
        expect(reads(server)).toEqual([claudePath]);
        clock.at += 1;
        await reader.afterAccessFailure('mc_claude');
        expect(reads(server)).toEqual([claudePath, claudePath]);
        expect((await capacityFrames(server)).map((frame) => frame.readAt)).toEqual([
            '2026-11-19T12:00:00.000Z',
            '2026-11-19T12:16:00.000Z',
        ]);
    });
});
