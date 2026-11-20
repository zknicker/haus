import { afterEach, describe, expect, test } from 'bun:test';
import type { RunnerModelConnection, RunnerUpFrame } from '@haus/api';
import {
    attachRunner,
    drainCleanups,
    type ServerStandIn,
    type StandInRoutes,
    serverStandIn,
} from '../runner-test-server.ts';
import { createCapacityReader } from './connection-capacity.ts';

afterEach(drainCleanups);

const farFuture = 4_102_444_800_000;
const minute = 60 * 1000;
const claudePath = '/api/oauth/usage';
const chatgptPath = '/backend-api/wham/usage';
let barriers = 0;

const claudePlan: RunnerModelConnection = {
    credential: { kind: 'setup-token', token: 'sk-ant-oat01-team' },
    credentialVersion: 1,
    id: 'mc_claude',
    label: 'Team plan',
    provider: 'claude',
    serverId: 'srv_1',
    webSearch: false,
};

function chatgptPlan(expires = farFuture, credentialVersion = 1) {
    const connection: RunnerModelConnection = {
        credential: {
            credential: { access: 'access-1', accountId: 'acct_1', expires, refresh: 'refresh-1' },
            kind: 'oauth',
        },
        credentialVersion,
        id: 'mc_chatgpt',
        label: 'Plus',
        provider: 'chatgpt',
        serverId: 'srv_1',
        webSearch: true,
    };
    return connection;
}

const keys: RunnerModelConnection[] = [
    {
        credential: { key: 'gemini-connection-key', kind: 'api-key' },
        credentialVersion: 1,
        id: 'mc_gemini',
        label: 'Gemini key',
        provider: 'gemini',
        serverId: 'srv_1',
        webSearch: true,
    },
    {
        credential: {
            credential: { access: 'xai-access', expires: farFuture, refresh: 'xai-refresh' },
            kind: 'oauth',
        },
        credentialVersion: 1,
        id: 'mc_supergrok',
        label: 'SuperGrok',
        provider: 'xai',
        serverId: 'srv_1',
        webSearch: true,
    },
];

const claudeUsage = {
    extra_usage: { is_enabled: false },
    five_hour: { resets_at: '2026-11-19T15:00:00.123456+00:00', utilization: 42 },
    seven_day: { resets_at: '2026-11-24T08:00:00+00:00', utilization: 81.6 },
    seven_day_opus: null,
    seven_day_sonnet: { resets_at: null, utilization: 12 },
};

const chatgptUsage = {
    plan_type: 'plus',
    rate_limit: {
        primary_window: { limit_window_seconds: 18_000, reset_at: 1_795_100_400, used_percent: 17 },
        secondary_window: {
            limit_window_seconds: 604_800,
            reset_after_seconds: 86_400,
            used_percent: 63,
        },
    },
};

async function capacityRunner(
    connections: RunnerModelConnection[],
    routes: StandInRoutes = {
        [chatgptPath]: () => Response.json(chatgptUsage),
        [claudePath]: () => Response.json(claudeUsage),
    }
) {
    const server = serverStandIn(routes);
    const runner = await attachRunner(server);
    await server.frame('runner-inventory');
    await runner.book.replace(connections);
    const clock = { at: Date.parse('2026-11-19T12:00:00.000Z') };
    const logs: string[] = [];
    const reader = createCapacityReader({
        book: runner.book,
        link: runner.link,
        log: (line) => logs.push(line),
        now: () => new Date(clock.at),
        usageUrls: { chatgpt: `${server.url}${chatgptPath}`, claude: `${server.url}${claudePath}` },
    });
    return { clock, logs, reader, runner, server };
}

async function capacityFrames(server: ServerStandIn) {
    barriers += 1;
    const runId = `run_barrier_${barriers}`;
    server.start({ runId });
    server.start({ runId });
    await server.frame('ack');
    return server.received.filter(
        (frame): frame is Extract<RunnerUpFrame, { type: 'runner-connection-capacity' }> =>
            frame.type === 'runner-connection-capacity'
    );
}

function reads(server: ServerStandIn) {
    return server.requests
        .filter((request) => request.method === 'GET')
        .map((request) => request.path);
}

describe('plan capacity readers', () => {
    test('a Claude plan reads its setup-token windows as 5-hour, Weekly and Weekly Sonnet', async () => {
        const { reader, server } = await capacityRunner([claudePlan]);

        await reader.sweep();

        expect(await capacityFrames(server)).toEqual([
            {
                connectionId: 'mc_claude',
                readAt: '2026-11-19T12:00:00.000Z',
                type: 'runner-connection-capacity',
                windows: [
                    {
                        id: 'current-session',
                        label: '5-hour',
                        resetsAt: '2026-11-19T15:00:00.123Z',
                        usedPercent: 42,
                    },
                    {
                        id: 'current-week-all-models',
                        label: 'Weekly',
                        resetsAt: '2026-11-24T08:00:00.000Z',
                        usedPercent: 81.6,
                    },
                    {
                        id: 'current-week-sonnet',
                        label: 'Weekly Sonnet',
                        resetsAt: null,
                        usedPercent: 12,
                    },
                ],
            },
        ]);
        expect(server.requests).toEqual([
            {
                authorization: 'Bearer sk-ant-oat01-team',
                body: null,
                dispatchId: null,
                method: 'GET',
                path: claudePath,
            },
        ]);
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
        const { logs, reader, server } = await capacityRunner([claudePlan, chatgptPlan(1)], {
            [claudePath]: () => Response.json({ error: 'scope' }, { status: 403 }),
        });

        await reader.sweep();

        expect(await capacityFrames(server)).toEqual([]);
        expect(
            server.received.filter((frame) => frame.type === 'runner-connection-status')
        ).toEqual([]);
        expect(reads(server)).toEqual([claudePath]);
        expect(logs.toSorted()).toEqual([
            'Runner could not read capacity for mc_chatgpt: The access token has expired; the next turn refreshes it.',
            'Runner could not read capacity for mc_claude: Claude session expired. Run `claude` to log in again.',
        ]);
    });
});

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
});
