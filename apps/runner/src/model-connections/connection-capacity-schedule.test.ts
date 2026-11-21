import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import {
    capacityFrames,
    capacityRunner,
    chatgptPath,
    chatgptPlan,
    chatgptUsage,
    keys,
    minute,
    reads,
} from './connection-capacity-test-host.ts';

afterEach(drainCleanups);

const plan = chatgptPlan();
const refusedLog =
    'Runner could not read capacity for mc_chatgpt: Codex session expired. Run `codex` to log in again.';

describe('plan capacity schedule', () => {
    test('a plan is read at most every 15 minutes, again after an access failure, and after a new credential', async () => {
        const { clock, reader, runner, server } = await capacityRunner([plan, ...keys]);

        await reader.sweep();
        clock.at += 14 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath]);

        await reader.afterAccessFailure('mc_chatgpt');
        expect(reads(server)).toEqual([chatgptPath, chatgptPath]);

        clock.at += 14 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath]);
        clock.at += minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath, chatgptPath]);

        await runner.book.replace([{ ...plan, credentialVersion: 2 }, ...keys]);
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath, chatgptPath, chatgptPath]);
        expect(
            (await capacityFrames(server)).map((frame) => [frame.readAt, frame.credentialVersion])
        ).toEqual([
            ['2026-11-19T12:00:00.000Z', 1],
            ['2026-11-19T12:14:00.000Z', 1],
            ['2026-11-19T12:29:00.000Z', 1],
            ['2026-11-19T12:29:00.000Z', 2],
        ]);
    });

    test('a read in flight absorbs every later trigger, and access failures wait a minute after it', async () => {
        const gate = Promise.withResolvers<void>();
        const arrived = Promise.withResolvers<void>();
        const { clock, reader, server } = await capacityRunner([plan], {
            [chatgptPath]: async () => {
                arrived.resolve();
                await gate.promise;
                return Response.json(chatgptUsage);
            },
        });

        const first = reader.sweep();
        await arrived.promise;
        clock.at += 15 * minute;
        const later = [
            reader.afterAccessFailure('mc_chatgpt'),
            reader.afterAccessFailure('mc_chatgpt'),
            reader.sweep(),
        ];
        gate.resolve();
        await Promise.all([first, ...later]);
        expect(reads(server)).toEqual([chatgptPath]);

        clock.at += minute - 1;
        await reader.afterAccessFailure('mc_chatgpt');
        expect(reads(server)).toEqual([chatgptPath]);
        clock.at += 1;
        await reader.afterAccessFailure('mc_chatgpt');
        expect(reads(server)).toEqual([chatgptPath, chatgptPath]);
        expect((await capacityFrames(server)).map((frame) => frame.readAt)).toEqual([
            '2026-11-19T12:00:00.000Z',
            '2026-11-19T12:16:00.000Z',
        ]);
    });
});

describe('plan capacity backoff', () => {
    test('a rate-limited read holds every read on that provider for its Retry-After seconds', async () => {
        const secondPlan = { ...plan, id: 'mc_chatgpt_2', label: 'Second plan' };
        let limited = true;
        const { clock, reader, server } = await capacityRunner([plan, secondPlan], {
            [chatgptPath]: () =>
                limited
                    ? Response.json(
                          { error: 'rate_limited' },
                          { headers: { 'retry-after': '1800' }, status: 429 }
                      )
                    : Response.json(chatgptUsage),
        });

        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath]);

        limited = false;
        clock.at += 16 * minute;
        await reader.sweep();
        await reader.afterAccessFailure('mc_chatgpt_2');
        expect(reads(server)).toEqual([chatgptPath]);

        clock.at += 14 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath, chatgptPath]);
        expect((await capacityFrames(server)).map((frame) => frame.connectionId)).toEqual([
            'mc_chatgpt',
            'mc_chatgpt_2',
        ]);
    });

    test('a Retry-After date holds ChatGPT reads, capped at an hour', async () => {
        const { clock, reader, server } = await capacityRunner([plan], {
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
        const { clock, logs, reader, runner, server } = await capacityRunner([plan], {
            [chatgptPath]: () => Response.json({ error: 'scope' }, { status: 401 }),
        });

        await reader.sweep();
        clock.at += 16 * minute;
        await reader.sweep();
        await reader.afterAccessFailure('mc_chatgpt');
        clock.at += 5 * 60 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath]);

        clock.at += 44 * minute;
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath]);

        await runner.book.replace([{ ...plan, credentialVersion: 2 }]);
        await reader.sweep();
        expect(reads(server)).toEqual([chatgptPath, chatgptPath, chatgptPath]);
        expect(logs).toEqual([refusedLog, refusedLog, refusedLog]);
    });
});
