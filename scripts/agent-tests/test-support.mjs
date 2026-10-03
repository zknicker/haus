// Shared scenario support. Provisioned Agents are isolated by construction, so
// what lives here is the state a scenario driving a STANDING Agent — Cove — has
// to own itself before its first turn: a factory session and workspace, and no
// teammate an earlier run left behind. A scenario asks in its own fresh chat
// to avoid inheriting earlier requests from the standing Agent's Owner DM.

import { sleep } from '../eval-harness.mjs';
import { isReady, retireAgents } from './provisioner.mjs';

const factoryResetTimeoutMs = 300_000;
/** Slack for the reset request and the re-seed straddling a clock tick. */
const reseedSkewMs = 2000;

/** The body a Server sends when the tRPC path itself is not routed. */
export function unroutedPathError(path) {
    return trpcError(path, 404, `No "query"-procedure on path "${path}"`);
}

/** The body an authorization or unknown-Agent refusal sends: also NOT_FOUND. */
export function deniedError(path) {
    return trpcError(path, 404, 'No Agent exists on this Server.');
}

/**
 * Puts a standing Agent back to factory state through the product's own Full
 * Reset — session, workspace, and MEMORY.md — and waits for the Computer to
 * report the re-seeded workspace. Waiting on the re-seed, not on a timer, is
 * what makes the first turn of the scenario the first turn of the session: a
 * start command that reaches the Computer mid-reset is dropped there.
 */
export async function resetAgentToFactory(
    harness,
    agent,
    { intervalMs = 1000, log, timeoutMs = factoryResetTimeoutMs } = {}
) {
    const requestedAt = Date.now() - reseedSkewMs;
    log?.(`resetting @${agent.handle ?? agent.id} to factory state`);
    await harness.trpc('agent.reset', {
        agentId: agent.id,
        kind: 'full',
        serverId: harness.serverId,
    });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [reseededAt, latest] = await Promise.all([
            readWorkspaceSeedTime(harness, agent.id),
            readAgent(harness, agent.id),
        ]);
        if (reseededAt >= requestedAt && isReady(latest)) {
            return latest;
        }
        if (Date.now() >= deadline) {
            throw new Error(
                `@${agent.handle ?? agent.id} never came back from a full reset within ${Math.round(timeoutMs / 1000)}s.`
            );
        }
        await sleep(intervalMs);
    }
}

/**
 * Retires every Agent the given Agent created. For a creation scenario that is
 * exactly what an earlier run left behind, and retiring it frees the handle the
 * next run asks for.
 */
export async function retireAgentsCreatedBy(harness, creatorAgentId, { log } = {}) {
    const agents = await harness.trpc('agent.list', { serverId: harness.serverId });
    const leftovers = agents.filter((agent) => agent.createdByAgentId === creatorAgentId);
    if (leftovers.length === 0) {
        return [];
    }
    log?.(`retiring ${leftovers.length} Agent(s) left by an earlier run`);
    const { failures, retired } = await retireAgents(harness, leftovers);
    if (failures.length > 0) {
        throw new Error(
            `Could not retire ${failures.length} Agent(s) left by an earlier run: ${failures[0].error}`
        );
    }
    return retired;
}

/**
 * Runs `operation` with an Agent temporarily configured onto `target`'s
 * runtime/model, restoring the Agent's own configuration afterwards even when
 * the operation throws.
 */
export async function withTemporaryAgentConfiguration(harness, agent, target, operation, log) {
    const original = {
        modelId: agent.desiredModelId,
        runtimeId: agent.desiredRuntimeId,
    };
    const changed = original.modelId !== target.modelId || original.runtimeId !== target.runtimeId;
    let configured = false;

    try {
        if (changed) {
            configured = true;
            log?.('configuring the Agent on the requested temporary runtime/model');
            await harness.configureAgent(agent, target.runtimeId, target.modelId);
        }
        return await operation();
    } finally {
        if (configured) {
            log?.('restoring the Agent’s original runtime/model');
            await harness.configureAgent(agent, original.runtimeId, original.modelId);
        }
    }
}

async function readAgent(harness, agentId) {
    const agents = await harness.trpc('agent.list', { serverId: harness.serverId });
    return agents.find((candidate) => candidate.id === agentId) ?? null;
}

/** When the workspace MEMORY.md was last written, or 0 while it is gone. */
async function readWorkspaceSeedTime(harness, agentId) {
    const memory = await harness
        .trpc('agent.workspaceFile', {
            agentId,
            path: 'MEMORY.md',
            serverId: harness.serverId,
        })
        .catch(() => null);
    return Date.parse(memory?.updatedAt ?? '') || 0;
}

function trpcError(path, status, message) {
    const payload = {
        error: { code: -32_004, data: { code: 'NOT_FOUND', httpStatus: status, path }, message },
    };
    return new Error(`${path} failed (${status}): ${JSON.stringify(payload)}`);
}
