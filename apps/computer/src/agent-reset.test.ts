import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResetCommand } from './agent-command-frames.ts';
import { applyAgentConfiguration, parseAgentConfigureCommand } from './agent-configuration.ts';
import { resetAgentState } from './agent-reset.ts';
import { prepareAgentDrive } from './drive-migration/prepare-agent-drive.ts';
import { createDriveRoutes, serveDrive } from './drive-migration/testing/drive-server.ts';
import { agentDrive } from './drive/agent-drive.ts';

const agentId = 'agt_resetxxxxxxxxxxx';
const memory = '# Durable memory\n\nBluebird remains active.\n';

let dataRoot: string;
beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-reset-'));
});
afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('session reset rotates harness context while preserving Agent-owned state', async () => {
    const { agentRoot, configurationJson, drive } = await seedResetFixture();

    expect(
        parseResetCommand({
            agentId: 'agt_reset',
            kind: 'session',
            sessionGeneration: 2,
            type: 'agent-reset',
        })
    ).toEqual({
        agentId: 'agt_reset',
        kind: 'session',
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

    await resetAgentState({ agentId, dataRoot, kind: 'session', serverId: 'srv_reset' });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'inbox'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'pending-notice.json'))).rejects.toThrow();
    expect(await readFile(drive.memory, 'utf8')).toBe(memory);
    expect(await readFile(join(agentRoot, 'workspace', 'kept.txt'), 'utf8')).toBe('kept');
    expect(await readFile(join(drive.skills, 'custom-skill', 'SKILL.md'), 'utf8')).toBe(
        'name: custom-skill\n'
    );
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);
});

test('full reset keeps Drive and the next launch reseeds nothing over it', async () => {
    const { agentRoot, configurationJson, drive } = await seedResetFixture();

    await resetAgentState({ agentId, dataRoot, kind: 'full', serverId: 'srv_reset' });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'home'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'workspace', 'kept.txt'))).rejects.toThrow();
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);
    expect(await readFile(drive.memory, 'utf8')).toBe(memory);
    expect(await readFile(join(drive.skills, 'custom-skill', 'SKILL.md'), 'utf8')).toBe(
        'name: custom-skill\n'
    );

    const routes = createDriveRoutes({ agentId, runnerToken: 'runner-reset' });
    routes.put('agents/scout/MEMORY.md', memory);
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
                factoryKind: 'ordinary',
            },
            serverOrigin: `http://127.0.0.1:${server.port}`,
        });
    } finally {
        server.stop(true);
    }

    expect(routes.revisionCount()).toBe(1);
    expect(await readFile(drive.memory, 'utf8')).toBe(memory);
});

async function seedResetFixture() {
    const agentRoot = join(dataRoot, 'servers', 'srv_reset', 'agents', agentId);
    const configuration = parseAgentConfigureCommand({
        agentDescription: 'Onboarding guide',
        agentId,
        agentName: 'Scout',
        factoryKind: 'ordinary',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        sessionGeneration: 1,
        sessionResetKind: 'full',
        type: 'agent-configure',
    });
    if (!configuration) {
        throw new Error('Reset configuration fixture did not parse.');
    }
    await applyAgentConfiguration({
        command: configuration,
        dataRoot,
        inventory: {
            runtimes: [
                {
                    id: 'codex',
                    label: 'Codex',
                    models: [{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }],
                },
            ],
        },
        serverId: 'srv_reset',
    });
    const configurationJson = await readFile(join(agentRoot, 'configuration.json'), 'utf8');
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
