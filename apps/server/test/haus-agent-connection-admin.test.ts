import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';

const fixture = agentCreationFixture();
const linearId = `mcp_${'l'.repeat(16)}`;
const offlineId = `mcp_${'o'.repeat(16)}`;
const offsiteId = `mcp_${'x'.repeat(16)}`;

let member: HausClient;

beforeAll(async () => {
    member = await fixture.signIn('user_connection_admin_member', ['erin@haus.test']);
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email: 'erin@haus.test',
        serverId: fixture.serverId,
    });
    await member.trpc.invitation.accept.mutate({ token });
    await seedConnection(linearId, fixture.serverId, 'Linear', true);
    await seedConnection(offlineId, fixture.serverId, 'Notion', false);
    await seedConnection(offsiteId, fixture.otherServerId, 'Offsite Linear', true);
});

async function seedConnection(id: string, serverId: string, name: string, connected: boolean) {
    await fixture.harness.sql`
        insert into mcp_connections (id, server_id, name, url, auth, connected, header_names, tools)
        values (${id}, ${serverId}, ${name}, 'https://mcp.example.test/mcp', 'oauth', ${connected},
                '{}', ARRAY['search'])
    `;
}

async function readGrants(agentId: string) {
    const rows = (await fixture.harness.sql`
        select connection_id from agent_mcp_connection_grants
        where server_id = ${fixture.serverId} and agent_id = ${agentId}
        order by connection_id
    `) as { connection_id: string }[];
    return rows.map((row) => row.connection_id);
}

async function list(runner: { token: string }) {
    const response = await fetch(new URL('/api/agent/connections', fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

function setAdmin(agentId: string, connectionAdmin: boolean, client = fixture.owner) {
    return client.trpc.agent.setConnectionAdmin.mutate({
        agentId,
        connectionAdmin,
        serverId: fixture.serverId,
    });
}

test('an Agent that is not a connection admin is refused on list, grant, and revoke', async () => {
    const runner = await fixture.mintRunner('run_connection_unflagged', fixture.peerAgentId);
    const body = { agent: '@orbit', connection: 'Linear' };

    for (const response of [
        await list(runner),
        await fixture.post('/api/agent/connections/grant', runner, body),
        await fixture.post('/api/agent/connections/revoke', runner, body),
    ]) {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('CONNECTION_ADMIN_REQUIRED');
        expect(String(response.body.message)).toContain('Server Owner or Admin');
    }
    expect(await readGrants(fixture.orbitAgentId)).toEqual([]);
});

test('a connection admin lists, grants, and revokes for another Agent and itself', async () => {
    expect(await setAdmin(fixture.orbitAgentId, true)).toEqual({
        agentId: fixture.orbitAgentId,
        connectionAdmin: true,
    });
    const agents = await fixture.owner.trpc.agent.list.query({ serverId: fixture.serverId });
    expect(agents.find((agent) => agent.id === fixture.orbitAgentId)?.connectionAdmin).toBe(true);
    expect(agents.find((agent) => agent.id === fixture.peerAgentId)?.connectionAdmin).toBe(false);
    const runner = await fixture.mintRunner('run_connection_admin');

    const granted = await fixture.post('/api/agent/connections/grant', runner, {
        agent: 'Peer',
        connection: 'linear',
    });
    expect(granted.status).toBe(200);
    expect(granted.body).toEqual({
        agent: { displayName: 'Peer', handle: 'peer', id: fixture.peerAgentId },
        changed: true,
        connection: { id: linearId, name: 'Linear' },
        enabled: true,
    });
    expect(await readGrants(fixture.peerAgentId)).toEqual([linearId]);

    const again = await fixture.post('/api/agent/connections/grant', runner, {
        agent: fixture.peerAgentId,
        connection: linearId,
    });
    expect(again.body).toMatchObject({ changed: false, enabled: true });

    const self = await fixture.post('/api/agent/connections/grant', runner, {
        agent: '@orbit',
        connection: 'Linear',
    });
    expect(self.body).toMatchObject({ changed: true, enabled: true });

    const listed = await list(runner);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
        connections: [
            {
                agents: [
                    { displayName: 'Orbit', handle: 'orbit', id: fixture.orbitAgentId },
                    { displayName: 'Peer', handle: 'peer', id: fixture.peerAgentId },
                ],
                connected: true,
                id: linearId,
                name: 'Linear',
            },
            { agents: [], connected: false, id: offlineId, name: 'Notion' },
        ],
    });
    // Agents see no URL, header names, or account labels.
    expect(JSON.stringify(listed.body)).not.toContain('mcp.example.test');

    for (const agent of ['@peer', '@orbit']) {
        const revoked = await fixture.post('/api/agent/connections/revoke', runner, {
            agent,
            connection: 'Linear',
        });
        expect(revoked.body).toMatchObject({ changed: true, enabled: false });
    }
    expect(await readGrants(fixture.peerAgentId)).toEqual([]);
    expect(await readGrants(fixture.orbitAgentId)).toEqual([]);
});

test('a connection admin cannot enable a disconnected or offsite connection or name an unknown Agent', async () => {
    await setAdmin(fixture.orbitAgentId, true);
    const runner = await fixture.mintRunner('run_connection_admin_refusals');

    const disconnected = await fixture.post('/api/agent/connections/grant', runner, {
        agent: '@peer',
        connection: 'Notion',
    });
    expect(disconnected.status).toBe(409);
    expect(disconnected.body.code).toBe('CONNECTION_NOT_CONNECTED');

    const offsiteConnection = await fixture.post('/api/agent/connections/grant', runner, {
        agent: '@peer',
        connection: offsiteId,
    });
    expect(offsiteConnection.status).toBe(404);
    expect(offsiteConnection.body.code).toBe('CONNECTION_NOT_FOUND');

    const offsiteAgentId = await fixture.seedOffsiteAgent('faraway');
    const offsiteAgent = await fixture.post('/api/agent/connections/grant', runner, {
        agent: offsiteAgentId,
        connection: 'Linear',
    });
    expect(offsiteAgent.status).toBe(404);
    expect(offsiteAgent.body.code).toBe('AGENT_NOT_FOUND');
    expect(await readGrants(fixture.peerAgentId)).toEqual([]);
});

test('a duplicate connection name is ambiguous and names nothing', async () => {
    await setAdmin(fixture.orbitAgentId, true);
    const duplicateId = `mcp_${'d'.repeat(16)}`;
    await seedConnection(duplicateId, fixture.serverId, 'Twin', true);
    await seedConnection(`mcp_${'e'.repeat(16)}`, fixture.serverId, 'twin', true);
    const runner = await fixture.mintRunner('run_connection_admin_ambiguous');

    const ambiguous = await fixture.post('/api/agent/connections/grant', runner, {
        agent: '@peer',
        connection: 'Twin',
    });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.code).toBe('AMBIGUOUS_TARGET');

    const byId = await fixture.post('/api/agent/connections/grant', runner, {
        agent: '@peer',
        connection: duplicateId,
    });
    expect(byId.body).toMatchObject({ changed: true });
    await fixture.post('/api/agent/connections/revoke', runner, {
        agent: '@peer',
        connection: duplicateId,
    });
});

