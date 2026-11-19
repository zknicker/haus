import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DriveMigrationError, prepareAgentDrive } from './prepare-agent-drive.ts';
import { createDriveRoutes, type DriveFault, serveDrive } from './testing/drive-server.ts';

const agentId = 'agt_driveoutcomes';
const runnerToken = 'runner-drive-outcomes';

let agentRoot: string;
let routes: ReturnType<typeof createDriveRoutes>;
let server: ReturnType<typeof serveDrive>;
let faults: Map<string, DriveFault>;
let refused: Set<string>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-drive-outcomes-'));
    faults = new Map();
    refused = new Set();
    routes = createDriveRoutes({
        agentId,
        fault: (path) => faults.get(path) ?? null,
        refuse: (path) => refused.has(path),
        runnerToken,
    });
    server = serveDrive(routes);
});
afterEach(async () => {
    server.stop(true);
    await rm(agentRoot, { force: true, recursive: true });
});

function prepare(runId: string) {
    return prepareAgentDrive({
        agentId,
        agentRoot,
        handle: 'scout',
        runId,
        runnerToken,
        seed: {
            agentDescription: 'Tracks competitor launches.',
            agentName: 'Scout',
            brief: null,
            briefAuthorHandle: null,
            factoryKind: 'ordinary',
        },
        serverOrigin: `http://127.0.0.1:${server.port}`,
    });
}

async function writeLegacy(files: Record<string, string>) {
    for (const [relative, text] of Object.entries(files)) {
        const target = join(agentRoot, 'workspace', ...relative.split('/'));
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, text);
    }
}

function area(...segments: string[]) {
    return join(agentRoot, 'workspace', 'drive', 'agents', 'scout', ...segments);
}

function driveText(path: string) {
    const held = routes.bytes.get(path);
    return held ? new TextDecoder().decode(held) : null;
}

async function receipt() {
    return JSON.parse(await readFile(join(agentRoot, 'runtime', 'drive-seed.json'), 'utf8'));
}

test('a reservation that failed in one run does not block the next run', async () => {
    await writeLegacy({ 'MEMORY.md': '# Scout\n', 'notes/leads.md': 'Acme\n' });
    faults.set('agents/scout/notes/leads.md', 'failed-reservation');

    await expect(prepare('run_a')).rejects.toBeInstanceOf(DriveMigrationError);
    await expect(prepare('run_a')).rejects.toBeInstanceOf(DriveMigrationError);
    expect(await readFile(join(agentRoot, 'workspace', 'notes', 'leads.md'), 'utf8')).toBe(
        'Acme\n'
    );
    faults.clear();

    await prepare('run_b');

    expect(driveText('agents/scout/notes/leads.md')).toBe('Acme\n');
    expect(await readFile(area('notes', 'leads.md'), 'utf8')).toBe('Acme\n');
    expect(await readFile(area('MEMORY.md'), 'utf8')).toBe('# Scout\n');
    await expect(stat(join(agentRoot, 'workspace', 'notes', 'leads.md'))).rejects.toThrow();
    expect((await receipt()).version).toBe(1);
});

test('an answer lost in one run converges in the next with one revision and no copy', async () => {
    await writeLegacy({ 'MEMORY.md': '# Scout\n' });
    faults.set('agents/scout/MEMORY.md', 'lost-answer');

    await expect(prepare('run_a')).rejects.toBeInstanceOf(DriveMigrationError);
    faults.clear();
    await prepare('run_b');

    expect([...routes.heads.keys()]).toEqual(['agents/scout/MEMORY.md']);
    expect(routes.revisionCount()).toBe(1);
    expect(await readFile(area('MEMORY.md'), 'utf8')).toBe('# Scout\n');
    await expect(stat(join(agentRoot, 'workspace', 'MEMORY.md'))).rejects.toThrow();
});

test('a revision deleted after a lost answer is uploaded again by the next run', async () => {
    await writeLegacy({ 'MEMORY.md': '# Scout\n', 'notes/leads.md': 'Acme\n' });
    faults.set('agents/scout/notes/leads.md', 'lost-answer');

    await expect(prepare('run_a')).rejects.toBeInstanceOf(DriveMigrationError);
    faults.clear();
    routes.remove('agents/scout/notes/leads.md');
    await prepare('run_b');

    expect(driveText('agents/scout/notes/leads.md')).toBe('Acme\n');
    expect(await readFile(area('notes', 'leads.md'), 'utf8')).toBe('Acme\n');
});

test('a legacy file over a different Drive head keeps both as a conflict copy', async () => {
    routes.put('agents/scout/notes/leads.md', 'Drive head\n');
    routes.put('agents/scout/notes/plan.md', 'Drive plan\n');
    routes.put('agents/scout/notes/plan.conflict-scout.md', 'An older copy\n');
    await writeLegacy({
        'MEMORY.md': '# Scout\n',
        'notes/leads.md': 'Acme\n',
        'notes/plan.md': 'Ship Friday\n',
    });

    await prepare('run_a');

    expect(driveText('agents/scout/notes/leads.md')).toBe('Drive head\n');
    expect(driveText('agents/scout/notes/leads.conflict-scout.md')).toBe('Acme\n');
    expect(driveText('agents/scout/notes/plan.md')).toBe('Drive plan\n');
    expect(driveText('agents/scout/notes/plan.conflict-scout.md')).toBe('An older copy\n');
    expect(driveText('agents/scout/notes/plan.conflict-scout-2.md')).toBe('Ship Friday\n');
    expect(await readFile(area('notes', 'leads.conflict-scout.md'), 'utf8')).toBe('Acme\n');
    expect(await readFile(area('notes', 'plan.conflict-scout-2.md'), 'utf8')).toBe('Ship Friday\n');
    await expect(stat(area('notes', 'leads.md'))).rejects.toThrow();
    await expect(stat(area('notes', 'plan.md'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'workspace', 'notes'))).rejects.toThrow();
    expect((await receipt()).conflicts).toEqual([
        {
            copy: 'agents/scout/notes/leads.conflict-scout.md',
            path: 'agents/scout/notes/leads.md',
        },
        {
            copy: 'agents/scout/notes/plan.conflict-scout-2.md',
            path: 'agents/scout/notes/plan.md',
        },
    ]);
});

test('a refused legacy file moves to drive-refused and the migration completes', async () => {
    await writeLegacy({ 'MEMORY.md': '# Scout\n', 'notes/leads.md': 'Acme\n' });
    refused.add('agents/scout/notes/leads.md');

    await prepare('run_a');

    expect(
        await readFile(
            join(agentRoot, 'workspace', 'drive-refused', 'agents', 'scout', 'notes', 'leads.md'),
            'utf8'
        )
    ).toBe('Acme\n');
    expect(routes.heads.has('agents/scout/notes/leads.md')).toBe(false);
    expect(await readFile(area('MEMORY.md'), 'utf8')).toBe('# Scout\n');
    await expect(stat(join(agentRoot, 'workspace', 'notes'))).rejects.toThrow();
    expect((await receipt()).refused).toEqual([
        {
            location: 'workspace/drive-refused/agents/scout/notes/leads.md',
            path: 'agents/scout/notes/leads.md',
            reason: 'FORBIDDEN Writing agents/scout/notes/leads.md is not allowed.',
        },
    ]);
});
