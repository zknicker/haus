import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { openSilentComputerSocket } from './raw-computer-socket.ts';

let harness: HausServerHarness;
const userId = 'usr_liveness00000000';
const serverId = 'srv_liveness00000000';
const silentComputerId = 'cmp_silentliveness00';
const quietComputerId = 'cmp_quietliveness000';
const closingComputerId = 'cmp_closingliveness0';
const silentCredential = 'silent-computer-liveness-credential-0';
const quietCredential = 'quiet-computer-liveness-credential-00';
const closingCredential = 'closing-computer-liveness-credential';
const liveness = { intervalMs: 50, probeTimeoutMs: 3000, timeoutMs: 250 };

beforeAll(async () => {
    harness = await startHausServerHarness({ computerSocketLiveness: liveness });
    await harness.sql`
        insert into users (id, clerk_user_id) values (${userId}, 'clerk_liveness_user')
    `;
    await harness.sql`
        insert into servers (id, slug, display_name)
        values (${serverId}, 'liveness-test', 'Liveness Test')
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_liveness00000000', ${serverId}, ${userId}, 'owner')
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values
            (${silentComputerId}, ${serverId}, ${userId}, ${digest(silentCredential)}),
            (${quietComputerId}, ${serverId}, ${userId}, ${digest(quietCredential)}),
            (${closingComputerId}, ${serverId}, ${userId}, ${digest(closingCredential)})
    `;
});

afterAll(async () => {
    await harness?.close();
});

test('a silently vanished Computer that never negotiated a heartbeat is reaped offline', async () => {
    const silent = await openSilentComputerSocket(computerSocketUrl());
    // An older protocol never speaks the app-level heartbeat.
    silent.send(bootstrap(silentCredential, computerProtocolVersion - 1));
    await eventually(async () => {
        expect(await health(silentComputerId)).toBe('update-required');
    });

    await silent.ended;
    await eventually(async () => {
        expect(await health(silentComputerId)).toBe('offline');
        const events = (await harness.sql`
            select reason from computer_system_events
            where computer_id = ${silentComputerId} and event_type = 'disconnected'
        `) as { reason: string }[];
        expect(events.map((event) => event.reason)).toEqual(['heartbeat-timeout']);
    });
});

test('a live Computer that never negotiates a heartbeat stays attached', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(bootstrap(quietCredential, computerProtocolVersion));
    expect(await message(socket)).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });

    await Bun.sleep(liveness.timeoutMs * 3);

    expect(socket.readyState).toBe(WebSocket.OPEN);
    expect(await health(quietComputerId)).toBe('healthy');
    socket.close();
    await eventually(async () => {
        expect(await health(quietComputerId)).toBe('offline');
    });
});

test('a socket closed mid-handshake never stays healthy or blocks reconnection', async () => {
    const closing = await openSilentComputerSocket(computerSocketUrl());
    closing.closeAfter(bootstrap(closingCredential, computerProtocolVersion));
    await closing.ended;
    // Let the queued bootstrap finish every await it would have taken.
    await Bun.sleep(300);
    expect(await health(closingComputerId)).toBe('offline');

    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(bootstrap(closingCredential, computerProtocolVersion));
    expect(await message(socket)).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
    expect(await health(closingComputerId)).toBe('healthy');
    socket.close();
    await eventually(async () => {
        expect(await health(closingComputerId)).toBe('offline');
    });
});

function bootstrap(credential: string, protocolVersion: number) {
    return JSON.stringify({
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '1.0.0',
        protocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-10-01T12:00:00.000Z',
        },
    });
}

async function health(computerId: string) {
    const [row] = (await harness.sql`
        select health from computers where id = ${computerId}
    `) as { health: string }[];
    return row?.health;
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}

function opened(socket: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
}

function message(socket: WebSocket) {
    return new Promise<unknown>((resolve) => {
        socket.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}

async function eventually(assertion: () => Promise<void>) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
            await assertion();
            return;
        } catch {
            await Bun.sleep(10);
        }
    }
    await assertion();
}