test('turning the flag off revokes the Agent route at once', async () => {
    await setAdmin(fixture.orbitAgentId, true);
    const runner = await fixture.mintRunner('run_connection_admin_revoked');
    await setAdmin(fixture.orbitAgentId, false);

    const refused = await fixture.post('/api/agent/connections/grant', runner, {
        agent: '@peer',
        connection: 'Linear',
    });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('CONNECTION_ADMIN_REQUIRED');
});

test('only a human Owner or Admin sets the flag; a Member and an Agent credential cannot', async () => {
    await expect(setAdmin(fixture.peerAgentId, true, member)).rejects.toThrow(/Owner or Admin/u);

    const runner = await fixture.mintRunner(
        'run_connection_admin_self_promote',
        fixture.peerAgentId
    );
    const asAgent = createHausClient(fixture.harness, runner.token);
    await expect(setAdmin(fixture.peerAgentId, true, asAgent)).rejects.toThrow();
    asAgent.close();

    const selfProfile = await fixture.post('/api/agent/profile/update', runner, {
        connectionAdmin: true,
    });
    expect(selfProfile.status).toBe(400);

    const agents = await fixture.owner.trpc.agent.list.query({ serverId: fixture.serverId });
    expect(agents.find((agent) => agent.id === fixture.peerAgentId)?.connectionAdmin).toBe(false);
});

test('the human grant path is unchanged', async () => {
    const { owner, peerAgentId: agentId, serverId } = fixture;
    expect(
        await owner.trpc.mcp.setGrant.mutate({
            agentId,
            connectionId: linearId,
            enabled: true,
            serverId,
        })
    ).toEqual({ agentId, connectionId: linearId });
    expect(await readGrants(agentId)).toEqual([linearId]);

    await expect(
        member.trpc.mcp.setGrant.mutate({
            agentId,
            connectionId: linearId,
            enabled: false,
            serverId,
        })
    ).rejects.toThrow(/Only a Server Owner or Admin can change Agent access/u);
    await expect(
        owner.trpc.mcp.setGrant.mutate({
            agentId,
            connectionId: offlineId,
            enabled: true,
            serverId,
        })
    ).rejects.toThrow(/Connect this MCP server before enabling Agent access/u);

    await owner.trpc.mcp.setGrant.mutate({
        agentId,
        connectionId: linearId,
        enabled: false,
        serverId,
    });
    expect(await readGrants(agentId)).toEqual([]);
});
