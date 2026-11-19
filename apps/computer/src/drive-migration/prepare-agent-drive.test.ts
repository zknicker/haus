import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentSeedConfiguration } from '../agent-configuration.ts';
import { agentDrive } from '../drive/agent-drive.ts';
import { legacyEntries } from './drive-sources.ts';
import { uploadEntries } from './drive-upload.ts';
import { DriveMigrationError, prepareAgentDrive } from './prepare-agent-drive.ts';
import { createDriveRoutes, serveDrive } from './testing/drive-server.ts';

const agentId = 'agt_drivemigrate';
const runnerToken = 'runner-drive';
const seed: AgentSeedConfiguration = {
    agentDescription: 'Tracks competitor launches.',
    agentName: 'Scout',
    brief: null,
    briefAuthorHandle: null,
    factoryKind: 'ordinary',
};
const memory = '# Scout\n\n## Active Context\n\n- Bluebird launch on Friday.\n';

let agentRoot: string;
let routes: ReturnType<typeof createDriveRoutes>;
let server: ReturnType<typeof serveDrive>;
let refused: string | null;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-drive-migration-'));
    refused = null;
    routes = createDriveRoutes({ agentId, refuse: (path) => path === refused, runnerToken });
    server = serveDrive(routes);
});
afterEach(async () => {
    server.stop(true);
    await rm(agentRoot, { force: true, recursive: true });
});

function prepare(input: Partial<AgentSeedConfiguration> = {}) {
    return prepareAgentDrive({
        agentId,
        agentRoot,
        handle: 'scout',
        runnerToken,
        seed: { ...seed, ...input },
        serverOrigin: `http://127.0.0.1:${server.port}`,
    });
}

async function writeLegacyWorkspace() {
    const workspace = join(agentRoot, 'workspace');
    await mkdir(join(workspace, 'notes', 'clients'), { recursive: true });
    await mkdir(join(workspace, 'notes', 'node_modules'), { recursive: true });
    await mkdir(join(workspace, 'pages'), { recursive: true });
    await mkdir(join(agentRoot, 'skills', 'digest'), { recursive: true });
    await writeFile(join(workspace, 'MEMORY.md'), memory);
    await writeFile(join(workspace, 'notes', 'channels.md'), '#product is launches.\n');
    await writeFile(join(workspace, 'notes', 'clients', 'acme.md'), 'Acme wants weekly.\n');
    await writeFile(join(workspace, 'notes', '.DS_Store'), 'finder');
    await writeFile(join(workspace, 'notes', 'node_modules', 'dep.js'), 'skip');
    await symlink(join(workspace, 'MEMORY.md'), join(workspace, 'notes', 'memory-link.md'));
    await writeFile(join(workspace, 'pages', 'launch.html'), '<h1>Launch</h1>');
    await writeFile(join(workspace, 'scratch.py'), 'print(1)\n');
    await writeFile(join(agentRoot, 'skills', 'digest', 'SKILL.md'), 'name: digest\n');
    await writeFile(join(agentRoot, 'skills', '.ai-sdk-harness-skills.json'), '{}');
}

function digest(text: string) {
    return createHash('sha256').update(text).digest('hex');
}

test('legacy memory, notes, pages and skills move into Drive and the folder', async () => {
    await writeLegacyWorkspace();

    const result = await prepare();

    const area = join(agentRoot, 'workspace', 'drive', 'agents', 'scout');
    expect([...routes.heads.keys()].sort()).toEqual([
        'agents/scout/MEMORY.md',
        'agents/scout/notes/channels.md',
        'agents/scout/notes/clients/acme.md',
        'agents/scout/pages/launch.html',
        'agents/scout/skills/digest/SKILL.md',
    ]);
    expect(await readFile(join(area, 'MEMORY.md'), 'utf8')).toBe(memory);
    expect(await readFile(join(area, 'notes', 'clients', 'acme.md'), 'utf8')).toBe(
        'Acme wants weekly.\n'
    );
    expect(await readFile(join(area, 'skills', 'digest', 'SKILL.md'), 'utf8')).toBe(
        'name: digest\n'
    );
    expect((await stat(join(area, 'MEMORY.md'))).mode & 0o777).toBe(0o644);
    expect(result.memory).toEqual({
        after: digest(memory),
        before: digest(memory),
        revisionId: routes.heads.get('agents/scout/MEMORY.md')?.revision_id ?? '',
    });
    expect((await readdir(join(agentRoot, 'workspace'))).sort()).toEqual([
        'drive',
        'notes',
        'scratch.py',
    ]);
    expect((await readdir(join(agentRoot, 'workspace', 'notes'))).sort()).toEqual([
        '.DS_Store',
        'memory-link.md',
        'node_modules',
    ]);
    await expect(stat(join(agentRoot, 'skills'))).rejects.toThrow();
    expect(
        JSON.parse(await readFile(join(agentRoot, 'runtime', 'drive-seed.json'), 'utf8')).memory
    ).toEqual(result.memory);
});

