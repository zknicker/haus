import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { computerBootstrapProtocolVersion, computerProtocolVersion } from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let socket: WebSocket;

const computerId = 'cmp_cloudagent000000';
const credential = 'cloud-agent-computer-credential-0000';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('clerk_cloud_agent_owner');
    member = await signIn('clerk_cloud_agent_member');
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Cloud Agent HQ',
            slug: 'cloud-agent-hq',
        })
    ).id;
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'cloud-agent-member-root',
    });
    const memberRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_cloud_agent_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_cloudagent000000', ${serverId}, ${memberRows[0]?.id}, 'member')
    `;
    const ownerRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_cloud_agent_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${ownerRows[0]?.id}, ${digest(credential)})
    `;
    socket = new WebSocket(computerSocketUrl());
    await opened(socket);
    socket.send(
        JSON.stringify({
            architecture: 'arm64',
            bootstrapProtocolVersion: computerBootstrapProtocolVersion,
            credential,
            health: 'healthy',
            operatingSystem: 'darwin',
            productVersion: '1.0.0',
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: {
                detail: null,
                phase: 'idle',
                targetVersion: null,
                updatedAt: '2026-07-28T12:00:00.000Z',
            },
        })
    );
    expect(await message(socket)).toEqual({ mode: 'ordinary', type: 'bootstrap-accepted' });
});

afterAll(async () => {
    socket?.close();
    owner?.close();
    member?.close();
    await harness?.close();
});

test('an Owner reads Cloud Agent readiness from the Computer that owns the credential', async () => {
    const computerReply = answerNextCapabilityRequest(socket, 'get', {
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    });
    await expect(
        owner.trpc.cloudAgentProvider.get.query({ computerId, provider: 'cursor', serverId })
    ).resolves.toEqual({
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    });
    await computerReply;
});

test('connecting relays to the Computer and answers with readiness, never a credential', async () => {
    const computerReply = answerNextCapabilityRequest(socket, 'connect', {
        accountEmail: 'delegate@example.com',
        expiresAt: '2026-12-03T21:03:33.000Z',
        provider: 'cursor',
        ready: true,
        reason: null,
    });
    const connected = await owner.trpc.cloudAgentProvider.connect.mutate({
        computerId,
        provider: 'cursor',
        serverId,
    });
    await computerReply;

    expect(connected.ready).toBe(true);
    expect(connected.accountEmail).toBe('delegate@example.com');
    expect(Object.keys(connected).sort()).toEqual([
        'accountEmail',
        'expiresAt',
        'provider',
        'ready',
        'reason',
    ]);
});

test('a Computer failure reaches settings as a message, not a stuck request', async () => {
    const computerReply = answerNextCapabilityRequest(socket, 'connect', null);
    await expect(
        owner.trpc.cloudAgentProvider.connect.mutate({ computerId, provider: 'cursor', serverId })
    ).rejects.toThrow(/login was cancelled/i);
    await computerReply;
});

test('sign-in links and cancellation relay through the authorized Computer capability', async () => {
    const waiting = {
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
        signIn: {
            status: 'waiting',
            url: 'https://cursor.com/loginDeepControl?uuid=test',
            expiresAt: '2026-09-21T18:00:00.000Z',
        },
    };
    const target = { computerId, provider: 'cursor' as const, serverId };
    const started = answerNextCapabilityRequest(socket, 'connect', waiting);
    expect(await owner.trpc.cloudAgentProvider.connect.mutate(target)).toEqual(waiting);
    await started;
    const cancelled = answerNextCapabilityRequest(socket, 'cancel-sign-in', {
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason: 'not-connected',
    });
    expect(
        (await owner.trpc.cloudAgentProvider.cancelSignIn.mutate(target)).signIn
    ).toBeUndefined();
    await cancelled;
    await expect(member.trpc.cloudAgentProvider.cancelSignIn.mutate(target)).rejects.toThrow(
        /Owner or Admin/i
    );
});

test('only an Owner or Admin can connect a Computer to a Cloud Agent provider', async () => {
    await expect(
        member.trpc.cloudAgentProvider.get.query({ computerId, provider: 'cursor', serverId })
    ).rejects.toThrow(/Owner or Admin/i);
    await expect(
        member.trpc.cloudAgentProvider.connect.mutate({ computerId, provider: 'cursor', serverId })
    ).rejects.toThrow(/Owner or Admin/i);
});

async function signIn(clerkUserId: string) {
    return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
}

function answerNextCapabilityRequest(
    connection: WebSocket,
    kind: string,
    result: Record<string, unknown> | null
) {
    return new Promise<void>((resolve) => {
        connection.addEventListener(
            'message',
            (event) => {
                const request = JSON.parse(String(event.data)) as {
                    operation: { kind: string };
                    requestId: string;
                    type: string;
                };
                expect(request.type).toBe('cloud-agent-capability-request');
                expect(request.operation.kind).toBe(kind);
                connection.send(
                    JSON.stringify({
                        ...(result
                            ? { result }
                            : { error: 'The Cursor login was cancelled in the browser.' }),
                        requestId: request.requestId,
                        type: 'cloud-agent-capability-result',
                    })
                );
                resolve();
            },
            { once: true }
        );
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

function opened(connection: WebSocket) {
    return new Promise<void>((resolve, reject) => {
        connection.addEventListener('open', () => resolve(), { once: true });
        connection.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
}

function message(connection: WebSocket) {
    return new Promise<unknown>((resolve) => {
        connection.addEventListener('message', (event) => resolve(JSON.parse(String(event.data))), {
            once: true,
        });
    });
}
