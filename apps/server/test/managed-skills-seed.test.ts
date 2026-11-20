import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    defaultVisualsSkill,
    factoryManagedSkillFiles,
    visualsSkillFiles,
} from '@haus/agent-workspace';
import { moveArtifacts } from '../src/artifacts/move.ts';
import { resolveRunnerCredential } from '../src/computers/runner-credentials.ts';
import { factoryRelease, managedSkillRelease } from '../src/managed-skills/release.ts';
import { seedManagedSkills } from '../src/managed-skills/seed.ts';
import { seedStaleManagedSkills } from '../src/managed-skills/seeder.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { drivePushFixture } from './drive-push.fixture.ts';

const drive = drivePushFixture({ seedManagedSkills: true });
const { fixture } = drive;
const skillFileCount = Object.keys(visualsSkillFiles).length + 1;
const nextVisuals = `${defaultVisualsSkill}\nRe-read the charts module before every chart.\n`;
const nextRelease = managedSkillRelease({
    visuals: { ...factoryManagedSkillFiles.visuals, 'SKILL.md': nextVisuals },
});
const thirdRelease = managedSkillRelease({
    visuals: {
        ...factoryManagedSkillFiles.visuals,
        'SKILL.md': `${nextVisuals}Label every axis.\n`,
    },
});
let connection: HausConnection;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
});

test('a new Agent holds every factory skill file in Drive as a Haus revision', async () => {
    const files = await skillHeads('orbit');

    expect(files).toHaveLength(skillFileCount);
    expect(new Set(files.map((file) => file.author_key))).toEqual(new Set(['haus']));
    expect(files.find((file) => file.path === 'agents/orbit/skills/visuals/SKILL.md')).toEqual({
        author_agent_id: null,
        author_key: 'haus',
        author_user_id: null,
        creator_agent_id: fixture.orbitAgentId,
        path: 'agents/orbit/skills/visuals/SKILL.md',
        revision_number: 1,
        sha256: sha256(defaultVisualsSkill),
    });
    const { artifact } = await fixture.owner.trpc.artifact.byPath.query({
        path: 'agents/orbit/skills/visuals/SKILL.md',
        serverId: fixture.serverId,
    });
    expect([artifact.author, artifact.creator]).toEqual([
        { type: 'haus' },
        { agent_id: fixture.orbitAgentId, type: 'agent' },
    ]);
    expect(await skillRecord(fixture.orbitAgentId)).toEqual({ pending: null, skill_id: 'visuals' });
});

test('seeding a current Agent again writes no revision and no Drive change', async () => {
    const before = await driveTotals();

    expect(await seed(fixture.orbitAgentId)).toEqual({ visuals: 'current' });
    expect(await seed(fixture.orbitAgentId)).toEqual({ visuals: 'current' });
    expect(await driveTotals()).toEqual(before);
});

test('a Server start seeds an Agent that has no skills, then leaves every Agent current', async () => {
    expect(await skillHeads('cove')).toHaveLength(0);

    await seedStaleManagedSkills(connection.db, drive.storage, new AbortController().signal);
    const seeded = await skillHeads('cove');
    const after = await driveTotals();
    await seedStaleManagedSkills(connection.db, drive.storage, new AbortController().signal);

    expect(seeded).toHaveLength(skillFileCount);
    expect(new Set(seeded.map((file) => file.revision_number))).toEqual(new Set([1]));
    expect(await driveTotals()).toEqual(after);
});

test('a skill its Agent edited keeps the edit when the release changes', async () => {
    const path = 'agents/peer/skills/visuals/SKILL.md';
    const writer = await drive.peerWriter();
    const edited = await drive.publish(
        writer,
        {
            base_revision_id: await headRevisionId(path),
            content_type: 'text/markdown',
            path,
            request_id: 'peer-visuals-edit',
        },
        'My own visuals rules.\n'
    );

    expect(await seed(fixture.peerAgentId, nextRelease)).toEqual({ visuals: 'edited' });
    expect(await headRevisionId(path)).toBe(edited.revision_id);
    expect(await skillRecord(fixture.peerAgentId)).toEqual({ pending: null, skill_id: 'visuals' });
});

test('a changed release updates an untouched skill and records one pending notice', async () => {
    expect(await seed(fixture.orbitAgentId, nextRelease)).toEqual({ visuals: 'updated' });

    const files = await skillHeads('orbit');
    expect(files.find((file) => file.path.endsWith('/SKILL.md'))).toMatchObject({
        author_key: 'haus',
        revision_number: 2,
        sha256: sha256(nextVisuals),
    });
    expect(files.filter((file) => file.revision_number !== 1)).toHaveLength(1);
    expect(await skillRecord(fixture.orbitAgentId)).toEqual({
        pending: nextRelease[0]?.fingerprint,
        skill_id: 'visuals',
    });
    expect(await seed(fixture.orbitAgentId, nextRelease)).toEqual({ visuals: 'current' });
});

