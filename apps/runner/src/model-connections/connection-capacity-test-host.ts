import type { RunnerModelConnection, RunnerUpFrame } from '@haus/api';
import {
    attachRunner,
    type ServerStandIn,
    type StandInRoutes,
    serverStandIn,
} from '../runner-test-server.ts';
import { createCapacityReader } from './connection-capacity.ts';

export const farFuture = 4_102_444_800_000;
export const minute = 60 * 1000;
export const claudePath = '/api/oauth/usage';
export const chatgptPath = '/backend-api/wham/usage';
let barriers = 0;

export const claudePlan: RunnerModelConnection = {
    credential: { kind: 'setup-token', token: 'sk-ant-oat01-team' },
    credentialVersion: 1,
    id: 'mc_claude',
    label: 'Team plan',
    provider: 'claude',
    serverId: 'srv_1',
    webSearch: false,
};

export function chatgptPlan(expires = farFuture, credentialVersion = 1) {
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

export const keys: RunnerModelConnection[] = [
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

export const chatgptUsage = {
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

export async function capacityRunner(
    connections: RunnerModelConnection[],
    routes: StandInRoutes = {
        [chatgptPath]: () => Response.json(chatgptUsage),
        [claudePath]: () => Response.json({ five_hour: { utilization: 1 } }),
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
        usageUrls: { chatgpt: `${server.url}${chatgptPath}` },
    });
    return { clock, logs, reader, runner, server };
}

export async function capacityFrames(server: ServerStandIn) {
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

export function reads(server: ServerStandIn) {
    return server.requests
        .filter((request) => request.method === 'GET')
        .map((request) => request.path);
}
