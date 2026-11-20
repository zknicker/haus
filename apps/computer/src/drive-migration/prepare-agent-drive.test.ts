import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentSeedConfiguration } from '../agent-configuration.ts';
import { agentDrive } from '../drive/agent-drive.ts';
import { resolveEntries } from './drive-outcomes.ts';
import { legacyEntries } from './drive-sources.ts';
import { DriveMigrationError, prepareAgentDrive } from './prepare-agent-drive.ts';
import { createDriveRoutes, serveDrive } from './testing/drive-server.ts';

const agentId = 'agt_drivemigrate';
const runnerToken = 'runner-drive';
const seed: AgentSeedConfiguration = {
    agentDescription: 'Tracks competitor launches.',
    agentName: 'Scout',
    brief: null,
    briefAuthorHandle: null,
};
const memory = '# Scout\n\n## Active Context\n\n- Bluebird launch on Friday.\n';

let agentRoot: string;
let routes: ReturnType<typeof createDriveRoutes>;
let server: ReturnType<typeof serveDrive>;
let failing: string | null;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-drive-migration-'));
    failing = null;
    routes = createDriveRoutes({
        agentId,
        fault: (path) => (path === failing ? 'failed-reservation' : null),
        runnerToken,
    });
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
        runId: 'run_prepare',
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
    const firstOutcomes = await resolveEntries(await legacyEntries(agentRoot, drive), 'scout', {
        agentId,
        runId: 'run_crashed',
        runnerToken,
        serverOrigin: `http://127.0.0.1:${server.port}`,
    });
    const revisionsAfterCrash = routes.revisionCount();

    const result = await prepare();

    expect(routes.revisionCount()).toBe(revisionsAfterCrash);
    const firstMemory = firstOutcomes.find((outcome) => outcome.entry.sha256 === digest(memory));
    expect(result.memory?.revisionId).toBe(
        firstMemory?.kind === 'stored' ? firstMemory.revisionId : ''
    );
    expect(await readFile(drive.memory, 'utf8')).toBe(memory);
    await expect(stat(join(agentRoot, 'workspace', 'MEMORY.md'))).rejects.toThrow();
});

test('a Drive outage leaves every legacy file in place and fails', async () => {
    await writeLegacyWorkspace();
    failing = 'agents/scout/notes/clients/acme.md';

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

test('legacy notes without a MEMORY.md move and the seed fills MEMORY.md', async () => {
    await mkdir(join(agentRoot, 'workspace', 'notes'), { recursive: true });
    await writeFile(join(agentRoot, 'workspace', 'notes', 'tabs.md'), 'Tab strip polish.\n');

    const result = await prepare();

    const seeded = await readFile(result.drive.memory, 'utf8');
    expect(seeded).toContain('# Scout\n\n## Role\n\nTracks competitor launches.\n');
    expect(routes.bytes.get('agents/scout/MEMORY.md')).toEqual(new TextEncoder().encode(seeded));
    expect(new TextDecoder().decode(routes.bytes.get('agents/scout/notes/tabs.md'))).toBe(
        'Tab strip polish.\n'
    );
    expect(result.memory?.before).toBe(digest(seeded));
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

test('a former onboarding Agent is seeded like any Agent, with no onboarding notes', async () => {
    const result = await prepare({ agentDescription: 'Onboarding Assistant', agentName: 'Harbor' });

    expect((await readdir(result.drive.area)).sort()).toEqual(['MEMORY.md', 'skills']);
    expect(await readFile(result.drive.memory, 'utf8')).toContain(
        '# Harbor\n\n## Role\n\nOnboarding Assistant\n'
    );
});

test('the launch seed renders the standing brief its creator wrote', async () => {
    const result = await prepare({
        brief: 'Own competitor intel. Post a Friday digest in #product.',
        briefAuthorHandle: 'harbor',
    });

    const seeded = await readFile(result.drive.memory, 'utf8');
    expect(seeded).toContain(
        '## Standing brief from @harbor\n\nOwn competitor intel. Post a Friday digest in #product.\n'
    );
    expect(seeded).not.toContain('self-introduction');
});
