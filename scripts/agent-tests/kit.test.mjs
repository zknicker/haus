import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentInputSchema } from '../../packages/haus-api/src/agent-creation.ts';
import { chunkChatIds, expandEvalCleanupChatIds } from './cleanup-chats.mjs';
import { marker } from './kit.mjs';
import {
    agentKindDescriptions,
    createConcurrency,
    isReady,
    pickAgentTarget,
    provisionAgents,
    retireAgents,
} from './provisioner.mjs';
import { activeLine, formatWall, pad } from './render.mjs';
import { buildSummary, runStamp, slug } from './report.mjs';
import { createRunLedger } from './state.mjs';
import { sweepAgentTestLeftovers } from './sweep.mjs';
import { deniedError, unroutedPathError } from './test-support.mjs';
import { createTurnObserver, isMissingProcedure } from './turns.mjs';

const readyAgent = {
    availability: 'idle',
    desiredModelId: 'codex-terra-1',
    desiredRuntimeId: 'codex',
    effectiveModelId: 'codex-terra-1',
    effectiveRuntimeId: 'codex',
    handle: 'eval-worker1-a3f9kq',
    id: 'agt_worker',
    missingResources: [],
    status: 'applied',
};

const codexComputer = {
    health: 'healthy',
    id: 'cmp_1',
    reportedInventory: {
        runtimes: [
            { id: 'claude-code', label: 'Claude Code', models: [{ id: 'opus', label: 'Opus' }] },
            {
                id: 'codex',
                label: 'Codex',
                models: [
                    { id: 'gpt-5.6-sol', label: 'Sol' },
                    { id: 'gpt-5.6-terra', label: 'Terra' },
                ],
            },
        ],
    },
};

describe('marker', () => {
    test('carries the EVAL prefix and a six character suffix', () => {
        const value = marker();
        expect(value).toMatch(/^EVAL-[A-Z2-9]{6}$/u);
        expect(value).not.toBe(marker());
    });

    test('supports a custom prefix and a bare suffix', () => {
        expect(marker('TASK')).toMatch(/^TASK-[A-Z2-9]{6}$/u);
        expect(marker('')).toMatch(/^[A-Z2-9]{6}$/u);
    });
});

describe('cleanup expansion', () => {
    const tasks = [{ task: { chatId: 'cht_parent', threadChatId: 'cht_thread' } }];

    test('adds the Threads owned by a requested parent Chat', () => {
        expect(expandEvalCleanupChatIds(['cht_parent'], tasks)).toEqual({
            chatIds: ['cht_parent', 'cht_thread'],
            retained: [],
        });
    });

    test('retains a task Thread whose parent is not in the set', () => {
        // Deleting a task's thread chat alone orphans the durable task row and
        // 500s task.list server-wide (observed live). The thread is retained
        // and reported resolved so cleanup state stops retrying it.
        expect(expandEvalCleanupChatIds(['cht_thread'], tasks)).toEqual({
            chatIds: [],
            retained: ['cht_thread'],
        });
    });

    test('chunks ids to the twenty id server limit', () => {
        const ids = Array.from({ length: 45 }, (_, index) => `cht_${index}`);
        expect(chunkChatIds(ids).map((chunk) => chunk.length)).toEqual([20, 20, 5]);
    });
});

describe('agent target', () => {
    test('reads runtime and model from the Computer inventory', () => {
        expect(pickAgentTarget([codexComputer])).toEqual({
            computerId: 'cmp_1',
            modelId: 'gpt-5.6-terra',
            runtimeId: 'codex',
        });
    });

    test('skips offline Computers and Computers without a terra codex model', () => {
        expect(pickAgentTarget([{ ...codexComputer, health: 'offline' }])).toBeNull();
        expect(
            pickAgentTarget([{ health: 'healthy', id: 'cmp_2', reportedInventory: null }])
        ).toBeNull();
        expect(pickAgentTarget([])).toBeNull();
    });

    test('prefers a healthy Computer over a degraded one', () => {
        const degraded = { ...codexComputer, health: 'degraded', id: 'cmp_degraded' };
        expect(pickAgentTarget([degraded, codexComputer])?.computerId).toBe('cmp_1');
    });

    test('readiness needs applied, idle, matching, and complete resources', () => {
        expect(isReady(readyAgent)).toBe(true);
        expect(isReady({ ...readyAgent, availability: 'working' })).toBe(false);
        expect(isReady({ ...readyAgent, effectiveModelId: 'other' })).toBe(false);
        expect(isReady({ ...readyAgent, missingResources: ['session'] })).toBe(false);
        expect(isReady(undefined)).toBe(false);
    });
});

