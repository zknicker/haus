import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coveFactoryManifestSha256 } from '@haus/agent-workspace';
import {
    applyAgentConfiguration,
    parseAgentConfigureCommand,
    readAgentSeedConfiguration,
    readAppliedAgentConfiguration,
} from './agent-configuration.ts';
import { applyCoveConfiguration } from './cove-configuration.ts';
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
        factoryKind: 'ordinary',
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
        briefAuthorHandle: 'cove',
        factoryKind: 'ordinary',
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
        briefAuthorHandle: 'cove',
    });
});

test('reports a missing desired model instead of substituting one', async () => {
    const command = parseAgentConfigureCommand({
        agentDescription: null,
        agentId: 'agt_missingmodelxxxx',
        agentName: 'Missing',
        factoryKind: 'ordinary',
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

test('durably applies and replays Cove without touching its Drive files', async () => {
    const command = {
        agentDescription: 'Onboarding Assistant' as const,
        agentId: 'agt_covefactoryxxxx',
        agentName: 'Cove' as const,
        applicationId: 'cap_coveapplication',
        factoryKind: 'cove' as const,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        sessionGeneration: 1,
        type: 'cove-apply' as const,
    };
    const input = {
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
    };

    expect(await applyCoveConfiguration(input)).toEqual({
        agentId: command.agentId,
        applicationId: command.applicationId,
        factoryKind: 'cove',
        status: 'applied',
        type: 'cove-apply-result',
    });
    expect(await applyCoveConfiguration(input)).toEqual({
        agentId: command.agentId,
        applicationId: command.applicationId,
        factoryKind: 'cove',
        status: 'applied',
        type: 'cove-apply-result',
    });

    const agentRoot = join(dataRoot, 'servers', input.serverId, 'agents', command.agentId);
    expect(await readdir(join(agentRoot, 'workspace'))).toEqual([]);
    expect(
        JSON.parse(await readFile(join(agentRoot, 'cove-application.json'), 'utf8'))
    ).toMatchObject({ manifestSha256: coveFactoryManifestSha256() });
    expect(await inventory(agentRoot)).toEqual([
        'configuration.json',
        'cove-application.json',
        'home/',
        'runtime/',
        'workspace/',
    ]);
    await mkdir(join(agentRoot, 'workspace', 'drive', 'agents', 'cove'), { recursive: true });
    await writeFile(
        join(agentRoot, 'workspace', 'drive', 'agents', 'cove', 'MEMORY.md'),
        '# Edited\n'
    );
    expect(await applyCoveConfiguration(input)).toMatchObject({ status: 'applied' });

    const replay = parseAgentConfigureCommand({
        agentDescription: command.agentDescription,
        agentId: command.agentId,
        agentName: command.agentName,
        factoryKind: 'cove',
        modelId: command.modelId,
        reasoningEffort: 'medium',
        runtimeId: command.runtimeId,
        sessionGeneration: 1,
        sessionResetKind: 'session',
        type: 'agent-configure',
    });
    if (!replay) {
        throw new Error('Cove replay fixture did not parse.');
    }
    await applyAgentConfiguration({ ...input, command: replay });
    await expect(readAgentSeedConfiguration(agentRoot)).resolves.toMatchObject({
        factoryKind: 'cove',
    });

    const receiptPath = join(agentRoot, 'cove-application.json');
    await writeFile(receiptPath, '{malformed receipt\n');
    expect(await applyCoveConfiguration(input)).toMatchObject({ status: 'failed' });
    await expect(readFile(receiptPath, 'utf8')).resolves.toBe('{malformed receipt\n');
});

async function inventory(root: string): Promise<string[]> {
    return (await readdir(root, { withFileTypes: true }))
        .map((entry) => `${entry.name}${entry.isDirectory() ? '/' : ''}`)
        .sort();
}