test('two seeders racing on one Agent land a single revision', async () => {
    const held = drive.storage.holdNextUpload();
    const first = seed(fixture.coveAgentId, nextRelease);
    await held.started;
    const second = await seed(fixture.coveAgentId, nextRelease);
    held.release();

    expect([second, await first]).toEqual([{ visuals: 'updated' }, { visuals: 'raced' }]);
    expect(
        (await skillHeads('cove')).find((file) => file.path.endsWith('/SKILL.md'))
    ).toMatchObject({ revision_number: 2, sha256: sha256(nextVisuals) });
    const [ready] = (await fixture.harness.sql`
        select count(*)::int as count from artifact_revisions r
        join artifacts a on a.id = r.artifact_id
        where a.path = 'agents/cove/skills/visuals/SKILL.md' and r.state = 'ready'
    `) as { count: number }[];
    expect(ready?.count).toBe(2);
});

test('a skill file its Agent moves during the upload keeps its place and gets no seed', async () => {
    const before = 'agents/cove/skills/visuals/SKILL.md';
    const after = 'agents/cove/notes/visuals-skill.md';
    const held = drive.storage.holdNextUpload();
    const seeding = seed(fixture.coveAgentId, thirdRelease);
    await held.started;
    const { token } = await fixture.mintRunner(
        'run_move_skill',
        fixture.coveAgentId,
        fixture.channelId,
        false
    );
    const runner = await resolveRunnerCredential(connection.db, token);
    if (!runner) {
        throw new Error('The Cove run credential did not resolve.');
    }
    await moveArtifacts(connection.db, { kind: 'agent', runner }, 'http://haus.test', {
        from: before,
        to: after,
    });
    held.release();

    expect(await seeding).toEqual({ visuals: 'raced' });
    const [moved] = (await fixture.harness.sql`
        select r.revision_number, r.sha256 from artifacts a
        join artifact_revisions r on r.id = a.current_revision_id
        where a.server_id = ${fixture.serverId} and a.path = ${after} and a.deleted_at is null
    `) as { revision_number: number; sha256: string }[];
    expect(moved).toEqual({ revision_number: 2, sha256: sha256(nextVisuals) });
    expect(await headRevisionId(before)).toBe('');
});

test('a full reset seeds the factory skills fresh, with no notice', async () => {
    await fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });

    const files = await skillHeads('orbit');
    expect(files).toHaveLength(skillFileCount);
    expect(files.find((file) => file.path.endsWith('/SKILL.md'))).toMatchObject({
        author_key: 'haus',
        revision_number: 1,
        sha256: sha256(defaultVisualsSkill),
    });
    expect(await skillRecord(fixture.orbitAgentId)).toEqual({ pending: null, skill_id: 'visuals' });
});

function seed(agentId: string, release = factoryRelease) {
    return seedManagedSkills(
        connection.db,
        drive.storage,
        { agentId, serverId: fixture.serverId },
        release
    );
}

async function skillHeads(handle: string) {
    return (await fixture.harness.sql`
        select a.path, a.creator_agent_id, r.author_key, r.author_agent_id, r.author_user_id,
               r.revision_number, r.sha256
        from artifacts a join artifact_revisions r on r.id = a.current_revision_id
        where a.server_id = ${fixture.serverId} and a.deleted_at is null
          and a.path like ${`agents/${handle}/skills/%`}
        order by a.path
    `) as {
        author_agent_id: string | null;
        author_key: string;
        author_user_id: string | null;
        creator_agent_id: string;
        path: string;
        revision_number: number;
        sha256: string;
    }[];
}

async function headRevisionId(path: string) {
    const [row] = (await fixture.harness.sql`
        select current_revision_id from artifacts
        where server_id = ${fixture.serverId} and path = ${path} and deleted_at is null
    `) as { current_revision_id: string }[];
    return row?.current_revision_id ?? '';
}

async function skillRecord(agentId: string) {
    const [row] = (await fixture.harness.sql`
        select skill_id, pending_release_fingerprint as pending from agent_managed_skills
        where server_id = ${fixture.serverId} and agent_id = ${agentId}
    `) as { pending: string | null; skill_id: string }[];
    return row;
}

async function driveTotals() {
    const [row] = (await fixture.harness.sql`
        select
            (select count(*)::int from artifact_revisions where server_id = ${fixture.serverId}) as revisions,
            (select coalesce(sum(counter), 0)::int from drive_area_counters
             where server_id = ${fixture.serverId}) as changes
    `) as { changes: number; revisions: number }[];
    return row;
}

function sha256(text: string) {
    return createHash('sha256').update(text).digest('hex');
}
