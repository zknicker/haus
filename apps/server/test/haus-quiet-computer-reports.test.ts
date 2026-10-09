import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    computerBootstrapProtocolVersion,
    computerProtocolVersion,
    type ServerUpdatedEvent,
} from '@haus/api';
import { subscribeToServerUpdates } from '../src/haus-api/server-events.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// A Computer re-sends its whole state after every turn and on a timer. Only a
// report that changes what a read shows may wake every viewer's App.
let harness: HausServerHarness;
let socket: WebSocket;
const userId = 'usr_quietreports0000';
const serverId = 'srv_quietreports0000';
const computerId = 'cmp_quietreports0000';
const agentId = 'agt_quietreports0000';
const credential = 'quiet-computer-reports-credential-00';
const announced: ServerUpdatedEvent[] = [];
const stopWatching = new AbortController();

beforeAll(async () => {
    harness = await startHausServerHarness();
    await harness.sql`insert into users (id, clerk_user_id) values (${userId}, 'clerk_quiet_reports')`;
    await harness.sql`
        insert into servers (id, slug, display_name)
        values (${serverId}, 'quiet-reports', 'Quiet Reports')
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_quietreports0000', ${serverId}, ${userId}, 'owner')
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${userId}, ${digest(credential)})
    `;
    await harness.sql`
        insert into agents (
            id, server_id, handle, display_name, home_timezone,
            computer_id, desired_runtime_id, desired_model_id
        )
        values (
            ${agentId}, ${serverId}, 'quiet-scout', 'Scout', 'America/New_York',
            ${computerId}, 'codex', 'gpt-5.6-sol'
        )
    `;
    void (async () => {
        try {
            for await (const event of subscribeToServerUpdates(stopWatching.signal)) {
                if (event.serverId === serverId) {
                    announced.push(event);
                }
            }
        } catch {
            // Aborted at teardown.
        }
    })();
    socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    const accepted = message(socket);
    socket.send(JSON.stringify(bootstrapFrame()));
    expect(await accepted).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
    // The attachment itself is a real presence change.
    await waitForAnnouncements(1);
});

afterAll(async () => {
    stopWatching.abort();
    socket?.close();
    await harness?.close();
});

test('a repeated state report announces nothing; a changed one announces once', async () => {
    const before = announced.length;
    socket.send(JSON.stringify(stateReport('gpt-5.6-sol', 'Studio')));
    await waitForAnnouncements(before + 1);

    // The same inventory and effective state, re-sent after a turn.
    socket.send(JSON.stringify(stateReport('gpt-5.6-sol', 'Studio')));
    socket.send(JSON.stringify(hausAgentReport('1.0.0')));
    await waitForAnnouncements(before + 2);
    socket.send(JSON.stringify(hausAgentReport('1.0.0')));
    // A changed name is the only change below; a no-op above would make this three.
    socket.send(JSON.stringify(stateReport('gpt-5.6-sol', 'Studio Mac')));
    await waitForAnnouncements(before + 3);
    await Bun.sleep(100);
    expect(announced.length).toBe(before + 3);
    expect(announced.slice(before).every((event) => event.scope === 'computer')).toBeTrue();

    const [row] = (await harness.sql`
        select reported_inventory->>'name' as name, effective_model_id
        from computers, agents where computers.id = ${computerId} and agents.id = ${agentId}
    `) as { effective_model_id: string; name: string }[];
    expect(row).toEqual({ effective_model_id: 'gpt-5.6-sol', name: 'Studio Mac' });
});

test('a changed effective model announces even when inventory is unchanged', async () => {
    const before = announced.length;
    socket.send(JSON.stringify(stateReport('gpt-5.6-terra', 'Studio Mac')));
    await waitForAnnouncements(before + 1);
    socket.send(JSON.stringify(stateReport('gpt-5.6-terra', 'Studio Mac')));
    await Bun.sleep(150);
    expect(announced.length).toBe(before + 1);
});

test('a repeated usage snapshot and replayed system events announce nothing', async () => {
    const before = announced.length;
    socket.send(JSON.stringify(usageReport('2026-10-09T12:00:00.000Z')));
    socket.send(JSON.stringify(systemEvents()));
    await waitForAnnouncements(before + 2);

    socket.send(JSON.stringify(usageReport('2026-10-09T12:00:00.000Z')));
    socket.send(JSON.stringify(systemEvents()));
    socket.send(JSON.stringify(usageReport('2026-10-09T12:15:00.000Z')));
    await waitForAnnouncements(before + 3);
    await Bun.sleep(100);
    expect(announced.length).toBe(before + 3);
});

function stateReport(modelId: string, name: string) {
    return {
        agents: [{ agentId, missingResources: [], modelId, runtimeId: 'codex' }],
        inventory: {
            name,
            runtimes: [
                {
                    id: 'codex',
                    label: 'Codex',
                    models: [
                        { id: 'gpt-5.6-sol', label: 'Sol' },
                        { id: 'gpt-5.6-terra', label: 'Terra' },
                    ],
                },
            ],
        },
        type: 'report',
    };
}

function hausAgentReport(version: string) {
    return {
        agents: [{ agentId, appliedAt: '2026-10-09T12:00:00.000Z', status: 'current', version }],
        type: 'haus-agent-report',
    };
}

function usageReport(capturedAt: string) {
    const signedOut = (provider: string) => ({
        error: { code: 'auth', message: 'Not signed in', name: 'UsageError' },
        provider,
        status: 'error',
    });
    return {
        type: 'usage-report',
        usage: {
            capturedAt,
            claude: signedOut('claude'),
            codex: signedOut('codex'),
            connectedProviders: [],
            grok: signedOut('grok'),
            openRouter: {
                error: null,
                overview: {
                    days: 30,
                    keys: [],
                    message: 'Not configured',
                    note: null,
                    series: [],
                    status: 'unconfigured',
                    totalByokUsageUsd: 0,
                    totalRequests: 0,
                    totalUsageUsd: 0,
                },
                status: 'ok',
            },
        },
    };
}

function systemEvents() {
    return {
        events: [
            {
                command: 'restart',
                id: 'cse_quietreports0001',
                occurredAt: '2026-10-09T12:00:00.000Z',
                type: 'management-command',
            },
        ],
        type: 'system-event-report',
    };
}

function bootstrapFrame() {
    return {
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '9.4.0',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-10-09T12:00:00.000Z',
        },
    };
}

async function waitForAnnouncements(count: number) {
    for (let attempt = 0; attempt < 300 && announced.length < count; attempt += 1) {
        await Bun.sleep(10);
    }
    expect(announced.length).toBe(count);
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}

function opened(target: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        target.addEventListener('open', () => resolve(), { once: true });
        target.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
}

function message(target: WebSocket) {
    return new Promise<unknown>((resolve) => {
        target.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}
