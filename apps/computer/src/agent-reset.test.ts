import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { visualsSkillFiles } from '@haus/agent-workspace';
import { parseResetCommand } from './agent-command-frames.ts';
import { resetAgentState } from './agent-reset.ts';
import { prepareAgentDrive } from './drive-migration/prepare-agent-drive.ts';
import { createDriveRoutes, serveDrive } from './drive-migration/testing/drive-server.ts';
import { agentDrive } from './drive/agent-drive.ts';
import { removeTree } from './workers/computer/remove-tree.ts';

const agentId = 'agt_resetxxxxxxxxxxx';
const memory = '# Durable memory\n\nBluebird remains active.\n';

let dataRoot: string;
beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-reset-'));
});
afterEach(async () => {
    await removeTree(dataRoot);
});

test('a reset command parses only the two reset kinds', () => {
    expect(
        parseResetCommand({
            agentId: 'agt_reset',
            kind: 'full',
            sessionGeneration: 2,
            type: 'agent-reset',
        })
    ).toEqual({
        agentId: 'agt_reset',
        kind: 'full',
        sessionGeneration: 2,
        type: 'agent-reset',
    });
    expect(
        parseResetCommand({
            agentId: 'agt_reset',
            kind: 'unknown',
            sessionGeneration: 2,
            type: 'agent-reset',
        })
    ).toBe(null);
});

test('full reset clears the Drive folder and the next launch seeds the factory area', async () => {
    const { agentRoot, configurationJson, drive } = await seedResetFixture();

    await resetAgentState({ agentId, dataRoot, serverId: 'srv_reset' });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'home'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'workspace', 'kept.txt'))).rejects.toThrow();
    await expect(stat(drive.folder)).rejects.toThrow();
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);

    const routes = createDriveRoutes({ agentId, runnerToken: 'runner-reset' });
    const server = serveDrive(routes);
    try {
        await prepareAgentDrive({
            agentId,
            agentRoot,
            handle: 'scout',
            runId: 'run_after_reset',
            runnerToken: 'runner-reset',
            seed: {
                agentDescription: 'Onboarding guide',
                agentName: 'Scout',
                brief: null,
                briefAuthorHandle: null,
            },
            serverOrigin: `http://127.0.0.1:${server.port}`,
        });
    } finally {
        server.stop(true);
    }

    expect([...routes.heads.keys()].sort()).toEqual(
        [
            'agents/scout/MEMORY.md',
            'agents/scout/skills/visuals/SKILL.md',
            ...Object.keys(visualsSkillFiles).map((path) => `agents/scout/skills/visuals/${path}`),
        ].sort()
    );
    const seeded = await readFile(drive.memory, 'utf8');
    expect(seeded.startsWith('# Scout\n\n## Role\n\nOnboarding guide\n')).toBe(true);
    await expect(stat(join(drive.skills, 'custom-skill'))).rejects.toThrow();
});

