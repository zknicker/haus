import { randomBytes } from 'node:crypto';
import { makeTestRuntime } from '@haus/effect';
import { eq } from 'drizzle-orm';
import type { LinearDeliveryRow } from '../src/linear/delivery-handler.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentInboxTable,
    agentMcpConnectionGrantsTable,
    agentsTable,
    computersTable,
    linearAgentLabelsTable,
    linearCredentialsTable,
    linearIdentitiesTable,
    linearIdentitySecretsTable,
    linearOutboxTable,
    linearTeamAccessTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';

// One Server bound to one Linear workspace, written straight to PostgreSQL:
// a binder (Owner), a second Owner, two granted Agents (Juniper, Beacon), the
// workspace credential with team DES, and Agent labels already created.

export const linearTestRuntime = makeTestRuntime();
export const desTeamId = 'team-des';

export interface LinearSessionWorld {
    agents: { beacon: string; juniper: string };
    binderUserId: string;
    connectionId: string;
    credentialId: string;
    labels: { beacon: string; juniper: string };
    organizationId: string;
    ownerUserId: string;
    serverId: string;
    workspaceAppUserId: string;
    workspaceId: string;
}

export async function seedLinearSessionWorld(db: HausDatabase): Promise<LinearSessionWorld> {
    const serverId = createOpaqueId('srv');
    const binderUserId = await user(db);
    const ownerUserId = await user(db);
    await db
        .insert(serversTable)
        .values({ displayName: 'Linear', id: serverId, slug: `linear-${hex(4)}` });
    // The second Owner joined first, so a binder fallback picks them deterministically.
    await membership(db, serverId, ownerUserId, new Date('2026-01-01T00:00:00Z'));
    await membership(db, serverId, binderUserId, new Date('2026-02-01T00:00:00Z'));
    const computerId = createOpaqueId('cmp');
    await db.insert(computersTable).values({
        attachedByUserId: binderUserId,
        credentialHash: hex(32),
        id: computerId,
        serverId,
    });
    const juniper = await agent(db, serverId, computerId, 'Juniper', `juniper${hex(3)}`);
    const beacon = await agent(db, serverId, computerId, 'Beacon', `beacon${hex(3)}`);
    const connectionId = createOpaqueId('mcp');
    await db.insert(mcpConnectionsTable).values({
        auth: 'none',
        connected: true,
        headerNames: [],
        id: connectionId,
        name: 'Haus',
        preset: 'linear',
        serverId,
        tools: [],
        url: 'https://hosted-mcp.haus.invalid/linear/mcp',
    });
    for (const agentId of [juniper.id, beacon.id]) {
        await db.insert(agentMcpConnectionGrantsTable).values({ agentId, connectionId, serverId });
    }
    const workspaceId = createOpaqueId('lnw');
    const organizationId = `org-${hex(6)}`;
    const workspaceAppUserId = `app-user-${hex(4)}`;
    await db.insert(linearWorkspacesTable).values({
        appUserId: workspaceAppUserId,
        boundByUserId: binderUserId,
        connectionId,
        id: workspaceId,
        name: 'Haus',
        organizationId,
        serverId,
        status: 'active',
        urlKey: `haus-${hex(3)}`,
    });
    const credentialId = await credential(db, { serverId, workspaceId });
    const labels = {
        beacon: await activeLabel(db, { agentId: beacon.id, serverId, workspaceId }),
        juniper: await activeLabel(db, { agentId: juniper.id, serverId, workspaceId }),
    };
    return {
        agents: { beacon: beacon.id, juniper: juniper.id },
        binderUserId,
        connectionId,
        credentialId,
        labels,
        organizationId,
        ownerUserId,
        serverId,
        workspaceAppUserId,
        workspaceId,
    };
}

