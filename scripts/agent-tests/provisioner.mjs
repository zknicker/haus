// Per-test Agent provisioning. A scenario's declared agents are CREATED for
// that scenario and retired after its verdict, so isolation is by construction:
// a fresh Agent has a fresh session, a fresh workspace, and a fresh Owner DM.
//
// Creation is globally bounded to two concurrent create-and-wait operations.
// More concurrent applies race the Computer into a degraded Agent whose
// missingResources carry "session" (observed live at four concurrent); the
// repair for one that lands there anyway is a single full reset.

import { sleep } from '../eval-harness.mjs';

export const agentKindDescriptions = Object.freeze({
    worker: 'Temporary agent-test fixture. Act only when explicitly addressed or assigned.',
});

/** Two concurrent creates is the Computer-safe ceiling for the whole process. */
export const createConcurrency = 2;

const handleAlphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const defaultModelHint = 'terra';
const defaultRuntimeId = 'codex';
const readyTimeoutMs = 300_000;
const repairAfterMs = 45_000;
const retireTimeoutMs = 45_000;
const targetTimeoutMs = 60_000;

const gate = createSemaphore(createConcurrency);
const targets = new WeakMap();

/**
 * Creates one Agent per request and returns the hosted Agent rows, each tagged
 * with the kind it fulfills. `onCreated` fires the moment a Server record
 * exists — before readiness — so a crash mid-provision still leaves the id in
 * the caller's ledger.
 */
export async function provisionAgents(harness, requests, { onCreated, onPhase } = {}) {
    const created = [];
    // Settled, not raced: a failure must not abandon an Agent still being
    // created in a sibling request.
    const results = await Promise.allSettled(
        requests.map((request, index) =>
            provisionAgent(harness, request, index + 1, {
                onCreated: async (agent) => {
                    created.push(agent);
                    await onCreated?.(agent);
                },
                onPhase,
            })
        )
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
        // A partially provisioned scenario still owns every Agent it created.
        await retireAgents(harness, created);
        throw failed.reason;
    }
    return results.map((result) => result.value);
}

/**
 * Deletes the given Agents. Best effort and bounded: a failure is reported to
 * the caller, never thrown, so teardown can never fail a settled verdict.
 */
export async function retireAgents(harness, agents, { timeoutMs = retireTimeoutMs } = {}) {
    const failures = [];
    const retired = [];
    const listed = await harness.trpc('agent.list', { serverId: harness.serverId });
    const existingIds = new Set(listed.map((agent) => agent.id));
    await Promise.all(
        (agents ?? []).map(async (agent) => {
            if (!existingIds.has(agent.id)) {
                retired.push(agent.id);
                return;
            }
            try {
                await withTimeout(
                    harness.trpc('agent.delete', {
                        agentId: agent.id,
                        confirmation: agent.displayName,
                        serverId: harness.serverId,
                    }),
                    timeoutMs,
                    `retiring @${agent.handle ?? agent.id}`
                );
                retired.push(agent.id);
            } catch (error) {
                failures.push({ agentId: agent.id, error: String(error) });
            }
        })
    );
    return { failures, retired };
}

/**
 * The Computer, runtime, and model a test Agent is built on, read from the
 * Computer's own reported inventory rather than copied off another Agent.
 */
export function pickAgentTarget(
    computers,
    { modelHint = defaultModelHint, runtimeId = defaultRuntimeId } = {}
) {
    const hint = modelHint.toLowerCase();
    const ranked = [...(computers ?? [])]
        .filter((computer) => computer.health !== 'offline')
        .sort((left, right) => healthRank(left) - healthRank(right));
    for (const computer of ranked) {
        const runtime = (computer.reportedInventory?.runtimes ?? []).find(
            (entry) => entry.id === runtimeId
        );
        const model = runtime?.models.find((entry) => entry.id.toLowerCase().includes(hint));
        if (model) {
            return { computerId: computer.id, modelId: model.id, runtimeId: runtime.id };
        }
    }
    return null;
}

export function isReady(agent) {
    return Boolean(
        agent &&
            agent.status === 'applied' &&
            agent.availability === 'idle' &&
            agent.effectiveRuntimeId === agent.desiredRuntimeId &&
            agent.effectiveModelId === agent.desiredModelId &&
            agent.missingResources.length === 0
    );
}

export function agentHandleSuffix(length = 6) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return [...bytes].map((byte) => handleAlphabet[byte % handleAlphabet.length]).join('');
}