test('full reset of an unmigrated Agent keeps every legacy source for the next launch', async () => {
    const { agentRoot } = await seedResetFixture();
    await rm(join(agentRoot, 'runtime', 'drive-seed.json'));
    await rm(join(agentRoot, 'workspace', 'drive'), { recursive: true });
    const legacy = {
        'skills/digest/SKILL.md': 'name: digest\n',
        'workspace/MEMORY.md': memory,
        'workspace/drive-refused/agents/scout/notes/big.bin': 'refused bytes',
        'workspace/notes/leads.md': 'Acme\n',
        'workspace/pages/launch.html': '<h1>Launch</h1>',
        'workspace/workbench/pricing.html': '<h1>Pricing</h1>',
    };
    for (const [relative, text] of Object.entries(legacy)) {
        await mkdir(dirname(join(agentRoot, relative)), { recursive: true });
        await writeFile(join(agentRoot, relative), text);
    }

    await resetAgentState({ agentId, dataRoot, serverId: 'srv_reset' });

    for (const [relative, text] of Object.entries(legacy)) {
        expect(await readFile(join(agentRoot, relative), 'utf8')).toBe(text);
    }
    await expect(stat(join(agentRoot, 'workspace', 'kept.txt'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();

    const routes = createDriveRoutes({ agentId, runnerToken: 'runner-reset' });
    const server = serveDrive(routes);
    try {
        await prepareAgentDrive({
            agentId,
            agentRoot,
            handle: 'scout',
            runId: 'run_after_reset',
            runnerToken: 'runner-reset',
            seed: {
                agentDescription: 'Onboarding guide',
                agentName: 'Scout',
                brief: null,
                briefAuthorHandle: null,
            },
            serverOrigin: `http://127.0.0.1:${server.port}`,
        });
    } finally {
        server.stop(true);
    }

    expect([...routes.heads.keys()].sort()).toEqual([
        'agents/scout/MEMORY.md',
        'agents/scout/notes/leads.md',
        'agents/scout/pages/launch.html',
        'agents/scout/skills/digest/SKILL.md',
        'agents/scout/workbench/pricing.html',
    ]);
    expect(await readFile(agentDrive(agentRoot, 'scout').memory, 'utf8')).toBe(memory);
    expect(
        await readFile(
            join(agentRoot, 'workspace', 'drive-refused', 'agents', 'scout', 'notes', 'big.bin'),
            'utf8'
        )
    ).toBe('refused bytes');
});

test("full reset removes other Agents' read-only folders and the folder's bookkeeping", async () => {
    const { agentRoot, drive } = await seedResetFixture();
    const peer = join(drive.folder, 'agents', 'peer', 'notes');
    await mkdir(peer, { recursive: true });
    await mkdir(join(drive.folder, 'haus'), { recursive: true });
    await writeFile(join(peer, 'brief.md'), 'peer\n');
    await writeFile(join(drive.folder, 'haus', 'AGENTS.md'), 'rules\n');
    await chmod(join(peer, 'brief.md'), 0o444);
    await chmod(peer, 0o555);
    await chmod(join(drive.folder, 'agents', 'peer'), 0o555);
    const stateFile = join(agentRoot, 'runtime', 'drive.json');
    await writeFile(stateFile, '{"files":{"haus/AGENTS.md":{}}}\n');

    await resetAgentState({ agentId, dataRoot, serverId: 'srv_reset' });

    await expect(stat(drive.folder)).rejects.toThrow();
    await expect(stat(stateFile)).rejects.toThrow();
});

async function seedResetFixture() {
    const agentRoot = join(dataRoot, 'servers', 'srv_reset', 'agents', agentId);
    const configurationJson = '{"agentId":"agt_resetxxxxxxxxxxx"}\n';
    await mkdir(agentRoot, { recursive: true });
    await writeFile(join(agentRoot, 'configuration.json'), configurationJson);
    const drive = agentDrive(agentRoot, 'scout');
    await Promise.all(
        [
            'home',
            join('runtime', 'inbox'),
            '.agent-runs',
            join('workspace', 'drive', 'agents', 'scout', 'skills', 'custom-skill'),
        ].map((dir) => mkdir(join(agentRoot, dir), { recursive: true }))
    );
    await Promise.all([
        writeFile(
            join(agentRoot, 'session.json'),
            JSON.stringify({
                effectiveModel: { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
                generation: 1,
                resumeState: { runtime: 'codex', threadId: 'native-reset-session', version: 1 },
                runtimeSessionId: 'harness-reset-session',
            })
        ),
        writeFile(join(agentRoot, '.agent-runs', 'old-run'), 'state'),
        writeFile(join(agentRoot, 'runtime', 'inbox', 'pending.json'), '[]'),
        writeFile(join(agentRoot, 'runtime', 'pending-notice.json'), '{"notice":"pending"}'),
        writeFile(join(agentRoot, 'runtime', 'drive-seed.json'), '{"version":1}\n'),
        writeFile(drive.memory, memory),
        writeFile(join(agentRoot, 'workspace', 'kept.txt'), 'kept'),
        writeFile(join(drive.skills, 'custom-skill', 'SKILL.md'), 'name: custom-skill\n'),
    ]);
    return { agentRoot, configurationJson, drive };
}
