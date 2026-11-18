import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    acceptHostSkillImport,
    finishHostSkillImport,
    importHostSkill,
    listAgentSkillImportReports,
    listAgentSkillReports,
    listImportableSkills,
} from './host-skills.ts';

let dataRoot: string;
let sourceRoot: string;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-host-skills-'));
    sourceRoot = await mkdtemp(join(tmpdir(), 'haus-host-sources-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
    await rm(sourceRoot, { force: true, recursive: true });
});

test('reports metadata only and imports an independent Agent copy', async () => {
    const source = join(sourceRoot, 'release-checks');
    await mkdir(join(source, 'scripts'), { recursive: true });
    await writeFile(
        join(source, 'SKILL.md'),
        '---\ndescription: Verify a release\n---\n\n# Release checks\n'
    );
    await writeFile(join(source, 'scripts', 'check.sh'), '#!/bin/zsh\nexit 0\n', {
        mode: 0o700,
    });

    const [available] = await listImportableSkills([sourceRoot]);
    expect(available).toMatchObject({
        description: 'Verify a release',
        name: 'release-checks',
    });
    expect(JSON.stringify(available)).not.toContain('exit 0');

    const imported = await importHostSkill({
        agentId: 'agt_hostskillsxxxxxx',
        dataRoot,
        roots: [sourceRoot],
        serverId: 'srv_hostskills',
        sourceId: available?.id ?? '',
    });
    expect(imported).toMatchObject({
        description: 'Verify a release',
        name: 'release-checks',
    });

    await writeFile(join(source, 'SKILL.md'), '# Changed source');
    expect(
        await readFile(
            join(
                dataRoot,
                'servers',
                'srv_hostskills',
                'agents',
                'agt_hostskillsxxxxxx',
                'skills',
                'release-checks',
                'SKILL.md'
            ),
            'utf8'
        )
    ).toContain('Verify a release');
    expect(await listAgentSkillReports(dataRoot, 'srv_hostskills')).toEqual([
        { agentId: 'agt_hostskillsxxxxxx', skills: [imported] },
    ]);
});

test('dedupes symlinked sources and never imports symlinks from a bundle', async () => {
    const source = join(sourceRoot, 'safe');
    const otherRoot = await mkdtemp(join(tmpdir(), 'haus-host-sources-link-'));
    await mkdir(source);
    await writeFile(join(source, 'SKILL.md'), '# Safe');
    await symlink('/tmp', join(source, 'escape'));
    await symlink(source, join(otherRoot, 'safe'));

    expect(await listImportableSkills([sourceRoot, otherRoot])).toHaveLength(1);
    const [available] = await listImportableSkills([sourceRoot]);
    await importHostSkill({
        agentId: 'agt_hostskillsxxxxxx',
        dataRoot,
        roots: [sourceRoot],
        serverId: 'srv_hostskills',
        sourceId: available?.id ?? '',
    });
    await expect(
        readFile(
            join(
                dataRoot,
                'servers',
                'srv_hostskills',
                'agents',
                'agt_hostskillsxxxxxx',
                'skills',
                'safe',
                'escape'
            )
        )
    ).rejects.toThrow();
    await rm(otherRoot, { force: true, recursive: true });
});

test('dedupes same-name sources by root precedence', async () => {
    const preferred = join(sourceRoot, 'decision-helper');
    const fallbackRoot = await mkdtemp(join(tmpdir(), 'haus-host-sources-fallback-'));
    const fallback = join(fallbackRoot, 'decision-helper');
    await mkdir(preferred);
    await mkdir(fallback);
    await writeFile(join(preferred, 'SKILL.md'), '---\ndescription: Preferred\n---\n');
    await writeFile(join(fallback, 'SKILL.md'), '---\ndescription: Fallback\n---\n');

    expect(await listImportableSkills([sourceRoot, fallbackRoot])).toEqual([
        expect.objectContaining({ description: 'Preferred', name: 'decision-helper' }),
    ]);

    await rm(fallbackRoot, { force: true, recursive: true });
});

test('parses YAML frontmatter and copies binary support files byte-for-byte', async () => {
    const source = join(sourceRoot, 'binary-safe');
    await mkdir(join(source, 'assets'), { recursive: true });
    await writeFile(
        join(source, 'SKILL.md'),
        '---\ndescription: >-\n  Verify releases\n  without shortcuts\n---\n\n# Ignored heading\n'
    );
    const bytes = Uint8Array.from([0, 255, 12, 128, 1]);
    await writeFile(join(source, 'assets', 'fixture.bin'), bytes);

    const [available] = await listImportableSkills([sourceRoot]);
    expect(available?.description).toBe('Verify releases without shortcuts');
    await importHostSkill({
        agentId: 'agt_hostskillsxxxxxx',
        dataRoot,
        roots: [sourceRoot],
        serverId: 'srv_hostskills',
        sourceId: available?.id ?? '',
    });
    const copied = await readFile(
        join(
            dataRoot,
            'servers',
            'srv_hostskills',
            'agents',
            'agt_hostskillsxxxxxx',
            'skills',
            'binary-safe',
            'assets',
            'fixture.bin'
        )
    );
    expect(copied.equals(Buffer.from(bytes))).toBe(true);
});

test('rejects a bundle before copying when its byte budget is exceeded', async () => {
    const source = join(sourceRoot, 'too-large');
    await mkdir(join(source, 'assets'), { recursive: true });
    await writeFile(join(source, 'SKILL.md'), '# Too large');
    await writeFile(join(source, 'assets', 'large.bin'), new Uint8Array(2 * 1024 * 1024 + 1));
    const [available] = await listImportableSkills([sourceRoot]);

    await expect(
        importHostSkill({
            agentId: 'agt_hostskillsxxxxxx',
            dataRoot,
            roots: [sourceRoot],
            serverId: 'srv_hostskills',
            sourceId: available?.id ?? '',
        })
    ).rejects.toThrow('exceeds');
    await expect(
        readFile(
            join(
                dataRoot,
                'servers',
                'srv_hostskills',
                'agents',
                'agt_hostskillsxxxxxx',
                'skills',
                'too-large',
                'SKILL.md'
            )
        )
    ).rejects.toThrow();
});

test('persists accepted and applied import states idempotently', async () => {
    const command = {
        agentId: 'agt_hostskillsxxxxxx',
        requestId: 'req_hostskillsxxxxxx',
        sourceId: 'hsk_hostskillsxxxxxx',
        type: 'agent-skill-import' as const,
    };
    const accepted = await acceptHostSkillImport({
        command,
        dataRoot,
        serverId: 'srv_hostskills',
    });
    expect(accepted.status).toBe('accepted');
    expect(await acceptHostSkillImport({ command, dataRoot, serverId: 'srv_hostskills' })).toEqual(
        accepted
    );

    const applied = await finishHostSkillImport({
        dataRoot,
        record: {
            agentId: command.agentId,
            requestId: command.requestId,
            skill: {
                description: 'Release checks',
                hash: 'a'.repeat(64),
                modifiedAt: '2026-07-27T00:00:00.000Z',
                name: 'release-checks',
            },
            sourceId: command.sourceId,
            status: 'applied',
        },
        serverId: 'srv_hostskills',
    });
    expect(await listAgentSkillImportReports(dataRoot, 'srv_hostskills')).toEqual([applied]);
});
