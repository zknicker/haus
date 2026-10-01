import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
const userId = 'usr_bootstrap0000000';
const serverId = 'srv_bootstrap0000000';
const computerId = 'cmp_bootstrap0000000';
const oldComputerId = 'cmp_oldbootstrap0000';
const usageComputerId = 'cmp_usagebootstrap00';
const idleComputerId = 'cmp_idlebootstrap000';
const credential = 'computer-bootstrap-credential-00000000';
const oldCredential = 'old-computer-bootstrap-credential-000';
const usageCredential = 'usage-computer-bootstrap-credential-0';
const idleCredential = 'idle-computer-bootstrap-credential-00';

beforeAll(async () => {
    harness = await startHausServerHarness();
    await harness.sql`
        insert into users (id, clerk_user_id)
        values (${userId}, 'clerk_bootstrap_user')
    `;
    await harness.sql`
        insert into servers (id, slug, display_name)
        values (${serverId}, 'bootstrap-test', 'Bootstrap Test')
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_bootstrap0000000', ${serverId}, ${userId}, 'owner')
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values
            (${computerId}, ${serverId}, ${userId}, ${digest(credential)}),
            (${oldComputerId}, ${serverId}, ${userId}, ${digest(oldCredential)}),
            (${usageComputerId}, ${serverId}, ${userId}, ${digest(usageCredential)}),
            (${idleComputerId}, ${serverId}, ${userId}, ${digest(idleCredential)})
    `;
});

afterAll(async () => {
    await harness?.close();
});

test('credential validation identifies an attachment removed from its Server', async () => {
    const response = await fetch(new URL('/computer/validate', harness.url), {
        body: JSON.stringify({
            credentialHash: digest('unlinked-computer-credential'),
            serverId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
        code: 'computer_machine_unlinked',
        error: 'Computer credential was rejected. Open the App to manage this attachment.',
    });
});

test('preceding Computer protocol remains connected only for update progress', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '0.9.0',
            protocolVersion: computerProtocolVersion - 1,
            type: 'bootstrap',
            update: {
                activeAgentCount: null,
                detail: null,
                downloadedBytes: null,
                failedPhase: null,
                phase: 'idle',
                targetVersion: null,
                totalBytes: null,
                updatedAt: '2026-07-27T12:00:00.000Z',
            },
        })
    );

    expect(await message(socket)).toEqual({
        mode: 'update-required',
        type: 'bootstrap-accepted',
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.send(
        JSON.stringify({
            type: 'update-progress',
            update: {
                activeAgentCount: 2,
                detail: 'Waiting for active Agents to finish.',
                downloadedBytes: null,
                failedPhase: null,
                phase: 'waiting-for-agents',
                targetVersion: '1.1.0',
                totalBytes: null,
                updatedAt: '2026-07-27T12:01:00.000Z',
            },
        })
    );
    await eventually(async () => {
        const rows = (await harness.sql`
            select health, update_phase, update_target_version
            from computers where id = ${computerId}
        `) as { health: string; update_phase: string; update_target_version: string }[];
        expect(rows[0]).toEqual({
            health: 'update-required',
            update_phase: 'waiting-for-agents',
            update_target_version: '1.1.0',
        });
    });
    socket.close();
});

test('a Computer without stable bootstrap fails closed', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            credential: oldCredential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '0.8.0',
            protocolVersion: 1,
            type: 'hello',
        })
    );
    expect(await closed(socket)).toBe(4403);
});

