import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyAgentConfiguration, parseAgentConfigureCommand } from './agent-configuration.ts';
import { readEffectiveAgentStates } from './effective-state.ts';

let dataRoot: string;

beforeEach(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), 'haus-agent-workspace-'));
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

// A full agent-test run lost six fresh Agents to "missing=[session]": the
// workspace reservation threw, no configuration was written, and the report
// read the bare directory as session-less.
test('reports a workspace the Computer cannot provide, and applies once it can', async () => {
    const command = parseAgentConfigureCommand({
        agentDescription: null,
        agentId: 'agt_noworkspacexxxxx',
        agentName: 'Cramped',
        factoryKind: 'ordinary',
        modelId: 'gpt-5.6-sol',
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
    const agentRoot = join(dataRoot, 'servers', 'srv_configuration', 'agents', command.agentId);

    await expect(
        applyAgentConfiguration({
            command,
            dataRoot,
            inventory,
            prepareWorkspace: () =>
                Promise.reject(
                    new Error('Computer has insufficient reserved capacity for this workspace.')
                ),
            serverId: 'srv_configuration',
        })
    ).resolves.toMatchObject({ missingResources: ['workspace'] });
    expect(await readEffectiveAgentStates(dataRoot, 'srv_configuration')).toMatchObject([
        { missingResources: ['workspace'], modelId: null, runtimeId: null },
    ]);
    // No seeded directory: the next apply must still create a capped volume.
    expect(await readdir(agentRoot)).not.toContain('workspace');

    await applyAgentConfiguration({ command, dataRoot, inventory, serverId: 'srv_configuration' });
    expect(await readEffectiveAgentStates(dataRoot, 'srv_configuration')).toMatchObject([
        { missingResources: [], modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
    ]);
});
