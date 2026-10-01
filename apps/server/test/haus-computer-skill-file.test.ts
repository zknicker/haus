import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    computerBootstrapProtocolVersion,
    computerProtocolVersion,
    hostSkillFileRequestSchema,
} from '@haus/api';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let member: HausClient;
let serverId: string;
let socket: WebSocket;

const computerId = 'cmp_hostskill0000000';
const credential = 'hostskillfile-computer-credential-00000000';

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await signIn('clerk_hostskillfile_owner');
    member = await signIn('clerk_hostskillfile_member');
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Host Skill HQ',
            slug: 'hostskillfile-hq',
        })
    ).id;
    await member.trpc.server.create.mutate({
        displayName: 'Member Root',
        slug: 'hostskillfile-member-root',
    });
    const memberRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_hostskillfile_member'
    `) as { id: string }[];
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role)
        values ('mem_hostskillfile000000000', ${serverId}, ${memberRows[0]?.id}, 'member')
    `;
    const ownerRows = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_hostskillfile_owner'
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
    expect(await message(socket)).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });
});

afterAll(async () => {
    socket?.close();
    owner?.close();
    member?.close();
    await harness?.close();
});

async function signIn(clerkUserId: string) {
    return createHausClient(harness, await harness.clerk.mintSessionToken(clerkUserId));
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

test('reads a host skill live from the Computer for Owners and Admins only', async () => {
    const sourceId = 'hsk_releasechecks000';
    const read = owner.trpc.computer.skillFile.query({ computerId, serverId, sourceId });
    const request = hostSkillFileRequestSchema.parse(await message(socket));
    expect(request.sourceId).toBe(sourceId);
    socket.send(
        JSON.stringify({
            content: '# Release checks\n',
            requestId: request.requestId,
            status: 'read',
            type: 'host-skill-file-result',
        })
    );
    expect(await read).toEqual({ content: '# Release checks\n' });

    const missing = owner.trpc.computer.skillFile.query({ computerId, serverId, sourceId });
    const retry = hostSkillFileRequestSchema.parse(await message(socket));
    socket.send(
        JSON.stringify({
            error: 'not-found',
            requestId: retry.requestId,
            status: 'failed',
            type: 'host-skill-file-result',
        })
    );
    await expect(missing).rejects.toThrow(/no longer available/i);

    await expect(
        member.trpc.computer.skillFile.query({ computerId, serverId, sourceId })
    ).rejects.toThrow(/Owner or Admin/i);
    await expect(
        owner.trpc.computer.skillFile.query({
            computerId: 'cmp_notattached00000',
            serverId,
            sourceId,
        })
    ).rejects.toThrow('not attached');
});

test('reports an offline Computer as unavailable', async () => {
    socket.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(
        owner.trpc.computer.skillFile.query({
            computerId,
            serverId,
            sourceId: 'hsk_releasechecks000',
        })
    ).rejects.toThrow(/offline/i);
});
