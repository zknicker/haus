import { randomBytes } from 'node:crypto';
import type { LinearTeam } from '@haus/api';
import { eq } from 'drizzle-orm';
import { linearHostedUrl } from '../src/hosted-mcp/catalog.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    linearCredentialsTable,
    linearIdentitiesTable,
    linearTeamAccessTable,
    linearWorkspacesTable,
    mcpConnectionsTable,
} from '../src/postgres/schema.ts';
import type { Seed } from './agent-inbox-harness.ts';
import { fakeTeamJoin, fakeTeamsPage } from './linear-fake-teams.ts';

// A fake Linear (OAuth token, revoke, and GraphQL endpoints) and seeds for a
// bound workspace, so binding, refresh, and transport tests run against real
// PostgreSQL with no network.

export interface FakeActor {
    appUserId: string;
    displayName: string;
    /** Teams the app user may add itself to (`viewerCanJoin`). */
    joinableTeamIds?: string[];
    /** Teams the app user is a member of (`viewerMembership`); a join adds to it. */
    memberTeamIds?: string[];
    organization: { id: string; name: string; urlKey: string };
    teams: LinearTeam[];
}

export interface FakeLinear {
    /** Issued authorization codes: code → the actor the install creates. */
    codes: Map<string, FakeActor>;
    /** Entity id → its team ids, for target-team reads. */
    entityTeams: Map<string, string[]>;
    fetch: typeof fetch;
    /** Team ids whose `teamMembershipCreate` Linear refuses. */
    joinFailures: Set<string>;
    /** Every `teamMembershipCreate`: who asked (the token's app user) and its input. */
    joins: { actorAppUserId: string; teamId: string; userId: string }[];
    refreshCalls: number;
    /** Refresh-call gates: the n-th refresh (0-based) waits for its promise. */
    refreshGates: Map<number, Promise<void>>;
    /** Valid refresh tokens → actor; rotation deletes the old one. */
    refreshTokens: Map<string, FakeActor>;
    revoked: string[];
    /** Valid access tokens → actor. */
    tokens: Map<string, FakeActor>;
}

export function createFakeLinear(): FakeLinear {
    let sequence = 0;
    const fake: FakeLinear = {
        codes: new Map(),
        entityTeams: new Map(),
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith('/oauth/token')) {
                return await token(new URLSearchParams(String(init?.body)));
            }
            if (url.endsWith('/oauth/revoke')) {
                fake.revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? '');
                return Response.json({});
            }
            return graphql(init);
        }) as typeof fetch,
        joinFailures: new Set(),
        joins: [],
        refreshCalls: 0,
        refreshGates: new Map(),
        refreshTokens: new Map(),
        revoked: [],
        tokens: new Map(),
    };
    const issue = (actor: FakeActor) => {
        sequence += 1;
        const pair = {
            access: `lin_acc_${sequence}_${randomBytes(4).toString('hex')}`,
            refresh: `lin_ref_${sequence}`,
        };
        fake.tokens.set(pair.access, actor);
        fake.refreshTokens.set(pair.refresh, actor);
        return Response.json({
            access_token: pair.access,
            expires_in: 86_400,
            refresh_token: pair.refresh,
            scope: 'read write app:assignable app:mentionable',
            token_type: 'Bearer',
        });
    };
    const token = async (form: URLSearchParams) => {
        if (form.get('grant_type') === 'authorization_code') {
            const actor = fake.codes.get(form.get('code') ?? '');
            return actor && form.get('code_verifier')
                ? issue(actor)
                : Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        const call = fake.refreshCalls;
        fake.refreshCalls += 1;
        await fake.refreshGates.get(call);
        const refresh = form.get('refresh_token') ?? '';
        const actor = fake.refreshTokens.get(refresh);
        if (!actor) {
            return Response.json({ error: 'invalid_grant' }, { status: 400 });
        }
        fake.refreshTokens.delete(refresh);
        return issue(actor);
    };
    const graphql = (init?: RequestInit) => {
        const authorization = new Headers(init?.headers).get('authorization') ?? '';
        const actor = fake.tokens.get(authorization.replace(/^Bearer /u, ''));
        if (!actor) {
            return new Response('unauthorized', { status: 401 });
        }
        const body = JSON.parse(String(init?.body)) as {
            query: string;
            variables?: {
                after?: string | null;
                first?: number;
                id?: string;
                input?: { teamId: string; userId: string };
            };
        };
        if (body.query.includes('HausJoinTeam')) {
            return fakeTeamJoin(fake, actor, body.variables?.input ?? { teamId: '', userId: '' });
        }
        if (body.query.includes('HausInstall')) {
            return Response.json({
                data: {
                    organization: actor.organization,
                    viewer: { displayName: actor.displayName, id: actor.appUserId },
                },
            });
        }
        if (body.query.includes('HausTeams')) {
            return Response.json({ data: { teams: fakeTeamsPage(actor, body.variables) } });
        }
        const teamIds = fake.entityTeams.get(body.variables?.id ?? '');
        const entity = teamIds
            ? body.query.includes('HausProjectTeams')
                ? { teams: { nodes: teamIds.map((id) => ({ id })) } }
                : { team: teamIds[0] ? { id: teamIds[0] } : null }
            : null;
        return Response.json({ data: { entity } });
    };
    return fake;
}

