import { describe, expect, test } from 'bun:test';
import {
    resetAgentToFactory,
    retireAgentsCreatedBy,
    withTemporaryAgentConfiguration,
} from './test-support.mjs';

describe('Agent scenario configuration isolation', () => {
    test('restores the exact original runtime and model when an operation fails', async () => {
        const calls = [];
        const harness = {
            configureAgent: async (_agent, runtimeId, modelId) => {
                calls.push({ modelId, runtimeId });
            },
        };
        const harbor = {
            desiredModelId: 'gpt-5.6-sol',
            desiredRuntimeId: 'codex',
        };
        const terra = { modelId: 'gpt-5.6-terra', runtimeId: 'codex' };

        await expect(
            withTemporaryAgentConfiguration(harness, harbor, terra, async () => {
                throw new Error('scenario assertion failed');
            })
        ).rejects.toThrow('scenario assertion failed');

        expect(calls).toEqual([
            { modelId: terra.modelId, runtimeId: terra.runtimeId },
            { modelId: harbor.desiredModelId, runtimeId: harbor.desiredRuntimeId },
        ]);
    });

    test('leaves the Agent untouched when the target already matches', async () => {
        const calls = [];
        const harness = {
            configureAgent: async (_agent, runtimeId, modelId) => {
                calls.push({ modelId, runtimeId });
            },
        };
        const harbor = { desiredModelId: 'gpt-5.6-sol', desiredRuntimeId: 'codex' };

        const result = await withTemporaryAgentConfiguration(
            harness,
            harbor,
            { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
            async () => 'ran'
        );

        expect(result).toBe('ran');
        expect(calls).toEqual([]);
    });
});

describe('standing-Agent scenario setup', () => {
    test('a full reset settles only once the Computer re-seeded the workspace', async () => {
        const harbor = readyAgent();
        let workspaceReads = 0;
        const harness = fakeHarness({
            'agent.list': () => [harbor],
            'agent.reset': () => ({}),
            'agent.workspaceFile': () => {
                workspaceReads += 1;
                if (workspaceReads === 1) {
                    // The workspace is gone while the Computer applies the reset.
                    throw new Error('Workspace files are unavailable.');
                }
                return { updatedAt: new Date().toISOString() };
            },
        });

        const settled = await resetAgentToFactory(harness, harbor, { intervalMs: 1 });

        expect(settled).toBe(harbor);
        expect(harness.inputs('agent.reset')).toEqual([
            { agentId: 'harbor', kind: 'full', serverId: 'server-1' },
        ]);
        expect(workspaceReads).toBeGreaterThan(1);
    });

    // The pre-reset MEMORY.md is the trap: it reads fine, so a wait that only
    // asked whether the file exists would hand the scenario the old workspace.
    test('a MEMORY.md older than the request never settles the reset', async () => {
        const harbor = readyAgent();
        const harness = fakeHarness({
            'agent.list': () => [harbor],
            'agent.reset': () => ({}),
            'agent.workspaceFile': () => ({
                updatedAt: new Date(Date.now() - 60_000).toISOString(),
            }),
        });

        await expect(
            resetAgentToFactory(harness, harbor, { intervalMs: 1, timeoutMs: 10 })
        ).rejects.toThrow(/never came back from a full reset/u);
    });

    test('retiring leftovers touches only the Agents the creator made', async () => {
        const harness = fakeHarness({
            'agent.delete': () => ({}),
            'agent.list': () => [
                { createdByAgentId: null, displayName: 'Harbor', handle: 'harbor', id: 'harbor' },
                {
                    createdByAgentId: 'harbor',
                    displayName: 'Mossy Lantern',
                    handle: 'mossy-lantern',
                    id: 'mossy',
                },
                { createdByAgentId: null, displayName: 'Blippy', handle: 'blippy', id: 'blippy' },
            ],
        });

        const retired = await retireAgentsCreatedBy(harness, 'harbor');

        expect(retired).toEqual(['mossy']);
        expect(harness.inputs('agent.delete')).toEqual([
            { agentId: 'mossy', confirmation: 'Mossy Lantern', serverId: 'server-1' },
        ]);
    });
});

function readyAgent() {
    return {
        availability: 'idle',
        computerId: 'computer-1',
        desiredModelId: 'gpt-5.6-terra',
        desiredRuntimeId: 'codex',
        effectiveModelId: 'gpt-5.6-terra',
        effectiveRuntimeId: 'codex',
        handle: 'harbor',
        id: 'harbor',
        missingResources: [],
        status: 'applied',
    };
}

/** A harness whose tRPC is a routing table, recording every call it answered. */
function fakeHarness(routes) {
    const calls = [];
    return {
        calls,
        inputs: (path) => calls.filter((call) => call.path === path).map((call) => call.input),
        serverId: 'server-1',
        trpc: async (path, input) => {
            calls.push({ input, path });
            const route = routes[path];
            if (!route) {
                throw new Error(`unexpected tRPC call ${path}`);
            }
            return await route(input);
        },
    };
}