describe('provisioning', () => {
    test('creates one Agent per request with a kind-shaped identity', async () => {
        const harness = createFakeHarness();
        const created = [];
        const agents = await provisionAgents(
            harness,
            [{ kind: 'worker' }, { kind: 'coordinator' }],
            { onCreated: (agent) => created.push(agent.id) }
        );

        expect(agents.map((agent) => agent.kind)).toEqual(['worker', 'coordinator']);
        expect(agents.map((agent) => agent.dmChatId)).toEqual(['cht_agt_1', 'cht_agt_2']);
        // The ledger learns each id the moment the Server record exists.
        expect(created).toEqual(agents.map((agent) => agent.id));
        const [worker, coordinator] = harness.inputsFor('agent.create');
        expect(worker.displayName).toBe(`Eval Worker ${harness.stamp}-1`);
        expect(worker.handle).toMatch(/^eval-worker1-[a-z2-9]{6}$/u);
        expect(worker.description).toBe(agentKindDescriptions.worker);
        expect(worker).toMatchObject({
            computerId: 'cmp_1',
            modelId: 'gpt-5.6-terra',
            runtimeId: 'codex',
            serverId: 'srv_1',
        });
        // The fake harness accepts anything, so the payload is judged by the
        // Server's own strict schema instead: a retired field (`role`) outlived
        // its removal here and failed every provisioning scenario at run time.
        expect(createAgentInputSchema.safeParse(worker).error?.issues ?? []).toEqual([]);
        expect(coordinator.handle).toMatch(/^eval-coordinator2-[a-z2-9]{6}$/u);
        expect(coordinator.description).toBe(agentKindDescriptions.coordinator);
    });

    // Concurrent applies race the Computer into a degraded Agent missing its
    // session, so the semaphore is global to the process, not per scenario.
    test('bounds concurrent creation across every scenario in the process', async () => {
        const harness = createFakeHarness({ createDelayMs: 20 });
        const requests = Array.from({ length: 5 }, () => ({ kind: 'worker' }));
        const [first, second] = await Promise.all([
            provisionAgents(harness, requests.slice(0, 3)),
            provisionAgents(harness, requests.slice(3)),
        ]);

        expect(first.length + second.length).toBe(5);
        expect(harness.peakCreates()).toBe(createConcurrency);
    });

    test('retires the Agents it already created when one request fails', async () => {
        const harness = createFakeHarness({ failCreateAt: 2 });
        await expect(
            provisionAgents(harness, [{ kind: 'worker' }, { kind: 'worker' }])
        ).rejects.toThrow(/create refused/u);
        expect(harness.inputsFor('agent.delete').map((input) => input.agentId)).toEqual(['agt_1']);
    });

    test('reports a failed retirement instead of throwing it', async () => {
        const harness = createFakeHarness({ failDeleteFor: 'agt_2' });
        const agents = await provisionAgents(harness, [{ kind: 'worker' }, { kind: 'worker' }]);
        const result = await retireAgents(harness, agents);

        expect(result.retired).toEqual(['agt_1']);
        expect(result.failures[0].agentId).toBe('agt_2');
        expect(harness.inputsFor('agent.delete')[0].confirmation).toBe(agents[0].displayName);
    });

    test('retires an Agent that an earlier cleanup already deleted', async () => {
        const harness = createFakeHarness();
        const result = await retireAgents(harness, [
            { displayName: 'Already deleted', handle: 'already-deleted', id: 'agt_absent' },
        ]);

        expect(result).toEqual({ failures: [], retired: ['agt_absent'] });
        expect(harness.inputsFor('agent.delete')).toEqual([]);
    });
});

describe('crash ledger', () => {
    test('records this run and reads only what earlier runs left', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-state-'));
        const crashed = createRunLedger({ repositoryRoot, stamp: 'run_a' });
        await crashed.rememberAgent({ displayName: 'Eval Worker run_a-1', id: 'agt_a' });
        await crashed.rememberChat('cht_a');
        expect(await crashed.leftovers()).toEqual([]);

        const current = createRunLedger({ repositoryRoot, stamp: 'run_b' });
        await current.rememberChat('cht_b');
        expect(await current.leftovers()).toEqual([
            {
                agents: [{ displayName: 'Eval Worker run_a-1', handle: null, id: 'agt_a' }],
                chatIds: ['cht_a'],
                stamp: 'run_a',
            },
        ]);

        // A failed sweep confirms nothing, so the ids survive to the next run.
        expect(await current.leftovers()).toHaveLength(1);
        await current.forgetChats(['cht_a']);
        await current.forgetAgents(['agt_a']);
        expect(await current.leftovers()).toEqual([]);
    });

    test('adopts the standing pool ledger so its chats are still swept', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-legacy-'));
        const file = path.join(repositoryRoot, '.context', 'agent-tests', 'state.json');
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify({ chatsByHandle: { 'eval-worker-1': ['cht_old'] } }));

        expect(await createRunLedger({ repositoryRoot, stamp: 'run_a' }).leftovers()).toEqual([
            { agents: [], chatIds: ['cht_old'], stamp: 'standing-pool' },
        ]);
    });
});

