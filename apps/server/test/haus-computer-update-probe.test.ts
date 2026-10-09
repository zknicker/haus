import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { openSilentComputerSocket } from './raw-computer-socket.ts';

const silentUpdateComputerId = 'cmp_probesilentupd00';
const credentials: Record<string, string> = {
    [silentUpdateComputerId]: 'probe-silent-update-credential-00000',
};
// Routine liveness is far slower than the update's probe, so only the probe can reap.
const liveness = { intervalMs: 60_000, probeTimeoutMs: 200, timeoutMs: 120_000 };
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ computerSocketLiveness: liveness });
    owner = createHausClient(harness, await harness.clerk.mintSessionToken('clerk_probe_owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Presence Probe', slug: 'probe' })
    ).id;
    const [user] = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_probe_owner'
    `) as { id: string }[];
    for (const [computerId, credential] of Object.entries(credentials)) {
        await harness.sql`
            insert into computers (id, server_id, attached_by_user_id, credential_hash, product_version)
            values (${computerId}, ${serverId}, ${user?.id}, ${digest(credential)}, '4.2.0')
        `;
    }
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('an update for a silent but still attached Computer is rejected as unreachable', async () => {
    const silent = await openSilentComputerSocket(computerSocketUrl());
    silent.send(bootstrap(silentUpdateComputerId));
    await eventually(async () => {
        expect(await listedHealth(silentUpdateComputerId)).toBe('healthy');
    });

    await expect(
        owner.trpc.computer.update.mutate({ computerId: silentUpdateComputerId, serverId })
    ).rejects.toThrow('Reconnect this Computer');

    await silent.ended;
    const [row] = (await harness.sql`
        select update_phase from computers where id = ${silentUpdateComputerId}
    `) as { update_phase: string }[];
    expect(row?.update_phase).toBe('idle');
});

async function listedHealth(computerId: string) {
    const computers = await owner.trpc.computer.list.query({ serverId });
    return computers.find((computer) => computer.id === computerId)?.health;
}

function bootstrap(computerId: string) {
    return JSON.stringify({
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential: credentials[computerId],
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '4.2.0',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-10-01T12:00:00.000Z',
        },
    });
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
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
