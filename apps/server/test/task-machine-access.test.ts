import { afterAll, beforeAll, expect, test } from 'bun:test';
import { gateInvocation } from '../src/agent-invocations/invocation-gate.ts';
import {
    readAccessibleComputerIds,
    readAgentAccess,
    readAgentsBarredFrom,
} from '../src/computer-access/agent-access.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { seedTaskAgent } from './task-agent.fixture.ts';

const fixture = agentCreationFixture();
const studioId = `cmp_${'s'.repeat(16)}`;
let connection: HausConnection;
let beaUserId: string;

async function access(agentId: string, computerId: string) {
    return await readAgentAccess(connection.db, {
        agentId,
        computerId,
        serverId: fixture.serverId,
    });
}

function seedOnStudio(input: { captainId?: string; starterUserId?: string }) {
    return seedTaskAgent(fixture.harness, {
        ...input,
        computerId: studioId,
        projectId: fixture.channelId,
        serverId: fixture.serverId,
    });
}

async function setGrant(agentId: string, granted: boolean) {
    await (granted
        ? fixture.harness.sql`
              insert into computer_agent_access (server_id, computer_id, agent_id, granted_by_user_id)
              values (${fixture.serverId}, ${studioId}, ${agentId}, ${fixture.ownerUserId})
          `
        : fixture.harness.sql`
              delete from computer_agent_access where computer_id = ${studioId} and agent_id = ${agentId}
          `);
}

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, health, agent_access_scope)
        values (${studioId}, ${fixture.serverId}, ${fixture.ownerUserId}, ${'5'.repeat(64)}, 'healthy', 'selected')
    `;
    const { token } = await fixture.owner.trpc.invitation.create.mutate({
        email: 'bea-access@haus.test',
        serverId: fixture.serverId,
    });
    const bea = await fixture.signIn('user_task_access_bea', ['bea-access@haus.test']);
    await bea.trpc.invitation.accept.mutate({ token });
    beaUserId = await fixture.readUserId('user_task_access_bea');
});

afterAll(async () => {
    await connection?.close();
});

test('crew uses its Machine exactly while its Captain’s current grant allows the Captain', async () => {
    const crew = await seedOnStudio({ captainId: fixture.orbitAgentId });
    expect(await access(crew.agentId, studioId)).toBe('no-access');
    await setGrant(fixture.orbitAgentId, true);
    expect(await access(crew.agentId, studioId)).toBe('allowed');
    expect([...(await readAccessibleComputerIds(connection.db, { ...crew, serverId: fixture.serverId }))]).toEqual([
        studioId,
    ]);
    await setGrant(fixture.orbitAgentId, false);
    expect(await access(crew.agentId, studioId)).toBe('no-access');
    const barred = (await readAgentsBarredFrom(connection.db, studioId)).map(({ agentId }) => agentId);
    expect(barred).toContain(crew.agentId);
    expect(barred).toContain(fixture.orbitAgentId);
});

test('a Task agent never gets the own-Machine pass, and refuses any other target', async () => {
    const crew = await seedOnStudio({ captainId: fixture.peerAgentId });
    expect(await access(crew.agentId, studioId)).toBe('no-access');
    expect(await access(crew.agentId, fixture.computerId)).toBe('task-machine-only');
    const gate = await gateInvocation(connection.db, {
        agentId: crew.agentId,
        computerId: fixture.computerId,
        online: true,
        operation: { command: 'pwd', kind: 'bash' },
        serverId: fixture.serverId,
    });
    expect(gate).toMatchObject({ kind: 'refuse', refusal: 'task-machine-only' });
});

test('a person’s Task follows its starter: the attacher, or All Captains on the Computer', async () => {
    const owners = await seedOnStudio({ starterUserId: fixture.ownerUserId });
    const beas = await seedOnStudio({ starterUserId: beaUserId });
    expect(await access(owners.agentId, studioId)).toBe('allowed');
    expect(await access(beas.agentId, studioId)).toBe('no-access');
    await fixture.harness.sql`update computers set agent_access_scope = 'all' where id = ${studioId}`;
    expect(await access(beas.agentId, studioId)).toBe('allowed');
    await fixture.harness.sql`update tasks set archived_at = now() where id = ${beas.taskId}`;
    expect(await access(beas.agentId, studioId)).toBe('no-access');
    await fixture.harness.sql`update computers set agent_access_scope = 'selected' where id = ${studioId}`;
});