describe('crash sweep', () => {
    test('deletes exactly the recorded ids and forgets only confirmed deletes', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-sweep-'));
        const crashed = createRunLedger({ repositoryRoot, stamp: 'run_a' });
        await crashed.rememberAgent({ displayName: 'Eval Worker run_a-1', id: 'agt_a' });
        await crashed.rememberAgent({ displayName: 'Eval Worker run_a-2', id: 'agt_b' });
        await crashed.rememberChat('cht_a');

        const harness = createFakeHarness({
            failDeleteFor: 'agt_b',
            listedAgentIds: ['agt_a', 'agt_b'],
            stamp: 'run_b',
        });
        const swept = await sweepAgentTestLeftovers(harness, { repositoryRoot });

        expect(swept).toMatchObject({ agents: 1, chats: 1, runs: ['run_a'] });
        expect(harness.inputsFor('dev.cleanupEvalChats')[0].chatIds).toEqual(['cht_a']);
        expect(
            harness
                .inputsFor('agent.delete')
                .map((input) => input.agentId)
                .sort()
        ).toEqual(['agt_a', 'agt_b']);
        // Only the refused Agent stays; nothing was matched by name or age.
        expect(await createRunLedger({ repositoryRoot, stamp: 'run_c' }).leftovers()).toEqual([
            {
                agents: [{ displayName: 'Eval Worker run_a-2', handle: null, id: 'agt_b' }],
                chatIds: [],
                stamp: 'run_a',
            },
        ]);
    });

    test('a run with nothing left behind sweeps nothing', async () => {
        const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'agent-tests-sweep-'));
        const harness = createFakeHarness();
        expect(await sweepAgentTestLeftovers(harness, { repositoryRoot })).toMatchObject({
            agents: 0,
            chats: 0,
            runs: [],
        });
        expect(harness.inputsFor('agent.delete')).toEqual([]);
    });
});

describe('turn observability fallback', () => {
    test('only an unrouted tRPC path counts as a missing capability', () => {
        expect(isMissingProcedure(unroutedPathError('agent.turns'))).toBe(true);
        expect(isMissingProcedure(deniedError('agent.turns'))).toBe(false);
        expect(isMissingProcedure(new Error('agent.turns failed (404): {"error":{}}'))).toBe(false);
        expect(isMissingProcedure(new Error('agent.turns failed (500): boom'))).toBe(false);
    });

    test('an unrouted agent.turns falls back to agent.activity', async () => {
        const observer = createTurnObserver({
            serverId: 'srv_1',
            trpc: (path) => {
                if (path === 'agent.turns') {
                    throw unroutedPathError(path);
                }
                return Promise.resolve([{ messageCount: 2, runId: 'run_1', status: 'completed' }]);
            },
        });
        const turns = await observer.listTurns('agt_1');
        expect(turns[0]).toMatchObject({ outputProduced: true, source: 'activity' });
        expect(observer.capabilities().turns).toBe(false);
    });

    test('a denial fails the scenario instead of disabling the capability', async () => {
        const observer = createTurnObserver({
            serverId: 'srv_1',
            trpc: (path) => {
                throw deniedError(path);
            },
        });
        await expect(observer.listTurns('agt_1')).rejects.toThrow(/No Agent exists/u);
        await expect(observer.listDeliveries('agt_1')).rejects.toThrow(/No Agent exists/u);
        expect(observer.capabilities()).toEqual({ deliveries: null, turns: null });
    });

    test('an unrouted agent.deliveries reads as no delivery ledger', async () => {
        const observer = createTurnObserver({
            serverId: 'srv_1',
            trpc: (path) => {
                throw unroutedPathError(path);
            },
        });
        expect(await observer.listDeliveries('agt_1')).toBeNull();
        expect(observer.capabilities().deliveries).toBe(false);
    });
});

