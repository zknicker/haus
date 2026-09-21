import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    for (const directory of ['home', 'runtime', 'skills', 'workspace']) {
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
    expect(await readFile(join(workspace, 'MEMORY.md'), 'utf8')).toContain(
        'Reviews launch copy and records concrete risks.'
    );
    await expect(stat(join(workspace, 'notes'))).rejects.toThrow();
    expect(await readdir(workspace)).toEqual(['MEMORY.md']);
    const skills = join(
        dataRoot,
        'servers',
        'srv_configuration',
        'agents',
        command.agentId,
        'skills'
    );
    await expect(readFile(join(skills, 'haus-agent', 'SKILL.md'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(skills, 'visuals', 'SKILL.md'), 'utf8')).resolves.toContain(
        'name: visuals'
    );
});

test('renders the standing brief into the memory it seeds, and keeps it on reprovision', async () => {
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

    const agentRoot = join(dataRoot, 'servers', 'srv_configuration', 'agents', command.agentId);
    const memoryPath = join(agentRoot, 'workspace', 'MEMORY.md');
    const seeded = await readFile(memoryPath, 'utf8');
    expect(seeded).toContain('## Standing brief from @cove');
    expect(seeded).toContain('Own competitor intel. Post a Friday digest in #product');
    expect(seeded).toContain('say hello in #all in your own voice');
    // The Server row is the durable copy, so a reprovision re-sends it — and the
    // Agent's own edits to the seeded file still win.
    await writeFile(memoryPath, `${seeded}\n- Learned something.\n`);
    await apply();
    expect(await readFile(memoryPath, 'utf8')).toContain('- Learned something.');
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

test('durably applies and replays the exact Cove factory workspace', async () => {
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
    const workspace = join(agentRoot, 'workspace');
    expect(await inventory(workspace)).toEqual(['MEMORY.md', 'notes/']);
    expect(await inventory(join(workspace, 'notes'))).toEqual([
        'onboarding_knowledge_faq.md',
        'onboarding_objectives.md',
        'onboarding_playbook.md',
    ]);
    const objectives = await readFile(join(workspace, 'notes', 'onboarding_objectives.md'), 'utf8');
    expect(objectives.match(/^### recipes\//gmu)).toHaveLength(12);
    expect(objectives).not.toMatch(/recipes\/archetype\//u);
    expect(objectives).not.toMatch(/save-as-a-skill|haus-agent/u);
    await expect(
        readFile(join(agentRoot, 'skills', 'visuals', 'SKILL.md'), 'utf8')
    ).resolves.toContain('name: visuals');
    expect(await inventory(agentRoot)).toEqual([
        'configuration.json',
        'cove-application.json',
        'home/',
        'runtime/',
        'skills/',
        'workspace/',
    ]);

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
