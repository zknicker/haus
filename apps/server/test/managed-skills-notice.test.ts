import { afterAll, beforeAll, expect, test } from 'bun:test';
import { defaultVisualsSkill, factoryManagedSkillFiles } from '@haus/agent-workspace';
import { managedSkillRelease } from '../src/managed-skills/release.ts';
import { seedManagedSkills } from '../src/managed-skills/seed.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { drivePushFixture } from './drive-push.fixture.ts';

const drive = drivePushFixture({ seedManagedSkills: true });
const { fixture } = drive;
const releaseOf = (skill: string) =>
    managedSkillRelease({
        visuals: {
            ...factoryManagedSkillFiles.visuals,
            'SKILL.md': `${defaultVisualsSkill}${skill}`,
        },
    });
let connection: HausConnection;

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
});

test('an update is pending for its Agent alone until a receipt names its release', async () => {
    const second = releaseOf('\nSecond release.\n');
    const third = releaseOf('\nThird release.\n');
    const orbit = await drive.orbitWriter();
    const peer = await drive.peerWriter();
    await seed(second);
    const secondFingerprint = second[0]?.fingerprint ?? '';

    expect(await readNotice(orbit)).toEqual({ pending: { visuals: secondFingerprint } });
    expect(await readNotice(peer)).toEqual({ pending: {} });

    await seed(third);
    expect(await ack(orbit, { visuals: secondFingerprint })).toBe(200);
    expect(await readNotice(orbit)).toEqual({
        pending: { visuals: third[0]?.fingerprint ?? '' },
    });

    expect(await ack(orbit, { visuals: third[0]?.fingerprint ?? '' })).toBe(200);
    expect(await readNotice(orbit)).toEqual({ pending: {} });
});

test('the notice routes need the run credential', async () => {
    const response = await fetch(new URL('/api/agent/managed-skills/notice', fixture.harness.url));
    expect([response.status, await response.json()]).toEqual([
        401,
        { code: 'MISSING_TOKEN', message: 'A valid runner credential is required.' },
    ]);
});

function seed(release: ReturnType<typeof managedSkillRelease>) {
    return seedManagedSkills(
        connection.db,
        drive.storage,
        { agentId: fixture.orbitAgentId, serverId: fixture.serverId },
        release
    );
}

async function readNotice(runner: { token: string }) {
    const response = await fetch(new URL('/api/agent/managed-skills/notice', fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    expect(response.status).toBe(200);
    return await response.json();
}

async function ack(runner: { token: string }, announced: Record<string, string>) {
    const response = await fetch(
        new URL('/api/agent/managed-skills/notice/ack', fixture.harness.url),
        {
            body: JSON.stringify({ announced }),
            headers: {
                authorization: `Bearer ${runner.token}`,
                'content-type': 'application/json',
            },
            method: 'POST',
        }
    );
    return response.status;
}