describe('cli scenario selection', () => {
    const cli = fileURLToPath(new URL('./cli.mjs', import.meta.url));

    test('lists the scenarios it would run', () => {
        const listed = runCli(['--list']);
        expect(listed.status).toBe(0);
        expect(listed.stdout).toContain('task-thread-routing');
    });

    test('keeps opt-in scenarios out unless explicitly included', () => {
        const defaultList = runCli(['--list']);
        expect(defaultList.status).toBe(0);
        expect(defaultList.stdout).not.toContain('cove-composes-agent-creation');

        const optInList = runCli(['--list', '--include-opt-in']);
        expect(optInList.status).toBe(0);
        expect(optInList.stdout).toContain('cove-composes-agent-creation');
    });

    test('combines repeated scenario filters', () => {
        const listed = runCli([
            '--list',
            '--only',
            'coordinator-synthesizes-from-lanes',
            '--only',
            'reminder-schedule-and-fire',
        ]);
        expect(listed.status).toBe(0);
        expect(listed.stdout).toContain('coordinator-synthesizes-from-lanes');
        expect(listed.stdout).toContain('reminder-schedule-and-fire');
        expect(listed.stdout).not.toContain('task-thread-routing');
    });

    test('a missing filter aborts before the live stack', () => {
        const missing = runCli(['--only']);
        expect(missing.status).toBe(2);
        expect(missing.stderr).toContain('--only needs a scenario-name substring');
        expect(missing.stdout).toBe('');
    });

    // A filter that matches nothing must fail, and must fail before the run
    // reaches the dev stack: a green "0 passed" would read as a passing lane.
    test('a filter that matches nothing exits non-zero', () => {
        const empty = runCli(['--only', 'no-such-scenario']);
        expect(empty.status).toBe(1);
        expect(empty.stderr).toContain('no-such-scenario');
        expect(empty.stdout).toBe('');
    });

    function runCli(args) {
        const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
        return { status: result.status, stderr: result.stderr, stdout: result.stdout };
    }
});

describe('report shape', () => {
    test('summary carries scenarios, timing, and errors', () => {
        const summary = buildSummary({
            scenarios: [
                { assertions: [], error: new Error('nope'), name: 'a', ok: false, seconds: 3 },
                { name: 'b', ok: true, seconds: 2 },
            ],
            startedAt: '2026-08-12T00:00:00.000Z',
            wallSeconds: 5,
        });
        expect(summary.scenarios[0].error).toContain('nope');
        expect(summary.scenarios[1]).toEqual({ assertions: [], name: 'b', ok: true, seconds: 2 });
        expect(summary.wallSeconds).toBe(5);
    });

    test('slug and stamp are filesystem safe', () => {
        expect(slug('task thread routing!')).toBe('task-thread-routing');
        expect(runStamp(new Date('2026-08-12T09:41:07.123Z'))).toBe('20260812T094107');
    });
});

describe('render helpers', () => {
    test('pads the scenario column and formats the wall clock', () => {
        expect(pad('demo', 8)).toBe('demo    ');
        expect(formatWall(125)).toBe('2m 5s');
    });

    test('active line carries the index, name, phase, and elapsed seconds', () => {
        const line = activeLine({
            index: 1,
            name: 'task-thread-routing',
            phase: 'turn active',
            startedAt: Date.now() - 24_000,
        });
        expect(line).toBe('▶ 01 task-thread-routing       turn active · 24s');
    });
});

/**
 * A hosted Server stand-in: it answers the exact procedures provisioning,
 * retirement, and the crash sweep call, and records every input.
 */
function createFakeHarness({
    createDelayMs = 0,
    failCreateAt = null,
    failDeleteFor = null,
    listedAgentIds = [],
    stamp = '20260813031612',
} = {}) {
    const calls = [];
    let created = 0;
    let inFlightCreates = 0;
    let peakCreates = 0;

    async function trpc(path, input) {
        calls.push({ input, path });
        if (path === 'computer.list') {
            return [codexComputer];
        }
        if (path === 'agent.create') {
            inFlightCreates += 1;
            peakCreates = Math.max(peakCreates, inFlightCreates);
            try {
                await wait(createDelayMs);
                created += 1;
                if (created === failCreateAt) {
                    throw new Error(`create refused for ${input.handle}`);
                }
                return { agent: { ...readyAgent, ...input, id: `agt_${created}` } };
            } finally {
                inFlightCreates -= 1;
            }
        }
        if (path === 'agent.list') {
            const createdAgents = calls
                .filter((call) => call.path === 'agent.create')
                .map((call, index) => ({ ...readyAgent, ...call.input, id: `agt_${index + 1}` }));
            return [
                ...createdAgents,
                ...listedAgentIds.map((id) => ({ ...readyAgent, displayName: id, id })),
            ];
        }
        if (path === 'chat.ensureAgentDm') {
            return { id: `cht_${input.agentId}` };
        }
        if (path === 'agent.delete') {
            if (input.agentId === failDeleteFor) {
                throw new Error(`delete refused for ${input.agentId}`);
            }
            return { agentId: input.agentId };
        }
        if (path === 'task.list') {
            return { backgroundCount: 0, tasks: [] };
        }
        if (path === 'chat.messages') {
            return { messages: [], threads: [] };
        }
        if (path === 'dev.cleanupEvalChats') {
            return { deleted: input.chatIds.length };
        }
        throw new Error(`the fake harness has no answer for ${path}`);
    }

    return {
        inputsFor: (path) => calls.filter((call) => call.path === path).map((call) => call.input),
        peakCreates: () => peakCreates,
        serverId: 'srv_1',
        stamp,
        trpc,
    };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
