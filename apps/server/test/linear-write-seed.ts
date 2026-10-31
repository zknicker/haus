import { randomBytes } from 'node:crypto';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    computersTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
    serverMembershipsTable,
    serversTable,
    usersTable,
} from '../src/postgres/schema.ts';

export interface LinearWriteSeed {
    agentId: string;
    serverId: string;
    userId: string;
    workspaceId: string;
}

/** A Server with one Agent and one active Linear workspace, written straight to PostgreSQL. */
export async function seedLinearWorkspace(db: HausDatabase): Promise<LinearWriteSeed> {
    const userId = createOpaqueId('usr');
    const serverId = createOpaqueId('srv');
    const computerId = createOpaqueId('cmp');
    const agentId = createOpaqueId('agt');
    const connectionId = createOpaqueId('mcp');
    const workspaceId = createOpaqueId('lnw');
    await db.insert(usersTable).values({ authSubject: createOpaqueId('clk'), id: userId });
    await db
        .insert(serversTable)
        .values({ displayName: 'Linear', id: serverId, slug: createOpaqueId('slug') });
    await db.insert(serverMembershipsTable).values({
        handle: `owner-${randomBytes(4).toString('hex')}`,
        id: createOpaqueId('mem'),
        role: 'owner',
        serverId,
        userId,
    });
    await db.insert(computersTable).values({
        attachedByUserId: userId,
        credentialHash: randomBytes(32).toString('hex'),
        id: computerId,
        serverId,
    });
    await db.insert(agentsTable).values({
        computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName: 'Juniper',
        handle: `juniper-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        serverId,
    });
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
    await db.insert(linearWorkspacesTable).values({
        appUserId: 'app-user-haus',
        boundByUserId: userId,
        connectionId,
        id: workspaceId,
        name: 'Haus',
        organizationId: `org-${randomBytes(6).toString('hex')}`,
        serverId,
        status: 'active',
        urlKey: 'haus-chat',
    });
    return { agentId, serverId, userId, workspaceId };
}
