import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listWorkspaceFiles, readWorkspaceFile } from './workspace-files.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('ports Runtime workspace browsing while confining Computer-local reads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-workspace-'));
    roots.push(root);
    const workspace = join(root, 'workspace');
    const outside = join(root, 'outside.md');
    await mkdir(join(workspace, 'notes'), { recursive: true });
    await mkdir(join(workspace, '.drafts'), { recursive: true });
    await mkdir(join(workspace, '.git'), { recursive: true });
    await mkdir(join(workspace, '.ssh'), { recursive: true });
    await mkdir(join(workspace, 'node_modules'), { recursive: true });
    await Promise.all([
        writeFile(join(workspace, 'MEMORY.md'), '# Memory'),
        writeFile(join(workspace, '.env'), 'TOKEN=secret'),
        writeFile(join(workspace, '.drafts', 'plan.md'), '# Plan'),
        writeFile(join(workspace, '.git', 'config'), 'credential=secret'),
        writeFile(join(workspace, '.ssh', 'id_rsa'), 'private-key'),
        writeFile(join(workspace, 'notes', 'today.md'), 'Today'),
        writeFile(outside, 'outside'),
    ]);
    await symlink(outside, join(workspace, 'escape.md'));
    const canonicalWorkspace = await realpath(workspace);

    const listed = await listWorkspaceFiles(canonicalWorkspace, '');
    expect(listed.entries.map((entry) => entry.name)).toEqual(['notes', 'MEMORY.md']);
    const hidden = await listWorkspaceFiles(canonicalWorkspace, '', true);
    expect(hidden.entries.map((entry) => entry.name)).toEqual(['.drafts', 'notes', 'MEMORY.md']);
    expect(
        (await listWorkspaceFiles(canonicalWorkspace, '.drafts', true)).entries.map(
            (entry) => entry.path
        )
    ).toEqual(['.drafts/plan.md']);
    await expect(listWorkspaceFiles(canonicalWorkspace, '.drafts')).rejects.toThrow(
        'not browseable'
    );
    await expect(listWorkspaceFiles(canonicalWorkspace, '.git', true)).rejects.toThrow(
        'not browseable'
    );
    await expect(
        readWorkspaceFile(canonicalWorkspace, '.drafts/plan.md', true)
    ).resolves.toMatchObject({ content: '# Plan' });
    expect((await readWorkspaceFile(canonicalWorkspace, 'MEMORY.md')).content).toBe('# Memory');
    await expect(readWorkspaceFile(canonicalWorkspace, '.env')).rejects.toThrow(
        'blocked because it may contain secrets'
    );
    await expect(readWorkspaceFile(canonicalWorkspace, 'escape.md')).rejects.toThrow(
        'must stay inside the workspace'
    );
    await expect(readWorkspaceFile(canonicalWorkspace, '../outside.md')).rejects.toThrow(
        'must stay inside the workspace'
    );
});
