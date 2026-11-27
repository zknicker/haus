import { expect, test } from 'bun:test';
import { provisionAgents } from './provisioner.mjs';

const terraComputer = { health: 'healthy', id: 'cmp_1' };

const runnerModels = [{ id: 'codex', models: [{ id: 'gpt-6.1-terra', label: 'Terra' }] }];

// A full run once lost six scenarios to 300s readiness timeouts: the Computer
// had no disk left to reserve their workspaces, and a reset never re-applies
// a workspace, so only a replacement Agent can get one.
test('replaces an Agent the Computer had no workspace capacity for', async () => {
    const calls = [];
    const harness = {
        serverId: 'srv_1',
        stamp: '20261021000000',
        trpc(path, input) {
            calls.push({ input, path });
            const created = calls.filter((call) => call.path === 'agent.create');
            const deleted = calls.filter((call) => call.path === 'agent.delete');
            switch (path) {
                case 'computer.list':
                    return Promise.resolve([terraComputer]);
                case 'modelConnections.list':
                    return Promise.resolve({
                        connections: [{ enabled: true, provider: 'chatgpt', status: 'ready' }],
                        runnerModels,
                    });
                case 'project.list':
                    return Promise.resolve([
                        { archived: false, chatId: 'cht_product', isHaus: false, name: 'product' },
                    ]);
                case 'agent.create':
                    return Promise.resolve({ agent: { id: `agt_${created.length}` } });
                case 'chat.ensureAgentDm':
                    return Promise.resolve({ id: `cht_${input.agentId}` });
                case 'agent.delete':
                    return Promise.resolve({ agentId: input.agentId });
                case 'agent.list':
                    return Promise.resolve(
                        created
                            .map((_, index) => agentRow(`agt_${index + 1}`))
                            .filter((row) => !deleted.some((call) => call.input.agentId === row.id))
                    );
                default:
                    return Promise.reject(new Error(`no fake answer for ${path}`));
            }
        },
    };

    const agents = await provisionAgents(harness, [{ kind: 'worker' }], { retryMs: 1 });

    expect(agents.map((agent) => agent.id)).toEqual(['agt_2']);
    const paths = calls.map((call) => call.path);
    expect(paths.filter((path) => path === 'agent.delete')).toHaveLength(1);
    expect(paths).not.toContain('agent.reset');
});

// ADR 0062 replaced Owner DMs with one Captain chat per Captain, read off the Agent row.
test("uses the Agent's Captain chat when its row carries one", async () => {
    const calls = [];
    const harness = {
        serverId: 'srv_1',
        stamp: '20261126000000',
        trpc(path, input) {
            calls.push({ input, path });
            switch (path) {
                case 'computer.list':
                    return Promise.resolve([terraComputer]);
                case 'modelConnections.list':
                    return Promise.resolve({
                        connections: [{ enabled: true, provider: 'chatgpt', status: 'ready' }],
                        runnerModels,
                    });
                case 'project.list':
                    return Promise.resolve([
                        { archived: false, chatId: 'cht_product', isHaus: false, name: 'product' },
                    ]);
                case 'agent.create':
                    return Promise.resolve({ agent: { id: 'agt_2' } });
                case 'agent.list':
                    return Promise.resolve([
                        { ...agentRow('agt_2'), captainChatId: 'cht_captain' },
                    ]);
                default:
                    return Promise.reject(new Error(`no fake answer for ${path}`));
            }
        },
    };

    const [agent] = await provisionAgents(harness, [{ kind: 'worker' }]);

    expect(agent.ownChatId).toBe('cht_captain');
    expect(calls.map((call) => call.path)).not.toContain('chat.ensureAgentDm');
});

function agentRow(id) {
    const cramped = id === 'agt_1';
    return {
        availability: 'idle',
        desiredModelId: 'gpt-5.6-terra',
        desiredRuntimeId: 'codex',
        effectiveModelId: cramped ? null : 'gpt-5.6-terra',
        effectiveRuntimeId: cramped ? null : 'codex',
        id,
        missingResources: cramped ? ['workspace'] : [],
        status: cramped ? 'degraded' : 'applied',
    };
}
