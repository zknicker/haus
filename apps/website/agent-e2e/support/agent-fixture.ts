import { type Agent, chatSchema } from '@haus/api';
import { createEvalHarness } from '../../../../scripts/eval-harness.mjs';
import { cleanupEvalChats } from './cleanup-eval-chats.ts';

type EvalHarness = Awaited<ReturnType<typeof createEvalHarness>>;

export type FixtureAgent = Agent & { name: string };

interface AgentProfile {
    description: string;
    name: string;
}

interface CreateAgentFixtureOptions {
    evalName: string;
    modelHint?: string;
    profiles: readonly AgentProfile[];
    repositoryRoot: string;
}

export async function createAgentFixture(options: CreateAgentFixtureOptions) {
    const harness = await createEvalHarness({
        evalName: options.evalName,
        repositoryRoot: options.repositoryRoot,
    });
    const agents: FixtureAgent[] = [];
    const chatIds = new Set<string>();
    let cleanupPromise: Promise<void> | null = null;

    const cleanup = () => {
        cleanupPromise ??= cleanupResources(harness, agents, chatIds);
        return cleanupPromise;
    };

    try {
        const template = await findTemplate(harness, options.modelHint);
        for (const [index, profile] of options.profiles.entries()) {
            const created = await createAgent(harness, template, profile, index);
            agents.push(created);
            if (created.dmChatId) {
                chatIds.add(created.dmChatId);
            }
            const ready = await waitForReadyAgent(harness, created.id);
            await harness.waitForAgentQuiet(ready.id, 2000, 90_000);
            agents[index] = { ...ready, name: ready.displayName };
        }

        return {
            agents,
            cleanup,
            harness,
            trackChat: (chatId: string) => chatIds.add(chatId),
        };
    } catch (error) {
        try {
            await cleanup();
        } catch (cleanupError) {
            throw new AggregateError(
                [error, cleanupError],
                'Agent E2E fixture setup and cleanup failed.'
            );
        }
        throw error;
    }
}

async function findTemplate(harness: EvalHarness, modelHint = 'terra') {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const agents = (await harness.trpc('agent.list', {
            serverId: harness.serverId,
        })) as Agent[];
        const template = agents.find(
            (agent) =>
                agent.status === 'applied' &&
                agent.availability !== 'offline' &&
                agent.availability !== 'stopped' &&
                agent.desiredModelId.toLowerCase().includes(modelHint.toLowerCase())
        );
        if (template) {
            return template;
        }
        await sleep(1000);
    }
    throw new Error(`Agent E2E needs one applied online ${modelHint} Agent configuration.`);
}

async function createAgent(
    harness: EvalHarness,
    template: Agent,
    profile: AgentProfile,
    index: number
) {
    const suffix = `${harness.stamp.slice(-6)}-${crypto.randomUUID().slice(0, 6)}`.toLowerCase();
    const displayName = `${profile.name} ${suffix}`;
    const created = (await harness.trpc('agent.create', {
        computerId: template.computerId,
        description: `Temporary Agent E2E fixture. Act only when explicitly addressed or assigned. ${profile.description}`,
        displayName,
        handle: createHandle(profile.name, suffix, index),
        modelId: template.desiredModelId,
        runtimeId: template.desiredRuntimeId,
        serverId: harness.serverId,
    })) as { agent: Agent };
    const dm = chatSchema.parse(
        await harness.trpc('chat.ensureAgentDm', {
            agentId: created.agent.id,
            serverId: harness.serverId,
        })
    );
    return { ...created.agent, dmChatId: dm.id, name: created.agent.displayName };
}

async function waitForReadyAgent(harness: EvalHarness, agentId: string) {
    const deadline = Date.now() + 90_000;
    let latest: Agent | undefined;
    while (Date.now() < deadline) {
        const agents = (await harness.trpc('agent.list', {
            serverId: harness.serverId,
        })) as Agent[];
        latest = agents.find((agent) => agent.id === agentId);
        if (
            latest?.status === 'applied' &&
            latest.availability === 'idle' &&
            latest.effectiveRuntimeId === latest.desiredRuntimeId &&
            latest.effectiveModelId === latest.desiredModelId &&
            latest.missingResources.length === 0
        ) {
            return latest;
        }
        await sleep(1000);
    }
    throw new Error(
        `Timed out waiting for temporary Agent ${agentId}: ${JSON.stringify(latest ?? null)}`
    );
}

async function cleanupResources(
    harness: EvalHarness,
    agents: FixtureAgent[],
    chatIds: Set<string>
) {
    const failures: unknown[] = [];
    for (const operation of [
        () => cleanupEvalChats(harness, chatIds),
        () => deleteAgents(harness, agents),
        () => harness.cleanup(),
    ]) {
        try {
            await operation();
        } catch (error) {
            failures.push(error);
        }
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Agent E2E fixture cleanup failed.');
    }
}

async function deleteAgents(harness: EvalHarness, agents: FixtureAgent[]) {
    const failures: unknown[] = [];
    for (const agent of [...agents].reverse()) {
        try {
            await harness.trpc('agent.delete', {
                agentId: agent.id,
                confirmation: agent.displayName,
                serverId: harness.serverId,
            });
            await waitForRetiredAgent(harness, agent.id);
        } catch (error) {
            failures.push(
                new Error(`Could not delete temporary Agent ${agent.id}.`, { cause: error })
            );
        }
    }
    if (failures.length > 0) {
        throw new AggregateError(failures, 'Agent E2E could not delete every temporary Agent.');
    }
}

async function waitForRetiredAgent(harness: EvalHarness, agentId: string) {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
        const agents = (await harness.trpc('agent.list', {
            serverId: harness.serverId,
        })) as Agent[];
        if (!agents.some((agent) => agent.id === agentId)) {
            return;
        }
        await sleep(1000);
    }
    throw new Error(`Timed out waiting for temporary Agent ${agentId} to retire.`);
}

function createHandle(name: string, suffix: string, index: number) {
    const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '')
        .slice(0, 12);
    return `${slug || 'agent'}-${index}-${suffix}`.slice(0, 31).replace(/-$/u, '');
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
