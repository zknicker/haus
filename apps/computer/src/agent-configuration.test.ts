import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    applyAgentConfiguration,
    parseAgentConfigureCommand,
    readAgentSeedConfiguration,
    readAppliedAgentConfiguration,
} from './agent-configuration.ts';
import { readEffectiveAgentStates } from './effective-state.ts';

let dataRoot: string;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-configuration-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('applies desired runtime and model without waiting for the first turn', async () => {
    const command = parseAgentConfigureCommand({
        agentDescription: 'Reviews launch copy and records concrete risks.',
        agentId: 'agt_configurationxxx',
        agentName: 'Scout',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'max',
        runtimeId: 'codex',
        sessionGeneration: 1,
        sessionResetKind: 'full',
        type: 'agent-configure',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    await applyAgentConfiguration({
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
        serverId: 'srv_configuration',
    });

    expect(await readEffectiveAgentStates(dataRoot, 'srv_configuration')).toEqual([
        {
            agentId: 'agt_configurationxxx',
            hausAgentAppliedAt: null,
            hausAgentStatus: 'pending',
            hausAgentVersion: null,
            missingResources: [],
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'max',
            runtimeId: 'codex',
        },
    ]);
    await expect(
        readAppliedAgentConfiguration(
            join(dataRoot, 'servers', 'srv_configuration', 'agents', command.agentId)
        )
    ).resolves.toMatchObject({ reasoningEffort: 'max' });
    for (const directory of ['home', 'runtime', 'workspace']) {
        expect(
            (
                await stat(
                    join(
                        dataRoot,
                        'servers',
                        'srv_configuration',
                        'agents',
                        command.agentId,
                        directory
                    )
                )
            ).isDirectory()
        ).toBe(true);
    }
    const workspace = join(
        dataRoot,
        'servers',
        'srv_configuration',
        'agents',
        command.agentId,
        'workspace'
    );
    expect(await readdir(workspace)).toEqual([]);
    await expect(stat(join(workspace, '..', 'skills'))).rejects.toThrow();
});

test('records the standing brief for the launch seed and keeps it on reprovision', async () => {
    const command = parseAgentConfigureCommand({
        agentDescription: 'Watches competitor launches.',
        agentId: 'agt_briefseedxxxxxxx',
        agentName: 'Orbit',
        brief: 'Own competitor intel. Post a Friday digest in #product; @ada reviews it.',
        briefAuthorHandle: 'harbor',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runtimeId: 'codex',
        sessionGeneration: 1,
        sessionResetKind: 'full',
        type: 'agent-configure',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }
    const inventory = {
        runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }],
    };
    const apply = async () =>
        await applyAgentConfiguration({
            command,
            dataRoot,
            inventory,
            serverId: 'srv_configuration',
        });

    await apply();
    await apply();

    const agentRoot = join(dataRoot, 'servers', 'srv_configuration', 'agents', command.agentId);
    await expect(readAgentSeedConfiguration(agentRoot)).resolves.toMatchObject({
        brief: 'Own competitor intel. Post a Friday digest in #product; @ada reviews it.',
        briefAuthorHandle: 'harbor',
    });
});

test('reports a missing desired model instead of substituting one', async () => {
    const command = parseAgentConfigureCommand({
        agentDescription: null,
        agentId: 'agt_missingmodelxxxx',
        agentName: 'Missing',
        modelId: 'missing-model',
        runtimeId: 'codex',
        sessionGeneration: 1,
        sessionResetKind: 'full',
        type: 'agent-configure',
    });
    if (!command) {
        throw new Error('Fixture command did not parse.');
    }

    await applyAgentConfiguration({
        command,
        dataRoot,
        inventory: { runtimes: [{ id: 'codex', label: 'Codex', models: [] }] },
        serverId: 'srv_configuration',
    });

    expect(await readEffectiveAgentStates(dataRoot, 'srv_configuration')).toEqual([
        {
            agentId: 'agt_missingmodelxxxx',
            hausAgentAppliedAt: null,
            hausAgentStatus: 'pending',
            hausAgentVersion: null,
            missingResources: ['model:missing-model'],
            modelId: null,
            reasoningEffort: 'medium',
            runtimeId: 'codex',
        },
    ]);
});

test.each(['cove', 'ordinary'])(
    'a stored configuration with factory kind %s still loads and reapplies as an ordinary Agent',
    async (factoryKind) => {
        const agentRoot = join(
            dataRoot,
            'servers',
            'srv_configuration',
            'agents',
            'agt_legacyseedxxxxx'
        );
        await mkdir(join(agentRoot, 'workspace', 'drive'), { recursive: true });
        await writeFile(join(agentRoot, 'workspace', 'drive', 'MEMORY.md'), '# Edited\n');
        await writeFile(join(agentRoot, 'cove-application.json'), '{"applicationId":"cap_old"}\n');
        await writeFile(
            join(agentRoot, 'configuration.json'),
            `${JSON.stringify({
                missingResources: [],
                modelId: 'gpt-5.6-sol',
                reasoningEffort: 'high',
                runtimeId: 'codex',
                seed: {
                    agentDescription: 'Onboarding Assistant',
                    agentName: 'Harbor',
                    factoryKind,
                },
            })}\n`
        );

        await expect(readAgentSeedConfiguration(agentRoot)).resolves.toEqual({
            agentDescription: 'Onboarding Assistant',
            agentName: 'Harbor',
            brief: null,
            briefAuthorHandle: null,
        });
        await expect(readAppliedAgentConfiguration(agentRoot)).resolves.toMatchObject({
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
        });

        const command = parseAgentConfigureCommand({
            agentDescription: 'Onboarding Assistant',
            agentId: 'agt_legacyseedxxxxx',
            agentName: 'Harbor',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            sessionGeneration: 1,
            sessionResetKind: 'session',
            type: 'agent-configure',
        });
        if (!command) {
            throw new Error('Fixture command did not parse.');
        }
        await applyAgentConfiguration({
            command,
            dataRoot,
            inventory: {
                runtimes: [
                    { id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] },
                ],
            },
            serverId: 'srv_configuration',
        });

        const stored = JSON.parse(await readFile(join(agentRoot, 'configuration.json'), 'utf8'));
        expect(stored.seed).not.toHaveProperty('factoryKind');
        await expect(
            readFile(join(agentRoot, 'workspace', 'drive', 'MEMORY.md'), 'utf8')
        ).resolves.toBe('# Edited\n');
        await expect(readFile(join(agentRoot, 'cove-application.json'), 'utf8')).resolves.toBe(
            '{"applicationId":"cap_old"}\n'
        );
    }
);