test('a rerun after a crash before placement converges on the first revisions', async () => {
    await writeLegacyWorkspace();
    const drive = agentDrive(agentRoot, 'scout');
    const firstUploads = await uploadEntries(await legacyEntries(agentRoot, drive), {
        agentId,
        runnerToken,
        serverOrigin: `http://127.0.0.1:${server.port}`,
    });
    const revisionsAfterCrash = routes.revisionCount();

    const result = await prepare();

    expect(routes.revisionCount()).toBe(revisionsAfterCrash);
    expect(result.memory?.revisionId).toBe(
        firstUploads.find((upload) => upload.sha256 === digest(memory))?.revisionId ?? ''
    );
    expect(await readFile(drive.memory, 'utf8')).toBe(memory);
    await expect(stat(join(agentRoot, 'workspace', 'MEMORY.md'))).rejects.toThrow();
});

test('a Drive refusal leaves every legacy file in place and fails', async () => {
    await writeLegacyWorkspace();
    refused = 'agents/scout/notes/clients/acme.md';

    await expect(prepare()).rejects.toBeInstanceOf(DriveMigrationError);

    expect(await readFile(join(agentRoot, 'workspace', 'MEMORY.md'), 'utf8')).toBe(memory);
    expect(await readFile(join(agentRoot, 'workspace', 'notes', 'channels.md'), 'utf8')).toBe(
        '#product is launches.\n'
    );
    expect(await readFile(join(agentRoot, 'skills', 'digest', 'SKILL.md'), 'utf8')).toBe(
        'name: digest\n'
    );
    await expect(stat(join(agentRoot, 'workspace', 'drive', 'agents'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'drive-seed.json'))).rejects.toThrow();
});

test('a fresh Agent is seeded into Drive and its folder once', async () => {
    const first = await prepare();

    const area = join(agentRoot, 'workspace', 'drive', 'agents', 'scout');
    const seeded = await readFile(join(area, 'MEMORY.md'), 'utf8');
    expect(seeded).toContain('# Scout\n\n## Role\n\nTracks competitor launches.\n');
    expect(routes.bytes.get('agents/scout/MEMORY.md')).toEqual(new TextEncoder().encode(seeded));
    expect(await readFile(join(area, 'skills', 'visuals', 'SKILL.md'), 'utf8')).toContain(
        'name: visuals'
    );
    expect(routes.heads.has('agents/scout/skills/visuals/SKILL.md')).toBe(true);
    expect(first.memory?.before).toBe(digest(seeded));
    const revisions = routes.revisionCount();

    await rm(join(agentRoot, 'runtime', 'drive-seed.json'));
    await prepare({ agentDescription: 'A different role.' });

    expect(routes.revisionCount()).toBe(revisions);
    expect(await readFile(join(area, 'MEMORY.md'), 'utf8')).toBe(seeded);
});

test('a seed never overwrites a Drive file someone else already wrote', async () => {
    routes.put('agents/scout/MEMORY.md', '# Scout\n\nWritten by a person.\n');

    const result = await prepare();

    expect(new TextDecoder().decode(routes.bytes.get('agents/scout/MEMORY.md'))).toBe(
        '# Scout\n\nWritten by a person.\n'
    );
    await expect(stat(result.drive.memory)).rejects.toThrow();
    expect(await readFile(join(result.drive.skills, 'visuals', 'SKILL.md'), 'utf8')).toContain(
        'name: visuals'
    );
});

test('Cove is seeded with its four onboarding files', async () => {
    const result = await prepare({ agentName: 'Cove', factoryKind: 'cove' });

    expect((await readdir(result.drive.area)).sort()).toEqual(['MEMORY.md', 'notes', 'skills']);
    expect((await readdir(join(result.drive.area, 'notes'))).sort()).toEqual([
        'onboarding_knowledge_faq.md',
        'onboarding_objectives.md',
        'onboarding_playbook.md',
    ]);
});

test('the launch seed renders the standing brief its creator wrote', async () => {
    const result = await prepare({
        brief: 'Own competitor intel. Post a Friday digest in #product.',
        briefAuthorHandle: 'cove',
    });

    const seeded = await readFile(result.drive.memory, 'utf8');
    expect(seeded).toContain(
        '## Standing brief from @cove\n\nOwn competitor intel. Post a Friday digest in #product.\n'
    );
    expect(seeded).not.toContain('self-introduction');
});