test('a compatible Computer reports its name through versioned inventory', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.1.5',
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: '2026-07-29T20:00:00.000Z',
            },
        })
    );
    expect(await message(socket)).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });
    socket.send(JSON.stringify({ type: 'heartbeat-negotiate' }));
    expect(await message(socket)).toEqual({
        intervalMs: 30_000,
        timeoutMs: 60_000,
        type: 'heartbeat-configuration',
    });
    socket.send(JSON.stringify({ id: 0, type: 'heartbeat' }));
    expect(await message(socket)).toEqual({ id: 0, type: 'heartbeat-ack' });
    socket.send(
        JSON.stringify({
            events: [
                {
                    command: 'restart',
                    id: 'cse_1234567890123456',
                    occurredAt: '2026-08-28T12:00:00.000Z',
                    type: 'management-command',
                },
            ],
            type: 'system-event-report',
        })
    );
    socket.send(
        JSON.stringify({
            events: [
                {
                    command: 'restart',
                    id: 'cse_1234567890123456',
                    occurredAt: '2026-08-28T12:00:00.000Z',
                    type: 'management-command',
                },
            ],
            type: 'system-event-report',
        })
    );
    socket.send(
        JSON.stringify({
            agents: [],
            inventory: {
                name: "Zach's MacBook Pro",
                runtimes: [],
            },
            type: 'report',
        })
    );

    await eventually(async () => {
        const [row] = (await harness.sql`
            select reported_inventory ->> 'name' as name
            from computers where id = ${computerId}
        `) as { name: string | null }[];
        expect(row.name).toBe("Zach's MacBook Pro");
        const [event] = (await harness.sql`
            select command, event_type, count(*) over ()::int as event_count
            from computer_system_events
            where id = 'cse_1234567890123456'
        `) as { command: string; event_count: number; event_type: string }[];
        expect(event).toEqual({
            command: 'restart',
            event_count: 1,
            event_type: 'management-command',
        });
    });
    socket.close();
});

test('a compatible Computer report becomes the durable Server usage snapshot', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential: usageCredential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.1.0',
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: '2026-07-28T20:00:00.000Z',
            },
        })
    );
    expect(await message(socket)).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });

    socket.send(
        JSON.stringify({
            type: 'usage-report',
            usage: {
                capturedAt: '2026-07-28T20:00:00.000Z',
                claude: {
                    error: { code: 'auth', message: 'Not signed in', name: 'UsageError' },
                    provider: 'claude',
                    status: 'error',
                },
                codex: {
                    error: { code: 'auth', message: 'Not signed in', name: 'UsageError' },
                    provider: 'codex',
                    status: 'error',
                },
                connectedProviders: [],
                grok: {
                    error: { code: 'auth', message: 'Not signed in', name: 'UsageError' },
                    provider: 'grok',
                    status: 'error',
                },
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
        })
    );

    await eventually(async () => {
        const [row] = (await harness.sql`
            select usage_snapshot, usage_reported_at
            from computers where id = ${usageComputerId}
        `) as {
            usage_reported_at: Date | null;
            usage_snapshot: Record<string, unknown> | null;
        }[];
        expect(row.usage_snapshot).toMatchObject({
            capturedAt: '2026-07-28T20:00:00.000Z',
        });
        expect(row.usage_reported_at).toBeInstanceOf(Date);
    });
    socket.close();
});

test('idle progress does not erase Server-owned update state', async () => {
    const socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential: idleCredential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.1.1',
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: '2026-07-29T16:00:00.000Z',
            },
        })
    );
    expect(await message(socket)).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });
    await harness.sql`
        update computers
        set update_phase = 'available',
            update_target_version = '1.1.2',
            update_detail = 'Haus Computer 1.1.2 is available.'
        where id = ${idleComputerId}
    `;

    socket.send(
        JSON.stringify({
            type: 'update-progress',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: '2026-07-29T16:00:01.000Z',
            },
        })
    );
    await Bun.sleep(50);

    const [row] = (await harness.sql`
        select update_detail, update_phase, update_target_version
        from computers where id = ${idleComputerId}
    `) as {
        update_detail: string;
        update_phase: string;
        update_target_version: string;
    }[];
    expect(row).toEqual({
        update_detail: 'Haus Computer 1.1.2 is available.',
        update_phase: 'available',
        update_target_version: '1.1.2',
    });
    socket.close();
});

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

function closed(socket: WebSocket) {
    return new Promise<number>((resolve) => {
        socket.addEventListener('close', (event) => resolve(event.code), { once: true });
    });
}

async function eventually(assertion: () => Promise<void>) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            await assertion();
            return;
        } catch {
            await Bun.sleep(10);
        }
    }
    await assertion();
}