async function provisionAgent(harness, request, position, { onCreated, onPhase }) {
    const target = await resolveAgentTarget(harness);
    const displayName = `Eval ${titleCase(request.kind)} ${harness.stamp}-${position}`;
    const handle = `eval-${request.kind}${position}-${agentHandleSuffix()}`;
    await gate.acquire();
    try {
        onPhase?.(`creating @${handle}`);
        const created = await harness.trpc('agent.create', {
            computerId: target.computerId,
            description: agentKindDescriptions[request.kind],
            displayName,
            handle,
            modelId: target.modelId,
            runtimeId: target.runtimeId,
            serverId: harness.serverId,
        });
        const agentId = created.agent.id;
        await onCreated?.({ displayName, handle, id: agentId });
        const dm = await harness.trpc('chat.ensureAgentDm', {
            agentId,
            serverId: harness.serverId,
        });
        const agent = await waitForReady(harness, agentId, { handle, onPhase });
        return { ...agent, dmChatId: dm.id, kind: request.kind };
    } finally {
        gate.release();
    }
}

/**
 * Waits for the Computer to report the Agent applied on the exact desired
 * runtime and model. An Agent still missing its session after the repair
 * window gets one full reset, which clears the raced apply.
 */
async function waitForReady(harness, agentId, { handle, onPhase } = {}) {
    const deadline = Date.now() + readyTimeoutMs;
    const repairAt = Date.now() + repairAfterMs;
    let repaired = false;
    let latest = null;
    while (Date.now() < deadline) {
        const agents = await harness.trpc('agent.list', { serverId: harness.serverId });
        latest = agents.find((candidate) => candidate.id === agentId);
        if (isReady(latest)) {
            return latest;
        }
        if (!repaired && Date.now() >= repairAt && latest?.missingResources?.includes('session')) {
            repaired = true;
            onPhase?.(`repairing @${handle ?? agentId}`);
            await harness.trpc('agent.reset', {
                agentId,
                kind: 'full',
                serverId: harness.serverId,
            });
        }
        await sleep(1000);
    }
    throw new Error(
        `Agent @${handle ?? agentId} never became ready within ${Math.round(readyTimeoutMs / 1000)}s (${describeAgent(latest)}).`
    );
}

/** One Computer lookup per harness: every scenario builds on the same target. */
function resolveAgentTarget(harness) {
    const existing = targets.get(harness);
    if (existing) {
        return existing;
    }
    const resolved = readAgentTarget(harness).catch((error) => {
        targets.delete(harness);
        throw error;
    });
    targets.set(harness, resolved);
    return resolved;
}

async function readAgentTarget(harness) {
    const deadline = Date.now() + targetTimeoutMs;
    const preference = requestedTarget();
    for (;;) {
        const computers = await harness.trpc('computer.list', { serverId: harness.serverId });
        const target = pickAgentTarget(computers, preference);
        if (target) {
            return target;
        }
        if (Date.now() >= deadline) {
            throw new Error(
                `No attached Computer reports a ${preference.runtimeId} runtime with a ${preference.modelHint} model, so the agent tests cannot create Agents.`
            );
        }
        await sleep(1000);
    }
}

/**
 * The runtime and model every test Agent is created on. `bun run eval --model`
 * sets HAUS_AGENT_TESTS_MODEL=<runtime>/<model>; creating on the target, rather
 * than reconfiguring afterwards, leaves nothing to restore on a retired Agent.
 */
export function requestedTarget(value = process.env.HAUS_AGENT_TESTS_MODEL) {
    const at = value?.indexOf('/') ?? -1;
    if (!value || at <= 0) {
        return { modelHint: defaultModelHint, runtimeId: defaultRuntimeId };
    }
    return { modelHint: value.slice(at + 1), runtimeId: value.slice(0, at) };
}

/** A counting semaphore: a released slot is handed straight to the next waiter. */
function createSemaphore(limit) {
    const waiting = [];
    let active = 0;

    return {
        acquire() {
            if (active < limit) {
                active += 1;
                return Promise.resolve();
            }
            return new Promise((resolve) => waiting.push(resolve));
        },
        release() {
            const next = waiting.shift();
            if (next) {
                next();
                return;
            }
            active = Math.max(0, active - 1);
        },
    };
}

async function withTimeout(operation, timeoutMs, label) {
    let timer = null;
    try {
        return await Promise.race([
            operation,
            new Promise((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
                    timeoutMs
                );
                timer.unref?.();
            }),
        ]);
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

function healthRank(computer) {
    return { degraded: 1, healthy: 0, 'update-required': 2 }[computer.health] ?? 3;
}

function describeAgent(agent) {
    if (!agent) {
        return 'no Server record';
    }
    return `status=${agent.status}, availability=${agent.availability}, missing=[${agent.missingResources?.join(', ') ?? ''}]`;
}

function titleCase(value) {
    return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
