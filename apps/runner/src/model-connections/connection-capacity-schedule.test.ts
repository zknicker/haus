import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import {
    capacityFrames,
    capacityRunner,
    chatgptPath,
    chatgptPlan,
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

describe('plan capacity backoff', () => {
    test('a rate-limited read holds every read on that provider for its Retry-After seconds', async () => {
        const secondPlan = { ...claudePlan, id: 'mc_claude_2', label: 'Second plan' };
        let limited = true;
        const { clock, reader, server } = await capacityRunner([claudePlan, secondPlan], {
            [claudePath]: () =>
                limited
                    ? Response.json(
                          { error: 'rate_limited' },
                          { headers: { 'retry-after': '1800' }, status: 429 }
                      )
                    : Response.json(claudeUsage),
        });

        await reader.sweep();
        expect(reads(server)).toEqual([claudePath]);

        limited = false;
        clock.at += 16 * minute;
        await reader.sweep();
        await reader.afterAccessFailure('mc_claude_2');
        expect(reads(server)).toEqual([claudePath]);

        clock.at += 14 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath, claudePath, claudePath]);
        expect((await capacityFrames(server)).map((frame) => frame.connectionId)).toEqual([
            'mc_claude',
            'mc_claude_2',
        ]);
    });

    test('a Retry-After date holds ChatGPT reads, capped at an hour', async () => {
        const { clock, reader, server } = await capacityRunner([chatgptPlan()], {
            [chatgptPath]: () =>
                new Response('slow down', {
                    headers: { 'retry-after': 'Fri, 20 Nov 2026 12:00:00 GMT' },
                    status: 429,
                }),
        });

        await reader.sweep();
        clock.at += 59 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath]);

        clock.at += minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath]);
    });

    test('a refused credential is not read again for 6 hours or until it is replaced', async () => {
        const { clock, logs, reader, runner, server } = await capacityRunner([claudePlan], {
            [claudePath]: () => Response.json({ error: 'scope' }, { status: 401 }),
        });

        await reader.sweep();
        clock.at += 16 * minute;
        await reader.sweep();
        await reader.afterAccessFailure('mc_claude');
        clock.at += 5 * 60 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath]);

        clock.at += 44 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath, claudePath]);

        await runner.book.replace([{ ...claudePlan, credentialVersion: 2 }]);
        await reader.sweep();
        expect(reads(server)).toEqual([claudePath, claudePath, claudePath]);
        expect(logs).toEqual([
            'Runner could not read capacity for mc_claude: Claude session expired. Run `claude` to log in again.',
            'Runner could not read capacity for mc_claude: Claude session expired. Run `claude` to log in again.',
            'Runner could not read capacity for mc_claude: Claude session expired. Run `claude` to log in again.',
        ]);
    });
});
