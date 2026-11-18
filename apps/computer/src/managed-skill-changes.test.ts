import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { factoryManagedSkillHashes } from '@haus/agent-workspace';
import {
    clearManagedSkillChangeNotice,
    type ManagedSkillFactory,
    managedSkillChangeText,
    readManagedSkillChangeNotice,
    seedAgentManagedSkills,
} from './managed-skill-changes.ts';

let agentRoot: string;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-managed-skill-changes-'));
});

afterEach(async () => {
    await rm(agentRoot, { force: true, recursive: true });
});

/** A release whose managed skills and their contents the test can change between seeds. */
function release(contents: Record<string, string>): ManagedSkillFactory {
    return {
        hashes: () => ({ ...contents }),
        seed: async (skillsDir) => {
            for (const [skillId, content] of Object.entries(contents)) {
                await mkdir(join(skillsDir, skillId), { recursive: true });
                await writeFile(join(skillsDir, skillId, 'SKILL.md'), content);
            }
        },
    };
}

test('a brand-new Agent is seeded without a notice', async () => {
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));

    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
    expect(await readFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'utf8')).toBe('v1');
});

test('an identical reseed queues nothing', async () => {
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));

    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
});

test('a changed managed skill queues exactly one notice naming it', async () => {
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v2' }));

    const notice = await readManagedSkillChangeNotice(agentRoot);
    expect(notice?.text).toBe(managedSkillChangeText(['visuals']));
    expect(notice?.announced).toEqual({ visuals: 'v2' });
});

test('a managed skill added by a release queues nothing', async () => {
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v1' }));

    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
    expect(await readFile(join(agentRoot, 'skills', 'charts', 'SKILL.md'), 'utf8')).toBe('c1');
});

test('an Agent seeded before the record existed is notified once for skills it held', async () => {
    await mkdir(join(agentRoot, 'skills', 'visuals'), { recursive: true });
    await writeFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'old release');

    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v2' }));

    const notice = await readManagedSkillChangeNotice(agentRoot);
    expect(notice?.text).toBe(managedSkillChangeText(['visuals']));
    await clearManagedSkillChangeNotice(agentRoot, notice ?? fail());
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v2' }));
    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
});

test('changes across seeds before the next turn coalesce into one notice', async () => {
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c1', visuals: 'v2' }));
    await seedAgentManagedSkills(agentRoot, release({ charts: 'c2', visuals: 'v3' }));

    const notice = await readManagedSkillChangeNotice(agentRoot);
    expect(notice?.text).toBe(managedSkillChangeText(['charts', 'visuals']));
    expect(notice?.text.match(/visuals/gu)).toHaveLength(1);
    expect(notice?.announced).toEqual({ charts: 'c2', visuals: 'v3' });
});

test('a delivered notice is consumed once', async () => {
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v2' }));
    const notice = await readManagedSkillChangeNotice(agentRoot);
    // Reading alone never consumes: a turn that fails before the model sees it retries.
    expect(await readManagedSkillChangeNotice(agentRoot)).toEqual(notice);

    await clearManagedSkillChangeNotice(agentRoot, notice ?? fail());

    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v2' }));
    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
});

test('a change landing after the notice was composed survives its clear', async () => {
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v2' }));
    const delivered = await readManagedSkillChangeNotice(agentRoot);
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v3' }));

    await clearManagedSkillChangeNotice(agentRoot, delivered ?? fail());

    expect((await readManagedSkillChangeNotice(agentRoot))?.announced).toEqual({ visuals: 'v3' });
});

test('Agent-authored and imported skills never participate', async () => {
    await mkdir(join(agentRoot, 'skills', 'sales-charts'), { recursive: true });
    await writeFile(join(agentRoot, 'skills', 'sales-charts', 'SKILL.md'), 'mine v1');
    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));
    await writeFile(join(agentRoot, 'skills', 'sales-charts', 'SKILL.md'), 'mine v2');

    await seedAgentManagedSkills(agentRoot, release({ visuals: 'v1' }));

    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
    expect(await readFile(join(agentRoot, 'skills', 'sales-charts', 'SKILL.md'), 'utf8')).toBe(
        'mine v2'
    );
});

test('the release seed records the shipped skill hashes', async () => {
    await seedAgentManagedSkills(agentRoot);

    const record = JSON.parse(
        await readFile(join(agentRoot, 'runtime', 'managed-skills.json'), 'utf8')
    );
    expect(record).toEqual({ pending: {}, seeded: factoryManagedSkillHashes() });
    expect(await readManagedSkillChangeNotice(agentRoot)).toBeNull();
});

test('the notice text is generic and points shared changes at #all', () => {
    expect(managedSkillChangeText(['visuals'])).toBe(
        '[Haus skill update: these Haus skills were updated: visuals.] Re-read each before you next use it, and rebuild any scripts, notes, memory, or recipes you derived from it. If that changed something you rely on, post one short note in #all saying what you updated; otherwise do not post.'
    );
});

function fail(): never {
    throw new Error('expected a pending notice');
}
