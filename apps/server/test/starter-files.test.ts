import { afterAll, beforeAll, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { seedAgentStarterFiles } from '../src/starter-files/agent-files.ts';
import { testSqlAgentHome } from './agent-home.ts';
import { drivePushFixture } from './drive-push.fixture.ts';

const drive = drivePushFixture({ seedManagedSkills: true });
const { fixture } = drive;
const hausRules = '# Haus rules\n\nThese rules apply to every Captain and Worker on this Server.\n';
let connection: HausConnection;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
});

test('a new Captain holds starter rule files and memory as Haus revisions', async () => {
    expect(await head('agents/orbit/AGENTS.md')).toEqual({
        author_key: 'haus',
        creator_agent_id: fixture.orbitAgentId,
        revision_number: 1,
        text: '# Orbit rules\n',
    });
    expect((await head('agents/orbit/WORKER.md'))?.text).toBe("# Rules for Orbit's Workers\n");
    const memory = await head('agents/orbit/MEMORY.md');
    expect(memory?.author_key).toBe('haus');
    expect(memory?.text).toMatch(/^# Orbit\n\n## Role\n/u);
    expect(memory?.text).toContain('## Key Knowledge');
});

test('a new Server holds a starter haus/AGENTS.md', async () => {
    expect(await head('haus/AGENTS.md')).toEqual({
        author_key: 'haus',
        creator_agent_id: null,
        revision_number: 1,
        text: hausRules,
    });
});

test('the starter MEMORY.md carries the creating Agent’s brief, and seeding never overwrites', async () => {
    const agentId = await insertAgent('scout', 'Scout', {
        brief: 'Own delivery checks in #product.',
        createdBy: fixture.orbitAgentId,
    });
    const seed = () => seedAgentStarterFiles(connection.db, drive.storage, fixtureAgent(agentId));

    expect(await seed()).toEqual({
        'AGENTS.md': 'written',
        'MEMORY.md': 'written',
        'WORKER.md': 'written',
    });
    const memory = (await head('agents/scout/MEMORY.md'))?.text ?? '';
    expect(memory).toContain('## Standing brief from @orbit\n\nOwn delivery checks in #product.\n');
    expect(await seed()).toEqual({
        'AGENTS.md': 'present',
        'MEMORY.md': 'present',
        'WORKER.md': 'present',
    });
    expect((await head('agents/scout/MEMORY.md'))?.revision_number).toBe(1);
});

test('a full reset reseeds the starter MEMORY.md and rule files', async () => {
    const edited = await drive.memberPut(
        {
            base_revision_id: (await headRevisionId('agents/orbit/MEMORY.md')) ?? '',
            content_type: 'text/markdown',
            path: 'agents/orbit/MEMORY.md',
            request_id: 'starter-memory-edit',
        },
        '# Orbit\n\nRemembers too much.\n'
    );
    expect(edited.status).toBe(200);

    await fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });

    const memory = await head('agents/orbit/MEMORY.md');
    expect(memory?.revision_number).toBe(1);
    expect(memory?.text).not.toContain('Remembers too much.');
    expect(memory?.text).toMatch(/^# Orbit\n\n## Role\n/u);
    expect((await head('agents/orbit/AGENTS.md'))?.text).toBe('# Orbit rules\n');
    expect((await head('agents/orbit/WORKER.md'))?.text).toBe("# Rules for Orbit's Workers\n");
});

function fixtureAgent(agentId: string) {
    return { agentId, serverId: fixture.serverId };
}

async function head(path: string, serverId = fixture.serverId) {
    const [row] = (await fixture.harness.sql`
        select a.creator_agent_id, r.author_key, r.revision_number, r.object_key
        from artifacts a join artifact_revisions r on r.id = a.current_revision_id
        where a.server_id = ${serverId} and a.path = ${path} and a.deleted_at is null
    `) as {
        author_key: string;
        creator_agent_id: string | null;
        object_key: string;
        revision_number: number;
    }[];
    if (!row) {
        return undefined;
    }
    const { object_key: objectKey, ...rest } = row;
    return { ...rest, text: new TextDecoder().decode(drive.storage.objects.get(objectKey)) };
}

async function headRevisionId(path: string) {
    const [row] = (await fixture.harness.sql`
        select current_revision_id from artifacts
        where server_id = ${fixture.serverId} and path = ${path} and deleted_at is null
    `) as { current_revision_id: string }[];
    return row?.current_revision_id;
}

async function insertAgent(
    handle: string,
    displayName: string,
    options: { brief: string; createdBy: string }
) {
    const agentId = `agt_${handle.padEnd(16, 'x')}`;
    await fixture.harness.sql`
        insert into agents (
            id, server_id, computer_id, display_name, handle, home_timezone,
            desired_model_id, desired_runtime_id, brief, created_by_agent_id, home_project_id)
        values (
            ${agentId}, ${fixture.serverId}, ${fixture.computerId}, ${displayName}, ${handle}, 'UTC',
            'gpt-5.6-sol', 'codex', ${options.brief}, ${options.createdBy},
            ${await testSqlAgentHome(fixture.harness.sql, fixture.serverId)}
        )
    `;
    return agentId;
}
