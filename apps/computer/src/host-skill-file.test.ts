import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostSkillFileMaxBytes } from '@haus/api';
import { parseHostSkillFileRequest, runHostSkillFileRequest } from './host-skill-file.ts';
import { listImportableSkills } from './host-skills.ts';

let sourceRoot: string;
let outsideRoot: string;

beforeEach(async () => {
    sourceRoot = await mkdtemp(join(tmpdir(), 'haus-host-skill-file-'));
    outsideRoot = await mkdtemp(join(tmpdir(), 'haus-host-skill-outside-'));
});

afterEach(async () => {
    await rm(sourceRoot, { force: true, recursive: true });
    await rm(outsideRoot, { force: true, recursive: true });
});

test('resolves a reported source id and returns its SKILL.md', async () => {
    const content = '---\ndescription: Verify a release\n---\n\n# Release checks\n';
    await writeSkill(sourceRoot, 'release-checks', content);
    const [skill] = await listImportableSkills([sourceRoot]);

    expect(await runHostSkillFileRequest(request(skill?.id ?? ''), [sourceRoot])).toEqual({
        content,
        requestId: 'req_hostskillfile0001',
        status: 'read',
        type: 'host-skill-file-result',
    });
});

test('returns not-found for an unknown or vanished source id', async () => {
    expect(await runHostSkillFileRequest(request('hsk_unknownunknown00'), [sourceRoot])).toEqual({
        error: 'not-found',
        requestId: 'req_hostskillfile0001',
        status: 'failed',
        type: 'host-skill-file-result',
    });

    await writeSkill(sourceRoot, 'gone', '# Gone\n');
    const [skill] = await listImportableSkills([sourceRoot]);
    await rm(join(sourceRoot, 'gone'), { force: true, recursive: true });
    expect((await runHostSkillFileRequest(request(skill?.id ?? ''), [sourceRoot])).status).toBe(
        'failed'
    );
});

test('refuses a SKILL.md above the relay cap', async () => {
    await writeSkill(sourceRoot, 'huge', 'x'.repeat(hostSkillFileMaxBytes + 1));
    const [skill] = await listImportableSkills([sourceRoot]);

    expect(await runHostSkillFileRequest(request(skill?.id ?? ''), [sourceRoot])).toMatchObject({
        error: 'too-large',
        status: 'failed',
    });
});

test('only reads skills under the scanned roots, never a path from the wire', async () => {
    await writeSkill(outsideRoot, 'secret', '# Secret\n');
    const [outside] = await listImportableSkills([outsideRoot]);

    expect(parseHostSkillFileRequest({ ...request('hsk_x'), path: outsideRoot })).toBeNull();
    expect(await runHostSkillFileRequest(request(outside?.id ?? ''), [sourceRoot])).toMatchObject({
        error: 'not-found',
        status: 'failed',
    });
});

test('refuses a symlinked SKILL.md instead of following it out of the skill', async () => {
    await writeFile(join(outsideRoot, 'secret.txt'), 'secret');
    await mkdir(join(sourceRoot, 'linked'), { recursive: true });
    await symlink(join(outsideRoot, 'secret.txt'), join(sourceRoot, 'linked', 'SKILL.md'));
    const [skill] = await listImportableSkills([sourceRoot]);

    expect(await runHostSkillFileRequest(request(skill?.id ?? ''), [sourceRoot])).toMatchObject({
        error: 'unreadable',
        status: 'failed',
    });
});

function request(sourceId: string) {
    return {
        requestId: 'req_hostskillfile0001',
        sourceId,
        type: 'host-skill-file-request' as const,
    };
}

async function writeSkill(root: string, name: string, content: string) {
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, name, 'SKILL.md'), content);
}