/** An installed, `active` identity for one Agent, with its credential on team DES. */
export async function seedLinearIdentity(
    db: HausDatabase,
    world: LinearSessionWorld,
    agentId: string
): Promise<{ appUserId: string; credentialId: string; identityId: string; secret: string }> {
    const identityId = createOpaqueId('lni');
    const appUserId = `identity-user-${hex(4)}`;
    const secret = `identity-secret-${hex(8)}`;
    await db.insert(linearIdentitiesTable).values({
        agentId,
        appUserId,
        handle: `handle-${hex(3)}`,
        id: identityId,
        oauthClientId: `client-${hex(6)}`,
        organizationId: world.organizationId,
        serverId: world.serverId,
        status: 'active',
        workspaceId: world.workspaceId,
    });
    await db
        .insert(linearIdentitySecretsTable)
        .values({ identityId, serverId: world.serverId, webhookSecret: secret });
    const credentialId = await credential(db, {
        identityId,
        serverId: world.serverId,
        workspaceId: world.workspaceId,
    });
    return { appUserId, credentialId, identityId, secret };
}

/** A claimed delivery row as the worker hands it to a handler. */
export function deliveryRow(
    world: LinearSessionWorld,
    input: { body: Record<string, unknown>; event: string; receiver?: string; at?: Date }
): LinearDeliveryRow {
    const at = input.at ?? new Date();
    return {
        action: typeof input.body.action === 'string' ? input.body.action : null,
        attempts: 0,
        body: input.body,
        deferredSince: null,
        deliveryId: crypto.randomUUID(),
        event: input.event,
        id: createOpaqueId('lnd'),
        receivedAt: at,
        receiver: input.receiver ?? 'app',
        serverId: world.serverId,
        webhookTimestamp: at,
        workspaceId: world.workspaceId,
    };
}

export async function outboxRows(db: HausDatabase, workspaceId: string) {
    return await db
        .select()
        .from(linearOutboxTable)
        .where(eq(linearOutboxTable.workspaceId, workspaceId))
        .orderBy(linearOutboxTable.createdAt);
}

export async function inboxRows(db: HausDatabase, serverId: string) {
    return await db.select().from(agentInboxTable).where(eq(agentInboxTable.serverId, serverId));
}

async function user(db: HausDatabase): Promise<string> {
    const id = createOpaqueId('usr');
    await db.insert(usersTable).values({ authSubject: createOpaqueId('clk'), id });
    return id;
}

async function membership(db: HausDatabase, serverId: string, userId: string, joinedAt: Date) {
    await db.insert(serverMembershipsTable).values({
        handle: `owner-${hex(4)}`,
        id: createOpaqueId('mem'),
        joinedAt,
        role: 'owner',
        serverId,
        userId,
    });
}

async function agent(
    db: HausDatabase,
    serverId: string,
    computerId: string,
    displayName: string,
    handle: string
) {
    const id = createOpaqueId('agt');
    await db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName,
        handle,
        homeTimezone: 'UTC',
        id,
        serverId,
    });
    return { handle, id };
}

async function credential(
    db: HausDatabase,
    input: { identityId?: string; serverId: string; workspaceId: string }
): Promise<string> {
    const id = createOpaqueId('lna');
    const now = new Date();
    await db.insert(linearCredentialsTable).values({
        accessExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        accessToken: `access-${hex(6)}`,
        id,
        identityId: input.identityId ?? null,
        refreshToken: `refresh-${hex(6)}`,
        scopes: ['read', 'write'],
        serverId: input.serverId,
        state: 'valid',
        workspaceId: input.workspaceId,
    });
    await db.insert(linearTeamAccessTable).values({
        credentialId: id,
        serverId: input.serverId,
        syncedAt: now,
        teamId: desTeamId,
        teamKey: 'DES',
        teamName: 'Design',
    });
    return id;
}

async function activeLabel(
    db: HausDatabase,
    input: { agentId: string; serverId: string; workspaceId: string }
): Promise<string> {
    const labelId = `label-${hex(6)}`;
    await db.insert(linearAgentLabelsTable).values({
        agentId: input.agentId,
        id: createOpaqueId('lnb'),
        labelId,
        serverId: input.serverId,
        state: 'active',
        teamId: desTeamId,
        workspaceId: input.workspaceId,
    });
    return labelId;
}

function hex(bytes: number): string {
    return randomBytes(bytes).toString('hex');
}
