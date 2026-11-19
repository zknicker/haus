import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    factoryManagedSkillHashes,
    heldManagedSkillHash,
    seedFactoryManagedSkills,
} from './managed-skills.ts';

let skillsDir = '';

beforeEach(async () => {
    skillsDir = await mkdtemp(join(tmpdir(), 'haus-managed-skill-hash-'));
});

afterEach(async () => {
    await rm(skillsDir, { force: true, recursive: true });
});

test('a held skill hashes like its release until it is edited', async () => {
    expect(await heldManagedSkillHash(skillsDir, 'visuals')).toBeNull();

    await seedFactoryManagedSkills(skillsDir, ['visuals']);

    expect(await heldManagedSkillHash(skillsDir, 'visuals')).toBe(
        factoryManagedSkillHashes().visuals ?? ''
    );
    await writeFile(join(skillsDir, 'visuals', 'notes.md'), 'mine');
    expect(await heldManagedSkillHash(skillsDir, 'visuals')).not.toBe(
        factoryManagedSkillHashes().visuals ?? ''
    );
});
