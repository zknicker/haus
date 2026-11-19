import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResetCommand } from './agent-command-frames.ts';
import { applyAgentConfiguration, parseAgentConfigureCommand } from './agent-configuration.ts';
import { resetAgentState } from './agent-reset.ts';
import { applyCoveConfiguration } from './cove-configuration.ts';

let dataRoot: string;
beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-reset-'));
});
afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('session reset rotates harness context while preserving Agent-owned state', async () => {
    const { agentRoot, configuration, configurationJson } = await seedResetFixture();

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

    await resetAgentState({
        agentId: configuration.agentId,
        dataRoot,
        kind: 'session',
        serverId: 'srv_reset',
    });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'inbox'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'runtime', 'pending-notice.json'))).rejects.toThrow();
    expect(await readFile(join(agentRoot, 'workspace', 'MEMORY.md'), 'utf8')).toBe(
        '# Durable memory\n\nBluebird remains active.\n'
    );
    expect(await readFile(join(agentRoot, 'workspace', 'kept.txt'), 'utf8')).toBe('kept');
    expect(await readFile(join(agentRoot, 'skills', 'custom-skill', 'SKILL.md'), 'utf8')).toBe(
        'name: custom-skill\n'
    );
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);
});

test('full reset independently clears harness context and restores the ordinary factory state', async () => {
    const { agentRoot, configuration, configurationJson } = await seedResetFixture();

    await resetAgentState({
        agentId: configuration.agentId,
        dataRoot,
        kind: 'full',
        serverId: 'srv_reset',
    });

    await expect(stat(join(agentRoot, 'session.json'))).rejects.toThrow();
    await expect(stat(join(agentRoot, '.agent-runs'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'workspace', 'kept.txt'))).rejects.toThrow();
    await expect(stat(join(agentRoot, 'skills', 'custom-skill'))).rejects.toThrow();
    expect(await readFile(join(agentRoot, 'configuration.json'), 'utf8')).toBe(configurationJson);
    expect(await readFile(join(agentRoot, 'workspace', 'MEMORY.md'), 'utf8')).toContain(
        'Onboarding guide'
    );
    expect(await readdir(join(agentRoot, 'workspace', 'notes'))).toEqual([]);
    await expect(
        readFile(join(agentRoot, 'skills', 'haus-agent', 'SKILL.md'), 'utf8')
    ).rejects.toThrow();
    await expect(
        readFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: visuals');
});

test('Cove full reset restores its exact factory workspace and only visuals', async () => {
    const agentId = 'agt_coveresetxxxxxxx';
    const serverId = 'srv_cove_reset';
    const command = {
        agentDescription: 'Onboarding Assistant' as const,
        agentId,
        agentName: 'Cove' as const,
        applicationId: 'cap_coveresetxxxxxx',
        factoryKind: 'cove' as const,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        sessionGeneration: 1,
        type: 'cove-apply' as const,
    };
    await applyCoveConfiguration({
        command,
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
        serverId,
    });
    const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
    await Promise.all([
        writeFile(join(agentRoot, 'workspace', 'MEMORY.md'), '# Changed\n'),
        writeFile(join(agentRoot, 'workspace', 'extra.md'), 'remove me\n'),
        mkdir(join(agentRoot, 'skills', 'custom-skill'), { recursive: true }).then(() =>
            writeFile(join(agentRoot, 'skills', 'custom-skill', 'SKILL.md'), 'name: custom-skill\n')
        ),
    ]);

    await resetAgentState({ agentId, dataRoot, kind: 'full', serverId });

    expect((await readdir(join(agentRoot, 'workspace'))).sort()).toEqual(['MEMORY.md', 'notes']);
    expect((await readdir(join(agentRoot, 'workspace', 'notes'))).sort()).toEqual([
        'onboarding_knowledge_faq.md',
        'onboarding_objectives.md',
        'onboarding_playbook.md',
    ]);
    const objectives = await readFile(
        join(agentRoot, 'workspace', 'notes', 'onboarding_objectives.md'),
        'utf8'
    );
    expect(objectives.match(/^### recipes\//gmu)).toHaveLength(12);
    expect(objectives).not.toMatch(/save-as-a-skill|haus-agent|recipes\/archetype\//u);
    expect(await readdir(join(agentRoot, 'skills'))).toEqual(['visuals']);
    await expect(
        readFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: visuals');
});

async function seedResetFixture() {
    const agentId = 'agt_resetxxxxxxxxxxx';
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
    await Promise.all(
        [
            'home',
            'skills',
            'skills/custom-skill',
            'workspace',
            'runtime',
            'runtime/inbox',
            '.agent-runs',
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
        writeFile(
            join(agentRoot, 'workspace', 'MEMORY.md'),
            '# Durable memory\n\nBluebird remains active.\n'
        ),
        writeFile(join(agentRoot, 'workspace', 'kept.txt'), 'kept'),
        writeFile(join(agentRoot, 'skills', 'custom-skill', 'SKILL.md'), 'name: custom-skill\n'),
    ]);
    return { agentRoot, configuration, configurationJson };
}
