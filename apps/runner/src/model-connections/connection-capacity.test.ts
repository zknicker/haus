import { afterEach, describe, expect, test } from 'bun:test';
import { drainCleanups } from '../runner-test-server.ts';
import {
    capacityFrames,
    capacityRunner,
    chatgptPath,
    chatgptPlan,
    chatgptUsage,
    claudePlan,
    keys,
    minute,
    reads,
} from './connection-capacity-test-host.ts';

afterEach(drainCleanups);

describe('plan capacity readers', () => {
    test('a Claude setup-token is never sent to the OAuth usage endpoint, which needs user:profile', async () => {
        const { logs, reader, server } = await capacityRunner([claudePlan]);

        await reader.sweep();
        await reader.afterAccessFailure('mc_claude');

        expect(reads(server)).toEqual([]);
        expect(await capacityFrames(server)).toEqual([]);
        expect(logs).toEqual([]);
    });

    test('a Claude plan sends the windows its turns observed, tagged with the credential it ran on', async () => {
        const { clock, reader, server } = await capacityRunner([claudePlan]);
        const windows = [
            {
                id: 'current-session',
                label: '5-hour',
                resetsAt: '2026-11-19T15:00:00.000Z',
                usedPercent: 42,
            },
            {
                id: 'current-week-all-models',
                label: 'Weekly',
                resetsAt: '2026-11-24T08:00:00.000Z',
                usedPercent: 81.6,
            },
        ];

        reader.observed(claudePlan, windows);
        clock.at += minute;
        reader.observed({ ...claudePlan, credentialVersion: 2 }, windows.slice(1));

        expect(await capacityFrames(server)).toEqual([
            {
                connectionId: 'mc_claude',
                credentialVersion: 1,
                readAt: '2026-11-19T12:00:00.000Z',
                type: 'runner-connection-capacity',
                windows,
            },
            {
                connectionId: 'mc_claude',
                credentialVersion: 2,
                readAt: '2026-11-19T12:01:00.000Z',
                type: 'runner-connection-capacity',
                windows: windows.slice(1),
            },
        ]);
        expect(reads(server)).toEqual([]);
    });

    test('a ChatGPT plan reads with its access token and account, as 5-hour and Weekly', async () => {
        const accounts: (string | null)[] = [];
        const { reader, server } = await capacityRunner([chatgptPlan()], {
            [chatgptPath]: (_body, _url, request) => {
                accounts.push(request.headers.get('chatgpt-account-id'));
                return Response.json(chatgptUsage);
            },
        });

        await reader.sweep();

        expect(await capacityFrames(server)).toEqual([
            {
                connectionId: 'mc_chatgpt',
                credentialVersion: 1,
                readAt: '2026-11-19T12:00:00.000Z',
                type: 'runner-connection-capacity',
                windows: [
                    {
                        id: 'current-session',
                        label: '5-hour',
                        resetsAt: '2026-11-19T15:00:00.000Z',
                        usedPercent: 17,
                    },
                    {
                        id: 'current-week',
                        label: 'Weekly',
                        resetsAt: '2026-11-20T12:00:00.000Z',
                        usedPercent: 63,
                    },
                ],
            },
        ]);
        expect(server.requests.map((request) => request.authorization)).toEqual([
            'Bearer access-1',
        ]);
        expect(accounts).toEqual(['acct_1']);
    });

    test('API keys and SuperGrok have no reader, so nothing is read or sent', async () => {
        const { reader, server } = await capacityRunner(keys);

        await reader.sweep();
        await reader.afterAccessFailure('mc_supergrok');

        expect(reads(server)).toEqual([]);
        expect(await capacityFrames(server)).toEqual([]);
    });

    test('a refused read sends nothing, touches no status, and says capacity is unavailable', async () => {
        const second = { ...chatgptPlan(), id: 'mc_chatgpt_2' };
        const { logs, reader, server } = await capacityRunner([chatgptPlan(1), second], {
            [chatgptPath]: () => Response.json({ error: 'scope' }, { status: 403 }),
        });

        await reader.sweep();

        expect(await capacityFrames(server)).toEqual([]);
        expect(
            server.received.filter((frame) => frame.type === 'runner-connection-status')
        ).toEqual([]);
        expect(reads(server)).toEqual([chatgptPath]);
        expect(logs.toSorted()).toEqual([
            'Runner could not read capacity for mc_chatgpt: The access token has expired; the next turn refreshes it.',
            'Runner could not read capacity for mc_chatgpt_2: Codex session expired. Run `codex` to log in again.',
        ]);
    });
});