export const teamDesign: LinearTeam = { id: 'team-design', key: 'DES', name: 'Design' };
export const teamOps: LinearTeam = { id: 'team-ops', key: 'OPS', name: 'Ops' };
export const acme = { id: 'org-acme', name: 'Acme', urlKey: 'acme' };

/** A bound, active workspace with a valid workspace credential and its teams. */
export async function seedWorkspace(
    db: HausDatabase,
    seed: Seed,
    input: {
        accessToken: string;
        expiresAt?: Date;
        memberTeamIds?: string[];
        refreshToken?: string;
        teams: LinearTeam[];
    }
) {
    const connectionId = createOpaqueId('mcp');
    const workspaceId = createOpaqueId('lnw');
    const credentialId = createOpaqueId('lna');
    await db.insert(mcpConnectionsTable).values({
        accountLabel: 'acme',
        auth: 'none',
        connected: true,
        headerNames: [],
        id: connectionId,
        name: 'Linear',
        preset: 'linear',
        serverId: seed.serverId,
        tools: [],
        url: linearHostedUrl,
    });
    await db.insert(linearWorkspacesTable).values({
        appUserId: 'haus-app-user',
        boundByUserId: seed.userId,
        connectionId,
        id: workspaceId,
        name: 'Acme',
        organizationId: `org-${randomBytes(4).toString('hex')}`,
        serverId: seed.serverId,
        status: 'active',
        urlKey: 'acme',
    });
    await insertCredential(db, seed.serverId, {
        ...input,
        credentialId,
        identityId: null,
        workspaceId,
    });
    await grant(db, seed.serverId, seed.agentId, connectionId);
    return { connectionId, credentialId, workspaceId };
}

/** An `active` identity for one Agent with its own credential and teams. */
export async function seedIdentity(
    db: HausDatabase,
    serverId: string,
    input: {
        accessToken: string;
        agentId: string;
        appUserId: string;
        memberTeamIds?: string[];
        teams: LinearTeam[];
        workspaceId: string;
    }
) {
    const identityId = createOpaqueId('lni');
    const [workspace] = await db
        .select()
        .from(linearWorkspacesTable)
        .where(eq(linearWorkspacesTable.id, input.workspaceId));
    await db.insert(linearIdentitiesTable).values({
        agentId: input.agentId,
        appUserId: input.appUserId,
        handle: input.appUserId,
        id: identityId,
        oauthClientId: `client-${identityId}`,
        organizationId: workspace?.organizationId ?? '',
        serverId,
        status: 'active',
        workspaceId: input.workspaceId,
    });
    const credentialId = createOpaqueId('lna');
    await insertCredential(db, serverId, { ...input, credentialId, identityId });
    return { credentialId, identityId };
}

export async function addAgent(db: HausDatabase, seed: Seed, displayName: string) {
    const agentId = createOpaqueId('agt');
    await db.insert(agentsTable).values({
        computerId: seed.computerId,
        desiredModelId: 'fake-model',
        desiredRuntimeId: 'fake',
        displayName,
        handle: `${displayName.toLowerCase()}-${randomBytes(4).toString('hex')}`,
        homeTimezone: 'UTC',
        id: agentId,
        serverId: seed.serverId,
    });
    return agentId;
}

export async function grant(
    db: HausDatabase,
    serverId: string,
    agentId: string,
    connectionId: string
) {
    await db.insert(agentMcpConnectionGrantsTable).values({ agentId, connectionId, serverId });
}

async function insertCredential(
    db: HausDatabase,
    serverId: string,
    input: {
        accessToken: string;
        credentialId: string;
        expiresAt?: Date;
        identityId: string | null;
        memberTeamIds?: string[];
        refreshToken?: string;
        teams: LinearTeam[];
        workspaceId: string;
    }
) {
    await db.insert(linearCredentialsTable).values({
        accessExpiresAt: input.expiresAt ?? new Date(Date.now() + 86_400_000),
        accessToken: input.accessToken,
        id: input.credentialId,
        identityId: input.identityId,
        refreshToken: input.refreshToken ?? `refresh-${input.credentialId}`,
        scopes: ['read', 'write'],
        serverId,
        state: 'valid',
        workspaceId: input.workspaceId,
    });
    for (const team of input.teams) {
        await db.insert(linearTeamAccessTable).values({
            credentialId: input.credentialId,
            member: input.memberTeamIds?.includes(team.id) ?? false,
            serverId,
            syncedAt: new Date(),
            teamId: team.id,
            teamKey: team.key,
            teamName: team.name,
        });
    }
}
