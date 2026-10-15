// A Linear workspace seeded on the eval stack's own Server, so Linear Trigger
// scenarios run with no Linear account and no call to api.linear.app. The rows
// go in through the stack's PostgreSQL, shaped like
// apps/server/test/linear-session-seed.ts: a connected `linear` connection the
// worker holds a grant on, an `active` workspace with a valid workspace-actor
// credential, and team access to Design (DES) and Engineering (ENG). Name-to-id
// resolution reads the Trigger catalog from the fake Linear the eval stack
// points HAUS_LINEAR_API_ORIGIN at (fake-linear.mjs).
//
// The connection's URL is deliberately not the hosted Linear connector's: the
// connector would call Linear itself, so the worker sees the connection with
// no Linear tools and authors Triggers through `haus trigger create` alone.

import { readdirSync } from 'node:fs';
import { SQL } from 'bun';
import { createDevStackStatePaths } from '../dev-stack-shared.mjs';
import { holdFakeLinear } from './fake-linear.mjs';

const idAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const offlineConnectionUrl = 'https://linear-offline.haus.invalid/mcp';

/**
 * Seeds the world and returns its ids, the secrets a scenario must never see
 * in chat, the fake's call log, and `cleanup()`, which tombstones the
 * workspace and removes the connection and grant. Triggers are the scenario's
 * to delete first.
 */
export async function seedLinearWorld(kit, worker) {
    const webhookSecret = process.env.HAUS_LINEAR_APP_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error(
            'Linear Trigger scenarios need HAUS_LINEAR_APP_WEBHOOK_SECRET: run them through `bun run eval`, or wrap test:agents in `bunx varlock run --`.'
        );
    }
    const world = linearWorldIds();
    const sql = openStackDatabase();
    const now = new Date();
    const later = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await sql`
        insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools, preset)
        values (${world.connectionId}, ${kit.serverId}, 'Linear', ${offlineConnectionUrl},
                'none', true, '{}', '{}', 'linear')
    `;
    await sql`
        insert into agent_mcp_connection_grants (server_id, agent_id, connection_id)
        values (${kit.serverId}, ${worker.id}, ${world.connectionId})
    `;
    await sql`
        insert into linear_workspaces
            (id, server_id, connection_id, app_user_id, name, organization_id, status, url_key,
             teams_synced_at)
        values (${world.workspaceId}, ${kit.serverId}, ${world.connectionId}, ${world.appUserId},
                'Haus Design', ${world.organizationId}, 'active', ${world.urlKey}, ${now})
    `;
    await sql`
        insert into linear_credentials
            (id, server_id, workspace_id, access_token, refresh_token, access_expires_at, scopes, state)
        values (${world.credentialId}, ${kit.serverId}, ${world.workspaceId}, ${world.accessToken},
                ${world.refreshToken}, ${later}, '{read,write,app:assignable,app:mentionable}', 'valid')
    `;
    for (const team of Object.values(world.teams)) {
        await sql`
            insert into linear_team_access (credential_id, server_id, synced_at, team_id, team_key, team_name)
            values (${world.credentialId}, ${kit.serverId}, ${now}, ${team.id}, ${team.key}, ${team.name})
        `;
    }
    const fake = holdFakeLinear({ catalog: linearCatalog(world), token: world.accessToken });

    async function cleanup() {
        try {
            await sql`
                update linear_workspaces
                set status = 'removed', removed_at = now(), connection_id = null, updated_at = now()
                where id = ${world.workspaceId}
            `;
            await sql`delete from agent_mcp_connection_grants where connection_id = ${world.connectionId}`;
            await sql`delete from mcp_connections where id = ${world.connectionId}`;
        } finally {
            fake.release();
            await sql.close();
        }
    }

    return {
        ...world,
        cleanup,
        fakeCalls: fake.calls,
        /** Strings that must never reach a Chat or an execution journal. */
        secrets: [world.accessToken, world.refreshToken, webhookSecret],
        webhookSecret,
    };
}

/** Fresh Linear-shaped ids per seed: organizations are unique among live workspaces. */
function linearWorldIds() {
    const uuid = () => crypto.randomUUID();
    const team = (key, name) => ({ id: uuid(), key, name });
    const teams = { des: team('DES', 'Design'), eng: team('ENG', 'Engineering') };
    const state = (teamId, name, type) => ({ id: uuid(), name, teamId, type });
    return {
        accessToken: `lin_oauth_${opaque(32)}`,
        appUserId: uuid(),
        connectionId: `mcp_${opaque(16)}`,
        credentialId: `lna_${opaque(16)}`,
        organizationId: uuid(),
        people: { maya: { email: 'maya@haus-design.test', id: uuid(), name: 'Maya Chen' } },
        refreshToken: `lin_refresh_${opaque(32)}`,
        states: {
            changesRequested: state(teams.des.id, 'Changes Requested', 'started'),
            designBacklog: state(teams.des.id, 'Backlog', 'backlog'),
            designDone: state(teams.des.id, 'Done', 'completed'),
            designReview: state(teams.des.id, 'Design Review', 'started'),
            inDesign: state(teams.des.id, 'In Design', 'started'),
            engInProgress: state(teams.eng.id, 'In Progress', 'started'),
            engInReview: state(teams.eng.id, 'In Review', 'started'),
            engDone: state(teams.eng.id, 'Done', 'completed'),
        },
        teams,
        urlKey: `haus-design-${opaque(4).toLowerCase()}`,
        workspaceId: `lnw_${opaque(16)}`,
    };
}

/** The HausTriggerCatalog answer (apps/server/src/linear/trigger-catalog.ts). */
function linearCatalog(world) {
    const page = (nodes) => ({ nodes, pageInfo: { hasNextPage: false } });
    return {
        issueLabels: page([
            { id: crypto.randomUUID(), isGroup: false, name: 'Bug', team: null },
            {
                id: crypto.randomUUID(),
                isGroup: false,
                name: 'Polish',
                team: { id: world.teams.des.id },
            },
        ]),
        projectStatuses: page([{ id: crypto.randomUUID(), name: 'In Progress' }]),
        projects: page([
            {
                id: crypto.randomUUID(),
                name: 'Brand Refresh',
                teams: { nodes: [{ id: world.teams.des.id }] },
                url: `https://linear.app/${world.urlKey}/project/brand-refresh-0123456789ab`,
            },
        ]),
        users: page([
            {
                displayName: 'maya',
                email: world.people.maya.email,
                id: world.people.maya.id,
                name: world.people.maya.name,
            },
        ]),
        workflowStates: page(
            Object.values(world.states).map((state) => ({
                id: state.id,
                name: state.name,
                team: { id: state.teamId },
                type: state.type,
            }))
        ),
    };
}

/** The stack's PostgreSQL over TCP; its port is the socket file's suffix. */
function openStackDatabase() {
    const { postgresSocketRoot } = createDevStackStatePaths({
        baseEnvironment: process.env,
        repositoryRoot: process.cwd(),
    });
    const socket = readdirSync(postgresSocketRoot).find((entry) =>
        /^\.s\.PGSQL\.\d+$/u.test(entry)
    );
    if (!socket) {
        throw new Error(`No PostgreSQL socket under ${postgresSocketRoot}; is the dev stack up?`);
    }
    const port = socket.split('.').at(-1);
    return new SQL(`postgres://haus@127.0.0.1:${port}/haus`);
}

function opaque(length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return [...bytes].map((byte) => idAlphabet[byte % idAlphabet.length]).join('');
}
